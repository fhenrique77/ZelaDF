import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
vi.mock("./supabaseClient", () => ({
  supabase: { auth: { getSession }, rpc },
}))
vi.mock("./reportService", () => ({
  ReportServiceError: class extends Error {
    constructor(public code: string, message: string) { super(message) }
  },
}))

describe("reportVoteApi", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_API_VOTES_ENABLED", "true")
    vi.stubEnv("VITE_API_URL", "https://api.example.com/")
    getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: "test-token" } }, error: null,
    })
    rpc.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("sends desired state with the session JWT and uses the canonical result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ voted: false, confirmations: 4 }) })
    vi.stubGlobal("fetch", fetchMock)
    const { setReportVoteViaApi, useReportVoteApi } = await import("./reportVoteApi")
    expect(useReportVoteApi()).toBe(true)
    expect(await setReportVoteViaApi("report-id", true)).toEqual({ voted: false, confirmations: 4 })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.example.com/api/v1/reports/report-id/vote")
    expect(options.method).toBe("PUT")
    expect(options.headers.Authorization).toBe("Bearer test-token")
    expect(JSON.parse(options.body)).toEqual({ confirmed: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("surfaces failure and malformed replies without direct write fallback", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ voted: true, confirmations: "5" }) })
      .mockResolvedValueOnce({ ok: false, status: 404 })
    vi.stubGlobal("fetch", fetchMock)
    const { setReportVoteViaApi } = await import("./reportVoteApi")
    await expect(setReportVoteViaApi("report-id", true)).rejects.toThrow("Atualize os avisos")
    await expect(setReportVoteViaApi("report-id", true)).rejects.toThrow("resposta da confirmação é inválida")
    await expect(setReportVoteViaApi("report-id", true)).rejects.toThrow("não está disponível")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("requires a session and defaults the switch off", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { setReportVoteViaApi } = await import("./reportVoteApi")
    await expect(setReportVoteViaApi("report-id", true)).rejects.toThrow("Entre na sua conta")
    vi.stubEnv("VITE_API_VOTES_ENABLED", "false")
    vi.resetModules()
    const disabled = await import("./reportVoteApi")
    expect(disabled.useReportVoteApi()).toBe(false)
  })
})
