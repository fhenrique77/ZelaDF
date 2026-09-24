// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Report } from "./data"
import type {
  ReportQueryResult,
  ReportStatusHistory,
  VoteMutationResult,
} from "./lib/reportService"

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "test-user" } as { id: string } | null, loading: false },
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
  useAuth: () => ({ ...mocks.auth, signOut: vi.fn() }),
  displayName: () => "Conta de teste",
}))
vi.mock("./auth/AuthModal", () => ({ AuthModal: () => null }))
vi.mock("./lib/gps", () => ({ getCurrentPosition: vi.fn() }))
vi.mock("./lib/reportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/reportService")>()),
  ...mocks,
}))
vi.mock("./lib/accountDeletion", () => ({
  fetchAccountDeletionRequest: vi.fn().mockResolvedValue(null),
  requestAccountDeletion: vi.fn(),
}))
vi.mock("./lib/communitySafety", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/communitySafety")>()),
  acceptCommunityTerms: mocks.acceptCommunityTerms,
}))

import App from "./App"
import { ReportServiceError } from "./lib/reportService"

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

const reportA: Report = {
  id: "report-A",
  category: "buraco",
  title: "Buraco no local A",
  description: "Descrição do aviso A",
  ra: "Plano Piloto",
  address: "Endereço de teste A",
  lat: -15.79,
  lng: -47.88,
  photo: "",
  status: "aberto",
  confirmations: 0,
  createdAt: "2026-09-05T12:00:00Z",
  isOwner: true,
}
const reportB: Report = {
  ...reportA,
  id: "report-B",
  title: "Buraco no local B",
  description: "Descrição do aviso B",
}
const historyEntry = (id: string): ReportStatusHistory => ({
  id,
  fromStatus: "aberto",
  toStatus: "andamento",
  reason: `Histórico exclusivo do aviso ${id}`,
  changedAt: "2026-09-05T12:00:00Z",
})

let container: HTMLDivElement
let root: Root
let serverReports: Report[]
let serverVotes: Set<string>

function response(): ReportQueryResult {
  return {
    reports: serverReports.map((report) => ({ ...report })),
    truncated: false,
    source: "supabase",
  }
}

async function render() {
  await act(async () => root.render(<App />))
}

