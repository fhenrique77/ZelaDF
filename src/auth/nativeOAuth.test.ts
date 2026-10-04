// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearNativeOAuth,
  consumeNativeOAuthCallback,
  NATIVE_OAUTH_REDIRECT,
  rememberNativeOAuth,
} from "./nativeOAuth"

const flowId = "flow-12345678"

beforeEach(() => {
  const storage = new Map<string, string>()

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,

    setItem: (key: string, value: string) => storage.set(key, value),

    removeItem: (key: string) => storage.delete(key),
  })
})

afterEach(() => {
  vi.restoreAllMocks()

  vi.unstubAllGlobals()

  vi.useRealTimers()
})

describe("native Google OAuth callback", () => {
  it("accepts one code for a recent local PKCE attempt and consumes it once", () => {
    expect(rememberNativeOAuth(flowId)).toBe(true)

    const callback = `${NATIVE_OAUTH_REDIRECT}?code=one-time-code`

    expect(consumeNativeOAuthCallback(callback)).toEqual({
      code: "one-time-code",

      flowId,
    })

    expect(consumeNativeOAuthCallback(callback)).toBeNull()
  })

  it("rejects a code without a pending attempt or after expiration", () => {
    const callback = `${NATIVE_OAUTH_REDIRECT}?code=one-time-code`

    expect(consumeNativeOAuthCallback(callback)).toBeNull()

    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))

    expect(rememberNativeOAuth(flowId)).toBe(true)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(consumeNativeOAuthCallback(callback)).toBeNull()
  })

  it.each([
    "https://example.org/auth-callback?code=code",

    "com.zeladf.app://evil?code=code",

    "com.zeladf.app://auth-callback/other?code=code",

    "com.zeladf.app://auth-callback?code=code#access_token=stolen",

    "com.zeladf.app://auth-callback?code=code&access_token=stolen",

    "com.zeladf.app://auth-callback?code=code&refresh_token=stolen",

    "com.zeladf.app://auth-callback?code=a&code=b",

    "com.zeladf.app://auth-callback?code=a&sb_flow_id=other-flow",

    "com.zeladf.app://auth-callback#access_token=stolen&refresh_token=stolen",
  ])("rejects a foreign or token-bearing callback: %s", (callback) => {
    expect(rememberNativeOAuth(flowId)).toBe(true)

    expect(consumeNativeOAuthCallback(callback)).toBeNull()

    expect(
      consumeNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT}?code=valid`),
    ).toEqual({ code: "valid", flowId })
  })

  it("fails closed if the pending attempt cannot be stored", () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    expect(rememberNativeOAuth(flowId)).toBe(false)

    setItem.mockRestore()

    expect(
      consumeNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT}?code=code`),
    ).toBeNull()

    clearNativeOAuth()
  })

  it("rejects malformed flow identifiers", () => {
    expect(rememberNativeOAuth("bad flow")).toBe(false)
  })
})
