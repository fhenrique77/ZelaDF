import type { Report } from "../data"
import { supabase } from "./supabaseClient"
import type { ReportQuery, ReportQueryResult } from "./reportService"
import { apiClientIdentityHeader } from "./apiClientIdentity"

const enabled = import.meta.env.VITE_API_READS_ENABLED === "true"
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")

export function useReportReadApi(): boolean {
  return enabled
}

async function apiGet(path: string, params: URLSearchParams): Promise<unknown> {
  if (!baseUrl || !supabase) throw new Error("A API de avisos não está configurada.")
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error("Não foi possível verificar sua sessão.")
  const response = await fetch(`${baseUrl}/api/v1${path}?${params}`, {
    headers: {
      ...apiClientIdentityHeader(),
      ...(data.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {}),
    },
  })
  if (!response.ok) throw new Error("Não foi possível carregar os avisos. Tente novamente.")
  return response.json()
}

export async function fetchReportsViaApi(query: ReportQuery): Promise<ReportQueryResult> {
  const params = new URLSearchParams()
  for (const key of ["south", "west", "north", "east"] as const) {
    params.set(key, String(query.bounds[key]))
  }
  for (const category of query.categories ?? []) params.append("category", category)
  if (query.status) params.set("status", query.status)
  if (query.limit) params.set("limit", String(query.limit))
  const path = query.onlyMine ? "/me/reports" : "/reports"
  const body = (await apiGet(path, params)) as ReportQueryResult
  if (!Array.isArray(body.reports) || typeof body.truncated !== "boolean" || body.source !== "supabase") {
    throw new Error("Resposta inválida da API de avisos.")
  }
  return body
}

export async function fetchMyVotesViaApi(reportIds: Report["id"][]): Promise<Set<string>> {
  if (!reportIds.length) return new Set()
  const voted = new Set<string>()
  // Stay below the Vercel CDN's URL length limit even with a full viewport.
  for (let index = 0; index < reportIds.length; index += 200) {
    const params = new URLSearchParams()
    for (const id of reportIds.slice(index, index + 200)) params.append("report_ids", id)
    const body = (await apiGet("/me/votes", params)) as { reportIds?: unknown }
    if (!Array.isArray(body.reportIds) || !body.reportIds.every((id) => typeof id === "string")) {
      throw new Error("Resposta inválida da API de confirmações.")
    }
    for (const id of body.reportIds) voted.add(id)
  }
  return voted
}
