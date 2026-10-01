/**
 * Serviço de dados — CRUD de avisos e votos via Supabase.
 * Quando o Supabase não está configurado, roda com dados de demonstração locais.
 * Votos autenticados usam RPC; device_id permanece apenas por compatibilidade.
 */

import { supabase, isConfigured } from "./supabaseClient"
import type { CategoryId, Report, Status } from "../data"
import { logger } from "./observability"
import {
  photoExtension,
  validateEditableReport,
  validateReport,
} from "./reportValidation"
import { validateStatusTransition } from "./reportStatus"
import { fetchMyVotesViaApi, fetchReportsViaApi, useReportReadApi } from "./reportReadApi"
import { createReportViaApi, deleteReportViaApi, updateReportViaApi, useReportWriteApi } from "./reportWriteApi"
import { setReportVoteViaApi, useReportVoteApi } from "./reportVoteApi"
import {
  changeReportStatusViaApi,
  fetchOperatorAccessViaApi,
  fetchReportStatusHistoryViaApi,
  useCommunityStatusApi,
} from "./communityStatusApi"

const PHOTO_BUCKET = "report-photos"
const REPORT_PUBLIC_COLUMNS =
  "id,category,title,description,ra,address,lat,lng,photo_url,status,confirmations,created_at"

export type ReportServiceErrorCode = "validation" | "fetch" | "fetch_mine_unavailable" | "create" | "update" | "delete" | "vote" | "status" | "photo_upload"

export class ReportServiceError extends Error {
  readonly code: ReportServiceErrorCode

  constructor(code: ReportServiceErrorCode, message: string) {
    super(message)
    this.name = "ReportServiceError"
    this.code = code
  }
}

function fail(
  code: ReportServiceErrorCode,
  message: string,
  event: string,
  error?: unknown,
): never {
  logger.error(event, { code, error })
  throw new ReportServiceError(code, message)
}

// ──────────────────────────────────────────────
// Device ID anônimo (fallback sem login)
// ──────────────────────────────────────────────