function button(
  text: string,
  scope: ParentNode = container,
): HTMLButtonElement {
  const result = [...scope.querySelectorAll("button")].find((element) =>
    element.textContent?.toLowerCase().includes(text.toLowerCase()),
  )
  if (!result) throw new Error(`Botão não encontrado: ${text}`)
  return result
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function selectReport(report: Report, mobile = false) {
  if (mobile) {
    await click(button("▤ Avisos"))
    const lists = container.querySelectorAll("ul")
    await click(button(report.title, lists[lists.length - 1]))
  } else {
    await click(button(report.title, container.querySelector("aside")!))
  }
}

function detail() {
  return container.querySelector("main")!
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.acceptCommunityTerms.mockResolvedValue(undefined)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test-preview"),
      revokeObjectURL: vi.fn(),
    }),
  )
  mocks.auth.user = { id: "test-user" }
  serverReports = [{ ...reportA }, { ...reportB }]
  serverVotes = new Set()
  mocks.fetchReports.mockImplementation(async () => response())
  mocks.fetchMyVotes.mockImplementation(async () => new Set(serverVotes))
  mocks.fetchOperatorAccess.mockResolvedValue(false)
  mocks.fetchReportStatusHistory.mockResolvedValue([])
  mocks.updateReport.mockImplementation(async (input) => {
    const report = {
      ...serverReports.find((row) => row.id === input.id)!,
      ...input,
    }
    serverReports = serverReports.map((row) =>
      row.id === report.id ? report : row,
    )
    return { report, photoCleanupFailed: false }
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe("carregamento de meus avisos", () => {
  it("preserva avisos quando os votos falham e só libera voto após recuperar a consulta", async () => {
    mocks.fetchMyVotes.mockRejectedValueOnce(new Error("votos indisponíveis"))
    await render()
    await selectReport(reportA)
    expect(detail().textContent).toContain(reportA.title)
    expect(button("Confirmação indisponível", detail()).disabled).toBe(true)
    await click(button("Confirmação indisponível", detail()))
    expect(mocks.setReportVote).not.toHaveBeenCalled()
    serverVotes.add(reportA.id)
    await click(button("tentar novamente"))
    expect(button("Você confirmou", detail()).disabled).toBe(false)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
  it("desativa filtro indisponível e carrega avisos gerais com explicação", async () => {
    mocks.fetchReports.mockImplementation(async (query) => {
      if (query.onlyMine) {
        throw new ReportServiceError(
          "fetch_mine_unavailable",
          "O filtro Meus avisos está indisponível. Exibindo os avisos gerais do mapa.",
        )
      }
      return response()
    })
    await render()
    await click(button("Meus avisos"))
    expect(button("Meus avisos").getAttribute("aria-pressed")).toBe("false")
    expect(mocks.fetchReports).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlyMine: false }),
    )
    expect(container.textContent).toContain(
      "O filtro Meus avisos está indisponível",
    )
    await selectReport(reportB, true)
    expect(detail().textContent).toContain(reportB.title)
  })

  it("mantém o filtro e permite tentar novamente em falha de rede", async () => {
    await render()
    mocks.fetchReports.mockRejectedValueOnce(
      new ReportServiceError("fetch", "Falha temporária"),
    )
    await click(button("Meus avisos"))
    expect(button("Meus avisos").getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Falha temporária",
    )
    await click(button("tentar novamente"))
    expect(mocks.fetchReports).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlyMine: true }),
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe("troca de aviso e edição", () => {
  it.each([false, true])(
    "edita os dados de B depois de visitar A (lista mobile: %s)",
    async (mobile) => {
      await render()
      await selectReport(reportA, mobile)
      await selectReport(reportB, mobile)
      await click(button("Editar", detail()))

      expect(
        detail().querySelector<HTMLInputElement>('input:not([type="file"])')
          ?.value,
      ).toBe(reportB.title)
      await click(button("Salvar", detail()))

      expect(mocks.updateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          id: reportB.id,
          title: reportB.title,
          description: reportB.description,
        }),
      )
    },
  )

  it("descarta rascunho e libera preview ao mudar o aviso durante uma edição", async () => {
    await render()
    await selectReport(reportA)
    await click(button("Editar", detail()))
    const fileInput =
      detail().querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(fileInput, "files", {
      value: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
    })
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    })

    await selectReport(reportB)
    expect(detail().querySelector('input[type="file"]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-preview")
    await click(button("Editar", detail()))
    await click(button("Salvar", detail()))
    expect(mocks.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: reportB.id, photoFile: null }),
    )
  })

  it("não transfere a confirmação de exclusão de A para B", async () => {
    await render()
    await selectReport(reportA)
    await click(button("Excluir", detail()))
    expect(button("Confirmar exclusão?", detail())).toBeTruthy()

    await selectReport(reportB)
    await click(button("Excluir", detail()))
    expect(mocks.deleteReport).not.toHaveBeenCalled()
    expect(button("Confirmar exclusão?", detail())).toBeTruthy()
  })

  it("mantém o aviso e apresenta o erro quando a exclusão não é confirmada", async () => {
    mocks.deleteReport.mockRejectedValue(new Error("Exclusão não confirmada"))
    await render()
    await selectReport(reportA)
    await click(button("Excluir", detail()))
    await click(button("Confirmar exclusão?", detail()))

    expect(detail().textContent).toContain("Exclusão não confirmada")
    expect(container.querySelector("aside")?.textContent).toContain(
      reportA.title,
    )
  })

  it("uma exclusão atrasada de A preserva a seleção atual de B", async () => {
    const deletion = deferred<{ photoCleanupFailed: boolean }>()
    mocks.deleteReport.mockReturnValueOnce(deletion.promise)
    await render()
    await selectReport(reportA)
    await click(button("Excluir", detail()))
    await click(button("Confirmar exclusão?", detail()))
    await selectReport(reportB)
    serverReports = [{ ...reportB }]
    await act(async () => deletion.resolve({ photoCleanupFailed: false }))

    expect(detail().querySelector("h2")?.textContent).toBe(reportB.title)
    expect(container.querySelector("aside")?.textContent).not.toContain(
      reportA.title,
    )
  })
})

