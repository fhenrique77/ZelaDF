import base64
import json
import time
import uuid

import httpx
from fastapi.testclient import TestClient

from server import app


ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
REPORT = str(uuid.uuid4())
HIDDEN = str(uuid.uuid4())
ROW = {"id": REPORT, "category": "buraco", "title": "Buraco", "description": "Rua", "ra": "Plano Piloto", "address": "Quadra 1", "lat": -15.8, "lng": -47.9, "photo_url": "", "status": "aberto", "confirmations": 2, "created_at": "2026-09-24T12:00:00Z", "author_id": ALICE}
EXP = int(time.time()) + 600


def token_for(user):
    claims = {"sub": user, "iss": "https://test.supabase.co/auth/v1", "aud": "authenticated", "role": "authenticated", "exp": EXP}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"header.{payload}.signature"


def test_reads_and_identity(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    seen = []
    fail_ownership = {"value": False}

    def upstream(request):
        seen.append(request)
        path = request.url.path
        auth = request.headers.get("Authorization", "")
        actor = ALICE if auth == f"Bearer {token_for(ALICE)}" else BOB if auth == f"Bearer {token_for(BOB)}" else None
        if path == "/auth/v1/health":
            return httpx.Response(200, json={"ok": True})
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor}) if actor else httpx.Response(401)
        if path == "/rest/v1/reports":
            if "eq." + HIDDEN in str(request.url):
                return httpx.Response(200, json=[])
            return httpx.Response(200, json=[ROW, ROW] if request.url.params.get("limit") == "2" else [ROW])
        if path == "/rest/v1/rpc/get_my_reports":
            return httpx.Response(200, json=[ROW] if actor == ALICE else [])
        if path == "/rest/v1/rpc/get_my_report_ids":
            if fail_ownership["value"]:
                return httpx.Response(503)
            return httpx.Response(200, json=[{"report_id": REPORT}] if actor == ALICE else [])
        if path == "/rest/v1/votes":
            return httpx.Response(200, json=[{"report_id": REPORT}] if actor == ALICE else [])
        raise AssertionError(path)

    bounds = {"south": "-16", "west": "-49", "north": "-15", "east": "-47"}
    with TestClient(app) as client:
        async_client = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            assert client.get("/health").json() == {"ok": True}
            assert client.get("/ready").status_code == 200
            assert client.get("/api/v1/reports", params=bounds).json()["reports"][0]["isOwner"] is False
            filtered = client.get("/api/v1/reports", params={**bounds, "limit": 1, "category": "buraco", "status": "aberto"}).json()
            assert len(filtered["reports"]) == 1 and filtered["truncated"] is True
            assert any(request.url.params.get("category") == "in.(buraco)" and request.url.params.get("status") == "eq.aberto" for request in seen if request.url.path == "/rest/v1/reports")
            assert client.get("/api/v1/me/reports", params=bounds).status_code == 401
            assert client.get("/api/v1/me/votes", params={"report_ids": REPORT}).status_code == 401
            alice = {"Authorization": f"Bearer {token_for(ALICE)}"}
            bob = {"Authorization": f"Bearer {token_for(BOB)}"}
            owned = client.get("/api/v1/reports", params=bounds, headers=alice)
            assert owned.json()["reports"][0]["isOwner"] is True
            assert owned.headers["Cache-Control"] == "no-store"
            fail_ownership["value"] = True
            assert client.get("/api/v1/reports", params=bounds, headers=alice).json()["reports"][0]["isOwner"] is False
            fail_ownership["value"] = False
            assert client.get("/api/v1/reports", params=bounds, headers=bob).json()["reports"][0]["isOwner"] is False
            assert client.get("/api/v1/me/reports", params=bounds, headers=alice).json()["reports"][0]["isOwner"] is True
            assert client.get("/api/v1/me/reports", params=bounds, headers=bob).json()["reports"] == []
            votes = client.get("/api/v1/me/votes", params={"report_ids": REPORT}, headers=alice)
            assert votes.json() == {"reportIds": [REPORT]}
            assert votes.headers["Cache-Control"] == "no-store"
            assert client.get("/api/v1/me/votes", params={"report_ids": REPORT}, headers=bob).json() == {"reportIds": []}
            assert client.get("/api/v1/me/votes", params=[("report_ids", REPORT)] * 251, headers=alice).status_code == 400
            assert client.get(f"/api/v1/reports/{HIDDEN}", headers=bob).status_code == 404
            assert client.get("/api/v1/reports", params=bounds, headers={"Authorization": "Bearer invalid"}).status_code == 401
            public = client.get("/api/v1/reports", params=bounds).json()["reports"][0]
            assert not {"author_id", "author_name", "user_id"}.intersection(public)
            assert any(request.url.path == "/rest/v1/reports" and request.url.params.get("limit") == "201" for request in seen)
            assert all(request.headers.get("apikey") == "public-test-key" for request in seen)
            assert not any("service_role" in str(request.headers) for request in seen)
        finally:
            client.app.state.http = async_client


def test_invalid_queries_and_tokens(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    with TestClient(app) as client:
        bounds = {"south": "-16", "west": "-49", "north": "-15", "east": "-47"}
        for params in ({}, {**bounds, "limit": "501"}, {**bounds, "category": "bad"}, {**bounds, "south": "nan"}):
            result = client.get("/api/v1/reports", params=params)
            assert result.status_code == 400
            assert set(result.json()["error"]) == {"code", "message", "requestId"}
        assert client.get("/api/v1/me/reports", params=bounds).status_code == 401
        assert client.get("/api/v1/reports/nope").status_code == 400
