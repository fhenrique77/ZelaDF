import os
import subprocess
import sys
from pathlib import Path


def test_application_errors_include_cors_for_allowed_origin():
    script = """
from fastapi.testclient import TestClient
from server import app
with TestClient(app) as client:
    allowed = client.get('/api/v1/me/reports', headers={'Origin': 'https://localhost'})
    assert allowed.status_code == 401
    assert allowed.headers.get('access-control-allow-origin') == 'https://localhost'
    denied = client.get('/api/v1/me/reports', headers={'Origin': 'https://example.invalid'})
    assert denied.status_code == 401
    assert 'access-control-allow-origin' not in denied.headers
"""
    env = os.environ.copy()
    env['API_CORS_ORIGINS'] = 'https://localhost'
    result = subprocess.run([sys.executable, '-c', script],
                            cwd=Path(__file__).resolve().parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
