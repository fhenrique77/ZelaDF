export const NATIVE_OAUTH_REDIRECT = "com.zeladf.app://auth-callback"

const PENDING_KEY = "zeladf.oauth.pending"
const MAX_AGE_MS = 5 * 60 * 1000
const FLOW_ID = /^[A-Za-z0-9_-]{8,64}$/

type PendingOAuth = { flowId: string; startedAt: number }

export function rememberNativeOAuth(flowId: string): boolean {
  if (!FLOW_ID.test(flowId)) return false
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ flowId, startedAt: Date.now() } satisfies PendingOAuth),
    )
    return true
  } catch {
    return false
  }
}

export function clearNativeOAuth(): void {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // An unavailable store must not make callback handling accept a URL.
  }
}

export function consumeNativeOAuthCallback(
  rawUrl: string,
): { code: string; flowId: string } | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (
    url.protocol !== "com.zeladf.app:" ||
    url.hostname !== "auth-callback" ||
    url.pathname !== "" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token")
  ) return null

  const codes = url.searchParams.getAll("code")
  if (codes.length !== 1 || !codes[0] || codes[0].length > 2048) return null

  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as Partial<PendingOAuth>
    const callbackFlowIds = url.searchParams.getAll("sb_flow_id")
    if (
      callbackFlowIds.length > 1 ||
      (callbackFlowIds.length === 1 && callbackFlowIds[0] !== pending.flowId)
    ) return null
    const age = Date.now() - (pending.startedAt ?? NaN)
    if (
      !pending.flowId ||
      !FLOW_ID.test(pending.flowId) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > MAX_AGE_MS
    ) {
      clearNativeOAuth()
      return null
    }
    clearNativeOAuth()
    return { code: codes[0], flowId: pending.flowId }
  } catch {
    return null
  }
}
