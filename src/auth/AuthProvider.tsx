import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { Capacitor } from "@capacitor/core"
import { App as CapApp } from "@capacitor/app"
import { supabase, isConfigured } from "../lib/supabaseClient"
import { accountDisplayName } from "../lib/privacy"
import { unregisterPushNotifications } from "../lib/push"
import { createAuthService } from "./authService"

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithEmailOtp: (email: string) => Promise<{ error: string | null }>
  verifyEmailOtp: (
    email: string,
    token: string,
  ) => Promise<{ error: string | null }>
  signUpWithPhone: (
    phone: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signInWithPhone: (
    phone: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)
const authService = createAuthService(supabase?.auth ?? null)

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

/** Rótulo privado da conta; nunca deve ser persistido como identidade pública. */
export const displayName = accountDisplayName

/** Retorna a URL de redirecionamento para autenticação OAuth */
export function getRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    // Deep link do aplicativo móvel
    return "com.zeladf.app://auth-callback"
  }
  // URL da web (produção ou localhost)
  return window.location.origin
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !isConfigured) {
      setLoading(false)
      return
    }

    // Reidratar sessão salva
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })

    // Escutar mudanças (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
    })

    // Escuta deep links no aplicativo Android / iOS
    let cleanupAppListener: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appUrlOpen", async (event) => {
        if (
          event.url.includes("com.zeladf.app") ||
          event.url.includes("#access_token")
        ) {
          // Extrai tokens de hash se presentes na URL de redirecionamento
          const url = new URL(event.url)
          const hashParams = new URLSearchParams(url.hash.replace("#", "?"))
          const accessToken = hashParams.get("access_token")
          const refreshToken = hashParams.get("refresh_token")

          if (accessToken && refreshToken && supabase) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
          }
        }
      }).then((handle) => {
        cleanupAppListener = () => handle.remove()
      })
    }

    return () => {
      subscription.unsubscribe()
      if (cleanupAppListener) cleanupAppListener()
    }
  }, [])

  // ── Métodos de autenticação ──

  const signInWithGoogle = async () => {
    return authService.signInWithGoogle(getRedirectUrl())
  }

  const signInWithEmailOtp = async (email: string): Promise<{
    error: string | null
  }> => {
    return authService.signInWithEmailOtp(email)
  }

  const verifyEmailOtp = async (email: string, token: string): Promise<{
    error: string | null
  }> => {
    return authService.verifyEmailOtp(email, token)
  }

  const signUpWithPhone = async (phone: string, password: string): Promise<{
    error: string | null
  }> => {
    return authService.signUpWithPhone(phone, password)
  }

  const signInWithPhone = async (phone: string, password: string): Promise<{
    error: string | null
  }> => {
    return authService.signInWithPhone(phone, password)
  }

  const signOut = async () => {
    if (user) await unregisterPushNotifications(user.id)
    await authService.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithEmailOtp,
        verifyEmailOtp,
        signUpWithPhone,
        signInWithPhone,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
