// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAuthService } from "./authService"
import { otpRetrySeconds } from "./otpCooldown"

let clock = Date.now()
beforeEach(() => {
  vi.useFakeTimers()
  clock += 120_000
  vi.setSystemTime(clock)
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function createGateway() {
  return {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }
}

describe("authService", () => {
  it("preserva a espera entre instâncias e libera o reenvio após 60s", async () => {
    const gateway = createGateway()
    await createAuthService(gateway as never).signInWithEmailOtp(
      "user@example.com",
    )
    const reopened = createAuthService(gateway as never)
    expect(
      (await reopened.signInWithEmailOtp("user@example.com")).error,
    ).toContain("60s")
    expect(gateway.signInWithOtp).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(otpRetrySeconds()).toBe(0)
    expect(localStorage.getItem("zeladf:otp-retry-at")).toBeNull()
    expect(
      (await reopened.signInWithEmailOtp("user@example.com")).error,
    ).toBeNull()
    expect(gateway.signInWithOtp).toHaveBeenCalledTimes(2)
  })

  it("bloqueia um segundo envio enquanto o primeiro ainda está pendente", async () => {
    const gateway = createGateway()
    let finish = (_value: unknown): void => {
      throw new Error("Envio não iniciado")
    }
    gateway.signInWithOtp.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const auth = createAuthService(gateway as never)
    const pending = auth.signInWithEmailOtp("user@example.com")
    expect((await auth.signInWithEmailOtp("user@example.com")).error).toContain(
      "em andamento",
    )
    finish({ error: null })
    await pending
    expect(gateway.signInWithOtp).toHaveBeenCalledTimes(1)
  })

  it("permite nova tentativa após falha de rede e respeita o limite 429", async () => {
    const gateway = createGateway()
    gateway.signInWithOtp
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        error: { message: "rate limited", status: 429 },
      })
    const auth = createAuthService(gateway as never)
    expect((await auth.signInWithEmailOtp("user@example.com")).error).toContain(
      "conexão",
    )
    expect(otpRetrySeconds()).toBe(0)
    expect((await auth.signInWithEmailOtp("user@example.com")).error).toBe(
      "rate limited",
    )
    expect(otpRetrySeconds()).toBe(60)
  })

  it("mantém a espera quando o armazenamento está bloqueado", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const auth = createAuthService(createGateway() as never)
    expect((await auth.signInWithEmailOtp("user@example.com")).error).toBeNull()
    expect(otpRetrySeconds()).toBe(60)
  })
  it("retorna erro previsível quando o Supabase não está configurado", async () => {
    const auth = createAuthService(null)

    await expect(auth.signInWithEmailOtp("user@example.com")).resolves.toEqual({
      error: "Supabase não configurado",
    })
  })

  it("encaminha os contratos de Google e OTP", async () => {
    const gateway = createGateway()
    const auth = createAuthService(gateway as never)

    await auth.signInWithGoogle("https://zeladf.example/auth")
    await auth.signInWithEmailOtp("user@example.com")
    await auth.verifyEmailOtp("user@example.com", "123456")

    expect(gateway.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://zeladf.example/auth" },
    })
    expect(gateway.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
    })
    expect(gateway.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "email",
    })
  })
  it("starts native Google OAuth without navigating the WebView", async () => {
    const gateway = createGateway()
    gateway.signInWithOAuth.mockResolvedValue({
      data: { url: "https://auth.example/authorize", flowId: "flow-12345678" },
      error: null,
    })
    const auth = createAuthService(gateway as never)
    expect(
      await auth.startNativeGoogleOAuth("com.zeladf.app://auth-callback"),
    ).toEqual({
      error: null,
      url: "https://auth.example/authorize",
      flowId: "flow-12345678",
    })
    expect(gateway.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "com.zeladf.app://auth-callback",
        skipBrowserRedirect: true,
      },
    })
  })

  it("encaminha cadastro, login por telefone e logout", async () => {
    const gateway = createGateway()
    const auth = createAuthService(gateway as never)

    await auth.signUpWithPhone("+5561999999999", "password")
    await auth.signInWithPhone("+5561999999999", "password")
    await auth.signOut()

    expect(gateway.signUp).toHaveBeenCalledWith({
      phone: "+5561999999999",
      password: "password",
    })
    expect(gateway.signInWithPassword).toHaveBeenCalledWith({
      phone: "+5561999999999",
      password: "password",
    })
    expect(gateway.signOut).toHaveBeenCalledOnce()
  })

  it("normaliza mensagens de erro do provedor", async () => {
    const gateway = createGateway()
    gateway.signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "rate limited" },
    })
    const auth = createAuthService(gateway as never)

    await expect(auth.signInWithEmailOtp("user@example.com")).resolves.toEqual({
      error: "rate limited",
    })
  })
})