const DEVICE_KEY = "zeladf:device-id"

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// ──────────────────────────────────────────────
// Dados de demonstração (fallback offline)
// ──────────────────────────────────────────────

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=520&h=340&fit=crop&auto=format`

const DEMO_REPORTS: Report[] = [
  {
    id: "demo-1",
    category: "buraco",
    title: "Cratera na W3 Sul altura da 510",
    description:
      "Buraco fundo na faixa da direita, já causou dois pneus furados essa semana. Piora quando chove.",
    ra: "Asa Sul",
    address: "W3 Sul, SQS 510",
    lat: -15.8203,
    lng: -47.9051,
    photo: img("1515162305285-0293e4767cc2"),
    status: "aberto",
    createdAt: "2026-08-09T13:20:00",
    confirmations: 27,
  },
  {
    id: "demo-2",
    category: "agua",
    title: "Vazamento constante na calçada",
    description:
      "Água escorrendo há mais de uma semana da rede, formando poça e limo na calçada em frente ao bloco C.",
    ra: "Asa Norte",
    address: "SQN 410, Bloco C",
    lat: -15.7583,
    lng: -47.8797,
    photo: img("1584967919857-3d80c53e6f5a"),
    status: "andamento",
    createdAt: "2026-08-07T09:05:00",
    confirmations: 14,
  },
  {
    id: "demo-3",
    category: "poste",
    title: "Quadra inteira sem iluminação",
    description:
      "Cinco postes apagados na via de acesso. À noite fica perigoso para quem volta do ponto de ônibus.",
    ra: "Ceilândia",
    address: "QNM 18, Ceilândia Sul",
    lat: -15.8241,
    lng: -48.1096,
    photo: img("1509395176047-4a66953fd231"),
    status: "aberto",
    createdAt: "2026-08-10T20:41:00",
    confirmations: 41,
  },
  {
    id: "demo-4",
    category: "lixo",
    title: "Descarte irregular de entulho",
    description:
      "Restos de obra e móveis velhos jogados no lote vago. Está atraindo mosquito e mau cheiro.",
    ra: "Taguatinga",
    address: "QNL 10, Taguatinga Norte",
    lat: -15.8331,
    lng: -48.0578,
    photo: img("1558618666-fcd25c85cd64"),
    status: "aberto",
    createdAt: "2026-08-08T16:12:00",
    confirmations: 9,
  },
  {
    id: "demo-5",
    category: "semaforo",
    title: "Semáforo piscando no amarelo",
    description:
      "Cruzamento movimentado com semáforo em amarelo intermitente desde ontem. Risco alto no horário de pico.",
    ra: "Águas Claras",
    address: "Av. das Araucárias com Rua 25 Sul",
    lat: -15.8345,
    lng: -48.0243,
    photo: img("1573511860302-28c524319d2a"),
    status: "resolvido",
    createdAt: "2026-08-05T07:50:00",
    confirmations: 33,
  },
  {
    id: "demo-6",
    category: "buraco",
    title: "Asfalto afundado na entrada do Lago Sul",
    description:
      "Depressão grande no asfalto logo após a ponte, carros freiam de repente para desviar.",
    ra: "Lago Sul",
    address: "QI 5, Lago Sul",
    lat: -15.8407,
    lng: -47.8709,
    photo: img("1605256585681-455837661b18"),
    status: "andamento",
    createdAt: "2026-08-06T11:30:00",
    confirmations: 18,
  },
  {
    id: "demo-7",
    category: "agua",
    title: "Boca de lobo entupida alagando",
    description:
      "Bueiro tampado de folhas e lixo, a rua alaga inteira em qualquer chuva rápida.",
    ra: "Sobradinho",
    address: "Quadra 8, Sobradinho",
    lat: -15.6534,
    lng: -47.7908,
    photo: img("1547683905-f686c993aae5"),
    status: "aberto",
    createdAt: "2026-08-10T18:03:00",
    confirmations: 6,
  },
  {
    id: "demo-8",
    category: "poste",
    title: "Poste inclinado sobre a fiação",
    description:
      "Poste tombando após temporal, encostando nos fios. Situação de risco, precisa de vistoria urgente.",
    ra: "Guará",
    address: "QE 23, Guará II",
    lat: -15.8253,
    lng: -47.9709,
    photo: img("1519864600265-abb23847ef2c"),
    status: "aberto",
    createdAt: "2026-08-11T08:15:00",
    confirmations: 22,
  },
]

// ──────────────────────────────────────────────
// Buscar avisos
// ──────────────────────────────────────────────

type DbReport = {
  id: string
  category: string
  title: string
  description: string
  ra: string
  address: string
  lat: number
  lng: number
  photo_url: string
  status: string
  confirmations: number
  created_at: string
}

function toReport(row: DbReport, isOwner = false): Report {
  return {
    id: row.id,
    category: row.category as CategoryId,
    title: row.title,
    description: row.description || "",
    ra: row.ra,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    photo: row.photo_url,
    status: row.status as Status,
    confirmations: row.confirmations,
    createdAt: row.created_at,
    isOwner,
  }
}

export type ReportBounds = {
  south: number
  west: number
  north: number
  east: number
}

export type ReportQuery = {
  bounds: ReportBounds
  categories?: CategoryId[]
  status?: Status
  userId?: string
  onlyMine?: boolean
  limit?: number
}

export type ReportQueryResult = {
  reports: Report[]
  truncated: boolean
  source: "demo" | "supabase"
}

const DEFAULT_REPORT_LIMIT = 200
const MAX_REPORT_LIMIT = 500

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_REPORT_LIMIT
  return Math.min(MAX_REPORT_LIMIT, Math.max(1, Math.trunc(limit!)))
}

function filterDemoReports(
  query: ReportQuery,
  limit: number,
): ReportQueryResult {
  const { bounds, categories, status, onlyMine } = query
  const matches = DEMO_REPORTS.filter(
    (report) =>
      report.lat >= bounds.south &&
      report.lat <= bounds.north &&
      report.lng >= bounds.west &&
      report.lng <= bounds.east &&
      (!categories?.length || categories.includes(report.category)) &&
      (!status || report.status === status) &&
      (!onlyMine || report.isOwner),
  ).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  return {
    reports: matches.slice(0, limit),
    truncated: matches.length > limit,
    source: "demo",
  }
}

export async function fetchReports(
  query: ReportQuery,
): Promise<ReportQueryResult> {
  const limit = normalizeLimit(query.limit)

  if (!isConfigured || !supabase) return filterDemoReports(query, limit)
  if (query.onlyMine && !query.userId) {
    return { reports: [], truncated: false, source: "supabase" }
  }
  if (useReportReadApi()) return fetchReportsViaApi({ ...query, limit })

  const south = Math.min(query.bounds.south, query.bounds.north)
  const north = Math.max(query.bounds.south, query.bounds.north)
  const west = Math.min(query.bounds.west, query.bounds.east)
  const east = Math.max(query.bounds.west, query.bounds.east)

  let data: unknown
  let error: unknown

  if (query.onlyMine) {
    const response = await supabase.rpc("get_my_reports", {
      p_south: south,
      p_west: west,
      p_north: north,
      p_east: east,
      p_categories: query.categories?.length ? query.categories : null,
      p_status: query.status ?? null,
      p_limit: limit + 1,
    })
    data = response.data
    error = response.error
  } else {
    let request = supabase
      .from("reports")
      .select(REPORT_PUBLIC_COLUMNS)
      .gte("lat", south)
      .lte("lat", north)
      .gte("lng", west)
      .lte("lng", east)

    if (query.categories?.length) {
      request = request.in("category", query.categories)
    }

    if (query.status) {
      request = request.eq("status", query.status)
    }

    const response = await request
      .order("created_at", { ascending: false })
      .limit(limit + 1)
    data = response.data
    error = response.error
  }

  if (error) {
    if (
      query.onlyMine &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "PGRST202"
    ) {
      fail(
        "fetch_mine_unavailable",
        "O filtro Meus avisos está indisponível. Exibindo os avisos gerais do mapa.",
        "report.mine_unavailable",
        error,
      )
    }
    fail(
      "fetch",
      "Não foi possível carregar os avisos. Tente novamente.",
      "report.fetch_failed",
      error,
    )
  }

  const resultRows = (data ?? []) as DbReport[]
  const rows = resultRows.slice(0, limit)
  const ownedIds = new Set<string>()

  if (query.userId && query.onlyMine) {
    rows.forEach((row) => ownedIds.add(row.id))
  } else if (query.userId && rows.length > 0) {
    const { data: ownershipRows, error: ownershipError } = await supabase.rpc(
      "get_my_report_ids",
      { p_report_ids: rows.map((row) => row.id) },
    )

    if (ownershipError) {
      logger.warn("report.ownership_lookup_failed", {
        error: ownershipError,
        operation: "fetch_ownership",
      })
    } else {
      for (const row of (ownershipRows ?? []) as Array<{ report_id: string }>) {
        ownedIds.add(row.report_id)
      }
    }
  }

  return {
    reports: rows.map((row) => toReport(row, ownedIds.has(row.id))),
    truncated: resultRows.length > limit,
    source: "supabase",
  }
}

// ──────────────────────────────────────────────
// Buscar votos do usuário atual
// ──────────────────────────────────────────────

export async function fetchMyVotes(
  userId: string | undefined,
  reportIds: string[],
): Promise<Set<string>> {
  if (!isConfigured || !supabase) return new Set()
  if (!userId) return new Set()
  if (reportIds.length === 0) return new Set()
  if (useReportReadApi()) return fetchMyVotesViaApi(reportIds)

  const { data, error } = await supabase
    .from("votes")
    .select("report_id")
    .in("report_id", reportIds)

  if (error) {
    fail(
      "fetch",
      "Os avisos foram encontrados, mas suas confirmações não puderam ser carregadas.",
      "vote.fetch_failed",
      error,
    )
  }

  return new Set((data ?? []).map((v: { report_id: string }) => v.report_id))
}

// ──────────────────────────────────────────────
// Criar aviso
// ──────────────────────────────────────────────

type CreateReportInput = {
  category: CategoryId
  title: string
  description: string
  ra: string
  address: string
  lat: number
  lng: number
  photoFile: File | null
  authorId?: string
  idempotencyKey?: string
}

export type CreateReportResult = {
  report: Report
  initialVoteFailed: boolean
}

export async function createReport(
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const normalizedInput = {
    ...input,
    title: input.title.trim(),
    description: input.description.trim() || "Sem descrição adicional.",
    ra: input.ra.trim(),
    address: input.address.trim(),
  }
  const validationErrors = validateReport(normalizedInput)
  if (validationErrors.length > 0) {
    throw new ReportServiceError("validation", validationErrors[0])
  }

  if (useReportWriteApi()) {
    return createReportViaApi({
      category: normalizedInput.category,
      title: normalizedInput.title,
      description: normalizedInput.description,
      ra: normalizedInput.ra,
      address: normalizedInput.address,
      lat: normalizedInput.lat,
      lng: normalizedInput.lng,
      photoFile: normalizedInput.photoFile,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    })
  }

  if (!isConfigured || !supabase) {
    // Modo offline: cria aviso local
    return {
      initialVoteFailed: false,
      report: {
        id: `local-${Date.now()}`,
        category: normalizedInput.category,
        title: normalizedInput.title,
        description: normalizedInput.description,
        ra: normalizedInput.ra,
        address: normalizedInput.address,
        lat: normalizedInput.lat,
        lng: normalizedInput.lng,
        photo: normalizedInput.photoFile
          ? URL.createObjectURL(normalizedInput.photoFile)
          : "",
        status: "aberto",
        createdAt: new Date().toISOString(),
        confirmations: 1,
        isOwner: Boolean(normalizedInput.authorId),
      },
    }
  }

  if (!normalizedInput.authorId) {
    throw new ReportServiceError(
      "create",
      "Entre na sua conta novamente antes de publicar o aviso.",
    )
  }

  let photoUrl = ""

  // Upload da foto ao Storage
  if (normalizedInput.photoFile) {
    const ext = photoExtension(normalizedInput.photoFile.type)
    const path = `${normalizedInput.authorId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, normalizedInput.photoFile, {
        contentType: normalizedInput.photoFile.type,
        upsert: false,
      })

    if (uploadErr) {
      fail(
        "photo_upload",
        "Não foi possível enviar a foto. O aviso não foi publicado.",
        "report.photo_upload_failed",
        uploadErr,
      )
    } else {
      const { data: urlData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(path)
      photoUrl = urlData.publicUrl
    }
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      category: normalizedInput.category,
      title: normalizedInput.title,
      description: normalizedInput.description,
      ra: normalizedInput.ra,
      address: normalizedInput.address,
      lat: normalizedInput.lat,
      lng: normalizedInput.lng,
      photo_url: photoUrl,
    })
    .select(REPORT_PUBLIC_COLUMNS)
    .single()

  if (error) {
    if (photoUrl) await removeStoredPhoto(photoUrl)
    fail(
      "create",
      "Não foi possível publicar o aviso. Revise os dados e tente novamente.",
      "report.create_failed",
      error,
    )
  }

  const report = toReport(data as DbReport, Boolean(normalizedInput.authorId))

  // O aviso já existe mesmo se a confirmação inicial falhar. A RPC mantém
  // voto e contador consistentes e devolve a contagem canônica.
  let initialVoteFailed = false
  if (normalizedInput.authorId) {
    try {
      const initialVote = await setReportVote(data.id, true)
      if (initialVote.confirmations !== null) {
        report.confirmations = initialVote.confirmations
      }
    } catch (error) {
      initialVoteFailed = true
      logger.error("vote.initial_create_failed", {
        error,
        operation: "rpc",
      })
    }
  }

  return {
    report,
    initialVoteFailed,
  }
}

