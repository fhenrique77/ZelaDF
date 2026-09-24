import { isConfigured, supabase } from "./supabaseClient"
export const COMMUNITY_TERMS_VERSION = "2026-09-13"
export const COMMUNITY_TERMS_URL = "./terms.html"
export const FLAG_REASONS = {
  spam: "Spam ou propaganda",
  violence: "Violência ou ameaça",
  hate: "Ódio, assédio ou discriminação",
  sexual: "Conteúdo sexual",
  privacy: "Exposição de dados pessoais",
  other: "Outro problema",
} as const
export type FlagReason = keyof typeof FLAG_REASONS
async function call(
  name: string,
  args?: Record<string, string>,
): Promise<unknown> {
  if (!isConfigured || !supabase)
    throw new Error("Entre no aplicativo conectado para usar este recurso.")
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    if (error.code === "22023" && name === "block_report_author")
      throw new Error(
        "Este aviso antigo não tem uma conta de autor vinculada. Você pode denunciar o conteúdo.",
      )
    if (error.code === "54000")
      throw new Error(
        "Limite de denúncias atingido. Aguarde antes de enviar outra.",
      )
    throw new Error(
      "Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.",
    )
  }
  return data
}
export async function acceptCommunityTerms() {
  if (!isConfigured) return // demonstracao local, sem upload ou gravacao externa
  await call("accept_community_terms", { p_version: COMMUNITY_TERMS_VERSION })
}
export async function flagReport(
  reportId: string,
  target: "report" | "author",
  reason: FlagReason,
  details: string,
) {
  if (details.length > 500 || !(reason in FLAG_REASONS))
    throw new Error("Revise os dados da denúncia.")
  const receipt = await call("flag_report", {
    p_report_id: reportId,
    p_target: target,
    p_reason: reason,
    p_details: details.trim(),
  })
  if (
    typeof receipt !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      receipt,
    )
  )
    throw new Error("A denúncia não foi confirmada. Tente novamente.")
  return receipt
}
export async function blockReportAuthor(reportId: string) {
  await call("block_report_author", { p_report_id: reportId })
}
export async function clearCommunityBlocks() {
  await call("clear_my_community_blocks")
}
