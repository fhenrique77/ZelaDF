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
EXP = int(time.time()) + 600


def token_for(actor):
    claims = {"sub": actor, "iss": "https://test.supabase.co/auth/v1",
              "aud": "authenticated", "role": "authenticated", "exp": EXP}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"header.{payload}.signature"


def test_vote_idempotency_two_accounts_hidden_and_invalid_requests(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    tokens = {ALICE: token_for(ALICE), BOB: token_for(BOB)}
    votes = set()
    calls = []
    state = {"hidden": False}

    def upstream(request):
        calls.append(request)
        actor = next((user for user, token in tokens.items()
                      if request.headers.get("Authorization") == f"Bearer {token}"), None)
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor}) if actor else httpx.Response(401)
        if request.url.path == "/rest/v1/rpc/set_report_vote":
            assert request.method == "POST"
            assert request.headers["apikey"] == "public-test-key"
            body = json.loads(request.content)
            assert body == {"p_report_id": REPORT, "p_voted": body["p_voted"], "p_device_id": actor}
            if state["hidden"] and body["p_voted"]:
                return httpx.Response(404, json={"code": "P0002", "message": "private detail"})
            if body["p_voted"]:
                votes.add(actor)
            else:
                votes.discard(actor)
            return httpx.Response(200, json=[{"voted": actor in votes, "confirmations": len(votes),
                                              "user_id": actor}])
        raise AssertionError(request.url.path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            route = f"/api/v1/reports/{REPORT}/vote"
            alice = {"Authorization": f"Bearer {tokens[ALICE]}"}
            bob = {"Authorization": f"Bearer {tokens[BOB]}"}
            assert client.put(route, json={"confirmed": True}).status_code == 401
            assert client.put(route, headers=alice, json={"confirmed": 1}).status_code == 422
            assert client.put(route, headers=alice, json={"confirmed": True, "user_id": BOB}).status_code == 422
            assert client.put(route, headers=alice, json={"confirmed": None}).status_code == 422
            assert client.put(route, headers=alice, json={}).status_code == 422
            assert client.put(route, headers=alice, content=b"x" * 65537).status_code == 413
            assert client.put(route + "?user_id=" + BOB, headers=alice, json={"confirmed": True}).status_code == 400
            assert client.put("/api/v1/reports/not-a-uuid/vote", headers=alice,
                              json={"confirmed": True}).status_code == 400
            assert not votes

            first = client.put(route, headers=alice, json={"confirmed": True})
            assert first.status_code == 200
            assert first.headers["cache-control"] == "no-store"
            assert first.json() == {"voted": True, "confirmations": 1}
            assert client.put(route, headers=alice, json={"confirmed": True}).json() == first.json()
            assert client.put(route, headers=bob, json={"confirmed": True}).json() == {
                "voted": True, "confirmations": 2}
            assert client.put(route, headers=alice, json={"confirmed": False}).json() == {
                "voted": False, "confirmations": 1}
            assert client.put(route, headers=alice, json={"confirmed": False}).json() == {
                "voted": False, "confirmations": 1}
            state["hidden"] = True
            denied = client.put(route, headers=alice, json={"confirmed": True})
            assert denied.status_code == 404
            assert "private detail" not in denied.text
            assert not any(request.url.path == "/rest/v1/votes" for request in calls)
            assert not any(request.url.path == "/rest/v1/reports" for request in calls)
        finally:
            app.state.http = original


def test_vote_reports_upstream_failure_without_inventing_state(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    token = token_for(ALICE)
    state = {"mode": "unavailable"}

    def upstream(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": ALICE})
        if request.url.path == "/rest/v1/rpc/set_report_vote":
            if state["mode"] == "unavailable":
                return httpx.Response(503, json={"message": "private detail"})
            return httpx.Response(200, json=[{"voted": True, "confirmations": "1"}])
        raise AssertionError(request.url.path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            route = f"/api/v1/reports/{REPORT}/vote"
            headers = {"Authorization": f"Bearer {token}"}
            failure = client.put(route, headers=headers, json={"confirmed": True})
            assert failure.status_code == 503
            assert "private detail" not in failure.text
            state["mode"] = "malformed"
            assert client.put(route, headers=headers, json={"confirmed": True}).status_code == 503
        finally:
            app.state.http = original
