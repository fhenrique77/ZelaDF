"""Restricted operator CLI for a verified account-deletion request.

No HTTP route invokes this module. The service-role key is read only from the
operator environment; never pass it as a command-line argument or log it.
"""

import argparse
import asyncio
import getpass
import hashlib
import os
import sys
import uuid
from urllib.parse import urlparse

import httpx


class DeletionError(Exception):
    pass


def configuration():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    parsed = urlparse(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment or not key):
        raise DeletionError("invalid_configuration")
    return url, key


class DeletionRunner:
    def __init__(self, client: httpx.AsyncClient, url: str, service_key: str):
        self.client = client
        self.url = url.rstrip("/")
        self.headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

    async def rpc(self, name: str, payload: dict, expected_stage: str | None = None):
        try:
            response = await self.client.post(
                f"{self.url}/rest/v1/rpc/{name}", headers=self.headers, json=payload)
        except httpx.HTTPError as exc:
            raise DeletionError(f"{name}_unavailable") from exc
        if response.status_code != 200:
            raise DeletionError(f"{name}_rejected")
        try:
            result = response.json()
        except ValueError as exc:
            raise DeletionError(f"{name}_invalid_response") from exc
        if not isinstance(result, dict):
            raise DeletionError(f"{name}_invalid_response")
        if expected_stage and result.get("stage") != expected_stage:
            raise DeletionError(f"{name}_invalid_response")
        return result

    async def auth_exists(self, user_id: str):
        try:
            response = await self.client.get(
                f"{self.url}/auth/v1/admin/users/{user_id}", headers=self.headers)
        except httpx.HTTPError as exc:
            raise DeletionError("auth_lookup_unavailable") from exc
        if response.status_code == 404:
            return False
        if response.status_code != 200:
            raise DeletionError("auth_lookup_failed")
        try:
            user = response.json()
        except ValueError as exc:
            raise DeletionError("auth_lookup_invalid_response") from exc
        if not isinstance(user, dict) or user.get("id") != user_id:
            raise DeletionError("auth_lookup_invalid_response")
        return True

    async def remove_photos(self, request_id: str, user_id: str):
        previous_paths = None
        payload = {"p_request_id": request_id, "p_expected_user_id": user_id}
        for _ in range(10000):
            batch = await self.rpc("account_deletion_photo_batch", payload)
            paths = batch.get("paths")
            if (not isinstance(paths, list) or len(paths) > 100
                    or any(not isinstance(path, str) or not path for path in paths)
                    or len(paths) != len(set(paths))):
                raise DeletionError("photo_batch_invalid_response")
            if not paths:
                return
            if paths == previous_paths:
                raise DeletionError("photo_removal_made_no_progress")
            try:
                response = await self.client.request(
                    "DELETE", f"{self.url}/storage/v1/object/report-photos",
                    headers=self.headers, json={"prefixes": paths})
            except httpx.HTTPError as exc:
                raise DeletionError("photo_removal_unavailable") from exc
            if response.status_code < 200 or response.status_code >= 300:
                raise DeletionError("photo_removal_failed")
            previous_paths = paths
        raise DeletionError("photo_batch_limit")

    async def run(self, request_id: str, user_id: str, verification_hash: str):
        payload = {"p_request_id": request_id, "p_expected_user_id": user_id}
        begin = await self.rpc("begin_account_deletion", {
            **payload, "p_verification_hash": verification_hash})
        stage = begin.get("stage")
        if stage == "completed":
            return stage
        if stage == "frozen":
            await self.remove_photos(request_id, user_id)
            await self.rpc("purge_account_deletion_data", payload, "database_done")
            stage = "database_done"
        if stage != "database_done":
            raise DeletionError("invalid_deletion_stage")
        if await self.auth_exists(user_id):
            try:
                response = await self.client.delete(
                    f"{self.url}/auth/v1/admin/users/{user_id}", headers=self.headers)
            except httpx.HTTPError as exc:
                raise DeletionError("auth_deletion_unavailable") from exc
            if response.status_code not in (200, 204, 404):
                raise DeletionError("auth_deletion_failed")
        if await self.auth_exists(user_id):
            raise DeletionError("auth_deletion_unconfirmed")
        await self.rpc("finish_account_deletion", payload, "completed")
        return "completed"


async def main():
    parser = argparse.ArgumentParser(description="Execute one verified account deletion")
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--expected-user-id", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        raise DeletionError("execute_flag_required")
    try:
        request_id = str(uuid.UUID(args.request_id))
        user_id = str(uuid.UUID(args.expected_user_id))
    except ValueError as exc:
        raise DeletionError("invalid_identifier") from exc
    url, key = configuration()
    reference = getpass.getpass("UUID do registro restrito de verificação de identidade: ").strip()
    try:
        reference = str(uuid.UUID(reference))
    except ValueError as exc:
        raise DeletionError("invalid_verification_reference") from exc
    verification_hash = hashlib.sha256(reference.encode("ascii")).hexdigest()
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
        result = await DeletionRunner(client, url, key).run(
            request_id, user_id, verification_hash)
    print(f"account_deletion_stage={result}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except DeletionError as exc:
        print(f"account_deletion_error={exc}", file=sys.stderr)
        sys.exit(1)
