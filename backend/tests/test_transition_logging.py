import logging

import httpx
from fastapi.testclient import TestClient

from server import app, log


def test_client_build_logging_uses_allowlist_and_never_logs_header_text(monkeypatch, caplog):
    monkeypatch.setenv("API_KNOWN_CLIENT_BUILDS", "web/1.0.0,android/1.0.0")
    assert log.isEnabledFor(logging.INFO)
    with TestClient(app) as client:
        assert client.get("/health", headers={"X-ZelaDF-Client": "android/1.0.0"}).status_code == 200
        assert client.get("/health", headers={"X-ZelaDF-Client": "private-token-123"}).status_code == 200
    lines = [record.getMessage() for record in caplog.records if "request method=" in record.getMessage()]
    assert len(lines) == 2
    assert "method=GET route=/health" in lines[0] and "client=android/1.0.0" in lines[0]
    assert "client=unknown" in lines[1]
    assert "private-token-123" not in caplog.text


def test_upstream_http_urls_are_not_logged_when_root_is_info(caplog):
    url = "https://project.supabase.co/rest/v1/reports?user_id=private-account-id"
    with caplog.at_level(logging.INFO):
        with httpx.Client(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=[]))) as client:
            assert client.get(url).status_code == 200
    assert url not in caplog.text
    assert "private-account-id" not in caplog.text


def test_unexpected_exception_does_not_log_sensitive_error(monkeypatch, caplog):
    monkeypatch.delenv("API_KNOWN_CLIENT_BUILDS", raising=False)

    def failure():
        raise RuntimeError("private@example.invalid bearer-secret")

    app.add_api_route("/__test_unexpected_error", failure, methods=["GET"])
    try:
        with caplog.at_level(logging.INFO, logger="zeladf.api"):
            with TestClient(app) as client:
                response = client.get("/__test_unexpected_error", headers={
                    "X-ZelaDF-Client": "private-token-123",
                })
        assert response.status_code == 503
        assert "private@example.invalid" not in caplog.text
        assert "bearer-secret" not in caplog.text
        assert "private-token-123" not in caplog.text
        assert "unhandled_api_failure" in caplog.text
    finally:
        app.router.routes[:] = [route for route in app.router.routes
                                if getattr(route, "path", None) != "/__test_unexpected_error"]

import pytest

@pytest.fixture(autouse=True)
def capture_api_logger(caplog):
    # The application owns its handler and does not propagate to the root logger.
    log.addHandler(caplog.handler)
    try:
        yield
    finally:
        log.removeHandler(caplog.handler)