describe("votos e respostas fora de ordem", () => {
  it.each(["antes", "depois"])(
    "ignora consulta antiga que termina %s do voto",
    async (order) => {
      await render()
      await selectReport(reportA)
      const oldResult = response()
      const oldQuery = deferred<ReportQueryResult>()
      const vote = deferred<VoteMutationResult>()
      mocks.fetchReports.mockReturnValueOnce(oldQuery.promise)
      mocks.setReportVote.mockReturnValueOnce(vote.promise)
      await click(
        container.querySelector<HTMLButtonElement>(
          '[title="Atualizar avisos"]',
        )!,
      )
      await click(button("Confirmo que existe", detail()))
      const finishOldQuery = async () =>
        act(async () => oldQuery.resolve(oldResult))

      if (order === "antes") {
        await finishOldQuery()
        expect(button("Atualizando…", detail()).textContent).toContain("(1)")
      }
      serverReports[0] = { ...reportA, confirmations: 1 }
      serverVotes.add(reportA.id)
      await act(async () => vote.resolve({ voted: true, confirmations: 1 }))
      if (order === "depois") await finishOldQuery()

      expect(button("Você confirmou", detail()).textContent).toContain("(1)")
      expect(mocks.setReportVote).toHaveBeenCalledExactlyOnceWith(
        reportA.id,
        true,
      )
    },
  )

  it("aplica o filtro mais recente após o voto e faz rollback quando ele falha", async () => {
    await render()
    await selectReport(reportA)
    const vote = deferred<VoteMutationResult>()
    mocks.setReportVote.mockReturnValueOnce(vote.promise)
    await click(button("Confirmo que existe", detail()))
    const callsBeforeFilter = mocks.fetchReports.mock.calls.length
    await click(button("resolvido", container.querySelector("aside")!))
    expect(mocks.fetchReports).toHaveBeenCalledTimes(callsBeforeFilter)

    await act(async () => vote.reject(new Error("Falha de confirmação")))
    expect(mocks.fetchReports).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "resolvido" }),
    )
    expect(button("Confirmo que existe", detail()).textContent).toContain("(0)")
    expect(container.textContent).toContain("Falha de confirmação")
    expect(button("Confirmo que existe", detail()).disabled).toBe(false)
  })

  it("ignora dados e erro de uma consulta substituída por outro filtro", async () => {
    await render()
    const oldQuery = deferred<ReportQueryResult>()
    mocks.fetchReports.mockReturnValueOnce(oldQuery.promise)
    await click(
      container.querySelector<HTMLButtonElement>('[title="Atualizar avisos"]')!,
    )
    await click(button("resolvido", container.querySelector("aside")!))
    await act(async () => oldQuery.reject(new Error("Erro de consulta antiga")))

    expect(container.textContent).not.toContain("Erro de consulta antiga")
    expect(
      container.querySelector<HTMLButtonElement>('[title="Atualizar avisos"]')
        ?.disabled,
    ).toBe(false)
  })

  it("espera votos de dois avisos antes de recarregar o estado do banco", async () => {
    const firstVote = deferred<VoteMutationResult>()
    const secondVote = deferred<VoteMutationResult>()
    mocks.setReportVote
      .mockReturnValueOnce(firstVote.promise)
      .mockReturnValueOnce(secondVote.promise)
    await render()
    await selectReport(reportA)
    await click(button("Confirmo que existe", detail()))
    await selectReport(reportB)
    await click(button("Confirmo que existe", detail()))
    const callsBeforeCompletion = mocks.fetchReports.mock.calls.length
    serverReports[0] = { ...reportA, confirmations: 1 }
    serverVotes.add(reportA.id)
    await act(async () => firstVote.resolve({ voted: true, confirmations: 1 }))
    expect(mocks.fetchReports).toHaveBeenCalledTimes(callsBeforeCompletion)
    expect(button("Atualizando…", detail()).disabled).toBe(true)

    serverReports[1] = { ...reportB, confirmations: 1 }
    serverVotes.add(reportB.id)
    await act(async () => secondVote.resolve({ voted: true, confirmations: 1 }))
    expect(button("Você confirmou", detail()).textContent).toContain("(1)")
    await selectReport(reportA)
    expect(button("Você confirmou", detail()).textContent).toContain("(1)")
    expect(mocks.fetchReports).toHaveBeenCalledTimes(callsBeforeCompletion + 1)
  })
})

