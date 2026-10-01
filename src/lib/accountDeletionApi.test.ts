import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock("./supabaseClient", () => ({ supabase: { auth: { getSession: mocks.getSession }, from: mocks.from, rpc: mocks.rpc } }))

const receipt = { id: "40000000-0000-0000-0000-000000000001", createdAt: "2026-09-24T15:00:00Z", status: "pending" }

describe("account deletion FastAPI path", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_API_DELETION_REQUESTS_ENABLED", "true")
    vi.stubEnv("VITE_API_URL", "https://api.example.com")
    mocks.getSession.mockReset()
    mocks.from.mockReset()
    mocks.rpc.mockReset()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("uses the API with an empty POST and preserves receipt fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => receipt })
    vi.stubGlobal("fetch", fetchMock)
    const { fetchAccountDeletionRequest, requestAccountDeletion } = await import("./accountDeletion")
    expect(await fetchAccountDeletionRequest()).toBeNull()
    expect(await requestAccountDeletion()).toEqual(receipt)
    expect(fetchMock.mock.calls[1]).toEqual([
      "https://api.example.com/api/v1/me/deletion-requests",
      { method: "POST", headers: { Authorization: "Bearer test-token", "X-ZelaDF-Client": "web/1.0.0" } },
    ])
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("never treats a server failure or invalid receipt as confirmation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 503, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ...receipt, id: "invalid" }) })
      .mockResolvedValueOnce({ status: 404, ok: false })
    vi.stubGlobal("fetch", fetchMock)
    const { fetchAccountDeletionRequest, requestAccountDeletion } = await import("./accountDeletion")
    await expect(fetchAccountDeletionRequest()).rejects.toThrow("Não foi possível")
    await expect(requestAccountDeletion()).rejects.toThrow("Não foi possível")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("recovers a committed receipt after the POST response is lost", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => receipt })
    vi.stubGlobal("fetch", fetchMock)
    const { requestAccountDeletion } = await import("./accountDeletion")
    expect(await requestAccountDeletion()).toEqual(receipt)
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe("/api/v1/me/deletion-requests/current")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires a current session before calling the API", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { requestAccountDeletion } = await import("./accountDeletion")
    await expect(requestAccountDeletion()).rejects.toThrow("Não foi possível")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
