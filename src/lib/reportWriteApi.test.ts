import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const upload = vi.hoisted(() => vi.fn())
const info = vi.hoisted(() => vi.fn())
vi.mock("./supabaseClient", () => ({
  supabase: { auth: { getSession }, storage: { from: () => ({ upload, info }) } },
}))
vi.mock("./reportService", () => ({
  ReportServiceError: class extends Error {
    constructor(public code: string, message: string) { super(message) }
  },
}))

const actor = "efbf72c0-65c4-4626-b38b-598c2896f80b"
const key = "b13ef8bb-ddde-457f-a504-250688624a98"
const row = { id: key, category: "buraco", title: "Buraco na rua", description: "Detalhes",
  ra: "Asa Sul", address: "Rua 1", lat: -15.8, lng: -47.9, photo: "", status: "aberto",
  confirmations: 1, createdAt: "2026-09-24T12:00:00Z", isOwner: true }
const input = { category: "buraco" as const, title: "Buraco na rua", description: "Detalhes",
  ra: "Asa Sul", address: "Rua 1", lat: -15.8, lng: -47.9, photoFile: null,
  idempotencyKey: key }

describe("reportWriteApi", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_API_REPORT_WRITES_ENABLED", "true")
    vi.stubEnv("VITE_API_URL", "https://api.example.com")
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "test-token", user: { id: actor } } }, error: null })
    upload.mockReset().mockResolvedValue({ error: null })
    info.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("sends only public fields and a stable key to the create endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ report: row, initialVoteFailed: false }) })
    vi.stubGlobal("fetch", fetchMock)
    const { createReportViaApi, useReportWriteApi } = await import("./reportWriteApi")
    expect(useReportWriteApi()).toBe(true)
    await createReportViaApi(input)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.example.com/api/v1/reports")
    expect(options.headers["Idempotency-Key"]).toBe(key)
    expect(options.headers.Authorization).toBe("Bearer test-token")
    expect(JSON.parse(options.body)).toEqual({ category: "buraco", title: "Buraco na rua",
      description: "Detalhes", ra: "Asa Sul", address: "Rua 1", lat: -15.8, lng: -47.9, photoPath: null })
  })

  it.each([
    { statusCode: "409" },
    { statusCode: "400", error: "Duplicate" },
    { statusCode: "400", code: "ResourceAlreadyExists" },
  ])("reuses the same photo path after a lost response (%j)", async (duplicate) => {
    const file = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" })
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: duplicate })
    info.mockResolvedValue({ data: { metadata: { size: file.size, mimetype: file.type } }, error: null })
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ report: row, initialVoteFailed: false }) })
    vi.stubGlobal("fetch", fetchMock)
    const { createReportViaApi } = await import("./reportWriteApi")
    await expect(createReportViaApi({ ...input, photoFile: file })).rejects.toThrow()
    await createReportViaApi({ ...input, photoFile: file })
    expect(upload.mock.calls[0][0]).toBe(`${actor}/${key}.jpg`)
    expect(upload.mock.calls[1][0]).toBe(`${actor}/${key}.jpg`)
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(key)
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(key)
  })

  it("does not fall back to a direct write on an API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const { deleteReportViaApi } = await import("./reportWriteApi")
    await expect(deleteReportViaApi(key)).rejects.toThrow("Atualize os avisos")
    expect(upload).not.toHaveBeenCalled()
  })
})
