import type { VercelRequest, VercelResponse } from "@vercel/node"
import { afterEach, expect, it, vi } from "vitest"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { createClient } from "@supabase/supabase-js"
import handler from "./send-push"

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "fake-credential"),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => "fake-app"),
}))
vi.mock("firebase-admin/messaging", () => ({ getMessaging: vi.fn() }))
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it("consulta reivindicação e tokens no Supabase, envia no FCM e remove apenas token inválido", async () => {
  vi.stubEnv("PUSH_ENABLED", "true")
  vi.stubEnv("PUSH_SECRET", "test-secret")
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "{}")
  vi.spyOn(console, "info").mockImplementation(() => undefined)

  const eventId = "10000000-0000-4000-8000-000000000001"
  const reportId = "10000000-0000-4000-8000-000000000002"
  const authorId = "20000000-0000-4000-8000-000000000001"
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        report_id: reportId,
        author_id: authorId,
        title: "Buraco na via",
        to_status: "resolvido",
      },
    ],
    error: null,
  })
  const findEq = vi.fn().mockResolvedValue({
    data: [{ token: "valid-token" }, { token: "expired-token" }],
    error: null,
  })
  const select = vi.fn(() => ({ eq: findEq }))
  const deleteIn = vi.fn().mockResolvedValue({ error: null })
  const deleteRows = vi.fn(() => ({ in: deleteIn }))
  const from = vi.fn(() => ({ select, delete: deleteRows }))
  vi.mocked(createClient).mockReturnValue({ rpc, from } as never)
  const sendEachForMulticast = vi.fn().mockResolvedValue({
    successCount: 1,
    failureCount: 1,
    responses: [
      {},
      { error: { code: "messaging/registration-token-not-registered" } },
    ],
  })
  vi.mocked(getMessaging).mockReturnValue({ sendEachForMulticast } as never)

  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  await handler(
    {
      method: "POST",
      headers: { authorization: "test-secret" },
      body: {
        type: "INSERT",
        table: "push_status_events",
        record: { id: eventId },
      },
    } as VercelRequest,
    response as unknown as VercelResponse,
  )

  expect(rpc).toHaveBeenCalledWith("claim_push_status_event", {
    p_event_id: eventId,
  })
  expect(from).toHaveBeenCalledWith("push_tokens")
  expect(findEq).toHaveBeenCalledWith("user_id", authorId)
  expect(sendEachForMulticast).toHaveBeenCalledWith({
    tokens: ["valid-token", "expired-token"],
    notification: {
      title: "Atualização no seu aviso!",
      body: 'O aviso "Buraco na via" agora foi Resolvido.',
    },
    data: { reportId },
  })
  expect(deleteIn).toHaveBeenCalledWith("token", ["expired-token"])
  expect(response.status).toHaveBeenCalledWith(200)
  expect(response.json).toHaveBeenCalledWith({
    success: true,
    sent: 1,
    failed: 1,
    invalidTokensRemoved: 1,
  })
  expect(cert).toHaveBeenCalledOnce()
  expect(getApps).toHaveBeenCalledOnce()
  expect(initializeApp).toHaveBeenCalledOnce()
})
