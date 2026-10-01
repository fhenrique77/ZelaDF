import { ReportServiceError } from "./reportService"
import { supabase } from "./supabaseClient"
import { apiClientIdentityHeader } from "./apiClientIdentity"

const enabled = import.meta.env.VITE_API_VOTES_ENABLED === "true"
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")

export function useReportVoteApi(): boolean {
  return enabled
}

export async function setReportVoteViaApi(
  reportId: string,
  confirmed: boolean,
): Promise<{ voted: boolean; confirmations: number }> {
  if (!baseUrl || !supabase) {
    throw new ReportServiceError("vote", "A API de confirmações não está configurada.")
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new ReportServiceError("vote", "Entre na sua conta novamente antes de confirmar.")
  }

  let response: Response
  try {
    response = await fetch(
      `${baseUrl}/api/v1/reports/${encodeURIComponent(reportId)}/vote`,
      {
        method: "PUT",
        headers: {
          ...apiClientIdentityHeader(),
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmed }),
      },
    )
  } catch {
    throw new ReportServiceError("vote", "Não foi possível confirmar a operação. Atualize os avisos.")
  }
  if (!response.ok) {
    const message = response.status === 401
      ? "Entre na sua conta novamente antes de confirmar."
      : response.status === 404 || response.status === 403
        ? "Este aviso não está disponível para confirmação. Atualize os avisos."
        : "Não foi possível atualizar sua confirmação. Atualize os avisos."
    throw new ReportServiceError("vote", message)
  }
  try {
    const result: unknown = await response.json()
    if (result && typeof result === "object") {
      const row = result as Record<string, unknown>
      if (typeof row.voted === "boolean" && Number.isInteger(row.confirmations) &&
          (row.confirmations as number) >= 0) {
        return { voted: row.voted, confirmations: row.confirmations as number }
      }
    }
  } catch {
    // A committed vote can have a lost or malformed response; the UI reloads state.
  }
  throw new ReportServiceError("vote", "A resposta da confirmação é inválida. Atualize os avisos.")
}
