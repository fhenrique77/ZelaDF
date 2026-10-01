import { afterEach, describe, expect, it, vi } from "vitest"
import { Capacitor } from "@capacitor/core"
import { apiClientIdentityHeader } from "./apiClientIdentity"

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: vi.fn() },
}))

describe("identidade agregada do build da API", () => {
  afterEach(() => vi.resetAllMocks())

  it("identifica web e Android sem ID de instalação ou conta", () => {
    vi.mocked(Capacitor.getPlatform)
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("android")
    expect(apiClientIdentityHeader()).toEqual({
      "X-ZelaDF-Client": "web/1.0.0",
    })
    expect(apiClientIdentityHeader()).toEqual({
      "X-ZelaDF-Client": "android/1.0.0",
    })
  })

  it("usa web quando a ponte nativa não está disponível", () => {
    vi.mocked(Capacitor.getPlatform).mockImplementation(() => {
      throw new Error("bridge unavailable")
    })
    expect(apiClientIdentityHeader()).toEqual({
      "X-ZelaDF-Client": "web/1.0.0",
    })
  })

  it("não rotula outra plataforma como web", () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios")
    expect(apiClientIdentityHeader()).toEqual({
      "X-ZelaDF-Client": "unknown/1.0.0",
    })
  })
})
