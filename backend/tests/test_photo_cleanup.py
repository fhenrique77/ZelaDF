import asyncio
import json
import httpx
import pytest
from photo_cleanup import PhotoCleanupRunner, CleanupError

PATH = "50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png"

def test_cleanup_retries_persisted_claim_after_storage_failure():
    calls = []
    state = {"failed": False, "finished": False}
    def upstream(request):
        calls.append(request.url.path)
        if request.url.path.endswith("claim_report_photo_cleanup"):
            return httpx.Response(200, json=[] if state["finished"] else [{"photo_path": PATH}])
        if request.method == "DELETE":
            assert json.loads(request.content) == {"prefixes": [PATH]}
            if not state["failed"]:
                state["failed"] = True
                return httpx.Response(503)
            return httpx.Response(200, json=[])
        if request.url.path.endswith("finish_report_photo_cleanup"):
            state["finished"] = True
            return httpx.Response(200, json=True)
        raise AssertionError("unexpected request")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            worker = PhotoCleanupRunner(client, "https://test.supabase.co", "synthetic-key")
            with pytest.raises(CleanupError, match="storage_delete_rejected"):
                await worker.run()
            assert not state["finished"]
            assert await worker.run() == 1
    asyncio.run(run())

def test_cleanup_requires_verified_storage_absence():
    def upstream(request):
        if request.url.path.endswith("claim_report_photo_cleanup"):
            return httpx.Response(200, json=[{"photo_path": PATH}])
        if request.method == "DELETE":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=False)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
            with pytest.raises(CleanupError, match="storage_delete_unconfirmed"):
                await PhotoCleanupRunner(client, "https://test.supabase.co", "synthetic-key").run()
    asyncio.run(run())