// ──────────────────────────────────────────────
// Definir voto (operação idempotente)
// ──────────────────────────────────────────────

export type VoteMutationResult = {
  voted: boolean
  confirmations: number | null
}

type DbVoteMutationResult = {
  voted: boolean
  confirmations: number
}

export async function setReportVote(
  reportId: string,
  voted: boolean,
): Promise<VoteMutationResult> {
  if (useReportVoteApi()) return setReportVoteViaApi(reportId, voted)
  if (!isConfigured || !supabase) {
    return { voted, confirmations: null }
  }

  const { data, error } = await supabase.rpc("set_report_vote", {
    p_report_id: reportId,
    p_voted: voted,
    p_device_id: getDeviceId(),
  })

  if (error) {
    fail(
      "vote",
      "Não foi possível atualizar sua confirmação.",
      "vote.set_failed",
      error,
    )
  }

  const row = (data as DbVoteMutationResult[] | null)?.[0]
  if (
    !row ||
    typeof row.voted !== "boolean" ||
    !Number.isInteger(row.confirmations) ||
    row.confirmations < 0
  ) {
    fail(
      "vote",
      "A confirmação foi processada, mas a resposta do servidor é inválida. Recarregue os avisos.",
      "vote.invalid_response",
    )
  }

  return {
    voted: row.voted,
    confirmations: row.confirmations,
  }
}

