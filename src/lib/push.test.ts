import { afterEach, describe, expect, it, vi } from "vitest"
import { Capacitor } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { supabase } from "./supabaseClient"
import { registerForPushNotifications } from "./push"

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}))
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    addListener: vi.fn(),
    register: vi.fn(),
  },
}))
vi.mock("./supabaseClient", () => ({ supabase: { from: vi.fn() } }))

describe("push desativado no cliente", () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([undefined, "false", "TRUE", "1"])(
    "não solicita permissão nem registra tokens com flag %s",
    async (flag) => {
      vi.stubEnv("VITE_PUSH_ENABLED", flag)

      expect(await registerForPushNotifications("test-user")).toBe(false)
      expect(Capacitor.isNativePlatform).not.toHaveBeenCalled()
      expect(PushNotifications.checkPermissions).not.toHaveBeenCalled()
      expect(PushNotifications.requestPermissions).not.toHaveBeenCalled()
      expect(PushNotifications.addListener).not.toHaveBeenCalled()
      expect(PushNotifications.register).not.toHaveBeenCalled()
      expect(supabase?.from).not.toHaveBeenCalled()
    },
  )
})
