import type { Status } from "../data"
import type { FlagReason } from "./communitySafety"
import type { ReportStatusHistory } from "./reportService"
import { ReportServiceError } from "./reportService"
import { REPORT_STATUSES } from "./reportStatus"
import { supabase } from "./supabaseClient"
import { apiClientIdentityHeader } from "./apiClientIdentity"

const enabled = import.meta.env.VITE_API_COMMUNITY_STATUS_ENABLED === "true"
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")

export function useCommunityStatusApi(): boolean {
  return enabled
}

function failure(status?: number): Error {
  if (status === 401) return new Error("Entre na sua conta novamente antes de continuar.")
  if (status === 403) return new Error("Você não tem permissão para esta operação.")
  if (status === 404) return new Error("Aviso indisponível. Atualize os avisos.")
  if (status === 429) return new Error("Limite de denúncias atingido. Aguarde antes de enviar outra.")
  if (status === 422) return new Error("Revise os dados da solicitação.")
  return new Error("Não foi possível confirmar a operação. Atualize os avisos antes de tentar novamente.")
}

async function apiRequest(method: "GET" | "PUT" | "POST" | "DELETE", path: string,
  body?: object): Promise<unknown> {
  if (!baseUrl || !supabase) throw new Error("A API de comunidade não está configurada.")
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw failure(401)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...apiClientIdentityHeader(),
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw failure()
  }
  if (!response.ok) {
    if (response.status === 422) {
      let code: string | undefined
      try {
        const body = await response.json() as { error?: { code?: string } }
        code = body.error?.code
      } catch {}
      if (code === "legacy_author") {
        throw new Error("Este aviso antigo não tem uma conta de autor vinculada. Você pode denunciar o conteúdo.")
      }
    }
    throw failure(response.status)
  }
  try {
    return await response.json()
  } catch {
    throw failure()
  }
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  throw failure()
}

export async function acceptCommunityTermsViaApi(version: string): Promise<void> {
  const result = object(await apiRequest("PUT", "/me/community-terms", { version }))
  if (result.accepted !== true || result.version !== version) throw failure()
}

export async function flagReportViaApi(reportId: string, target: "report" | "author",
  reason: FlagReason, details: string): Promise<string> {
  const result = object(await apiRequest("POST", `/reports/${encodeURIComponent(reportId)}/flags`,
    { target, reason, details }))
  if (typeof result.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id)) {
    throw new Error("A denúncia não foi confirmada. Tente novamente.")
  }
  return result.id
}

export async function blockReportAuthorViaApi(reportId: string): Promise<void> {
  const result = object(await apiRequest("POST", `/reports/${encodeURIComponent(reportId)}/author-block`))
  if (result.blocked !== true) throw failure()
}

export async function clearCommunityBlocksViaApi(): Promise<void> {
  const result = object(await apiRequest("DELETE", "/me/author-blocks"))
  if (result.cleared !== true) throw failure()
}

export async function fetchOperatorAccessViaApi(): Promise<boolean> {
  const result = object(await apiRequest("GET", "/operator/access"))
  if (typeof result.allowed !== "boolean") throw failure()
  return result.allowed
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value)
}

export async function fetchReportStatusHistoryViaApi(reportId: string): Promise<ReportStatusHistory[]> {
  const entries: ReportStatusHistory[] = []
  for (let page = 0; page <= 1000; page += 1) {
    const result = object(await apiRequest("GET",
      `/operator/reports/${encodeURIComponent(reportId)}/status-history?page=${page}`))
    if (!Array.isArray(result.entries) || typeof result.hasMore !== "boolean") throw failure()
    for (const item of result.entries) {
      const row = object(item)
      if (typeof row.id !== "string" || !isStatus(row.fromStatus) ||
          !isStatus(row.toStatus) || typeof row.reason !== "string" ||
          typeof row.changedAt !== "string") throw failure()
      entries.push({ id: row.id, fromStatus: row.fromStatus, toStatus: row.toStatus,
        reason: row.reason, changedAt: row.changedAt })
    }
    if (!result.hasMore) return entries
    if (!result.entries.length) throw failure()
  }
  throw failure()
}

export async function changeReportStatusViaApi(reportId: string, nextStatus: Status,
  reason: string): Promise<void> {
  try {
    const result = object(await apiRequest("POST",
      `/operator/reports/${encodeURIComponent(reportId)}/status`,
      { newStatus: nextStatus, reason }))
    if (result.status === nextStatus) return
    throw new ReportServiceError("status", "Não foi possível confirmar a alteração de status. Atualize os avisos.")
  } catch (error) {
    // The RPC may have committed before its response was lost. The latest
    // operator-only history entry can confirm the intended transition.
    try {
      const result = object(await apiRequest("GET",
        `/operator/reports/${encodeURIComponent(reportId)}/status-history?page=0`))
      if (Array.isArray(result.entries) && result.entries.length > 0) {
        const latest = object(result.entries[0])
        if (latest.toStatus === nextStatus && latest.reason === reason.trim()) return
      }
    } catch {
      // Keep the original error; the UI will reload state.
    }
    throw error
  }
}
