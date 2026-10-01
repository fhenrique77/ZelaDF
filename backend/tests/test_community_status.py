import base64
import json
import time
import uuid

import httpx
from fastapi.testclient import TestClient

from server import app


ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
OPERATOR = str(uuid.uuid4())
REPORT = str(uuid.uuid4())
RECEIPT = str(uuid.uuid4())
EXP = int(time.time()) + 600


def token_for(actor):
    claims = {"sub": actor, "iss": "https://test.supabase.co/auth/v1",
              "aud": "authenticated", "role": "authenticated", "exp": EXP}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"header.{payload}.signature"


def test_terms_flags_blocks_and_safe_errors(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    tokens = {actor: token_for(actor) for actor in (ALICE, BOB)}
    state = {"mode": None, "accepted": set(), "flags": {}, "blocked": set()}
    calls = []

    def upstream(request):
        calls.append(request)
        actor = next((user for user, token in tokens.items()
                      if request.headers.get("Authorization") == f"Bearer {token}"), None)
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor}) if actor else httpx.Response(401)
        assert actor is not None and request.headers["apikey"] == "public-test-key"
        if path == "/rest/v1/rpc/accept_community_terms":
            assert json.loads(request.content) == {"p_version": "2026-09-13"}
            if state["mode"] == "unavailable":
                return httpx.Response(503, json={"message": "private@example.invalid"})
            state["accepted"].add(actor)
            return httpx.Response(204)
        if path == "/rest/v1/rpc/flag_report":
            body = json.loads(request.content)
            assert set(body) == {"p_report_id", "p_target", "p_reason", "p_details"}
            if state["mode"] == "hidden":
                return httpx.Response(404, json={"code": "P0002", "message": "private detail"})
            if state["mode"] == "rate":
                return httpx.Response(400, json={"code": "54000", "message": "private detail"})
            key = actor, body["p_report_id"], body["p_target"]
            state["flags"].setdefault(key, RECEIPT if actor == ALICE else str(uuid.uuid4()))
            return httpx.Response(200, json=state["flags"][key])
        if path == "/rest/v1/rpc/block_report_author":
            assert json.loads(request.content) == {"p_report_id": REPORT}
            if state["mode"] == "legacy":
                return httpx.Response(400, json={"code": "22023", "message": "Legacy report has no account author"})
            state["blocked"].add(actor)
            return httpx.Response(204)
        if path == "/rest/v1/rpc/clear_my_community_blocks":
            assert json.loads(request.content) == {}
            state["blocked"].discard(actor)
            return httpx.Response(204)
        raise AssertionError(path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            alice = {"Authorization": f"Bearer {tokens[ALICE]}"}
            bob = {"Authorization": f"Bearer {tokens[BOB]}"}
            terms = "/api/v1/me/community-terms"
            flag = f"/api/v1/reports/{REPORT}/flags"
            block = f"/api/v1/reports/{REPORT}/author-block"
            clear = "/api/v1/me/author-blocks"
            assert client.put(terms, json={"version": "2026-09-13"}).status_code == 401
            assert client.post(flag, json={"target": "report", "reason": "spam", "details": ""}).status_code == 401
            assert client.put(terms, headers=alice, json={"version": "old"}).status_code == 422
            assert client.put(terms, headers=alice, json={"version": "2026-09-13", "user_id": BOB}).status_code == 422
            assert client.put(terms, headers=alice, content=b"x" * 65537).status_code == 413
            state["mode"] = "unavailable"
            assert client.put(terms, headers=alice, json={"version": "2026-09-13"}).status_code == 503
            assert not state["accepted"]
            state["mode"] = None
            accepted = client.put(terms, headers=alice, json={"version": "2026-09-13"})
            assert accepted.json() == {"accepted": True, "version": "2026-09-13"}
            assert accepted.headers["cache-control"] == "no-store"
            assert state["accepted"] == {ALICE}

            invalid = {"target": "report", "reason": "invalid", "details": ""}
            assert client.post(flag, headers=alice, json=invalid).status_code == 422
            assert client.post(flag, headers=alice, json={**invalid, "reason": "spam", "details": "x" * 501}).status_code == 422
            assert client.post(flag, headers=alice, json={**invalid, "reason": "spam", "reporter_id": BOB}).status_code == 422
            payload = {"target": "report", "reason": "spam", "details": "  sem dados pessoais  "}
            first = client.post(flag, headers=alice, json=payload)
            assert first.json() == {"id": RECEIPT}
            assert first.headers["cache-control"] == "no-store"
            assert client.post(flag, headers=alice, json=payload).json() == first.json()
            assert client.post(flag, headers=bob, json=payload).json()["id"] != RECEIPT
            rpc_call = [request for request in calls if request.url.path.endswith("/flag_report")][0]
            assert json.loads(rpc_call.content)["p_details"] == "sem dados pessoais"
            state["mode"] = "hidden"
            assert client.post(flag, headers=alice, json=payload).status_code == 404
            state["mode"] = "rate"
            assert client.post(flag, headers=alice, json=payload).status_code == 429
            state["mode"] = "legacy"
            legacy = client.post(block, headers=alice)
            assert legacy.status_code == 422
            assert legacy.json()["error"]["code"] == "legacy_author"
            state["mode"] = None
            assert client.post(block, headers=alice, json={"author_id": BOB}).status_code == 400
            assert client.post(block, headers=alice).json() == {"blocked": True}
            assert state["blocked"] == {ALICE}
            assert client.request("DELETE", clear, headers=alice, content=b"{}").status_code == 400
            assert client.delete(clear, headers=alice).json() == {"cleared": True}
            assert not state["blocked"]
            assert "private@example.invalid" not in accepted.text
            assert not any("community_flags" in request.url.path for request in calls)
        finally:
            app.state.http = original


def test_operator_access_history_and_atomic_status_rpc(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLIC_KEY", "public-test-key")
    tokens = {actor: token_for(actor) for actor in (ALICE, OPERATOR)}
    calls = []
    state = {"status": "aberto", "history": [], "mode": None}

    def upstream(request):
        calls.append(request)
        actor = next((user for user, token in tokens.items()
                      if request.headers.get("Authorization") == f"Bearer {token}"), None)
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": actor}) if actor else httpx.Response(401)
        if path == "/rest/v1/rpc/current_user_is_operator":
            return httpx.Response(200, json=actor == OPERATOR)
        if path == "/rest/v1/report_status_history":
            assert actor == OPERATOR
            assert request.url.params["select"] == "id,from_status,to_status,reason,changed_at"
            assert request.url.params["report_id"] == f"eq.{REPORT}"
            return httpx.Response(200, json=state["history"])
        if path == "/rest/v1/rpc/change_report_status":
            assert actor is not None
            if actor != OPERATOR:
                return httpx.Response(403, json={"code": "42501", "message": "private@example.invalid"})
            if state["mode"] == "missing":
                return httpx.Response(404, json={"code": "P0002"})
            body = json.loads(request.content)
            assert set(body) == {"p_report_id", "p_new_status", "p_reason"}
            if body["p_new_status"] == state["status"]:
                return httpx.Response(400, json={"code": "22023"})
            state["history"].insert(0, {"id": str(uuid.uuid4()), "from_status": state["status"],
                                        "to_status": body["p_new_status"], "reason": body["p_reason"],
                                        "changed_at": "2026-09-24T12:00:00Z", "changed_by": OPERATOR})
            state["status"] = body["p_new_status"]
            return httpx.Response(204)
        raise AssertionError(path)

    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            citizen = {"Authorization": f"Bearer {tokens[ALICE]}"}
            operator = {"Authorization": f"Bearer {tokens[OPERATOR]}"}
            access = "/api/v1/operator/access"
            history = f"/api/v1/operator/reports/{REPORT}/status-history"
            status = f"/api/v1/operator/reports/{REPORT}/status"
            body = {"newStatus": "andamento", "reason": "  A equipe iniciou a análise.  "}
            assert client.get(access).status_code == 401
            assert client.get(access, headers=citizen).json() == {"allowed": False}
            assert client.get(access, headers=operator).json() == {"allowed": True}
            assert client.get(history, headers=citizen).status_code == 403
            assert client.post(status, headers=citizen, json=body).status_code == 403
            assert client.post(status, headers=operator, json={**body, "changed_by": OPERATOR}).status_code == 422
            assert client.post(status, headers=operator, json={"newStatus": "andamento", "reason": "curto"}).status_code == 422
            assert client.post(status, headers=operator, json={"newStatus": "unknown", "reason": body["reason"]}).status_code == 422
            assert client.get(history + "?page=-1", headers=operator).status_code == 400
            assert client.get(history + "?user_id=" + ALICE, headers=operator).status_code == 400
            changed = client.post(status, headers=operator, json=body)
            assert changed.status_code == 200
            assert changed.json() == {"status": "andamento"}
            assert state["status"] == "andamento"
            assert state["history"][0]["reason"] == "A equipe iniciou a análise."
            assert client.post(status, headers=operator, json=body).status_code == 422
            result = client.get(history, headers=operator)
            assert result.status_code == 200
            assert result.headers["cache-control"] == "no-store"
            assert result.json()["hasMore"] is False
            assert result.json()["entries"][0]["reason"] == "A equipe iniciou a análise."
            assert "changed_by" not in result.text and OPERATOR not in result.text
            state["mode"] = "missing"
            assert client.post(status, headers=operator, json={"newStatus": "resolvido", "reason": "Motivo suficiente."}).status_code == 404
            assert not any(request.url.path == "/rest/v1/reports" and request.method == "PATCH" for request in calls)
        finally:
            app.state.http = original
