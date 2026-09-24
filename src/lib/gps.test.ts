import { describe, expect, it, vi } from "vitest"
import { Geolocation } from "@capacitor/geolocation"
import { getCurrentPosition } from "./gps"

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
}))
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: { getCurrentPosition: vi.fn() },
}))
vi.mock("./observability", () => ({ logger: { warn: vi.fn() } }))

describe("browser geolocation failures", () => {
  it.each([
    [{ code: 1, message: "Permissão recusada" }, "denied"],
    [{ code: 3, message: "Tempo esgotado" }, "timeout"],
    [{ code: 2, message: "Posição não disponível" }, "unavailable"],
    [{ message: "User denied geolocation" }, "denied"],
    [new Error("Location timeout"), "timeout"],
  ])(
    "classifies %j without requiring Error inheritance",
    async (failure, reason) => {
      vi.mocked(Geolocation.getCurrentPosition).mockRejectedValueOnce(failure)
      expect(await getCurrentPosition()).toMatchObject({
        success: false,
        reason,
      })
    },
  )
})
