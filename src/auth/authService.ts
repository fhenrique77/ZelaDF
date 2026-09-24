import type { SupabaseClient } from "@supabase/supabase-js"
import { otpRetrySeconds, startOtpCooldown } from "./otpCooldown"

type AuthGateway = Pick<SupabaseClient["auth"], "signInWithOAuth" | "signInWithOtp" | "verifyOtp" | "signUp" | "signInWithPassword" | "signOut">

export type AuthOperationResult = { error: string | null }

const notConfigured = (): AuthOperationResult => ({
  error: "Supabase não configurado",
})

export function createAuthService(auth: AuthGateway | null) {
  let otpSending = false
  return {
    async signInWithGoogle(redirectTo: string): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const { error } = await auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      return { error: error?.message ?? null }
    },

    async signInWithEmailOtp(email: string): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const seconds = otpRetrySeconds()
      if (otpSending)
        return { error: "Aguarde o envio do código em andamento." }
      if (seconds > 0)
        return { error: `Aguarde ${seconds}s para enviar outro código.` }
      otpSending = true
      try {
        const { error } = await auth.signInWithOtp({ email })
        if (!error || error.status === 429) startOtpCooldown()
        return { error: error?.message ?? null }
      } catch {
        return {
          error:
            "Não foi possível enviar o código. Verifique a conexão e tente novamente.",
        }
      } finally {
        otpSending = false
      }
    },

    async verifyEmailOtp(
      email: string,
      token: string,
    ): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const { error } = await auth.verifyOtp({ email, token, type: "email" })
      return { error: error?.message ?? null }
    },

    async signUpWithPhone(
      phone: string,
      password: string,
    ): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const { error } = await auth.signUp({ phone, password })
      return { error: error?.message ?? null }
    },

    async signInWithPhone(
      phone: string,
      password: string,
    ): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const { error } = await auth.signInWithPassword({ phone, password })
      return { error: error?.message ?? null }
    },

    async signOut(): Promise<AuthOperationResult> {
      if (!auth) return notConfigured()
      const { error } = await auth.signOut()
      return { error: error?.message ?? null }
    },
  }
}
