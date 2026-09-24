import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock("./supabaseClient", () => ({ supabase: mocks }))
import {
  fetchAccountDeletionRequest,
  requestAccountDeletion,
} from "./accountDeletion"

const row = {
  id: "40000000-0000-0000-0000-000000000001",
  created_at: "2026-09-05T15:00:00Z",
  status: "pending",
}

describe("account deletion requests", () => {
  beforeEach(() => {
    mocks.from.mockReturnValue(mocks)
    mocks.select.mockReturnValue(mocks)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it("submits no client-selected identity or status", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null })
    expect(await requestAccountDeletion()).toEqual({
      id: row.id,
      createdAt: row.created_at,
      status: "pending",
    })
    expect(mocks.rpc).toHaveBeenCalledWith("request_account_deletion")
  })

  it("reads only receipt fields protected by RLS", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await fetchAccountDeletionRequest()).toBeNull()
    expect(mocks.from).toHaveBeenCalledWith("account_deletion_requests")
    expect(mocks.select).toHaveBeenCalledWith("id,created_at,status")
  })

  it.each([
    null,
    [],
    [row, row],
    [{ ...row, id: "invalid" }],
    [{ ...row, created_at: "invalid" }],
    [{ ...row, status: "completed" }],
  ])("never confirms a request with an invalid receipt: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(requestAccountDeletion()).rejects.toThrow("Não foi possível")
  })

  it("hides backend errors and sensitive details from logs", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: new Error("private@example.invalid confidential-value"),
    })
    await expect(requestAccountDeletion()).rejects.toThrow("Não foi possível")
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /private@example|confidential-value/,
    )
  })

  it("does not treat failed lookup as absence of a request", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42501" },
    })
    await expect(fetchAccountDeletionRequest()).rejects.toThrow(
      "Não foi possível",
    )
  })
})
