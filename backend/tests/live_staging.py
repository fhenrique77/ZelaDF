"""Opt-in live rehearsal; disposable staging only, never production.
Credentials are obtained in memory from the authenticated CLI and never logged.
"""
import asyncio
import base64
import hashlib
import json
import logging
import os
import secrets
import subprocess
import sys
import uuid
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[2]
STAGING = os.environ.get("STAGING_PROJECT_REF", "")
URL = f"https://{STAGING}.supabase.co"
sys.path.insert(0, str(ROOT / "backend"))
checks = 0

def check(value, label):
    global checks
    if not value:
        raise RuntimeError(label)
    checks += 1

async def main():
    if not STAGING or not STAGING.isalpha() or len(STAGING) != 20:
        raise RuntimeError("explicit_staging_project_required")
    inventory = subprocess.run(["npx.cmd", "--offline", "--yes", "supabase@2", "projects", "list", "--output", "json"],
                               capture_output=True, text=True, timeout=90, cwd=ROOT)
    if inventory.returncode:
        raise RuntimeError("staging_inventory_unavailable")
    project = next((p for p in json.loads(inventory.stdout) if p["id"] == STAGING), None)
    if not project or not any(label in project["name"].lower() for label in ("staging", "test")):
        raise RuntimeError("only_named_staging_project_allowed")
    raw = subprocess.run(["npx.cmd", "--offline", "--yes", "supabase@2", "projects",
                          "api-keys", "--project-ref", STAGING, "--output", "json"],
                         capture_output=True, text=True, timeout=90, cwd=ROOT)
    if raw.returncode:
        raise RuntimeError("staging_credentials_unavailable")
    keys = {row["name"]: row["api_key"] for row in json.loads(raw.stdout)
            if row["name"] in ("anon", "service_role")}
    public, service = keys["anon"], keys["service_role"]
    os.environ["SUPABASE_URL"] = URL
    os.environ["SUPABASE_PUBLIC_KEY"] = public
    api_base = os.environ.get("STAGING_API_URL", "http://test").rstrip("/")
    if api_base not in ("http://test", "https://zeladf-api-staging.vercel.app"):
        raise RuntimeError("unapproved_staging_api")
    import server
    from account_deletion import DeletionRunner
    server.log.disabled = True
    admin = {"apikey": service, "Authorization": f"Bearer {service}"}
    users, photos = [], []
    async with httpx.AsyncClient(timeout=30) as remote:
        try:
            for _ in range(2):
                email = f"rehearsal-{uuid.uuid4()}@example.invalid"
                password = secrets.token_urlsafe(32)
                response = await remote.post(URL + "/auth/v1/admin/users", headers=admin,
                    json={"email": email, "password": password, "email_confirm": True})
                check(response.status_code == 200, "create_synthetic_auth_user")
                user_id = response.json()["id"]
                users.append({"id": user_id})
                response = await remote.post(URL + "/auth/v1/token?grant_type=password",
                    headers={"apikey": public}, json={"email": email, "password": password})
                check(response.status_code == 200, "authenticate_synthetic_user")
                users[-1]["token"] = response.json()["access_token"]
            async with server.lifespan(server.app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app) if api_base == "http://test" else None,
                                             base_url=api_base, timeout=30) as api:
                    async def call(method, path, actor=None, expected=200, **kwargs):
                        headers = kwargs.pop("headers", {})
                        if actor is not None:
                            headers["Authorization"] = "Bearer " + users[actor]["token"]
                        response = await api.request(method, path, headers=headers, **kwargs)
                        code = response.json().get("error", {}).get("code") if response.status_code >= 400 else ""
                        check(response.status_code == expected, f"{method} route expected={expected} got={response.status_code} code={code}")
                        return response.json()

                    await call("GET", "/health")
                    await call("GET", "/ready")
                    await call("GET", "/api/v1/me/votes", expected=401)
                    for actor in range(2):
                        await call("PUT", "/api/v1/me/community-terms", actor,
                                   json={"version": "2026-09-13"})
                    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
                    async def upload(actor):
                        path = f"{users[actor]['id']}/{uuid.uuid4()}.png"
                        response = await remote.post(URL + "/storage/v1/object/report-photos/" + path,
                            headers={"apikey": public, "Authorization": "Bearer " + users[actor]["token"],
                                     "Content-Type": "image/png"}, content=png)
                        check(response.status_code == 200, "upload_real_storage_photo")
                        photos.append(path)
                        return path
                    photo = await upload(0)
                    payload = {"category": "buraco", "title": "Aviso sintetico de staging",
                        "description": "Ensaio automatizado sem dados pessoais", "ra": "Plano Piloto",
                        "address": "Local sintetico", "lat": -15.79, "lng": -47.88, "photoPath": photo}
                    key = str(uuid.uuid4())
                    results = await asyncio.gather(*[
                        call("POST", "/api/v1/reports", 0, headers={"Idempotency-Key": key}, json=payload)
                        for _ in range(3)])
                    report_id = results[0]["report"]["id"]
                    check(all(r["report"]["id"] == report_id for r in results), "concurrent_create_idempotent")
                    check(all(not r["initialVoteFailed"] for r in results), "initial_vote")
                    check("author_id" not in results[0]["report"], "public_identity_minimized")
                    await call("POST", "/api/v1/reports", 0, expected=409,
                        headers={"Idempotency-Key": key}, json={**payload, "title": "Changed payload"})
                    await call("GET", f"/api/v1/reports/{report_id}")
                    await call("PATCH", f"/api/v1/reports/{report_id}", 1, expected=403, json={"title": "Unauthorized edit"})
                    await call("DELETE", f"/api/v1/reports/{report_id}", 1, expected=403)
                    for desired, count in [(True, 2), (False, 1)]:
                        votes = await asyncio.gather(*[
                            call("PUT", f"/api/v1/reports/{report_id}/vote", 1, json={"confirmed": desired})
                            for _ in range(5)])
                        check(all(r["confirmations"] == count for r in votes), "concurrent_votes_consistent")
                    await call("POST", f"/api/v1/reports/{report_id}/flags", 1,
                        json={"target": "report", "reason": "spam", "details": "Synthetic test"})
                    await call("POST", f"/api/v1/reports/{report_id}/author-block", 1)
                    await call("GET", f"/api/v1/reports/{report_id}", 1, expected=404)
                    await call("PUT", f"/api/v1/reports/{report_id}/vote", 1, expected=404, json={"confirmed": True})
                    await call("DELETE", "/api/v1/me/author-blocks", 1)
                    await call("GET", f"/api/v1/reports/{report_id}", 1)
                    await call("POST", f"/api/v1/operator/reports/{report_id}/status", 1, expected=403,
                        json={"newStatus": "andamento", "reason": "Synthetic status test"})
                    response = await remote.post(URL + "/rest/v1/operator_users", headers=admin,
                                                 json={"user_id": users[1]["id"]})
                    check(response.status_code == 201, "provision_synthetic_operator")
                    await call("POST", f"/api/v1/operator/reports/{report_id}/status", 1,
                        json={"newStatus": "andamento", "reason": "Synthetic status test"})
                    history = await call("GET", f"/api/v1/operator/reports/{report_id}/status-history", 1)
                    check(len(history["entries"]) == 1 and "changed_by" not in history["entries"][0], "private_status_history")
                    events = await remote.get(URL + "/rest/v1/push_status_events?select=id", headers=admin)
                    check(events.status_code == 200, "push_event_inventory")
                    event_id = events.json()[0]["id"]
                    claims = await asyncio.gather(*[remote.post(URL + "/rest/v1/rpc/claim_push_status_event",
                        headers=admin, json={"p_event_id": event_id}) for _ in range(5)])
                    check(all(r.status_code == 200 for r in claims) and sum(len(r.json()) for r in claims) == 1,
                          "push_claim_concurrent_exactly_once")
                    denied = await remote.post(URL + "/rest/v1/rpc/claim_push_status_event",
                        headers={"apikey": public, "Authorization": "Bearer " + users[0]["token"]},
                        json={"p_event_id": event_id})
                    check(denied.status_code == 403, "push_claim_service_only")
                    replacement = await upload(0)
                    await call("PATCH", f"/api/v1/reports/{report_id}", 0, json={"photoPath": replacement})
                    response = await remote.get(URL + "/storage/v1/object/info/report-photos/" + photo, headers=admin)
                    check(response.status_code in (400,404), "replaced_photo_removed")
                    from photo_cleanup import PhotoCleanupRunner
                    orphan = await upload(0)
                    fresh = await upload(0)
                    query = "UPDATE storage.objects SET created_at=now()-interval '2 days' WHERE bucket_id='report-photos' AND name IN ('" + orphan + "','" + replacement + "')"
                    sql_result = await asyncio.to_thread(subprocess.run,
                        ["npx.cmd", "--offline", "--yes", "supabase@2", "db", "query", "--linked",
                         "--project-ref", STAGING, query, "--output", "json"],
                         capture_output=True, text=True, timeout=90, cwd=ROOT)
                    check(sql_result.returncode == 0, "age_synthetic_photo_fixture")
                    cleanup = PhotoCleanupRunner(remote, URL, service)
                    check(await cleanup.run() == 1, "orphan_worker_removes_only_old_unlinked_photo")
                    check(await cleanup.run() == 0, "orphan_worker_repeat_is_empty")
                    response = await remote.get(URL + "/storage/v1/object/info/report-photos/" + replacement, headers=admin)
                    check(response.status_code == 200, "orphan_worker_preserves_linked_photo")
                    response = await remote.get(URL + "/storage/v1/object/info/report-photos/" + fresh, headers=admin)
                    check(response.status_code == 200, "orphan_worker_preserves_recent_photo")
                    duplicate = await remote.post(URL + "/storage/v1/object/report-photos/" + fresh,
                        headers={"apikey": public, "Authorization": "Bearer " + users[0]["token"],
                                 "Content-Type": "image/png"}, content=png)
                    print("duplicate_upload_http=" + str(duplicate.status_code) + " code=" + str(duplicate.json().get("error", "")))
                    requests = await asyncio.gather(*[call("POST", "/api/v1/me/deletion-requests", 0) for _ in range(3)])
                    check(len({r["id"] for r in requests}) == 1, "deletion_request_idempotent")
                    await call("GET", "/api/v1/me/deletion-requests/current", 1, expected=404)
                    runner = DeletionRunner(remote, URL, service)
                    digest = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()
                    stage = await runner.run(requests[0]["id"], users[0]["id"], digest)
                    check(stage == "completed", "real_storage_auth_account_deletion")
                    check(await runner.run(requests[0]["id"], users[0]["id"], digest) == "completed", "deletion_resume")
                    await call("GET", "/api/v1/me/deletion-requests/current", 0, expected=401)
                    await call("GET", f"/api/v1/reports/{report_id}", expected=404)
                    response = await remote.get(URL + "/auth/v1/admin/users/" + users[1]["id"], headers=admin)
                    check(response.status_code == 200, "other_account_preserved")
                    print(f"PASS {checks} live staging assertions")
        finally:
            if photos:
                response = await remote.request("DELETE", URL + "/storage/v1/object/report-photos",
                                                headers=admin, json={"prefixes": photos})
                check(response.status_code == 200, "synthetic_photo_cleanup")
            for user in users:
                response = await remote.delete(URL + "/auth/v1/admin/users/" + user["id"], headers=admin)
                check(response.status_code in (200, 204, 404), "synthetic_auth_cleanup")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        # No response bodies, credentials, personal IDs, or raw HTTP exceptions.
        print("FAIL " + (str(error) if isinstance(error, RuntimeError) else type(error).__name__))
        sys.exit(1)
