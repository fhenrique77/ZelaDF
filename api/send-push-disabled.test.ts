import type { VercelRequest, VercelResponse } from "@vercel/node"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { createClient } from "@supabase/supabase-js"
import handler from "./send-push"

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(),
  getApps: vi.fn(),
  initializeApp: vi.fn(),
}))
vi.mock("firebase-admin/messaging", () => ({ getMessaging: vi.fn() }))
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }))

describe("push desativado no servidor", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each([undefined, "false", "TRUE", "1"])(
    "responde 503 sem inicializar Firebase ou Supabase com flag %s",
    async (flag) => {
      vi.stubEnv("PUSH_ENABLED", flag)
      // Valor fictício e inválido: o bloqueio deve ocorrer antes de interpretá-lo.
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "invalid-test-credential")
      const logs = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined)
      const response = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }

      await handler(
        { method: "POST", headers: {}, body: {} } as VercelRequest,
        response as unknown as VercelResponse,
      )

      expect(response.status).toHaveBeenCalledWith(503)
      expect(response.json).toHaveBeenCalledWith({
        error: "Push service unavailable",
      })
      expect(cert).not.toHaveBeenCalled()
      expect(getApps).not.toHaveBeenCalled()
      expect(initializeApp).not.toHaveBeenCalled()
      expect(getMessaging).not.toHaveBeenCalled()
      expect(createClient).not.toHaveBeenCalled()
      expect(JSON.stringify(logs.mock.calls)).not.toContain(
        "invalid-test-credential",
      )
    },
  )
})
