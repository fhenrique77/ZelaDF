import base64
import json
import time
import uuid

import httpx
from fastapi.testclient import TestClient

from server import app


ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
REPORT_ID = str(uuid.uuid4())
KEY = str(uuid.uuid4())
PHOTO_ID = str(uuid.uuid4())
PHOTO = f"{ALICE}/{PHOTO_ID}.jpg"
PHOTO_URL = f"https://test.supabase.co/storage/v1/object/public/report-photos/{PHOTO}"
EXP = int(time.time()) + 600


def token_for(actor):
    claims = {"sub": actor, "iss": "https://test.supabase.co/auth/v1",
              "aud": "authenticated", "role": "authenticated", "exp": EXP}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"header.{payload}.signature"


def report_row(photo=""):
    return {"id": REPORT_ID, "category": "buraco", "title": "Buraco na rua", "description": "Detalhes",
            "ra": "Asa Sul", "address": "Rua 1", "lat": -15.8, "lng": -47.9,
            "photo_url": photo, "status": "aberto", "confirmations": 0,
            "created_at": "2026-09-24T12:00:00Z"}


def body(photo=None):
    return {"category": "buraco", "title": "Buraco na rua", "description": "Detalhes",
            "ra": "Asa Sul", "address": "Rua 1", "lat": -15.8, "lng": -47.9,
            "photoPath": photo}


