const STORAGE_KEY = "zeladf:otp-retry-at"
const COOLDOWN_MS = 60_000
let retryAt = 0

// Guarda somente um prazo, nunca e-mail ou código. É proteção de UX;
// o limite real de envio continua sendo responsabilidade do Supabase.
export function otpRetrySeconds(): number {
  let stored = 0
  try {
    stored = Number(localStorage.getItem(STORAGE_KEY))
  } catch {
    // WebViews com armazenamento bloqueado mantêm o prazo em memória.
  }
  const now = Date.now()
  const valid = (value: number) =>
    Number.isFinite(value) && value > now && value <= now + COOLDOWN_MS
      ? value
      : 0
  if (stored && !valid(stored)) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* armazenamento opcional */
    }
  }
  return Math.max(
    0,
    Math.ceil((Math.max(valid(retryAt), valid(stored)) - now) / 1000),
  )
}

export function startOtpCooldown(): void {
  retryAt = Date.now() + COOLDOWN_MS
  try {
    localStorage.setItem(STORAGE_KEY, String(retryAt))
  } catch {
    // O prazo em memória ainda protege fechamento/reabertura do modal.
  }
}
