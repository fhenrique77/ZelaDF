import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
vi.mock("./supabaseClient", () => ({
  isConfigured: true,
  supabase: { auth: { getSession }, rpc },
}))

const reportId = "a29374fb-8ead-41dd-ab38-8f193a507681"
const receiptId = "08af04e5-9e48-4f47-8f23-d70c0469c79c"
const historyRow = (id: string, fromStatus: string, toStatus: string) => ({
  id, fromStatus, toStatus, reason: "Motivo operacional válido", changedAt: "2026-09-24T12:00:00Z",
  changedBy: "private-auth-id",
})

describe("communityStatusApi integration", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_API_COMMUNITY_STATUS_ENABLED", "true")
    vi.stubEnv("VITE_API_URL", "https://api.example.com")
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null })
    rpc.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("routes terms, flags, blocks and operator status through FastAPI", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      const result = path.endsWith("/community-terms")
        ? { accepted: true, version: "2026-09-13" }
        : path.endsWith("/flags")
          ? { id: receiptId }
          : path.endsWith("/author-block")
            ? { blocked: true }
            : path.endsWith("/author-blocks")
              ? { cleared: true }
              : path.endsWith("/access")
                ? { allowed: true }
                : path.endsWith("/status-history")
                  ? new URL(url).searchParams.get("page") === "0"
                    ? { entries: [historyRow(receiptId, "aberto", "andamento")], hasMore: true }
                    : { entries: [historyRow(reportId, "andamento", "resolvido")], hasMore: false }
                  : { status: "andamento" }
      return { ok: true, json: async () => result }
    })
    vi.stubGlobal("fetch", fetchMock)
    const community = await import("./communitySafety")
    const reports = await import("./reportService")
    expect((await import("./communityStatusApi")).useCommunityStatusApi()).toBe(true)
    await community.acceptCommunityTerms()
    expect(await community.flagReport(reportId, "report", "spam", "  sem dados pessoais  ")).toBe(receiptId)
    await community.blockReportAuthor(reportId)
    await community.clearCommunityBlocks()
    expect(await reports.fetchOperatorAccess()).toBe(true)
    const history = await reports.fetchReportStatusHistory(reportId)
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ id: receiptId, fromStatus: "aberto", toStatus: "andamento",
      reason: "Motivo operacional válido", changedAt: "2026-09-24T12:00:00Z" })
    await reports.changeReportStatus({ reportId, currentStatus: "aberto", nextStatus: "andamento",
      reason: "  Motivo suficiente  " })
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/v1/me/community-terms",
      `/api/v1/reports/${reportId}/flags`,
      `/api/v1/reports/${reportId}/author-block`,
      "/api/v1/me/author-blocks",
      "/api/v1/operator/access",
      `/api/v1/operator/reports/${reportId}/status-history`,
      `/api/v1/operator/reports/${reportId}/status-history`,
      `/api/v1/operator/reports/${reportId}/status`,
    ])
    expect(calls.every(([, options]) => (options.headers as Record<string, string>).Authorization === "Bearer test-token")).toBe(true)
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ target: "report", reason: "spam", details: "sem dados pessoais" })
    expect(JSON.parse(calls[7][1].body as string)).toEqual({ newStatus: "andamento", reason: "Motivo suficiente" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("reports failures without switching to direct Supabase mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "bad-receipt" }) })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal("fetch", fetchMock)
    const community = await import("./communitySafety")
    const reports = await import("./reportService")
    await expect(community.acceptCommunityTerms()).rejects.toThrow("Não foi possível confirmar")
    await expect(community.flagReport(reportId, "report", "spam", "")).rejects.toThrow("não foi confirmada")
    await expect(reports.changeReportStatus({ reportId, currentStatus: "aberto", nextStatus: "andamento",
      reason: "Motivo suficiente" })).rejects.toThrow("permissão")
    expect(await reports.fetchOperatorAccess()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("confirms a status transition from private history after a lost response", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        entries: [historyRow(receiptId, "aberto", "andamento")], hasMore: false,
      }) })
    vi.stubGlobal("fetch", fetchMock)
    const reports = await import("./reportService")
    await expect(reports.changeReportStatus({ reportId, currentStatus: "aberto",
      nextStatus: "andamento", reason: "Motivo operacional válido" })).resolves.toBeUndefined()
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toContain("status-history")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("preserves the legacy author guidance without exposing upstream details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422,
      json: async () => ({ error: { code: "legacy_author", message: "private detail" } }) }))
    const { blockReportAuthor } = await import("./communitySafety")
    await expect(blockReportAuthor(reportId)).rejects.toThrow("Você pode denunciar o conteúdo")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("keeps the module switch disabled by default", async () => {
    vi.stubEnv("VITE_API_COMMUNITY_STATUS_ENABLED", "false")
    vi.resetModules()
    const { useCommunityStatusApi } = await import("./communityStatusApi")
    expect(useCommunityStatusApi()).toBe(false)
  })
})