// ──────────────────────────────────────────────
// Excluir aviso (somente o autor pode excluir)
// ──────────────────────────────────────────────

export type DeleteReportResult = {
  photoCleanupFailed: boolean
}

export async function deleteReport(
  reportId: string,
): Promise<DeleteReportResult> {
  if (useReportWriteApi()) return deleteReportViaApi(reportId)
  if (!isConfigured || !supabase) return { photoCleanupFailed: false }

  const { data, error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId)
    .select("id,photo_url")
    .single()

  if (error || !data || data.id !== reportId) {
    fail(
      "delete",
      "Não foi possível confirmar a exclusão. O aviso pode não existir ou você pode não ter permissão para excluí-lo. Atualize os avisos e tente novamente.",
      "report.delete_failed",
      error,
    )
  }

  // Usa a foto da linha efetivamente excluída, que pode ter mudado em outra sessão.
  const photoUrl = data.photo_url
  const photoCleanupFailed = photoUrl
    ? !(await removeStoredPhoto(photoUrl))
    : false
  return { photoCleanupFailed }
}

// ──────────────────────────────────────────────
// Editar aviso (somente o autor pode editar)
// ──────────────────────────────────────────────

type UpdateReportInput = {
  id: string
  authorId: string
  title?: string
  description?: string
  category?: CategoryId
  photoFile?: File | null
  currentPhotoUrl?: string
}

