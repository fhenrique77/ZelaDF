import base64
import json
import time
import uuid

import httpx
from fastapi.testclient import TestClient

from server import app


ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
RECEIPT = {"id": str(uuid.uuid4()), "created_at": "2026-09-24T15:00:00Z", "status": "pending", "user_id": ALICE}
EXP = int(time.time()) + 600


def token_for(user, *, expired=False):
    claims = {"sub": user, "iss": "https://test.supabase.co/auth/v1", "aud": "authenticated", "role": "authenticated", "exp": EXP - 660 if expired else EXP}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"header.{payload}.signature"


def test_private_lookup_idempotent_request_and_failures(monkeypatch, caplog):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    receipts = {}
    upstream_calls = []
    fault = {"mode": None}

    def upstream(request):
        upstream_calls.append(request)
        authorization = request.headers.get("Authorization")
        actor = ALICE if authorization in (f"Bearer {token_for(ALICE)}", f"Bearer {token_for(ALICE, expired=True)}") else BOB if authorization == f"Bearer {token_for(BOB)}" else None
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor}) if actor else httpx.Response(401)
        if request.url.path == "/rest/v1/account_deletion_requests":
            if fault["mode"] == "lookup_unavailable":
                return httpx.Response(503, json={"details": "private@example.invalid"})
            return httpx.Response(200, json=[receipts[actor]] if actor in receipts else [])
        if request.url.path == "/rest/v1/rpc/request_account_deletion":
            if fault["mode"] == "rpc_unavailable":
                return httpx.Response(503, json={"details": "private@example.invalid"})
            if fault["mode"] == "bad_receipt":
                return httpx.Response(200, json=[{"id": "invalid", "user_id": actor}])
            receipts.setdefault(actor, {**RECEIPT, "id": RECEIPT["id"] if actor == ALICE else str(uuid.uuid4()), "user_id": actor})
            return httpx.Response(200, json=[receipts[actor]])
        raise AssertionError(request.url.path)

    with TestClient(app) as client:
        original_http = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            path = "/api/v1/me/deletion-requests"
            alice = {"Authorization": f"Bearer {token_for(ALICE)}"}
            bob = {"Authorization": f"Bearer {token_for(BOB)}"}
            assert client.get(f"{path}/current").status_code == 401
            assert client.post(path).status_code == 401
            assert client.get(f"{path}/current", headers=alice).status_code == 404
            assert client.post(path, headers=alice, json={"user_id": BOB}).status_code == 400
            assert client.post(path, headers=alice, content=b"{}").status_code == 400
            assert client.post(path, headers={"Authorization": f"Bearer {token_for(ALICE, expired=True)}"}).status_code == 401
            assert not any(call.url.path == "/rest/v1/rpc/request_account_deletion" for call in upstream_calls)

            first = client.post(path, headers=alice)
            assert first.status_code == 200
            assert first.headers["cache-control"] == "no-store"
            assert first.json() == {"id": RECEIPT["id"], "createdAt": RECEIPT["created_at"], "status": "pending"}
            assert client.post(path, headers=alice).json() == first.json()
            assert client.get(f"{path}/current", headers=alice).json() == first.json()
            receipts[ALICE]["status"] = "in_review"
            assert client.get(f"{path}/current", headers=alice).json()["status"] == "in_review"
            assert client.get(f"{path}/current", headers=bob).status_code == 404
            assert client.post(path, headers=bob).json()["id"] != RECEIPT["id"]
            assert all(call.url.params.get("select") == "id,created_at,status" for call in upstream_calls if call.url.path == "/rest/v1/account_deletion_requests")
            assert all(call.content == b"{}" for call in upstream_calls if call.url.path == "/rest/v1/rpc/request_account_deletion")
            assert all(call.headers.get("apikey") == "public-test-key" for call in upstream_calls)

            fault["mode"] = "lookup_unavailable"
            unavailable = client.get(f"{path}/current", headers=alice)
            assert unavailable.status_code == 503
            assert "private@example.invalid" not in unavailable.text
            fault["mode"] = "rpc_unavailable"
            assert client.post(path, headers=alice).status_code == 503
            fault["mode"] = "bad_receipt"
            assert client.post(path, headers=alice).status_code == 503
            assert "private@example.invalid" not in caplog.text
        finally:
            app.state.http = original_http
