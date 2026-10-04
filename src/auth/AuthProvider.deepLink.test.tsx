// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  appCallback: null as ((event: { url: string }) => void) | null,
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  removeListener: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}))
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mocks.addListener,
    getLaunchUrl: mocks.getLaunchUrl,
  },
}))
vi.mock("@capacitor/browser", () => ({
  Browser: { open: vi.fn() },
}))
vi.mock("../lib/supabaseClient", () => ({
  isConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      setSession: mocks.setSession,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  },
}))
vi.mock("../lib/push", () => ({
  unregisterPushNotifications: vi.fn(),
}))

import { AuthProvider, useAuth } from "./AuthProvider"
import { NATIVE_OAUTH_REDIRECT, rememberNativeOAuth } from "./nativeOAuth"

let container: HTMLDivElement
let root: Root

function SessionProbe() {
  const { user } = useAuth()
  return <span>{user?.id ?? "none"}</span>
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "victim-account" } } },
  })
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  })
  mocks.addListener.mockImplementation(
    (_name: string, callback: (event: { url: string }) => void) => {
      mocks.appCallback = callback
      return Promise.resolve({ remove: mocks.removeListener })
    },
  )
  mocks.getLaunchUrl.mockResolvedValue({ url: null })
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { session: null },
    error: null,
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  mocks.appCallback = null
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

async function mountProvider() {
  await act(async () => {
    root.render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )
  })
  expect(container.textContent).toBe("victim-account")
  expect(mocks.addListener).toHaveBeenCalledWith(
    "appUrlOpen",
    expect.any(Function),
  )
}

async function openDeepLink(url: string) {
  await act(async () => {
    mocks.appCallback?.({ url })
  })
}

describe("unsolicited Android OAuth deep links", () => {
  it("does not replace the active account with tokens from a link", async () => {
    await mountProvider()
    await openDeepLink(
      `${NATIVE_OAUTH_REDIRECT}#access_token=attacker&refresh_token=attacker`,
    )
    await openDeepLink(
      `${NATIVE_OAUTH_REDIRECT}?code=unsolicited-code`,
    )
    await openDeepLink(
      "https://attacker.example/auth-callback?code=unsolicited-code",
    )

    expect(container.textContent).toBe("victim-account")
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("ignores an unsolicited token callback on a cold start", async () => {
    mocks.getLaunchUrl.mockResolvedValueOnce({
      url: `${NATIVE_OAUTH_REDIRECT}#access_token=attacker&refresh_token=attacker`,
    })
    await mountProvider()
    expect(container.textContent).toBe("victim-account")
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("rejects token links during a pending login and exchanges a valid code once", async () => {
    await mountProvider()
    expect(rememberNativeOAuth("flow-12345678")).toBe(true)

    await openDeepLink(
      `${NATIVE_OAUTH_REDIRECT}#access_token=attacker&refresh_token=attacker`,
    )
    await openDeepLink(
      "com.zeladf.app://other-host?code=foreign-code",
    )
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(container.textContent).toBe("victim-account")

    await openDeepLink(`${NATIVE_OAUTH_REDIRECT}?code=valid-code`)
    await openDeepLink(`${NATIVE_OAUTH_REDIRECT}?code=valid-code`)
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledOnce()
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code", {
      flowId: "flow-12345678",
    })
    expect(mocks.setSession).not.toHaveBeenCalled()
  })
})