export type UpdateReportResult = {
  report: Report
  photoCleanupFailed: boolean
}

export async function updateReport(
  input: UpdateReportInput,
): Promise<UpdateReportResult> {
  if (!isConfigured || !supabase) {
    throw new ReportServiceError(
      "update",
      "A edição não está disponível no modo demonstração.",
    )
  }

  const normalizedTitle = input.title?.trim()
  const normalizedDescription = input.description?.trim()
  const validationErrors = validateEditableReport({
    category: input.category ?? "outro",
    title: normalizedTitle ?? "Aviso válido",
    description: normalizedDescription ?? "",
    photoFile: input.photoFile,
  })
  if (validationErrors.length > 0) {
    throw new ReportServiceError("validation", validationErrors[0])
  }

  if (useReportWriteApi()) {
    return updateReportViaApi({
      id: input.id,
      title: normalizedTitle,
      description: normalizedDescription,
      category: input.category,
      photoFile: input.photoFile,
    })
  }

  const updates: Record<string, string> = {}
  if (normalizedTitle !== undefined) updates.title = normalizedTitle
  if (normalizedDescription !== undefined) {
    updates.description = normalizedDescription || "Sem descrição adicional."
  }
  if (input.category !== undefined) updates.category = input.category

  let newPhotoUrl = ""
  if (input.photoFile) {
    const path = `${input.authorId}/${crypto.randomUUID()}.${photoExtension(input.photoFile.type)}`
    const bucket = supabase.storage.from(PHOTO_BUCKET)
    const { error: uploadError } = await bucket.upload(path, input.photoFile, {
      contentType: input.photoFile.type,
      upsert: false,
    })
    if (uploadError) {
      fail(
        "photo_upload",
        "Não foi possível enviar a nova foto. O aviso não foi alterado.",
        "report.photo_upload_failed",
        uploadError,
      )
    }
    newPhotoUrl = bucket.getPublicUrl(path).data.publicUrl
    updates.photo_url = newPhotoUrl
  }

  if (Object.keys(updates).length === 0) {
    throw new ReportServiceError(
      "validation",
      "Nenhuma alteração foi informada.",
    )
  }

  const { data, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", input.id)
    .select(REPORT_PUBLIC_COLUMNS)
    .single()

  if (error) {
    if (newPhotoUrl) await removeStoredPhoto(newPhotoUrl)
    fail(
      "update",
      "Não foi possível salvar as alterações.",
      "report.update_failed",
      error,
    )
  }

  const photoCleanupFailed = Boolean(
    newPhotoUrl &&
      input.currentPhotoUrl &&
      !(await removeStoredPhoto(input.currentPhotoUrl)),
  )

  return {
    report: toReport(data as DbReport, true),
    photoCleanupFailed,
  }
}

export type ReportStatusHistory = {
  id: string
  fromStatus: Status
  toStatus: Status
  reason: string
  changedAt: string
}

type DbStatusHistory = {
  id: string
  from_status: string
  to_status: string
  reason: string
  changed_at: string
}

export async function fetchOperatorAccess(): Promise<boolean> {
  if (useCommunityStatusApi()) {
    try {
      return await fetchOperatorAccessViaApi()
    } catch {
      logger.warn("report.operator_access_unavailable", { code: "status", operation: "fetch" })
      return false
    }
  }
  if (!isConfigured || !supabase) return false

  const { data, error } = await supabase.rpc("current_user_is_operator")
  if (error) {
    logger.warn("report.operator_access_unavailable", {
      code: "status",
      operation: "fetch",
    })
    return false
  }

  return data === true
}

export async function fetchReportStatusHistory(
  reportId: string,
): Promise<ReportStatusHistory[]> {
  if (useCommunityStatusApi()) return fetchReportStatusHistoryViaApi(reportId)
  if (!isConfigured || !supabase) return []

  const { data, error } = await supabase
    .from("report_status_history")
    .select("id,from_status,to_status,reason,changed_at")
    .eq("report_id", reportId)
    .order("changed_at", { ascending: false })

  if (error) {
    fail(
      "status",
      "Não foi possível carregar o histórico de status.",
      "report.status_history_failed",
      error,
    )
  }

  return ((data ?? []) as DbStatusHistory[]).map((entry) => ({
    id: entry.id,
    fromStatus: entry.from_status as Status,
    toStatus: entry.to_status as Status,
    reason: entry.reason,
    changedAt: entry.changed_at,
  }))
}

export type ChangeReportStatusInput = {
  reportId: string
  currentStatus: Status
  nextStatus: Status
  reason: string
}

export async function changeReportStatus(
  input: ChangeReportStatusInput,
): Promise<void> {
  if (!isConfigured || !supabase) {
    throw new ReportServiceError(
      "status",
      "A alteração de status não está disponível no modo demonstração.",
    )
  }

  const reason = input.reason.trim()
  const validationError = validateStatusTransition(
    input.currentStatus,
    input.nextStatus,
    reason,
  )
  if (validationError) {
    throw new ReportServiceError("validation", validationError)
  }

  if (useCommunityStatusApi()) {
    return changeReportStatusViaApi(input.reportId, input.nextStatus, reason)
  }

  const { error } = await supabase.rpc("change_report_status", {
    p_report_id: input.reportId,
    p_new_status: input.nextStatus,
    p_reason: reason,
  })

  if (error) {
    fail(
      "status",
      "Não foi possível alterar o status do aviso.",
      "report.status_change_failed",
      error,
    )
  }
}

export function storedPhotoPath(photoUrl: string): string | null {
  if (!photoUrl) return null

  try {
    const url = new URL(photoUrl)
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0) return null
    const encodedPath = url.pathname.slice(markerIndex + marker.length)
    const path = decodeURIComponent(encodedPath)
    if (!path || path.startsWith("/") || path.split("/").includes(".."))
      return null
    return path
  } catch {
    return null
  }
}

async function removeStoredPhoto(photoUrl: string): Promise<boolean> {
  if (!supabase) return false
  const path = storedPhotoPath(photoUrl)
  if (!path) return true

  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  if (error) {
    logger.error("report.photo_delete_failed", {
      error,
      operation: "delete",
    })
    return false
  }
  return true
}
