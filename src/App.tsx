import { useCallback, useEffect, useRef, useState } from "react"
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet"
import L from "leaflet"
import {
  CATEGORIES,
  RA_CENTER,
  type CategoryId,
  type Report,
  type Status,
} from "./data"
import { NewReportForm } from "./NewReportForm"
import { ReportDetail, type EditReportData } from "./ReportDetail"
import { ReportList } from "./ReportList"
import {
  fetchReports,
  fetchMyVotes,
  createReport as createReportApi,
  setReportVote as setReportVoteApi,
  deleteReport as deleteReportApi,
  updateReport as updateReportApi,
  changeReportStatus as changeReportStatusApi,
  fetchOperatorAccess,
  fetchReportStatusHistory,
  ReportServiceError,
  type ReportBounds,
  type ReportStatusHistory,
} from "./lib/reportService"
import { useAuth, displayName } from "./auth/AuthProvider"
import { AuthModal } from "./auth/AuthModal"
import { AccountDeletionEntry } from "./AccountDeletion"
import { getCurrentPosition, type LatLng } from "./lib/gps"
import { PRIVACY_POLICY_URL } from "./lib/privacy"

const CATEGORY_LIST = Object.values(CATEGORIES)
const REPORTS_PER_VIEWPORT = 200
const VIEWPORT_DEBOUNCE_MS = 300

type StatusHistoryState = {
  reportId: string
  operatorId: string
  entries: ReportStatusHistory[]
  loading: boolean
}

