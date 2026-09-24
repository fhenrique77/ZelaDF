import type { User } from "@supabase/supabase-js"

export const PRIVACY_POLICY_URL = "./privacy.html"
export const PUBLIC_AUTHOR_NAME = "Cidadão"

function metadataText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Rótulo privado da conta, exibido somente para o próprio usuário no cabeçalho. */
export function accountDisplayName(user: User | null): string {
  if (!user) return PUBLIC_AUTHOR_NAME

  const fullName = metadataText(user.user_metadata?.full_name)
  if (fullName) return fullName

  const name = metadataText(user.user_metadata?.name)
  if (name) return name

  if (user.email) return user.email.split("@")[0] || "Conta por e-mail"
  if (user.phone) return "Conta por celular"
  return PUBLIC_AUTHOR_NAME
}
