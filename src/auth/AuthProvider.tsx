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
import { Browser } from "@capacitor/browser"
import { supabase, isConfigured } from "../lib/supabaseClient"
import { accountDisplayName } from "../lib/privacy"
import { unregisterPushNotifications } from "../lib/push"
import { createAuthService } from "./authService"
import {
  clearNativeOAuth,
  consumeNativeOAuthCallback,
  NATIVE_OAUTH_REDIRECT,
  rememberNativeOAuth,
} from "./nativeOAuth"

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  googleOAuthError: string | null
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
    return NATIVE_OAUTH_REDIRECT
  }
  // URL da web (produção ou localhost)
  return window.location.origin
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleOAuthError, setGoogleOAuthError] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client || !isConfigured) {
      setLoading(false)
      return
    }

    // Reidratar sessão salva
    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })

    // Escutar mudanças (login, logout, token refresh)
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
    })

    // Accept only a pending PKCE code delivered to this app.
    let cleanupAppListener: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      let disposed = false
      let listener: { remove: () => Promise<void> } | undefined
      const handleCallback = async (url: string) => {
        const callback = consumeNativeOAuthCallback(url)
        if (!callback) return
        try {
          const { error } = await client.auth.exchangeCodeForSession(
            callback.code,
            { flowId: callback.flowId },
          )
          if (error) {
            setGoogleOAuthError("Não foi possível concluir o login Google.")
          }
        } catch {
          setGoogleOAuthError("Não foi possível concluir o login Google.")
        }
      }
      CapApp.addListener("appUrlOpen", (event) => {
        void handleCallback(event.url)
      })
        .then((handle) => {
          if (disposed) {
            void handle.remove()
          } else {
            listener = handle
          }
        })
        .catch(() => undefined)
      void CapApp.getLaunchUrl()
        .then((launch) => {
          if (!disposed && launch?.url) void handleCallback(launch.url)
        })
        .catch(() => undefined)
      cleanupAppListener = () => {
        disposed = true
        void listener?.remove()
      }
    }

    return () => {
      subscription.unsubscribe()
      if (cleanupAppListener) cleanupAppListener()
    }
  }, [])

  // ── Métodos de autenticação ──

  const signInWithGoogle = async () => {
    setGoogleOAuthError(null)
    if (!Capacitor.isNativePlatform()) {
      return authService.signInWithGoogle(getRedirectUrl())
    }
    try {
      const { error, url, flowId } = await authService.startNativeGoogleOAuth(
        getRedirectUrl(),
      )
      if (error) return { error }
      if (!url || !flowId || !rememberNativeOAuth(flowId)) {
        return { error: "Não foi possível iniciar o login Google." }
      }
      await Browser.open({ url })
      return { error: null }
    } catch {
      clearNativeOAuth()
      return { error: "Não foi possível iniciar o login Google." }
    }
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
        googleOAuthError,
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
