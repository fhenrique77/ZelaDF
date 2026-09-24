import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { logger } from "./observability"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl!.includes("SEU-PROJETO")

if (!isConfigured) {
  logger.warn("supabase.not_configured", { operation: "initialize" })
}

// Cria o client com sessão persistente (mantém login entre recarregamentos)
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
