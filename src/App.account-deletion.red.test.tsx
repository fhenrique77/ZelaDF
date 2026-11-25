// @vitest-environment jsdom

import { act, type ReactNode } from "react"

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
  auth: {
    user: { id: "synthetic-account-a" } as { id: string } | null,

    loading: false,
  },

  signOut: vi.fn(),

  fetchReports: vi.fn(),

  fetchMyVotes: vi.fn(),

  createReport: vi.fn(),

  setReportVote: vi.fn(),

  deleteReport: vi.fn(),

  updateReport: vi.fn(),

  acceptCommunityTerms: vi.fn(),

  changeReportStatus: vi.fn(),

  fetchOperatorAccess: vi.fn(),

  fetchReportStatusHistory: vi.fn(),

  fetchDeletionRequest: vi.fn(),

  requestDeletion: vi.fn(),

  map: {
    flyTo: vi.fn(),

    getZoom: () => 12,

    getBounds: () => ({
      getSouth: () => -16,

      getNorth: () => -15,

      getWest: () => -48,

      getEast: () => -47,
    }),
  },
}))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => children,

  TileLayer: () => null,

  Marker: () => null,

  useMap: () => mocks.map,

  useMapEvents: () => mocks.map,
}))

vi.mock("leaflet", () => ({ default: { divIcon: vi.fn() } }))

vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({ ...mocks.auth, signOut: mocks.signOut }),

  displayName: () => "Conta sintética",
}))

vi.mock("./auth/AuthModal", () => ({ AuthModal: () => null }))

vi.mock("./CommunitySafety", () => ({
  CommunityBlocks: () => null,
}))

vi.mock("./lib/gps", () => ({ getCurrentPosition: vi.fn() }))

vi.mock("./lib/reportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/reportService")>()),

  ...mocks,
}))

vi.mock("./lib/accountDeletion", () => ({
  fetchAccountDeletionRequest: mocks.fetchDeletionRequest,

  requestAccountDeletion: mocks.requestDeletion,
}))

vi.mock("./lib/communitySafety", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/communitySafety")>()),

  acceptCommunityTerms: mocks.acceptCommunityTerms,
}))

import App from "./App"

type Receipt = {
  id: string

  createdAt: string

  status: "pending" | "in_review"
}

const receiptA: Receipt = {
  id: "40000000-0000-0000-0000-000000000011",

  createdAt: "2026-09-05T15:00:00Z",

  status: "pending",
}

const receiptB: Receipt = {
  ...receiptA,

  id: "40000000-0000-0000-0000-000000000012",
}

let container: HTMLDivElement

let root: Root

async function renderApp() {
  await act(async () => root.render(<App />))
}

function button(label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find(
    (element) =>
      element.textContent?.trim() === label ||
      element.getAttribute("aria-label") === label,
  )

  if (!result) throw new Error(`Botão não encontrado: ${label}`)

  return result
}

async function click(label: string) {
  await act(async () => button(label).click())
}

describe("account deletion mounted through the real App", () => {
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
    vi.resetAllMocks()

    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)

    mocks.auth.user = { id: "synthetic-account-a" }

    mocks.auth.loading = false

    mocks.signOut.mockImplementation(async () => {
      mocks.auth.user = null
    })

    mocks.fetchReports.mockResolvedValue({
      reports: [],

      truncated: false,

      source: "supabase",
    })

    mocks.fetchMyVotes.mockResolvedValue(new Set<string>())

    mocks.fetchOperatorAccess.mockResolvedValue(false)

    mocks.fetchReportStatusHistory.mockResolvedValue([])

    mocks.fetchDeletionRequest.mockResolvedValue(null)

    container = document.createElement("div")

    document.body.append(container)

    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())

    container.remove()

    vi.unstubAllGlobals()
  })

  it("hides the previous account's protocol after logout", async () => {
    mocks.fetchDeletionRequest.mockResolvedValue(receiptA)

    await renderApp()

    await click("Conta")

    expect(container.textContent).toContain(receiptA.id)

    await click("Sair")

    await renderApp()

    expect(mocks.signOut).toHaveBeenCalledOnce()

    expect(container.textContent).toContain("Entre na conta")

    expect(container.textContent).not.toContain(receiptA.id)
  })

  it("loads the next account's request after switching accounts in the real App", async () => {
    mocks.fetchDeletionRequest

      .mockResolvedValueOnce(receiptA)

      .mockResolvedValueOnce(receiptB)

    await renderApp()

    await click("Conta")

    expect(container.textContent).toContain(receiptA.id)

    mocks.auth.user = { id: "synthetic-account-b" }

    await renderApp()

    expect(container.textContent).not.toContain(receiptA.id)

    expect(container.textContent).toContain(receiptB.id)

    expect(container.textContent).not.toContain(receiptA.id)

    expect(mocks.fetchDeletionRequest).toHaveBeenCalledTimes(2)
  })
})