describe("histórico do aviso selecionado", () => {
  it.each([false, true])(
    "ignora histórico antigo de A após selecionar B (falha: %s)",
    async (fails) => {
      mocks.fetchOperatorAccess.mockResolvedValue(true)
      const oldHistory = deferred<ReportStatusHistory[]>()
      mocks.fetchReportStatusHistory.mockImplementation(async (id) =>
        id === reportA.id ? oldHistory.promise : [historyEntry("B")],
      )
      await render()
      await selectReport(reportA)
      await selectReport(reportB)
      await act(async () => {
        if (fails) oldHistory.reject(new Error("Erro antigo do aviso A"))
        else oldHistory.resolve([historyEntry("A")])
      })

      expect(detail().textContent).toContain(historyEntry("B").reason)
      expect(detail().textContent).not.toContain(historyEntry("A").reason)
      expect(container.textContent).not.toContain("Erro antigo do aviso A")
    },
  )

  it("oculta o histórico anterior enquanto o próximo ainda está carregando", async () => {
    mocks.fetchOperatorAccess.mockResolvedValue(true)
    const newHistory = deferred<ReportStatusHistory[]>()
    mocks.fetchReportStatusHistory.mockImplementation(async (id) =>
      id === reportA.id ? [historyEntry("A")] : newHistory.promise,
    )
    await render()
    await selectReport(reportA)
    await selectReport(reportB)
    expect(detail().textContent).not.toContain(historyEntry("A").reason)
    expect(detail().textContent).toContain("Carregando…")
    await act(async () => newHistory.resolve([historyEntry("B")]))
    expect(detail().textContent).toContain(historyEntry("B").reason)
  })

  it("não restaura histórico nem erros de uma sessão encerrada", async () => {
    mocks.fetchOperatorAccess.mockResolvedValue(true)
    const history = deferred<ReportStatusHistory[]>()
    mocks.fetchReportStatusHistory.mockReturnValueOnce(history.promise)
    await render()
    await selectReport(reportA)
    mocks.auth.user = null
    await render()
    await act(async () => history.reject(new Error("Erro da sessão anterior")))

    expect(detail().textContent).not.toContain("Histórico")
    expect(container.textContent).not.toContain("Erro da sessão anterior")
  })

  it("uma mudança de status atrasada de A recarrega somente o histórico selecionado em B", async () => {
    mocks.fetchOperatorAccess.mockResolvedValue(true)
    mocks.fetchReportStatusHistory.mockImplementation(async (id) => [
      historyEntry(id),
    ])
    const change = deferred<void>()
    mocks.changeReportStatus.mockReturnValueOnce(change.promise)
    await render()
    await selectReport(reportA)
    const reason = detail().querySelector("textarea")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(reason, "Equipe iniciou a análise do aviso.")
      reason.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click(button("Atualizar status", detail()))
    expect(mocks.changeReportStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: reportA.id,
        reason: "Equipe iniciou a análise do aviso.",
      }),
    )
    await selectReport(reportB)
    serverReports[0] = { ...reportA, status: "andamento" }
    await act(async () => change.resolve())

    expect(mocks.fetchReportStatusHistory).toHaveBeenLastCalledWith(reportB.id)
    expect(detail().textContent).toContain(historyEntry(reportB.id).reason)
    expect(detail().textContent).not.toContain(historyEntry(reportA.id).reason)
  })
})
