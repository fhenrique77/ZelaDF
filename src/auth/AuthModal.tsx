import { useEffect, useState } from "react"
import { PRIVACY_POLICY_URL } from "../lib/privacy"
import { useAuth } from "./AuthProvider"
import { otpRetrySeconds } from "./otpCooldown"

type Tab = "google" | "email" | "phone"
type PhoneMode = "login" | "signup"

export function AuthModal({ onClose }: { onClose: () => void }) {
  const {
    user,
    googleOAuthError,
    signInWithGoogle,
    signInWithEmailOtp,
    verifyEmailOtp,
    signUpWithPhone,
    signInWithPhone,
  } = useAuth()

  const [tab, setTab] = useState<Tab>("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // E-mail OTP state
  const [email, setEmail] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [retrySeconds, setRetrySeconds] = useState(otpRetrySeconds)

  useEffect(() => {
    const timer = window.setInterval(
      () => setRetrySeconds(otpRetrySeconds()),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (googleOAuthError) setError(googleOAuthError)
  }, [googleOAuthError])

  useEffect(() => {
    if (user) onClose()
  }, [user, onClose])

  // Phone state
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [phoneMode, setPhoneMode] = useState<PhoneMode>("login")

  const clearError = () => setError(null)

  // ── Google ──
  const handleGoogle = async () => {
    if (loading) return
    setLoading(true)
    clearError()
    try {
      const result = await signInWithGoogle()
      if (result.error) setError(result.error)
    } catch {
      setError("Não foi possível entrar com Google. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  // ── E-mail OTP ──
  const handleSendOtp = async () => {
    if (loading || !email.trim() || otpRetrySeconds() > 0) return
    setLoading(true)
    clearError()
    try {
      const { error: err } = await signInWithEmailOtp(email.trim())
      if (err) setError(err)
      else {
        setOtpSent(true)
        setOtpCode("")
      }
    } catch {
      setError("Não foi possível enviar o código. Tente novamente.")
    } finally {
      setRetrySeconds(otpRetrySeconds())
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (loading || otpCode.trim().length !== 6) return
    setLoading(true)
    clearError()
    try {
      const { error: err } = await verifyEmailOtp(email.trim(), otpCode.trim())
      if (err) setError(err)
      else onClose()
    } catch {
      setError("Não foi possível verificar o código. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  // ── Phone ──
  const handlePhone = async () => {
    if (loading || !phone.trim() || !password) return
    setLoading(true)
    clearError()

    const formatted = phone.trim().startsWith("+")
      ? phone.trim()
      : `+55${phone.trim().replace(/\D/g, "")}`

    try {
      const { error: err } =
        phoneMode === "signup"
          ? await signUpWithPhone(formatted, password)
          : await signInWithPhone(formatted, password)

      if (err) setError(err)
      else onClose()
    } catch {
      setError(
        "Não foi possível entrar. Verifique a conexão e tente novamente.",
      )
    } finally {
      setLoading(false)
    }
  }

  const tabs: {
    id: Tab
    label: string
    icon: string
  }[] = [
    { id: "email", label: "E-mail", icon: "✉️" },
    { id: "phone", label: "Celular", icon: "📱" },
    { id: "google", label: "Google", icon: "G" },
  ]

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-drop w-full max-w-sm border border-line bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-display text-lg font-bold">Entrar no ZelaDF</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ash">
              Identifique-se para contribuir
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center text-ash transition-colors hover:text-ink"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                clearError()
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? "border-b-2 border-cerrado text-cerrado"
                  : "text-ash hover:text-ink"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-4 p-5">
          {/* ── Error ── */}
          {error && (
            <div className="border border-terracota/30 bg-terracota/10 px-3 py-2 text-xs text-terracota">
              {error}
            </div>
          )}

          {/* ── Google ── */}
          {tab === "google" && (
            <>
              <p className="text-center text-sm text-ash">
                Use sua conta Google para entrar instantaneamente.
              </p>
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 border border-line py-3 font-display text-sm font-semibold transition-colors hover:border-ink hover:bg-concrete disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {loading ? "Redirecionando…" : "Continuar com Google"}
              </button>
            </>
          )}

          {/* ── Email OTP ── */}
          {tab === "email" && !otpSent && (
            <>
              <p className="text-center text-sm text-ash">
                Enviaremos um código de 6 dígitos para seu e-mail.
              </p>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
                  E-mail
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className={inputCls}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </label>
              <button
                onClick={handleSendOtp}
                disabled={loading || !email.trim() || retrySeconds > 0}
                className="w-full bg-cerrado py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? spinner
                  : retrySeconds > 0
                    ? `Enviar código em ${retrySeconds}s`
                    : "Enviar código"}
              </button>
            </>
          )}

          {tab === "email" && otpSent && (
            <>
              <p className="text-center text-sm text-ash">
                Código enviado para{" "}
                <span className="font-semibold text-ink">{email}</span>
              </p>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
                  Código de 6 dígitos
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className={`${inputCls} text-center font-mono text-lg tracking-[0.3em]`}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                  autoFocus
                />
              </label>
              <button
                onClick={handleVerifyOtp}
                disabled={loading || otpCode.length < 6}
                className="w-full bg-cerrado py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? spinner : "Verificar"}
              </button>
              <button
                onClick={handleSendOtp}
                disabled={loading || retrySeconds > 0}
                className="w-full py-2 text-center text-xs text-ash underline underline-offset-2 disabled:opacity-40"
              >
                {retrySeconds > 0
                  ? `Reenviar código em ${retrySeconds}s`
                  : "Reenviar código"}
              </button>
              <button
                onClick={() => {
                  setOtpSent(false)
                  setOtpCode("")
                  clearError()
                }}
                className="w-full py-2 text-center text-xs text-ash underline underline-offset-2 hover:text-ink"
              >
                Usar outro e-mail
              </button>
            </>
          )}

          {/* ── Phone + Password ── */}
          {tab === "phone" && (
            <>
              <p className="text-center text-sm text-ash">
                {phoneMode === "signup"
                  ? "Crie sua conta com número e senha."
                  : "Entre com seu número e senha."}
              </p>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
                  Celular (DDD + número)
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="61999999999"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
                  Senha{phoneMode === "signup" ? " (mínimo 6 caracteres)" : ""}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className={inputCls}
                  onKeyDown={(e) => e.key === "Enter" && handlePhone()}
                />
              </label>
              <button
                onClick={handlePhone}
                disabled={
                  loading ||
                  !phone.trim() ||
                  !password ||
                  (phoneMode === "signup" && password.length < 6)
                }
                className="w-full bg-cerrado py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? spinner
                  : phoneMode === "signup"
                    ? "Criar conta"
                    : "Entrar"}
              </button>
              <button
                onClick={() => {
                  setPhoneMode(phoneMode === "login" ? "signup" : "login")
                  clearError()
                }}
                className="w-full py-2 text-center text-xs text-ash underline underline-offset-2 hover:text-ink"
              >
                {phoneMode === "login"
                  ? "Não tem conta? Criar agora"
                  : "Já tem conta? Entrar"}
              </button>
            </>
          )}

          <p className="border-t border-line pt-3 text-center text-[11px] leading-relaxed text-ash">
            Seus dados de conta são usados para autenticação e não são exibidos
            como autoria pública. Consulte a{" "}
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cerrado underline underline-offset-2"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  "w-full border border-line bg-concrete/40 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ash/70 focus:border-cerrado focus:bg-paper"

const spinner = (
  <span className="flex items-center justify-center gap-2">
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-paper border-t-transparent" />
    Aguarde…
  </span>
)