def test_create_validates_identity_fields_and_replays_photo(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    calls = []

    def upstream(request):
        calls.append(request)
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": ALICE})
        if path == f"/storage/v1/object/info/report-photos/{PHOTO}":
            return httpx.Response(200, json={"name": PHOTO_ID + ".jpg",
                                             "metadata": {"mimetype": "image/jpeg", "size": 1234}})
        if path == "/rest/v1/rpc/create_report_idempotent":
            data = json.loads(request.content)
            assert data["p_request_key"] == KEY
            assert data["p_photo_path"] == PHOTO
            assert "author_id" not in data and "status" not in data
            return httpx.Response(200, json=[report_row(PHOTO_URL)])
        if path == "/rest/v1/rpc/set_report_vote":
            assert json.loads(request.content)["p_device_id"] == ALICE
            return httpx.Response(200, json=[{"confirmations": 1}])
        raise AssertionError(path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            route = "/api/v1/reports"
            auth = {"Authorization": f"Bearer {token_for(ALICE)}", "Idempotency-Key": KEY}
            assert client.post(route, json=body(PHOTO)).status_code == 401
            assert client.post(route, headers={"Authorization": auth["Authorization"]}, json=body()).status_code == 400
            assert client.post(route, headers=auth, json={**body(), "author_id": BOB}).status_code == 422
            assert client.post(route, headers=auth, json={**body(), "title": "x"}).status_code == 422
            assert client.post(route, headers=auth, json=body(f"{BOB}/{PHOTO_ID}.jpg")).status_code == 422
            first = client.post(route, headers=auth, json=body(PHOTO))
            second = client.post(route, headers=auth, json=body(PHOTO))
            assert first.status_code == second.status_code == 200
            assert first.json() == second.json()
            assert first.json()["report"]["confirmations"] == 1
            assert first.json()["report"]["isOwner"] is True
            assert "author_id" not in first.text and "owner_id" not in first.text
            assert len([r for r in calls if r.url.path.endswith("create_report_idempotent")]) == 2
            assert not any(r.url.path == "/rest/v1/reports" for r in calls)
        finally:
            app.state.http = original


def test_create_returns_quota_error_without_leaking_upstream_details(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")

    def upstream(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": ALICE})
        if request.url.path == "/rest/v1/rpc/create_report_idempotent":
            return httpx.Response(429, json={"code": "PT429", "message": "private@example.invalid"})
        raise AssertionError(request.url.path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            auth = {"Authorization": f"Bearer {token_for(ALICE)}", "Idempotency-Key": KEY}
            response = client.post("/api/v1/reports", headers=auth, json=body())
            assert response.status_code == 429
            assert response.json()["error"]["code"] == "rate_limited"
            assert "private@example.invalid" not in response.text
        finally:
            app.state.http = original


def test_update_delete_authorization_and_cleanup(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    state = {"exists": True, "photo": "", "cleanup_failure": False}
    calls = []

    def upstream(request):
        calls.append(request)
        path = request.url.path
        actor = ALICE if request.headers.get("Authorization") == f"Bearer {token_for(ALICE)}" else BOB
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor})
        if path == "/rest/v1/reports" and request.method == "GET":
            if request.url.params.get("photo_url"):
                return httpx.Response(200, json=[])
            return httpx.Response(200, json=[report_row(state["photo"])] if state["exists"] else [])
        if path == "/rest/v1/rpc/get_my_report_ids":
            return httpx.Response(200, json=[{"report_id": REPORT_ID}] if actor == ALICE else [])
        if path == f"/storage/v1/object/info/report-photos/{PHOTO}":
            return httpx.Response(200, json={"name": PHOTO, "content_type": "image/jpeg", "size": 1234})
        if path == "/rest/v1/reports" and request.method == "PATCH":
            state["photo"] = json.loads(request.content)["photo_url"]
            return httpx.Response(200, json=[report_row(state["photo"])])
        if path == "/rest/v1/reports" and request.method == "DELETE":
            state["exists"] = False
            return httpx.Response(200, json=[{"id": REPORT_ID, "photo_url": state["photo"]}])
        if path == "/rest/v1/rpc/claim_report_photo_cleanup":
            return httpx.Response(200, json=[{"photo_path": PHOTO}])
        if path == "/rest/v1/rpc/finish_report_photo_cleanup":
            return httpx.Response(200, json=True)
        if path == "/storage/v1/object/report-photos" and request.method == "DELETE":
            return httpx.Response(503 if state["cleanup_failure"] else 200,
                                  json=[] if state["cleanup_failure"] else [PHOTO])
        if path == "/rest/v1/rpc/queue_report_photo_cleanup":
            assert json.loads(request.content) == {"p_photo_path": PHOTO}
            return httpx.Response(204)
        raise AssertionError(path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            route = f"/api/v1/reports/{REPORT_ID}"
            alice = {"Authorization": f"Bearer {token_for(ALICE)}"}
            bob = {"Authorization": f"Bearer {token_for(BOB)}"}
            assert client.patch(route, json={"title": "Novo título"}).status_code == 401
            assert client.patch(route, headers=bob, json={"title": "Novo título"}).status_code == 403
            assert client.delete(route, headers=bob).status_code == 403
            assert client.patch(route, headers=alice, json={"status": "resolvido"}).status_code == 422
            assert client.patch(route, headers=alice, json={"title": None}).status_code == 422
            updated = client.patch(route, headers=alice, json={"photoPath": PHOTO})
            assert updated.status_code == 200
            assert updated.json()["report"]["photo"] == PHOTO_URL
            state["cleanup_failure"] = True
            deleted = client.delete(route, headers=alice)
            assert deleted.status_code == 200
            assert deleted.json() == {"photoCleanupFailed": True}
            assert client.delete(route, headers=alice).status_code == 404
            assert any(r.url.path == "/storage/v1/object/report-photos" for r in calls)
            assert any(r.url.path == "/rest/v1/rpc/queue_report_photo_cleanup" for r in calls)
        finally:
            app.state.http = original


def test_failed_create_compensates_unlinked_photo_and_rejects_bad_metadata(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    state = {"mime": "image/png", "removed": False}

    def upstream(request):
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": ALICE})
        if path == f"/storage/v1/object/info/report-photos/{PHOTO}":
            return httpx.Response(200, json={"name": PHOTO, "metadata": {"size": 1234, "mimetype": state["mime"]}})
        if path == "/rest/v1/rpc/create_report_idempotent":
            return httpx.Response(503, json={"message": "private@example.invalid"})
        if path == "/rest/v1/reports" and request.method == "GET":
            return httpx.Response(200, json=[])
        if path == "/rest/v1/rpc/claim_report_photo_cleanup":
            return httpx.Response(200, json=[{"photo_path": PHOTO}])
        if path == "/rest/v1/rpc/finish_report_photo_cleanup":
            return httpx.Response(200, json=True)
        if path == "/storage/v1/object/report-photos" and request.method == "DELETE":
            assert json.loads(request.content) == {"prefixes": [PHOTO]}
            state["removed"] = True
            return httpx.Response(200, json=[PHOTO])
        raise AssertionError(path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            auth = {"Authorization": f"Bearer {token_for(ALICE)}", "Idempotency-Key": KEY}
            assert client.post("/api/v1/reports", headers=auth, json=body(PHOTO)).status_code == 422
            assert not state["removed"]
            state["mime"] = "image/jpeg"
            failed = client.post("/api/v1/reports", headers=auth, json=body(PHOTO))
            assert failed.status_code == 503
            assert "private@example.invalid" not in failed.text
            assert state["removed"]
            assert client.post("/api/v1/reports", headers=auth, content=b"x" * 65537).status_code == 413
        finally:
            app.state.http = original
