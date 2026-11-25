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
  user: { id: "synthetic-account-a" } as { id: string } | null,

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

type Receipt = {
  id: string

  createdAt: string

  status: "pending" | "in_review"
}

const receiptA: Receipt = {
  id: "40000000-0000-0000-0000-000000000001",

  createdAt: "2026-09-05T15:00:00Z",

  status: "pending",
}

const receiptB: Receipt = {
  ...receiptA,

  id: "40000000-0000-0000-0000-000000000002",
}

function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error("Promise não inicializada")
  }

  let reject = (_reason: Error): void => {
    throw new Error("Promise não inicializada")
  }

  const promise = new Promise<T>((res, rej) => {
    resolve = res

    reject = rej
  })

  return { promise, resolve, reject }
}

let root: Root

let container: HTMLDivElement

async function renderWithoutExternalKey() {
  await act(async () => root.render(<AccountDeletionEntry />))
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

async function confirmRequest() {
  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )

  if (!checkbox) throw new Error("Missing confirmation checkbox")

  await act(async () => checkbox.click())
}

describe("account deletion regressions without an external key", () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,

    "showModal",
  )

  const originalClose = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,

    "close",
  )

  beforeAll(() => {
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

    mocks.user = { id: "synthetic-account-a" }

    mocks.fetch.mockResolvedValue(null)

    mocks.request.mockResolvedValue(receiptA)

    container = document.createElement("div")

    document.body.append(container)

    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())

    container.remove()

    sessionStorage.clear()

    window.history.replaceState(null, "", "/")

    vi.resetAllMocks()
  })

  it("does not show a previous receipt after logout and a failed lookup for the next account", async () => {
    mocks.fetch

      .mockResolvedValueOnce(receiptA)

      .mockRejectedValueOnce(new Error("synthetic lookup failure"))

    await renderWithoutExternalKey()

    await click("Solicitar exclusão da conta")

    expect(container.textContent).toContain(receiptA.id)

    mocks.user = null

    await renderWithoutExternalKey()

    expect(container.textContent).not.toContain(receiptA.id)

    expect(container.textContent).toContain("Entre na conta")

    mocks.user = { id: "synthetic-account-b" }

    await renderWithoutExternalKey()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "canal de exclusão está indisponível",
    )

    expect(container.textContent).not.toContain(receiptA.id)
  })

  it("ignores an old lookup that resolves after the next account's lookup", async () => {
    const lookupA = deferred<Receipt | null>()

    mocks.fetch

      .mockReturnValueOnce(lookupA.promise)

      .mockResolvedValueOnce(receiptB)

    await renderWithoutExternalKey()

    await click("Solicitar exclusão da conta")

    mocks.user = { id: "synthetic-account-b" }

    await renderWithoutExternalKey()

    expect(container.textContent).toContain(receiptB.id)

    await act(async () => lookupA.resolve(receiptA))

    expect(container.textContent).toContain(receiptB.id)

    expect(container.textContent).not.toContain(receiptA.id)
  })

  it("does not apply an old account's delayed submission to the next account", async () => {
    const submissionA = deferred<Receipt>()

    mocks.request.mockReturnValueOnce(submissionA.promise)

    await renderWithoutExternalKey()

    await click("Solicitar exclusão da conta")

    await confirmRequest()

    await click("Registrar solicitação")

    expect(mocks.request).toHaveBeenCalledExactlyOnceWith()

    mocks.user = { id: "synthetic-account-b" }

    await renderWithoutExternalKey()

    expect(container.textContent).not.toContain(receiptA.id)

    await act(async () => submissionA.resolve(receiptA))

    expect(container.textContent).not.toContain(receiptA.id)

    expect(container.textContent).not.toContain("Solicitação recebida")
  })

  it("keeps the current account receipt when an earlier submission completes", async () => {
    const submissionA = deferred<Receipt>()
    mocks.fetch.mockResolvedValueOnce(null).mockResolvedValueOnce(receiptB)
    mocks.request.mockReturnValueOnce(submissionA.promise)
    await renderWithoutExternalKey()
    await click("Solicitar exclusão da conta")
    await confirmRequest()
    await click("Registrar solicitação")
    expect(mocks.request).toHaveBeenCalledOnce()

    mocks.user = { id: "synthetic-account-b" }
    await renderWithoutExternalKey()
    expect(container.textContent).toContain(receiptB.id)

    await act(async () => submissionA.resolve(receiptA))
    expect(container.textContent).toContain(receiptB.id)
    expect(container.textContent).not.toContain(receiptA.id)
  })

  it("requires fresh confirmation when the account changes", async () => {
    await renderWithoutExternalKey()
    await click("Solicitar exclusão da conta")
    await confirmRequest()
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true)

    mocks.user = { id: "synthetic-account-b" }
    await renderWithoutExternalKey()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    const confirmation = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    const submit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Registrar solicitação",
    )
    expect(confirmation?.checked).toBe(false)
    expect(submit?.disabled).toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("retries a failed lookup and displays the persisted receipt", async () => {
    mocks.fetch

      .mockRejectedValueOnce(new Error("synthetic temporary failure"))

      .mockResolvedValueOnce(receiptB)

    await renderWithoutExternalKey()

    await click("Solicitar exclusão da conta")

    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    await click("Tentar novamente")

    expect(container.textContent).toContain(receiptB.id)

    expect(mocks.fetch).toHaveBeenCalledTimes(2)

    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("lets a visitor open login, then loads the signed-in account without submitting", async () => {
    mocks.user = null

    await renderWithoutExternalKey()

    await click("Solicitar exclusão da conta")

    await click("Entrar para solicitar exclusão")

    expect(container.textContent).toContain("Autenticação da conta")

    expect(mocks.fetch).not.toHaveBeenCalled()

    expect(mocks.request).not.toHaveBeenCalled()

    mocks.user = { id: "synthetic-account-b" }

    await renderWithoutExternalKey()

    expect(mocks.fetch).toHaveBeenCalledOnce()

    expect(mocks.request).not.toHaveBeenCalled()

    expect(container.textContent).toContain("Registrar solicitação")
  })
})
