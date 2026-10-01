import { afterEach, beforeEach, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
vi.mock("./supabaseClient", () => ({
  isConfigured: true,
  supabase: { auth: { getSession }, rpc },
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("VITE_API_VOTES_ENABLED", "true")
  vi.stubEnv("VITE_API_URL", "https://api.example.com")
  getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: "test-token" } }, error: null,
  })
  rpc.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it("routes the report service vote through FastAPI when its flag is enabled", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ voted: true, confirmations: 3 }) })
  vi.stubGlobal("fetch", fetchMock)
  const { setReportVote } = await import("./reportService")
  expect(await setReportVote("report-id", true)).toEqual({ voted: true, confirmations: 3 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(rpc).not.toHaveBeenCalled()
})
