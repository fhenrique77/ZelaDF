"""ZelaDF API. Supabase remains the authorization boundary for data."""

import base64
import hashlib
import json
import logging
import math
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field


PUBLIC_COLUMNS = "id,category,title,description,ra,address,lat,lng,photo_url,status,confirmations,created_at"
CATEGORIES = {"agua", "buraco", "poste", "lixo", "semaforo", "outro"}
STATUSES = {"aberto", "andamento", "resolvido"}
# Vercel CDN rejects URLs above 14 KiB; leave room for host and path.
MAX_QUERY_LENGTH = 13000
MAX_VOTE_IDS = 250
MAX_JSON_BODY = 65536
COMMUNITY_TERMS_VERSION = "2026-09-13"
PHOTO_BUCKET = "report-photos"
PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
PHOTO_NAME = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$")
CLIENT_BUILD = re.compile(r"^(?:web|android)/[0-9]+\.[0-9]+(?:\.[0-9]+)?$")
# The Vercel runtime can enable root INFO logging; upstream URLs may contain user IDs or query data.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
log = logging.getLogger("zeladf.api")
log.setLevel(logging.INFO)
log.propagate = False
# Configure only this logger: enabling the root/httpx INFO logs exposes URLs.
if not log.handlers:
    log.addHandler(logging.StreamHandler())


class ApiFailure(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def settings():
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_PUBLIC_KEY", "").strip()
    if not url or not key:
        log.error("api_configuration_missing url_present=%s key_present=%s", bool(url), bool(key))
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        log.error("api_configuration_invalid_url")
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    return url, key


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
        app.state.http = client
        yield


app = FastAPI(title="ZelaDF API", lifespan=lifespan)
def logged_client_build(request: Request):
    supplied = request.headers.get("X-ZelaDF-Client", "")
    configured = os.getenv("API_KNOWN_CLIENT_BUILDS", "").split(",")[:20]
    known = {value.strip() for value in configured if CLIENT_BUILD.fullmatch(value.strip())}
    return supplied if supplied in known else "unknown"


def logged_method(request: Request):
    return request.method if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"} else "OTHER"


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    start = time.monotonic()
    product_body = (
        request.method in ("POST", "PUT", "PATCH") and (
            request.url.path.startswith("/api/v1/reports")
            or request.url.path.startswith("/api/v1/me/community-terms")
            or request.url.path.startswith("/api/v1/operator/reports")
        )
    ) or (request.method == "DELETE" and request.url.path == "/api/v1/me/author-blocks")
    if product_body and len(await request.body()) > MAX_JSON_BODY:
        response = error_response(request, ApiFailure(413, "body_too_large", "Dados excedem o limite permitido."))
    elif len(request.url.query) > MAX_QUERY_LENGTH:
        response = error_response(request, ApiFailure(400, "invalid_query", "Consulta inválida."))
    else:
        try:
            response = await call_next(request)
        except ApiFailure as exc:
            response = error_response(request, exc)
        except httpx.HTTPError:
            response = error_response(request, ApiFailure(503, "dependency_unavailable", "Serviço indisponível."))
        except Exception:
            # Exception messages can contain upstream URLs, headers or user data.
            log.error("unhandled_api_failure")
            response = error_response(request, ApiFailure(503, "dependency_unavailable", "Serviço indisponível."))
    response.headers["X-Request-ID"] = request.state.request_id
    # Reads can include ownership, private votes and account-specific visibility.
    if request.url.path.startswith("/api/v1/"):
        response.headers["Cache-Control"] = "no-store"
    log.info("request method=%s route=%s status=%s duration_ms=%d request_id=%s client=%s", logged_method(request), request.scope.get("route").path if request.scope.get("route") else "unknown", response.status_code, round((time.monotonic() - start) * 1000), request.state.request_id, logged_client_build(request))
    return response


# Keep CORS outermost so errors returned by request_context retain CORS headers.
origins = [item.strip() for item in os.getenv("API_CORS_ORIGINS", "").split(",") if item.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Idempotency-Key", "Content-Type", "X-ZelaDF-Client"], allow_credentials=False)


def error_response(request: Request, error: ApiFailure):
    return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message, "requestId": request.state.request_id}})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, _error: RequestValidationError):
    if request.method in ("POST", "PUT", "PATCH"):
        if request.url.path.startswith(("/api/v1/me/community-terms", "/api/v1/operator/reports")) or request.url.path.endswith("/flags"):
            return error_response(request, ApiFailure(422, "invalid_request", "Revise os dados da solicitação."))
        if request.url.path.startswith("/api/v1/reports"):
            return error_response(request, ApiFailure(422, "invalid_report", "Revise os dados do aviso."))
    return error_response(request, ApiFailure(400, "invalid_query", "Consulta inválida."))


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/ready")
async def ready(request: Request):
    url, key = settings()
    try:
        response = await request.app.state.http.get(f"{url}/auth/v1/health", headers={"apikey": key})
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    return {"ok": True}


