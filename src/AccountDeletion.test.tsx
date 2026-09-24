// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const mocks = vi.hoisted(() => ({
  user: { id: "account-a" } as { id: string } | null,
  fetch: vi.fn(),
  request: vi.fn(),
}))
vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}))
vi.mock("./auth/AuthModal", () => ({
  AuthModal: () => <p>Autenticação da conta</p>,
}))
vi.mock("./lib/accountDeletion", () => ({
  fetchAccountDeletionRequest: mocks.fetch,
  requestAccountDeletion: mocks.request,
}))
import { AccountDeletionEntry } from "./AccountDeletion"

const receipt = {
  id: "40000000-0000-0000-0000-000000000001",
  createdAt: "2026-09-05T15:00:00Z",
  status: "pending" as const,
}
let root: Root
let container: HTMLDivElement

async function render() {
  await act(async () =>
    root.render(<AccountDeletionEntry key={mocks.user?.id ?? "visitor"} />),
  )
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  await act(async () => button.click())
}
async function confirm() {
  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )
  if (!checkbox) throw new Error("Missing confirmation")
  await act(async () => checkbox.click())
}

describe("account deletion flow", () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  )
  const originalClose = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "close",
  )
  beforeAll(() => {
    // jsdom does not implement native dialog focus management or the top layer.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function () {
        this.setAttribute("open", "")
      },
    })
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function () {
        this.removeAttribute("open")
      },
    })
  })
  afterAll(() => {
    for (const [name, descriptor] of [
      ["showModal", originalShowModal],
      ["close", originalClose],
    ] as const) {
      if (descriptor)
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
    }
  })
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.history.replaceState(null, "", "/")
    sessionStorage.clear()
    mocks.user = { id: "account-a" }
    mocks.fetch.mockResolvedValue(null)
    mocks.request.mockResolvedValue(receipt)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    sessionStorage.clear()
    window.history.replaceState(null, "", "/")
    vi.restoreAllMocks()
  })

  it("requires login without creating a request for visitors", async () => {
    mocks.user = null
    await render()
    await click("Solicitar exclusão da conta")
    await click("Entrar para solicitar exclusão")
    expect(container.textContent).toContain("Autenticação da conta")
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("requires confirmation and displays only the persisted receipt", async () => {
    await render()
    await click("Solicitar exclusão da conta")
    await click("Registrar solicitação")
    expect(mocks.request).not.toHaveBeenCalled()
    await confirm()
    await click("Registrar solicitação")
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith()
    expect(container.textContent).toContain(receipt.id)
    expect(container.textContent).toContain(
      "A exclusão da conta ainda não foi concluída",
    )
  })

  it("shows an existing request without submitting another", async () => {
    mocks.fetch.mockResolvedValue({ ...receipt, status: "in_review" })
    await render()
    await click("Solicitar exclusão da conta")
    expect(container.textContent).toContain("Solicitação em análise")
    expect(container.textContent).not.toContain("Registrar solicitação")
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("reports failure without a false protocol and recovers by reading the request", async () => {
    mocks.request.mockRejectedValue(new Error("private backend details"))
    await render()
    await click("Solicitar exclusão da conta")
    await confirm()
    await click("Registrar solicitação")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível confirmar",
    )
    expect(container.textContent).not.toMatch(
      /Protocolo:|private backend details/,
    )
    mocks.fetch.mockResolvedValue(receipt)
    await click("Tentar novamente")
    expect(container.textContent).toContain(receipt.id)
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  it("discards the previous account's late submission receipt", async () => {
    let resolveRequest: (value: typeof receipt) => void = () => {
      throw new Error("Not initialized")
    }
    mocks.request.mockReturnValue(
      new Promise<typeof receipt>((resolve) => {
        resolveRequest = resolve
      }),
    )
    await render()
    await click("Solicitar exclusão da conta")
    await confirm()
    await click("Registrar solicitação")
    mocks.user = { id: "account-b" }
    await render()
    await act(async () => resolveRequest(receipt))
    expect(container.textContent).not.toContain(receipt.id)
    expect(container.textContent).toContain("Registrar solicitação")
  })

  it("resets confirmation after closing and reopening", async () => {
    await render()
    await click("Solicitar exclusão da conta")
    await confirm()
    await click("Fechar solicitação de exclusão")
    await click("Solicitar exclusão da conta")
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(false)
  })

  it("opens from the public web link and preserves only navigation intent for OAuth", async () => {
    window.history.replaceState(null, "", "/?account-deletion=1")
    await render()
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true)
    expect(sessionStorage.getItem("zeladf.account-deletion.intent")).toBe("1")
    expect(mocks.request).not.toHaveBeenCalled()
    await click("Fechar solicitação de exclusão")
    expect(window.location.search).toBe("")
    expect(sessionStorage.getItem("zeladf.account-deletion.intent")).toBeNull()
  })
})
