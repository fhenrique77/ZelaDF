import asyncio
import json
import uuid

import httpx
import pytest

from account_deletion import DeletionError, DeletionRunner


REQUEST = str(uuid.uuid4())
ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
HASH = "a" * 64


def test_resumes_after_storage_failure_and_confirms_all_layers():
    state = {"stage": None, "auth": True, "photos": [f"{ALICE}/one.jpg", f"{ALICE}/two.jpg"],
             "other_photo": f"{BOB}/untouched.jpg", "fail_once": True, "calls": []}

    def upstream(request):
        state["calls"].append(request)
        assert request.headers["apikey"] == "test-service-key"
        assert request.headers["authorization"] == "Bearer test-service-key"
        path = request.url.path
        if path.endswith("/rpc/begin_account_deletion"):
            body = json.loads(request.content)
            assert body == {"p_request_id": REQUEST, "p_expected_user_id": ALICE,
                            "p_verification_hash": HASH}
            state["stage"] = state["stage"] or "frozen"
            return httpx.Response(200, json={"stage": state["stage"]})
        if path.endswith("/rpc/account_deletion_photo_batch"):
            return httpx.Response(200, json={"paths": state["photos"][:100]})
        if path == "/storage/v1/object/report-photos":
            assert request.method == "DELETE"
            paths = json.loads(request.content)["prefixes"]
            assert state["other_photo"] not in paths
            if state["fail_once"]:
                state["fail_once"] = False
                return httpx.Response(503, json={"message": "private@example.invalid"})
            state["photos"] = [path for path in state["photos"] if path not in paths]
            return httpx.Response(200, json=[])
        if path.endswith("/rpc/purge_account_deletion_data"):
            assert not state["photos"]
            state["stage"] = "database_done"
            return httpx.Response(200, json={"stage": state["stage"]})
        if path.endswith("/rpc/finish_account_deletion"):
            assert not state["auth"]
            state["stage"] = "completed"
            return httpx.Response(200, json={"stage": state["stage"]})
        if path == f"/auth/v1/admin/users/{ALICE}":
            if request.method == "GET":
                return httpx.Response(200, json={"id": ALICE}) if state["auth"] else httpx.Response(404)
            assert request.method == "DELETE"
            state["auth"] = False
            return httpx.Response(204)
        raise AssertionError(path)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            runner = DeletionRunner(client, "https://test.supabase.co", "test-service-key")
            with pytest.raises(DeletionError, match="photo_removal_failed"):
                await runner.run(REQUEST, ALICE, HASH)
            assert state["stage"] == "frozen" and state["auth"]
            assert await runner.run(REQUEST, ALICE, HASH) == "completed"
            assert await runner.run(REQUEST, ALICE, HASH) == "completed"
    asyncio.run(exercise())
    assert state["other_photo"] == f"{BOB}/untouched.jpg"
    assert sum(call.method == "DELETE" and "/auth/v1/admin/" in call.url.path
               for call in state["calls"]) == 1


def test_rejected_verification_or_photo_nonprogress_never_purges():
    state = {"mode": "reject", "calls": []}

    def upstream(request):
        state["calls"].append(request.url.path)
        if request.url.path.endswith("/rpc/begin_account_deletion"):
            if state["mode"] == "reject":
                return httpx.Response(400, json={"message": "other user details"})
            return httpx.Response(200, json={"stage": "frozen"})
        if request.url.path.endswith("/rpc/account_deletion_photo_batch"):
            return httpx.Response(200, json={"paths": [f"{ALICE}/still-there.jpg"]})
        if request.url.path == "/storage/v1/object/report-photos":
            return httpx.Response(200, json=[])
        raise AssertionError("Unexpected destructive call")

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            runner = DeletionRunner(client, "https://test.supabase.co", "test-service-key")
            with pytest.raises(DeletionError, match="begin_account_deletion_rejected"):
                await runner.run(REQUEST, BOB, HASH)
            state["mode"] = "stalled"
            with pytest.raises(DeletionError, match="photo_removal_made_no_progress"):
                await runner.run(REQUEST, ALICE, HASH)
    asyncio.run(exercise())
    assert all("purge" not in path and "/auth/" not in path for path in state["calls"])


def test_auth_failure_is_resumable_without_repeating_storage_or_purge():
    state = {"auth": True, "delete_fails": True, "calls": []}

    def upstream(request):
        path = request.url.path
        state["calls"].append(path)
        if path.endswith("/rpc/begin_account_deletion"):
            return httpx.Response(200, json={"stage": "database_done"})
        if path == f"/auth/v1/admin/users/{ALICE}":
            if request.method == "GET":
                return httpx.Response(200, json={"id": ALICE}) if state["auth"] else httpx.Response(404)
            if state["delete_fails"]:
                return httpx.Response(503)
            state["auth"] = False
            return httpx.Response(204)
        if path.endswith("/rpc/finish_account_deletion"):
            return httpx.Response(200, json={"stage": "completed"})
        raise AssertionError(path)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            runner = DeletionRunner(client, "https://test.supabase.co", "test-service-key")
            with pytest.raises(DeletionError, match="auth_deletion_failed"):
                await runner.run(REQUEST, ALICE, HASH)
            state["delete_fails"] = False
            assert await runner.run(REQUEST, ALICE, HASH) == "completed"
    asyncio.run(exercise())
    assert not any("photo_batch" in path or "purge" in path for path in state["calls"])


def test_lost_auth_delete_response_is_reconciled_on_retry():
    state = {"auth": True, "deletes": 0}

    def upstream(request):
        path = request.url.path
        if path.endswith("/rpc/begin_account_deletion"):
            return httpx.Response(200, json={"stage": "database_done"})
        if path == f"/auth/v1/admin/users/{ALICE}":
            if request.method == "GET":
                return httpx.Response(200, json={"id": ALICE}) if state["auth"] else httpx.Response(404)
            state["deletes"] += 1
            state["auth"] = False
            raise httpx.ReadError("response lost")
        if path.endswith("/rpc/finish_account_deletion"):
            assert not state["auth"]
            return httpx.Response(200, json={"stage": "completed"})
        raise AssertionError(path)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            runner = DeletionRunner(client, "https://test.supabase.co", "test-service-key")
            with pytest.raises(DeletionError, match="auth_deletion_unavailable"):
                await runner.run(REQUEST, ALICE, HASH)
            assert await runner.run(REQUEST, ALICE, HASH) == "completed"
    asyncio.run(exercise())
    assert state["deletes"] == 1
