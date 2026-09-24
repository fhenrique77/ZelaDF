// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }))
vi.mock("./AuthProvider", () => ({ useAuth: () => mocks }))
import { AuthModal } from "./AuthModal"
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("localStorage", { getItem: () => null })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!
describe("falhas de login Google", () => {
  it.each([false, true])(
    "exibe falha e permite nova tentativa (exceção: %s)",
    async (rejects) => {
      if (rejects)
        mocks.signInWithGoogle.mockRejectedValueOnce(new Error("network"))
      else
        mocks.signInWithGoogle.mockResolvedValueOnce({
          error: "Google indisponível",
        })
      await act(async () => root.render(<AuthModal onClose={vi.fn()} />))
      await act(async () => button("Google").click())
      await act(async () => button("Continuar com Google").click())
      expect(container.textContent).toContain(
        rejects ? "Não foi possível entrar com Google" : "Google indisponível",
      )
      expect(button("Continuar com Google").disabled).toBe(false)
      mocks.signInWithGoogle.mockResolvedValueOnce({ error: null })
      await act(async () => button("Continuar com Google").click())
      expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(2)
      expect(container.textContent).not.toContain("Google indisponível")
    },
  )
})
