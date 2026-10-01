"""Administrative orphan-photo cleanup. Service key stays outside the public API."""
import argparse
import asyncio
import re
import sys
import httpx
from account_deletion import configuration, DeletionError

PATH = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$")

class CleanupError(Exception):
    pass

class PhotoCleanupRunner:
    def __init__(self, client, url, key):
        self.client, self.url = client, url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    async def rpc(self, name, payload):
        try:
            response = await self.client.post(self.url + "/rest/v1/rpc/" + name,
                                             headers=self.headers, json=payload)
            if response.status_code != 200:
                raise CleanupError("cleanup_rpc_rejected")
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise CleanupError("cleanup_rpc_unavailable") from error

    async def run(self, batches=10):
        completed = 0
        for _ in range(batches):
            rows = await self.rpc("claim_report_photo_cleanup", {"p_limit": 100})
            if (not isinstance(rows, list) or len(rows) > 100 or
                any(not isinstance(row, dict) or not isinstance(row.get("photo_path"), str)
                    or not PATH.fullmatch(row["photo_path"]) for row in rows)):
                raise CleanupError("cleanup_invalid_batch")
            if not rows:
                break
            paths = [row["photo_path"] for row in rows]
            try:
                response = await self.client.request("DELETE", self.url + "/storage/v1/object/report-photos",
                    headers=self.headers, json={"prefixes": paths})
            except httpx.HTTPError as error:
                raise CleanupError("storage_delete_unavailable") from error
            if response.status_code != 200:
                raise CleanupError("storage_delete_rejected")
            for path in paths:
                if await self.rpc("finish_report_photo_cleanup", {"p_photo_path": path}) is not True:
                    raise CleanupError("storage_delete_unconfirmed")
                completed += 1
        return completed

async def main():
    parser = argparse.ArgumentParser(description="Remove unlinked managed photos older than 24 hours")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--max-batches", type=int, default=10)
    args = parser.parse_args()
    if not args.execute or not 1 <= args.max_batches <= 100:
        raise CleanupError("explicit_execution_and_valid_batch_limit_required")
    url, key = configuration()
    async with httpx.AsyncClient(timeout=30) as client:
        count = await PhotoCleanupRunner(client, url, key).run(args.max_batches)
    print(f"photo_cleanup_completed={count}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (CleanupError, DeletionError) as error:
        print(f"photo_cleanup_error={error}", file=sys.stderr)
        sys.exit(1)
