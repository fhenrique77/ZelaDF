import type { CategoryId, Report } from "../data"
import { photoExtension } from "./reportValidation"
import { ReportServiceError } from "./reportService"
import { supabase } from "./supabaseClient"
import { apiClientIdentityHeader } from "./apiClientIdentity"

const enabled = import.meta.env.VITE_API_REPORT_WRITES_ENABLED === "true"
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
const editPhotoIds = new WeakMap<File, string>()

export function useReportWriteApi(): boolean {
  return enabled
}

function apiError(operation: "create" | "update" | "delete", status?: number): ReportServiceError {
  const message = status === 401
    ? "Entre na sua conta novamente antes de continuar."
    : status === 403
      ? "Você não tem permissão para alterar este aviso."
      : status === 409
        ? "O aviso foi alterado em outra sessão. Atualize os avisos antes de tentar novamente."
        : "Não foi possível confirmar a operação. Atualize os avisos antes de tentar novamente."
  return new ReportServiceError(operation, message)
}

async function session() {
  if (!baseUrl || !supabase) throw new ReportServiceError("create", "A API de avisos não está configurada.")
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token || !data.session.user?.id) {
    throw new ReportServiceError("create", "Entre na sua conta novamente antes de continuar.")
  }
  return data.session
}

async function requestApi(method: "POST" | "PATCH" | "DELETE", path: string, token: string,
  operation: "create" | "update" | "delete", body?: object, key?: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...apiClientIdentityHeader(),
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw apiError(operation)
  }
  if (!response.ok) throw apiError(operation, response.status)
  try {
    return await response.json()
  } catch {
    throw apiError(operation)
  }
}

function parseReport(value: unknown, operation: "create" | "update"): Report {
  if (!value || typeof value !== "object") throw apiError(operation)
  const row = value as Partial<Report>
  if (typeof row.id !== "string" || typeof row.title !== "string" ||
      typeof row.confirmations !== "number" || typeof row.photo !== "string" || row.isOwner !== true) {
    throw apiError(operation)
  }
  return row as Report
}

async function uploadPhoto(file: File, actor: string, fileId: string): Promise<string> {
  if (!supabase) throw new ReportServiceError("photo_upload", "O envio da foto não está disponível.")
  const path = `${actor}/${fileId}.${photoExtension(file.type)}`
  const bucket = supabase.storage.from("report-photos")
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    // A repeated submit can encounter its own upload after a lost API response.
    const { data, error: infoError } = await bucket.info(path)
    const metadata = data?.metadata as { size?: number; mimetype?: string } | undefined
    const duplicate = String(error.statusCode) === "409" ||
      (String(error.statusCode) === "400" &&
        ((error as { error?: string }).error === "Duplicate" ||
          (error as { code?: string }).code === "ResourceAlreadyExists"))
    if (!duplicate || infoError || metadata?.size !== file.size || metadata?.mimetype !== file.type) {
      throw new ReportServiceError("photo_upload", "Não foi possível enviar a foto. O aviso não foi alterado.")
    }
  }
  return path
}

export async function createReportViaApi(input: {
  category: CategoryId; title: string; description: string; ra: string; address: string;
  lat: number; lng: number; photoFile: File | null; idempotencyKey: string
}): Promise<{ report: Report; initialVoteFailed: boolean }> {
  const current = await session()
  const photoPath = input.photoFile
    ? await uploadPhoto(input.photoFile, current.user.id, input.idempotencyKey) : null
  const body = {
    category: input.category, title: input.title, description: input.description,
    ra: input.ra, address: input.address, lat: input.lat, lng: input.lng, photoPath,
  }
  const result = await requestApi("POST", "/reports", current.access_token, "create", body, input.idempotencyKey) as {
    report?: unknown; initialVoteFailed?: unknown
  }
  if (typeof result.initialVoteFailed !== "boolean") throw apiError("create")
  return { report: parseReport(result.report, "create"), initialVoteFailed: result.initialVoteFailed }
}

export async function updateReportViaApi(input: {
  id: string; title?: string; description?: string; category?: CategoryId; photoFile?: File | null
}): Promise<{ report: Report; photoCleanupFailed: boolean }> {
  const current = await session()
  if (input.photoFile && !editPhotoIds.has(input.photoFile)) {
    editPhotoIds.set(input.photoFile, crypto.randomUUID())
  }
  const photoPath = input.photoFile
    ? await uploadPhoto(input.photoFile, current.user.id, editPhotoIds.get(input.photoFile)!) : undefined
  const body = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(photoPath ? { photoPath } : {}),
  }
  const result = await requestApi("PATCH", `/reports/${encodeURIComponent(input.id)}`,
    current.access_token, "update", body) as { report?: unknown; photoCleanupFailed?: unknown }
  if (typeof result.photoCleanupFailed !== "boolean") throw apiError("update")
  return { report: parseReport(result.report, "update"), photoCleanupFailed: result.photoCleanupFailed }
}

export async function deleteReportViaApi(id: string): Promise<{ photoCleanupFailed: boolean }> {
  const current = await session()
  const result = await requestApi("DELETE", `/reports/${encodeURIComponent(id)}`,
    current.access_token, "delete") as { photoCleanupFailed?: unknown }
  if (typeof result.photoCleanupFailed !== "boolean") throw apiError("delete")
  return { photoCleanupFailed: result.photoCleanupFailed }
}
