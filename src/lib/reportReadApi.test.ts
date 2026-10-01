import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
vi.mock("./supabaseClient", () => ({
  supabase: { auth: { getSession } },
}))

describe("reportReadApi", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_API_READS_ENABLED", "true")
    vi.stubEnv("VITE_API_URL", "https://api.example.com")
    getSession.mockReset()
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("uses the current session and maps viewport filters without writing to Supabase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reports: [], truncated: false, source: "supabase" }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const { fetchReportsViaApi, useReportReadApi } = await import("./reportReadApi")
    expect(useReportReadApi()).toBe(true)
    await fetchReportsViaApi({
      bounds: { south: -16, west: -49, north: -15, east: -47 },
      categories: ["agua", "buraco"],
      status: "aberto",
      userId: "local-ui-id",
      onlyMine: true,
      limit: 200,
    })
    const [url, options] = fetchMock.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/api/v1/me/reports")
    expect(parsed.searchParams.getAll("category")).toEqual(["agua", "buraco"])
    expect(parsed.searchParams.get("limit")).toBe("200")
    expect(options.headers).toEqual({ Authorization: "Bearer test-token", "X-ZelaDF-Client": "web/1.0.0" })
    expect(parsed.search).not.toContain("local-ui-id")
  })

  it("surfaces API failures instead of returning demo data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const { fetchReportsViaApi } = await import("./reportReadApi")
    await expect(fetchReportsViaApi({
      bounds: { south: -16, west: -49, north: -15, east: -47 },
    })).rejects.toThrow("Não foi possível carregar")
  })

  it("splits vote lookups to fit the API URL budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reportIds: [] }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const { fetchMyVotesViaApi } = await import("./reportReadApi")
    await fetchMyVotesViaApi(Array.from({ length: 201 }, (_, index) => String(index)))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.getAll("report_ids")).toHaveLength(200)
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.getAll("report_ids")).toHaveLength(1)
  })
})
