import { supabase } from "./supabaseClient"
import { logger } from "./observability"

export type AccountDeletionRequest = {
  id: string
  createdAt: string
  status: "pending" | "in_review"
}

const UNAVAILABLE =
  "Não foi possível acessar o canal de exclusão. Tente novamente mais tarde."

function parseRequest(value: unknown): AccountDeletionRequest {
  if (!value || typeof value !== "object") throw new Error(UNAVAILABLE)
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id) ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    (row.status !== "pending" && row.status !== "in_review")
  )
    throw new Error(UNAVAILABLE)
  return { id: row.id, createdAt: row.created_at, status: row.status }
}

/** RLS returns only this session's request; no account ID comes from the UI. */
export async function fetchAccountDeletionRequest(): Promise<AccountDeletionRequest | null> {
  if (!supabase) throw new Error(UNAVAILABLE)
  try {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select("id,created_at,status")
      .maybeSingle()
    if (error) throw error
    return data === null ? null : parseRequest(data)
  } catch (error) {
    logger.error("privacy.request_lookup_failed", {
      error,
      operation: "select",
    })
    throw new Error(UNAVAILABLE)
  }
}

/** The database derives identity and deduplicates; success requires its receipt. */
export async function requestAccountDeletion(): Promise<AccountDeletionRequest> {
  if (!supabase) throw new Error(UNAVAILABLE)
  try {
    const { data, error } = await supabase.rpc("request_account_deletion")
    if (error) throw error
    if (!Array.isArray(data) || data.length !== 1) throw new Error(UNAVAILABLE)
    return parseRequest(data[0])
  } catch (error) {
    logger.error("privacy.request_create_failed", {
      error,
      operation: "request",
    })
    throw new Error(UNAVAILABLE)
  }
}