def bearer(request: Request):
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token or " " in token:
        raise ApiFailure(401, "unauthorized", "Sessão inválida.")
    return token


async def identity(request: Request, required: bool = False):
    token = bearer(request)
    if not token:
        if required:
            raise ApiFailure(401, "unauthorized", "Entre na sua conta.")
        return None
    url, key = settings()
    try:
        response = await request.app.state.http.get(f"{url}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if response.status_code in (401, 403):
        raise ApiFailure(401, "unauthorized", "Sessão inválida.")
    if response.status_code != 200:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        user = response.json()
        sub = str(uuid.UUID(claims["sub"]))
        issuer = f"{url}/auth/v1"
        if claims["iss"] != issuer or claims["aud"] != "authenticated" or claims["role"] != "authenticated" or claims["exp"] <= datetime.now(timezone.utc).timestamp() or user["id"] != sub:
            raise ValueError("Invalid claims")
    except (IndexError, KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ApiFailure(401, "unauthorized", "Sessão inválida.") from exc
    request.state.user_id = sub
    return token


async def optional_identity(request: Request):
    return await identity(request)


async def required_identity(request: Request):
    return await identity(request, required=True)


async def data_request(request: Request, method: str, path: str, token: str | None, *, params=None, body=None):
    url, key = settings()
    headers = {"apikey": key, "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = await request.app.state.http.request(method, f"{url}/rest/v1/{path}", headers=headers, params=params, json=body)
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if response.status_code in (401, 403):
        raise ApiFailure(401 if response.status_code == 401 else 403, "access_denied", "Acesso indisponível.")
    if response.status_code >= 400:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    try:
        result = response.json()
        if not isinstance(result, list):
            raise ValueError("Expected list")
        return result
    except (ValueError, json.JSONDecodeError) as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc


def parse_filters(request: Request):
    query = request.query_params
    allowed = {"south", "west", "north", "east", "category", "status", "limit"}
    if any(key not in allowed for key in query.keys()) or any(len(query.getlist(key)) != 1 for key in allowed - {"category"} if key in query):
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    try:
        south, west, north, east = (float(query[key]) for key in ("south", "west", "north", "east"))
        limit = int(query.get("limit", "200"))
    except (KeyError, ValueError) as exc:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.") from exc
    if not all(math.isfinite(v) for v in (south, west, north, east)) or not -90 <= south <= 90 or not -90 <= north <= 90 or not -180 <= west <= 180 or not -180 <= east <= 180 or not 1 <= limit <= 500:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    categories = query.getlist("category")
    if len(categories) > len(CATEGORIES) or any(category not in CATEGORIES for category in categories) or len(set(categories)) != len(categories):
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    status = query.get("status")
    if status is not None and status not in STATUSES:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    return min(south, north), min(west, east), max(south, north), max(west, east), categories, status, limit


def report_dto(row, is_owner=False):
    try:
        return {"id": row["id"], "category": row["category"], "title": row["title"], "description": row["description"] or "", "ra": row["ra"], "address": row["address"], "lat": row["lat"], "lng": row["lng"], "photo": row["photo_url"], "status": row["status"], "createdAt": row["created_at"], "confirmations": row["confirmations"], "isOwner": is_owner}
    except KeyError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc


async def owned_ids(request: Request, token: str, ids: list[str]):
    if not ids:
        return set()
    try:
        rows = await data_request(request, "POST", "rpc/get_my_report_ids", token, body={"p_report_ids": ids})
        return {row["report_id"] for row in rows}
    except (ApiFailure, KeyError):
        # Public content can still load, as in the existing client. Never infer ownership.
        log.warning("ownership_lookup_failed")
        return set()


async def list_reports(request: Request, token: str | None, only_mine: bool):
    south, west, north, east, categories, status, limit = parse_filters(request)
    if only_mine:
        rows = await data_request(request, "POST", "rpc/get_my_reports", token, body={"p_south": south, "p_west": west, "p_north": north, "p_east": east, "p_categories": categories or None, "p_status": status, "p_limit": limit + 1})
    else:
        params = {"select": PUBLIC_COLUMNS, "lat": f"gte.{south}", "lng": f"gte.{west}", "and": f"(lat.lte.{north},lng.lte.{east})", "order": "created_at.desc", "limit": str(limit + 1)}
        if categories:
            params["category"] = f"in.({','.join(categories)})"
        if status:
            params["status"] = f"eq.{status}"
        rows = await data_request(request, "GET", "reports", token, params=params)
    visible = rows[:limit]
    owners = {row["id"] for row in visible} if only_mine else await owned_ids(request, token, [row["id"] for row in visible]) if token else set()
    return {"reports": [report_dto(row, row["id"] in owners) for row in visible], "truncated": len(rows) > limit, "source": "supabase"}


@app.get("/api/v1/reports")
async def reports(request: Request, token: str | None = Depends(optional_identity)):
    return await list_reports(request, token, False)


@app.get("/api/v1/me/reports")
async def my_reports(request: Request, token: str = Depends(required_identity)):
    return await list_reports(request, token, True)


@app.get("/api/v1/reports/{report_id}")
async def report_detail(report_id: str, request: Request, token: str | None = Depends(optional_identity)):
    try:
        report_id = str(uuid.UUID(report_id))
    except ValueError as exc:
        raise ApiFailure(400, "invalid_query", "Identificador inválido.") from exc
    rows = await data_request(request, "GET", "reports", token, params={"select": PUBLIC_COLUMNS, "id": f"eq.{report_id}", "limit": "1"})
    if not rows:
        raise ApiFailure(404, "not_found", "Aviso não encontrado.")
    owners = await owned_ids(request, token, [report_id]) if token else set()
    return report_dto(rows[0], report_id in owners)


@app.get("/api/v1/me/votes")
async def my_votes(request: Request, token: str = Depends(required_identity)):
    query = request.query_params
    if any(key != "report_ids" for key in query.keys()):
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    ids = query.getlist("report_ids")
    if len(ids) > MAX_VOTE_IDS:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    try:
        ids = [str(uuid.UUID(value)) for value in ids]
    except ValueError as exc:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.") from exc
    if not ids:
        return {"reportIds": []}
    rows = await data_request(request, "GET", "votes", token, params={"select": "report_id", "report_id": f"in.({','.join(ids)})", "limit": "500"})
    return {"reportIds": list({row["report_id"] for row in rows})}


def deletion_request_dto(rows):
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise ApiFailure(503, "invalid_receipt", "Não foi possível confirmar a solicitação.")
    row = rows[0]
    try:
        receipt_id = str(uuid.UUID(row["id"]))
        created_at = row["created_at"]
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if created.tzinfo is None or row["status"] not in ("pending", "in_review"):
            raise ValueError("Invalid receipt")
    except (KeyError, AttributeError, ValueError, TypeError) as exc:
        raise ApiFailure(503, "invalid_receipt", "Não foi possível confirmar a solicitação.") from exc
    return {"id": receipt_id, "createdAt": created_at, "status": row["status"]}


@app.get("/api/v1/me/deletion-requests/current")
async def current_deletion_request(request: Request, token: str = Depends(required_identity)):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    rows = await data_request(request, "GET", "account_deletion_requests", token,
                              params={"select": "id,created_at,status", "limit": "2"})
    if not rows:
        raise ApiFailure(404, "not_found", "Solicitação não encontrada.")
    return deletion_request_dto(rows)


@app.post("/api/v1/me/deletion-requests")
async def create_deletion_request(request: Request, token: str = Depends(required_identity)):
    if request.url.query or request.headers.get("content-length") not in (None, "0"):
        raise ApiFailure(400, "invalid_request", "A solicitação não aceita dados adicionais.")
    async for chunk in request.stream():
        if chunk:
            raise ApiFailure(400, "invalid_request", "A solicitação não aceita dados adicionais.")
    rows = await data_request(request, "POST", "rpc/request_account_deletion", token, body={})
    return deletion_request_dto(rows)


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str
    title: str
    description: str = ""
    ra: str
    address: str
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    photoPath: str | None = None


class ReportPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str | None = None
    title: str | None = None
    description: str | None = None
    photoPath: str | None = None


class VoteSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: bool = Field(strict=True)


def normalized_text(value: str, minimum: int, maximum: int):
    if not isinstance(value, str):
        raise ApiFailure(422, "invalid_report", "Revise os dados do aviso.")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ApiFailure(422, "invalid_report", "Revise os dados do aviso.")
    return value


def check_category(value: str):
    if value not in CATEGORIES:
        raise ApiFailure(422, "invalid_report", "Revise os dados do aviso.")
    return value


def report_uuid(value: str):
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise ApiFailure(400, "invalid_query", "Identificador inválido.") from exc


def photo_url(path: str):
    url, _ = settings()
    return f"{url}/storage/v1/object/public/{PHOTO_BUCKET}/{path}"


def managed_photo_path(url: str, actor: str):
    prefix = photo_url(f"{actor}/")
    if not url.startswith(prefix):
        return None
    filename = url[len(prefix):]
    return f"{actor}/{filename}" if PHOTO_NAME.fullmatch(filename) else None


async def ensure_owned_photo(request: Request, token: str, path: str, current_report_id: str | None = None,
                             *, check_association: bool = True):
    actor = request.state.user_id
    folder, separator, filename = path.partition("/")
    if folder != actor or separator != "/" or not PHOTO_NAME.fullmatch(filename):
        raise ApiFailure(422, "invalid_photo", "Foto inválida.")
    extension = filename.rsplit(".", 1)[1]
    url, key = settings()
    headers = {"apikey": key, "Authorization": f"Bearer {token}"}
    try:
        response = await request.app.state.http.get(f"{url}/storage/v1/object/info/{PHOTO_BUCKET}/{path}", headers=headers)
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if response.status_code in (400, 403, 404):
        raise ApiFailure(422, "invalid_photo", "Foto inválida.")
    if response.status_code != 200:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    try:
        info = response.json()
        metadata = info.get("metadata") or {}
        content_type = info.get("content_type", metadata.get("mimetype"))
        size = info.get("size", metadata.get("size"))
        if (info.get("name") not in (path, filename) or content_type != PHOTO_MIME[extension]
                or type(size) is not int or not 0 < size <= PHOTO_MAX_BYTES
                or info.get("owner_id", actor) != actor or info.get("bucket_id", PHOTO_BUCKET) != PHOTO_BUCKET):
            raise ValueError("Invalid object metadata")
    except (ValueError, AttributeError, TypeError) as exc:
        raise ApiFailure(422, "invalid_photo", "Foto inválida.") from exc
    if check_association:
        linked = await data_request(request, "GET", "reports", token,
                                    params={"select": "id", "photo_url": f"eq.{photo_url(path)}", "limit": "2"})
        if any(row.get("id") != current_report_id for row in linked):
            raise ApiFailure(409, "photo_in_use", "Foto já associada a outro aviso.")
    return photo_url(path)


async def remove_photo(request: Request, token: str, path: str):
    url, key = settings()
    headers = {"apikey": key, "Authorization": f"Bearer {token}"}
    try:
        claim = await request.app.state.http.post(
            f"{url}/rest/v1/rpc/claim_report_photo_cleanup", headers=headers,
            json={"p_photo_path": path, "p_limit": 1})
        if claim.status_code == 200:
            rows = claim.json()
            if rows == []:
                # Already absent or still referenced, including hidden reports.
                return True
            if rows != [{"photo_path": path}]:
                raise ValueError("Invalid cleanup claim")
            response = await request.app.state.http.request(
                "DELETE", f"{url}/storage/v1/object/{PHOTO_BUCKET}",
                headers=headers, json={"prefixes": [path]})
            if response.status_code == 200:
                finished = await request.app.state.http.post(
                    f"{url}/rest/v1/rpc/finish_report_photo_cleanup", headers=headers,
                    json={"p_photo_path": path})
                if finished.status_code == 200 and finished.json() is True:
                    return True
    except (httpx.HTTPError, ValueError):
        pass
    log.warning("photo_cleanup_failed")
    await queue_photo_cleanup(request, token, path)
    return False


async def queue_photo_cleanup(request: Request, token: str, path: str):
    url, key = settings()
    try:
        response = await request.app.state.http.post(
            f"{url}/rest/v1/rpc/queue_report_photo_cleanup",
            headers={"apikey": key, "Authorization": f"Bearer {token}"},
            json={"p_photo_path": path},
        )
        if response.status_code < 300:
            return
    except httpx.HTTPError:
        pass
    log.warning("photo_cleanup_queue_failed")


async def compensate_new_photo(request: Request, token: str, path: str):
    # A failed response can follow a committed write: keep any linked object.
    try:
        rows = await data_request(request, "GET", "reports", token,
                                  params={"select": "id", "photo_url": f"eq.{photo_url(path)}", "limit": "1"})
        if not rows:
            await remove_photo(request, token, path)
    except ApiFailure:
        log.warning("photo_compensation_deferred")
        await queue_photo_cleanup(request, token, path)


async def cleanup_unlinked_photo(request: Request, token: str, path: str):
    try:
        rows = await data_request(request, "GET", "reports", token,
                                  params={"select": "id", "photo_url": f"eq.{photo_url(path)}", "limit": "1"})
        return bool(rows) or await remove_photo(request, token, path)
    except ApiFailure:
        log.warning("photo_cleanup_deferred")
        await queue_photo_cleanup(request, token, path)
        return False


async def write_rows(request: Request, method: str, path: str, token: str, *, body=None, params=None):
    url, key = settings()
    try:
        response = await request.app.state.http.request(
            method, f"{url}/rest/v1/{path}", params=params, json=body,
            headers={"apikey": key, "Authorization": f"Bearer {token}",
                     "Accept": "application/json", "Prefer": "return=representation"},
        )
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        if response.status_code == 401:
            raise ApiFailure(401, "unauthorized", "Sessão inválida.")
        if code == "PT429" or response.status_code == 429:
            raise ApiFailure(429, "rate_limited", "Limite de publicações atingido. Aguarde antes de tentar novamente.")
        if code == "23505":
            raise ApiFailure(409, "conflict", "Operação em conflito. Atualize os avisos.")
        if code == "P0002":
            raise ApiFailure(404, "not_found", "Aviso não encontrado.")
        if code in ("22023", "23514", "22P02"):
            raise ApiFailure(422, "invalid_report", "Revise os dados do aviso.")
        if code == "42501" or response.status_code == 403:
            raise ApiFailure(403, "access_denied", "Operação não permitida.")
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    try:
        rows = response.json()
        if isinstance(rows, list):
            return rows
    except ValueError:
        pass
    raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")


async def owned_report(request: Request, token: str, report_id: str):
    rows = await data_request(request, "GET", "reports", token,
                              params={"select": PUBLIC_COLUMNS, "id": f"eq.{report_id}", "limit": "1"})
    if not rows:
        raise ApiFailure(404, "not_found", "Aviso não encontrado.")
    owner_rows = await data_request(request, "POST", "rpc/get_my_report_ids", token,
                                    body={"p_report_ids": [report_id]})
    if not any(row.get("report_id") == report_id for row in owner_rows):
        raise ApiFailure(403, "access_denied", "Operação não permitida.")
    return rows[0]


@app.post("/api/v1/reports")
async def create_report(input: ReportCreate, request: Request, token: str = Depends(required_identity)):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    key = request.headers.get("Idempotency-Key", "")
    try:
        key = str(uuid.UUID(key))
    except ValueError as exc:
        raise ApiFailure(400, "idempotency_required", "Chave de operação inválida.") from exc
    values = {
        "category": check_category(input.category),
        "title": normalized_text(input.title, 5, 120),
        "description": input.description.strip() or "Sem descrição adicional.",
        "ra": normalized_text(input.ra, 2, 80),
        "address": normalized_text(input.address, 3, 200),
        "lat": input.lat, "lng": input.lng,
    }
    if len(values["description"]) > 2000:
        raise ApiFailure(422, "invalid_report", "Revise os dados do aviso.")
    path = input.photoPath
    if path is not None:
        # The atomic RPC checks association after the idempotency replay branch.
        await ensure_owned_photo(request, token, path, check_association=False)
    values["photoPath"] = path
    digest = hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    args = {f"p_{name}": value for name, value in values.items() if name != "photoPath"}
    args.update({"p_request_key": key, "p_payload_hash": digest,
                 "p_photo_path": path, "p_photo_url": photo_url(path) if path else ""})
    try:
        rows = await write_rows(request, "POST", "rpc/create_report_idempotent", token, body=args)
    except ApiFailure:
        if path:
            await compensate_new_photo(request, token, path)
        raise
    if len(rows) != 1:
        if path:
            await compensate_new_photo(request, token, path)
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    report = report_dto(rows[0], True)
    initial_vote_failed = False
    try:
        vote = await data_request(request, "POST", "rpc/set_report_vote", token,
                                  body={"p_report_id": report["id"], "p_voted": True,
                                        "p_device_id": request.state.user_id})
        if len(vote) != 1 or type(vote[0].get("confirmations")) is not int:
            raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
        report["confirmations"] = vote[0]["confirmations"]
    except ApiFailure:
        initial_vote_failed = True
    return {"report": report, "initialVoteFailed": initial_vote_failed}


@app.patch("/api/v1/reports/{report_id}")
async def patch_report(report_id: str, input: ReportPatch, request: Request,
                       token: str = Depends(required_identity)):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    report_id = report_uuid(report_id)
    current = await owned_report(request, token, report_id)
    updates = {}
    if "category" in input.model_fields_set:
        updates["category"] = check_category(input.category)
    if "title" in input.model_fields_set:
        updates["title"] = normalized_text(input.title, 5, 120)
    if "description" in input.model_fields_set:
        updates["description"] = normalized_text(input.description, 0, 2000) or "Sem descrição adicional."
    path = input.photoPath if "photoPath" in input.model_fields_set else None
    if "photoPath" in input.model_fields_set:
        if not path:
            raise ApiFailure(422, "invalid_photo", "Foto inválida.")
        updates["photo_url"] = await ensure_owned_photo(request, token, path, report_id)
    if not updates or all(current.get(name) == value for name, value in updates.items()):
        raise ApiFailure(422, "invalid_report", "Nenhuma alteração foi informada.")
    params = {"id": f"eq.{report_id}", "select": PUBLIC_COLUMNS}
    if "photo_url" in updates:
        params["photo_url"] = f"eq.{current['photo_url']}"
    try:
        rows = await write_rows(request, "PATCH", "reports", token, body=updates, params=params)
    except ApiFailure:
        if path and updates.get("photo_url") != current.get("photo_url"):
            await compensate_new_photo(request, token, path)
        raise
    if len(rows) != 1:
        if path and updates.get("photo_url") != current.get("photo_url"):
            await compensate_new_photo(request, token, path)
        raise ApiFailure(409, "conflict", "Aviso alterado em outra sessão. Atualize os avisos.")
    old_path = managed_photo_path(current.get("photo_url") or "", request.state.user_id)
    cleanup_failed = bool(old_path and "photo_url" in updates and updates["photo_url"] != current["photo_url"]
                          and not await cleanup_unlinked_photo(request, token, old_path))
    return {"report": report_dto(rows[0], True), "photoCleanupFailed": cleanup_failed}


@app.delete("/api/v1/reports/{report_id}")
async def remove_report(report_id: str, request: Request, token: str = Depends(required_identity)):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    report_id = report_uuid(report_id)
    await owned_report(request, token, report_id)
    rows = await write_rows(request, "DELETE", "reports", token,
                            params={"id": f"eq.{report_id}", "select": "id,photo_url"})
    if len(rows) != 1 or rows[0].get("id") != report_id:
        raise ApiFailure(404, "not_found", "Aviso não encontrado.")
    old_path = managed_photo_path(rows[0].get("photo_url") or "", request.state.user_id)
    cleanup_failed = bool(old_path and not await cleanup_unlinked_photo(request, token, old_path))
    return {"photoCleanupFailed": cleanup_failed}


@app.put("/api/v1/reports/{report_id}/vote")
async def set_vote(report_id: str, input: VoteSet, request: Request,
                   token: str = Depends(required_identity)):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    report_id = report_uuid(report_id)
    rows = await write_rows(request, "POST", "rpc/set_report_vote", token,
                            body={"p_report_id": report_id, "p_voted": input.confirmed,
                                  "p_device_id": request.state.user_id})
    if (len(rows) != 1 or not isinstance(rows[0], dict)
            or type(rows[0].get("voted")) is not bool
            or type(rows[0].get("confirmations")) is not int
            or rows[0]["confirmations"] < 0):
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    return {"voted": rows[0]["voted"], "confirmations": rows[0]["confirmations"]}


class TermsAcceptance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str


class CommunityFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: Literal["report", "author"]
    reason: Literal["spam", "violence", "hate", "sexual", "privacy", "other"]
    details: str = Field(max_length=500)


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    newStatus: Literal["aberto", "andamento", "resolvido"]
    reason: str


async def rpc_response(request: Request, token: str, name: str, body: dict):
    url, key = settings()
    try:
        response = await request.app.state.http.post(
            f"{url}/rest/v1/rpc/{name}", json=body,
            headers={"apikey": key, "Authorization": f"Bearer {token}",
                     "Accept": "application/json"},
        )
    except httpx.HTTPError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if response.status_code >= 400:
        try:
            upstream_error = response.json()
            code = upstream_error.get("code")
        except (ValueError, AttributeError):
            upstream_error = {}
            code = None
        if response.status_code == 401:
            raise ApiFailure(401, "unauthorized", "Sessão inválida.")
        if code == "42501" or response.status_code == 403:
            raise ApiFailure(403, "access_denied", "Operação não permitida.")
        if code == "P0002":
            raise ApiFailure(404, "not_found", "Aviso indisponível.")
        if code == "54000":
            raise ApiFailure(429, "rate_limited", "Limite de denúncias atingido. Aguarde antes de enviar outra.")
        if code == "22023":
            if name in ("block_report_author", "flag_report") and upstream_error.get("message") in (
                "Legacy report has no account author",
                "Legacy report has no account author; report the content instead",
            ):
                raise ApiFailure(422, "legacy_author", "Este aviso antigo não tem uma conta de autor vinculada. Você pode denunciar o conteúdo.")
            raise ApiFailure(422, "invalid_action", "Revise os dados da solicitação.")
        if code == "23505":
            raise ApiFailure(409, "conflict", "Operação em conflito. Atualize os avisos.")
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    return response


def require_empty_request(request: Request):
    if request.url.query:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")


async def require_empty_body(request: Request):
    require_empty_request(request)
    if await request.body():
        raise ApiFailure(400, "invalid_request", "A solicitação não aceita dados adicionais.")


@app.put("/api/v1/me/community-terms")
async def accept_terms(input: TermsAcceptance, request: Request,
                       token: str = Depends(required_identity)):
    require_empty_request(request)
    if input.version != COMMUNITY_TERMS_VERSION:
        raise ApiFailure(422, "invalid_terms_version", "Versão dos termos inválida.")
    await rpc_response(request, token, "accept_community_terms", {"p_version": input.version})
    return {"accepted": True, "version": COMMUNITY_TERMS_VERSION}


@app.post("/api/v1/reports/{report_id}/flags")
async def create_flag(report_id: str, input: CommunityFlag, request: Request,
                      token: str = Depends(required_identity)):
    require_empty_request(request)
    report_id = report_uuid(report_id)
    response = await rpc_response(request, token, "flag_report", {
        "p_report_id": report_id, "p_target": input.target,
        "p_reason": input.reason, "p_details": input.details.strip(),
    })
    try:
        receipt = response.json()
        if not isinstance(receipt, str):
            raise ValueError("Invalid receipt")
        receipt = str(uuid.UUID(receipt))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ApiFailure(503, "invalid_receipt", "Não foi possível confirmar a denúncia.") from exc
    return {"id": receipt}


@app.post("/api/v1/reports/{report_id}/author-block")
async def block_author(report_id: str, request: Request,
                       token: str = Depends(required_identity)):
    await require_empty_body(request)
    report_id = report_uuid(report_id)
    await rpc_response(request, token, "block_report_author", {"p_report_id": report_id})
    return {"blocked": True}


@app.delete("/api/v1/me/author-blocks")
async def clear_author_blocks(request: Request, token: str = Depends(required_identity)):
    await require_empty_body(request)
    await rpc_response(request, token, "clear_my_community_blocks", {})
    return {"cleared": True}


async def operator_allowed(request: Request, token: str):
    response = await rpc_response(request, token, "current_user_is_operator", {})
    try:
        allowed = response.json()
    except ValueError as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    if type(allowed) is not bool:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.")
    return allowed


@app.get("/api/v1/operator/access")
async def operator_access(request: Request, token: str = Depends(required_identity)):
    require_empty_request(request)
    return {"allowed": await operator_allowed(request, token)}


@app.get("/api/v1/operator/reports/{report_id}/status-history")
async def status_history(report_id: str, request: Request,
                         token: str = Depends(required_identity)):
    report_id = report_uuid(report_id)
    query = request.query_params
    if any(key != "page" for key in query.keys()) or len(query.getlist("page")) > 1:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    try:
        page = int(query.get("page", "0"))
    except ValueError as exc:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.") from exc
    if not 0 <= page <= 1000:
        raise ApiFailure(400, "invalid_query", "Consulta inválida.")
    if not await operator_allowed(request, token):
        raise ApiFailure(403, "access_denied", "Operação não permitida.")
    rows = await data_request(request, "GET", "report_status_history", token,
                              params={"select": "id,from_status,to_status,reason,changed_at",
                                      "report_id": f"eq.{report_id}",
                                      "order": "changed_at.desc,id.desc", "limit": "101",
                                      "offset": str(page * 100)})
    entries = []
    try:
        for row in rows[:100]:
            if (row["from_status"] not in STATUSES or row["to_status"] not in STATUSES
                    or not isinstance(row["reason"], str)
                    or not isinstance(row["changed_at"], str)):
                raise ValueError("Invalid history")
            entries.append({"id": str(uuid.UUID(row["id"])),
                            "fromStatus": row["from_status"],
                            "toStatus": row["to_status"],
                            "reason": row["reason"], "changedAt": row["changed_at"]})
    except (KeyError, TypeError, ValueError) as exc:
        raise ApiFailure(503, "dependency_unavailable", "Serviço indisponível.") from exc
    return {"entries": entries, "hasMore": len(rows) > 100}


@app.post("/api/v1/operator/reports/{report_id}/status")
async def change_status(report_id: str, input: StatusChange, request: Request,
                        token: str = Depends(required_identity)):
    require_empty_request(request)
    report_id = report_uuid(report_id)
    reason = input.reason.strip()
    if not 10 <= len(reason) <= 500:
        raise ApiFailure(422, "invalid_status_reason", "Informe um motivo entre 10 e 500 caracteres.")
    await rpc_response(request, token, "change_report_status", {
        "p_report_id": report_id, "p_new_status": input.newStatus,
        "p_reason": reason,
    })
    return {"status": input.newStatus}