function makeIcon(category: CategoryId, active: boolean) {
  const c = CATEGORIES[category]
  return L.divIcon({
    className: `pin-marker ${active ? "pin-active" : ""}`,
    html: `<div class="pin" style="background:${c.color}"><span>${c.emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  })
}

function MapController({
  focus,
  onMapClick,
  adding,
}: {
  focus: Report | null
  onMapClick: (lat: number, lng: number) => void
  adding: boolean
}) {
  const map = useMap()
  const last = useRef<string | null>(null)
  if (focus && last.current !== focus.id) {
    last.current = focus.id
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), {
      duration: 0.8,
    })
  }
  useMapEvents({
    click(e) {
      if (adding) onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function getReportBounds(map: L.Map): ReportBounds {
  const bounds = map.getBounds()
  const round = (value: number) => Math.round(value * 100_000) / 100_000

  return {
    south: round(bounds.getSouth()),
    west: round(bounds.getWest()),
    north: round(bounds.getNorth()),
    east: round(bounds.getEast()),
  }
}

function MapViewportObserver({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: ReportBounds) => void
}) {
  const map = useMap()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const publishBounds = useCallback(() => {
    onBoundsChange(getReportBounds(map))
  }, [map, onBoundsChange])

  const scheduleBounds = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(publishBounds, VIEWPORT_DEBOUNCE_MS)
  }, [publishBounds])

  useMapEvents({
    moveend: scheduleBounds,
    zoomend: scheduleBounds,
  })

  useEffect(() => {
    publishBounds()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [publishBounds])

  return null
}

export default function App() {
  const { user, loading: authLoading } = useAuth()

  const [reports, setReports] = useState<Report[]>([])
  const [queryBounds, setQueryBounds] = useState<ReportBounds | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCats, setActiveCats] = useState<Set<CategoryId>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos")
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<LatLng | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [voted, setVoted] = useState<Set<string>>(new Set())
  const [votesUserId, setVotesUserId] = useState<string | null>(null)
  const votesUnavailable = Boolean(user && votesUserId !== user.id)
  const [votingReportIds, setVotingReportIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const [showMyReports, setShowMyReports] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<"demo" | "supabase" | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null)
  const [historyResult, setHistoryResult] = useState<StatusHistoryState | null>(
    null,
  )
  const [historyRevision, setHistoryRevision] = useState(0)
  const [reloadRevision, setReloadRevision] = useState(0)
  const mapRef = useRef<L.Map | null>(null)
  const hasLoadedRef = useRef(false)
  const loadRequestRef = useRef(0)
  const voteRequestsRef = useRef(new Set<string>())
  const activeUserIdRef = useRef(user?.id)

  useEffect(() => {
    activeUserIdRef.current = user?.id
  }, [user?.id])

  const invalidateReportQuery = useCallback(() => {
    loadRequestRef.current += 1
    setQuerying(false)
  }, [])

  const handleBoundsChange = useCallback((bounds: ReportBounds) => {
    setQueryBounds((current) => {
      if (
        current?.south === bounds.south &&
        current.west === bounds.west &&
        current.north === bounds.north &&
        current.east === bounds.east
      ) {
        return current
      }
      return bounds
    })
  }, [])

  // Consulta somente o viewport e os filtros atuais. Respostas antigas são ignoradas.
  const loadData = useCallback(async () => {
    // A consulta seguinte usa o viewport atual depois que os votos terminarem.
    if (!queryBounds || voteRequestsRef.current.size > 0) return

    const requestId = ++loadRequestRef.current
    if (!hasLoadedRef.current) setLoading(true)
    setQuerying(true)

    try {
      const result = await fetchReports({
        bounds: queryBounds,
        categories: [...activeCats],
        status: statusFilter === "todos" ? undefined : statusFilter,
        userId: user?.id,
        onlyMine: showMyReports,
        limit: REPORTS_PER_VIEWPORT,
      })
      if (requestId !== loadRequestRef.current) return
      let votes = new Set<string>()
      let votesFailed = false
      try {
        votes = await fetchMyVotes(
          user?.id,
          result.reports.map((report) => report.id),
        )
      } catch {
        votesFailed = true
      }

      if (requestId !== loadRequestRef.current) return

      setReports(result.reports)
      setVoted(votes)
      setVotesUserId(votesFailed ? null : (user?.id ?? null))
      setTruncated(result.truncated)
      setDataSource(result.source)
      setLoadError(
        votesFailed
          ? "Os avisos foram carregados, mas suas confirmações estão indisponíveis. Tente novamente para votar."
          : null,
      )
      setSelectedId((current) =>
        current && result.reports.some((report) => report.id === current)
          ? current
          : null,
      )
      hasLoadedRef.current = true
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      if (
        showMyReports &&
        error instanceof ReportServiceError &&
        error.code === "fetch_mine_unavailable"
      ) {
        setShowMyReports(false)
        setLoadError(null)
        setToast(error.message)
        return
      }
      setLoadError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os avisos. Tente novamente.",
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
        setQuerying(false)
      }
    }
  }, [activeCats, queryBounds, showMyReports, statusFilter, user])

  useEffect(() => {
    if (authLoading) return
    void loadData()
    return () => {
      loadRequestRef.current += 1
    }
  }, [authLoading, loadData, reloadRevision])

  useEffect(() => {
    let active = true

    if (!user) {
      setOperatorUserId(null)
      return
    }

    setOperatorUserId(null)
    void fetchOperatorAccess().then((allowed) => {
      if (active) setOperatorUserId(allowed ? user.id : null)
    })

    return () => {
      active = false
    }
  }, [user])

  const isOperator = Boolean(user && operatorUserId === user.id)

  const historyMatchesSelection = Boolean(
    isOperator &&
      historyResult?.reportId === selectedId &&
      historyResult?.operatorId === user?.id,
  )
  const statusHistory = historyMatchesSelection ? historyResult!.entries : []
  const statusHistoryLoading = Boolean(
    isOperator &&
      selectedId &&
      (!historyMatchesSelection || historyResult?.loading),
  )

  useEffect(() => {
    if (!selectedId || !isOperator || !user) {
      setHistoryResult(null)
      return
    }

    let active = true
    const context = { reportId: selectedId, operatorId: user.id }
    setHistoryResult({ ...context, entries: [], loading: true })

    void fetchReportStatusHistory(selectedId).then(
      (entries) => {
        if (active) setHistoryResult({ ...context, entries, loading: false })
      },
      (error: unknown) => {
        if (!active) return
        setHistoryResult({ ...context, entries: [], loading: false })
        setToast(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o histórico de status.",
        )
      },
    )

    return () => {
      active = false
    }
  }, [isOperator, selectedId, user?.id, historyRevision])

  // Pull-to-refresh / refresh manual
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  // GPS: centralizar mapa na localização real
  const handleGps = async () => {
    const result = await getCurrentPosition()

    if (result.success) {
      if (mapRef.current) {
        mapRef.current.flyTo([result.position.lat, result.position.lng], 15, {
          duration: 1,
        })
      }
    } else {
      // Mensagem amigável conforme o motivo
      const messages: Record<string, string> = {
        denied:
          "📍 Localização bloqueada. Habilite nas configurações do navegador/celular.",
        timeout: "📍 Tempo esgotado ao buscar localização. Tente novamente.",
        unavailable: "📍 GPS indisponível no momento. Tente novamente.",
      }
      setToast(messages[result.reason ?? "unavailable"])
      setTimeout(() => setToast(null), 4000)

      // Mesmo sem GPS, centraliza em Brasília
      if (mapRef.current) {
        mapRef.current.flyTo([result.position.lat, result.position.lng], 12, {
          duration: 1,
        })
      }
    }
  }

  const selected = reports.find((r) => r.id === selectedId) ?? null

  const visible = reports

  const toggleCat = (id: CategoryId) =>
    setActiveCats((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const openReports = reports.filter((r) => r.status !== "resolvido").length

  // Gate: exige login para criar aviso
  const startAdding = () => {
    if (!user) {
      setShowAuth(true)
      return
    }
    setAdding(true)
    setSelectedId(null)
    setSheetOpen(false)
  }

  const selectReport = (id: string) => {
    setSelectedId(id)
    setAdding(false)
    setSheetOpen(false)
  }

  const submitReport = async (
    data: Omit<Report, "id" | "createdAt" | "confirmations" | "status"> & {
      photoFile: File | null
      idempotencyKey: string
    },
  ) => {
    const result = await createReportApi({
      category: data.category,
      title: data.title,
      description: data.description,
      ra: data.ra,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
      photoFile: data.photoFile,
      idempotencyKey: data.idempotencyKey,
      authorId: user?.id,
    })
    const report = result.report

    invalidateReportQuery()
    setActiveCats(new Set())
    setStatusFilter("todos")
    setReports((prev) => [report, ...prev])
    setVoted((prev) => {
      const next = new Set(prev)
      if (result.initialVoteFailed) next.delete(report.id)
      else next.add(report.id)
      return next
    })
    setSelectedId(report.id)

    if (result.initialVoteFailed) {
      setToast(
        "O aviso foi publicado, mas a confirmação inicial não pôde ser registrada.",
      )
      setReloadRevision((revision) => revision + 1)
    }

    setDraft(null)
    setAdding(false)
  }

  // Gate: exige login para votar
  const handleToggleVote = async (id: string) => {
    if (!user) {
      setShowAuth(true)
      return
    }

    if (voteRequestsRef.current.has(id)) return
    if (votesUnavailable) return

    const has = voted.has(id)
    const desiredVote = !has
    voteRequestsRef.current.add(id)
    invalidateReportQuery()
    setVotingReportIds((current) => new Set(current).add(id))

    // Atualização otimista na UI
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, confirmations: r.confirmations + (has ? -1 : 1) }
          : r,
      ),
    )
    setVoted((prev) => {
      const next = new Set(prev)
      has ? next.delete(id) : next.add(id)
      return next
    })

    try {
      const result = await setReportVoteApi(id, desiredVote)
      if (activeUserIdRef.current !== user.id) return
      setReports((prev) =>
        prev.map((report) =>
          report.id === id && result.confirmations !== null
            ? { ...report, confirmations: result.confirmations }
            : report,
        ),
      )
      setVoted((prev) => {
        const next = new Set(prev)
        result.voted ? next.add(id) : next.delete(id)
        return next
      })
    } catch (error) {
      if (activeUserIdRef.current !== user.id) return
      setReports((prev) =>
        prev.map((report) =>
          report.id === id
            ? {
                ...report,
                confirmations: Math.max(
                  0,
                  report.confirmations + (has ? 1 : -1),
                ),
              }
            : report,
        ),
      )
      setVoted((prev) => {
        const next = new Set(prev)
        has ? next.add(id) : next.delete(id)
        return next
      })
      setToast(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar sua confirmação.",
      )
    } finally {
      voteRequestsRef.current.delete(id)
      setVotingReportIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      // Recarrega também consultas adiadas durante o voto, usando os filtros atuais.
      setReloadRevision((revision) => revision + 1)
    }
  }

  // Excluir aviso (somente autor)
  const handleDelete = async (id: string) => {
    const result = await deleteReportApi(id)
    invalidateReportQuery()
    setReports((prev) => prev.filter((r) => r.id !== id))
    setSelectedId((current) => (current === id ? null : current))
    if (result.photoCleanupFailed) {
      setToast(
        "O aviso foi excluído, mas a foto não pôde ser removida do armazenamento.",
      )
    }
    setReloadRevision((revision) => revision + 1)
  }

  // Editar aviso (somente autor)
  const handleEdit = async (id: string, data: EditReportData) => {
    if (!user) {
      setShowAuth(true)
      throw new Error("Entre na sua conta novamente para editar o aviso.")
    }

    const current = reports.find((report) => report.id === id)
    const result = await updateReportApi({
      id,
      authorId: user.id,
      ...data,
      currentPhotoUrl: current?.photo,
    })
    invalidateReportQuery()
    setReports((prev) =>
      prev.map((report) => (report.id === id ? result.report : report)),
    )
    if (result.photoCleanupFailed) {
      setToast(
        "As alterações foram salvas, mas a foto anterior não pôde ser removida.",
      )
    }
    setReloadRevision((revision) => revision + 1)
  }

  const handleStatusChange = async (
    id: string,
    nextStatus: Status,
    reason: string,
  ) => {
    const current = reports.find((report) => report.id === id)
    if (!current) throw new Error("Aviso não encontrado.")

    await changeReportStatusApi({
      reportId: id,
      currentStatus: current.status,
      nextStatus,
      reason,
    })

    invalidateReportQuery()
    setReports((previous) =>
      previous.map((report) =>
        report.id === id ? { ...report, status: nextStatus } : report,
      ),
    )
    setHistoryRevision((revision) => revision + 1)
    setToast("Status atualizado e registrado no histórico.")
    setReloadRevision((revision) => revision + 1)
  }

  const userName = displayName(user)

  return (
    <div className="grid h-full grid-rows-[auto_1fr] bg-concrete text-ink safe-area-top">
      {/* Top bar */}
      <header className="z-[600] flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2.5 safe-sides sm:px-5 sm:py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center bg-cerrado text-paper max-[359px]:hidden">
            <span className="font-display text-lg font-extrabold leading-none">
              Z
            </span>
          </div>
          <div className="leading-none">
            <h1 className="font-display text-xl font-extrabold tracking-tight">
              Zela<span className="text-cerrado">DF</span>
            </h1>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
              Mapa cidadão · DF
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-6 md:flex">
          <Stat
            value={reports.length}
            label={truncated ? "mais recentes" : "nesta área"}
          />
          <span className="h-8 w-px bg-line" />
          <Stat value={openReports} label="em aberto" accent />
        </div>

        <div className="flex items-center gap-2">
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Política de Privacidade"
            title="Política de Privacidade"
            className="flex h-8 w-8 items-center justify-center text-ash transition-colors hover:text-cerrado sm:h-auto sm:w-auto sm:font-mono sm:text-[10px] sm:uppercase sm:underline sm:underline-offset-2"
          >
            <span aria-hidden="true" className="text-base sm:hidden">
              ⓘ
            </span>
            <span className="hidden sm:inline">Privacidade</span>
          </a>

          {/* Auth area */}
          <AccountDeletionEntry
            key={user?.id ?? "visitor"}
            onContentChanged={() => setReloadRevision((value) => value + 1)}
          />
          {user ? (
            <UserBadge name={userName} />
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="border border-line px-3 py-2 font-display text-sm font-semibold text-ink transition-colors hover:border-cerrado hover:text-cerrado"
            >
              Entrar
            </button>
          )}

          <button
            onClick={startAdding}
            className="flex items-center gap-2 bg-terracota px-3.5 py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado"
          >
            <span className="text-base leading-none">＋</span>
            <span className="hidden sm:inline">Novo aviso</span>
            <span className="sm:hidden">Avisar</span>
          </button>
        </div>
      </header>

      <div className="relative grid min-h-0 grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* Desktop sidebar */}
        <aside className="scroll-thin hidden min-h-0 overflow-y-auto border-r border-line bg-paper lg:block">
          <ReportList
            reports={visible}
            selectedId={selectedId}
            activeCats={activeCats}
            statusFilter={statusFilter}
            truncated={truncated}
            onToggleCat={toggleCat}
            onStatus={setStatusFilter}
            onSelect={selectReport}
          />
        </aside>

        {/* Map */}
        <main className="relative min-h-0">
          <MapContainer
            center={RA_CENTER}
            zoom={12}
            zoomControl={false}
            className="h-full w-full"
            ref={mapRef}
            style={{ cursor: adding ? "crosshair" : "" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <MapController
              focus={selected}
              onMapClick={(lat, lng) => setDraft({ lat, lng })}
              adding={adding}
            />
            <MapViewportObserver onBoundsChange={handleBoundsChange} />
            {visible.map((r) => (
              <Marker
                key={r.id}
                position={[r.lat, r.lng]}
                icon={makeIcon(r.category, selectedId === r.id)}
                eventHandlers={{ click: () => selectReport(r.id) }}
              />
            ))}
            {draft && (
              <Marker
                position={[draft.lat, draft.lng]}
                icon={makeIcon("outro", true)}
              />
            )}
          </MapContainer>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-concrete/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cerrado border-t-transparent" />
                <p className="font-display text-sm font-semibold text-cerrado">
                  Carregando avisos…
                </p>
              </div>
            </div>
          )}

          {(loadError || dataSource === "demo") && !loading && (
            <div
              role={loadError ? "alert" : "status"}
              className={`absolute left-3 z-[500] max-w-[calc(100%-4.5rem)] border px-3 py-2 text-xs shadow-md ${
                adding && !draft ? "top-16" : "top-3"
              } ${
                loadError
                  ? "border-terracota bg-paper text-terracota"
                  : "border-cerrado bg-paper text-cerrado-deep"
              }`}
            >
              <p>
                {loadError
                  ? loadError
                  : "Modo demonstração: os avisos exibidos são exemplos locais."}
              </p>
              {loadError && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || querying}
                  className="mt-1 font-mono text-[10px] uppercase underline underline-offset-2 disabled:opacity-50"
                >
                  tentar novamente
                </button>
              )}
            </div>
          )}

          {/* Adding banner */}
          {adding && !draft && (
            <div className="animate-drop pointer-events-none absolute left-1/2 top-4 z-[500] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 border border-cerrado bg-cerrado px-4 py-2.5 text-center text-sm font-medium text-paper shadow-lg">
              Toque no mapa para marcar o local
              <button
                onClick={() => setAdding(false)}
                className="pointer-events-auto ml-3 font-mono text-[10px] uppercase tracking-wider underline underline-offset-2"
              >
                cancelar
              </button>
            </div>
          )}

          {/* Map controls: GPS + Refresh */}
          <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
            <button
              onClick={handleGps}
              className="grid h-10 w-10 place-items-center border border-line bg-paper shadow-md transition-colors hover:bg-concrete"
              title="Minha localização"
            >
              📍
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing || querying}
              className="grid h-10 w-10 place-items-center border border-line bg-paper shadow-md transition-colors hover:bg-concrete disabled:opacity-50"
              title="Atualizar avisos"
            >
              {refreshing || querying ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cerrado border-t-transparent" />
              ) : (
                "🔄"
              )}
            </button>
          </div>

          {/* Legend (desktop) */}
          <div className="absolute bottom-4 left-4 z-[500] hidden border border-line bg-paper/95 px-3 py-2.5 backdrop-blur lg:block">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ash">
              Legenda
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {CATEGORY_LIST.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-1.5 text-[11px] text-ash"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.label}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: floating buttons */}
          <div className="safe-bottom absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 gap-2 lg:hidden">
            <button
              onClick={() => setSheetOpen(true)}
              className="border border-ink bg-ink px-5 py-2.5 font-display text-sm font-semibold text-paper shadow-lg"
            >
              ▤ Avisos{" "}
              <span className="font-mono text-xs opacity-70">
                ({visible.length})
              </span>
            </button>
            {user && (
              <button
                type="button"
                aria-label="Meus avisos"
                aria-pressed={showMyReports}
                title="Filtrar meus avisos"
                onClick={() => {
                  setShowMyReports((p) => !p)
                }}
                className={`border px-3 py-2.5 font-display text-sm font-semibold shadow-lg transition-colors ${
                  showMyReports
                    ? "border-cerrado bg-cerrado text-paper"
                    : "border-line bg-paper text-ink"
                }`}
              >
                👤 <span className="text-xs">Meus avisos</span>
              </button>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <ReportDetail
              key={`${user?.id ?? "visitor"}:${selected.id}`}
              report={selected}
              hasVoted={voted.has(selected.id)}
              votePending={votingReportIds.has(selected.id)}
              voteUnavailable={votesUnavailable}
              isOwner={Boolean(user && selected.isOwner)}
              isOperator={isOperator}
              statusHistory={statusHistory}
              statusHistoryLoading={statusHistoryLoading}
              onClose={() => setSelectedId(null)}
              onVote={() => handleToggleVote(selected.id)}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onStatusChange={handleStatusChange}
              onCommunityChanged={() => {
                invalidateReportQuery()
                setSelectedId(null)
                setToast("Autor bloqueado. Para desfazer, abra Conta.")
                setReloadRevision((value) => value + 1)
              }}
            />
          )}
        </main>
      </div>

      {/* Mobile bottom sheet with the list */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[800] lg:hidden"
          onClick={() => setSheetOpen(false)}
        >
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <div
            className="animate-drop scroll-thin absolute inset-x-0 bottom-0 h-[80%] overflow-y-auto rounded-t-2xl border-t border-line bg-paper safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper px-5 py-3">
              <span className="font-display text-base font-bold">
                Avisos{" "}
                <span className="font-mono text-xs text-ash">
                  ({visible.length})
                </span>
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                className="grid h-8 w-8 place-items-center text-ash hover:text-ink"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <ReportList
              reports={visible}
              selectedId={selectedId}
              activeCats={activeCats}
              statusFilter={statusFilter}
              truncated={truncated}
              onToggleCat={toggleCat}
              onStatus={setStatusFilter}
              onSelect={selectReport}
            />
          </div>
        </div>
      )}

      {/* New report form */}
      {draft && (
        <NewReportForm
          coords={draft}
          onCancel={() => {
            setDraft(null)
            setAdding(false)
          }}
          onSubmit={submitReport}
        />
      )}

      {/* Auth modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* Toast notification */}
      {toast && (
        <div role="status" className="animate-drop fixed left-1/2 top-20 z-[900] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 border border-line bg-paper px-4 py-3 text-center text-sm text-ink shadow-lg safe-area-top lg:top-4">
          <p>{toast}</p>
          <button
            onClick={() => setToast(null)}
            className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ash underline underline-offset-2 hover:text-ink"
          >
            fechar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function Stat({
  value,
  label,
  accent,
}: {
  value: number
  label: string
  accent?: boolean
}) {
  return (
    <div className="text-right leading-none">
      <p
        className={`font-display text-2xl font-extrabold ${
          accent ? "text-terracota" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
        {label}
      </p>
    </div>
  )
}

function UserBadge({ name }: { name: string }) {
  const { signOut } = useAuth()
  const initial = name.charAt(0).toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center bg-cerrado font-display text-sm font-bold text-paper">
        {initial}
      </div>
      <div className="hidden leading-none sm:block">
        <p className="max-w-24 truncate text-xs font-semibold text-ink">
          {name}
        </p>
        <button
          onClick={signOut}
          className="font-mono text-[9px] uppercase tracking-wider text-ash underline underline-offset-2 hover:text-terracota"
        >
          Sair
        </button>
      </div>
      <button
        onClick={signOut}
        className="text-xs text-ash underline underline-offset-2 hover:text-terracota sm:hidden"
      >
        Sair
      </button>
    </div>
  )
}
