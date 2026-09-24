import { CATEGORIES, type CategoryId } from "../data"

export const REPORT_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMax: 2_000,
  raMin: 2,
  raMax: 80,
  addressMin: 3,
  addressMax: 200,
  photoMaxBytes: 5 * 1024 * 1024,
} as const

export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export const PHOTO_ACCEPT = ACCEPTED_PHOTO_TYPES.join(",")

export type ReportValidationInput = {
  category: CategoryId
  title: string
  description: string
  ra: string
  address: string
  lat: number
  lng: number
  photoFile?: File | null
}

export type EditableReportInput = Pick<
  ReportValidationInput,
  "category" | "title" | "description" | "photoFile"
>

function textLengthError(
  label: string,
  value: string,
  minimum: number,
  maximum: number,
) {
  const length = value.trim().length
  if (length < minimum) return `${label} deve ter pelo menos ${minimum} caracteres.`
  if (length > maximum) return `${label} deve ter no máximo ${maximum} caracteres.`
  return null
}

export function validatePhoto(file: File | null | undefined): string | null {
  if (!file) return null

  if (!ACCEPTED_PHOTO_TYPES.includes(file.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
    return "A foto deve estar no formato JPEG, PNG ou WebP."
  }

  if (file.size > REPORT_LIMITS.photoMaxBytes) {
    return "A foto deve ter no máximo 5 MB."
  }

  if (file.size === 0) return "A foto selecionada está vazia."
  return null
}

export function validateReport(input: ReportValidationInput): string[] {
  const errors = validateEditableReport(input)

  const raError = textLengthError(
    "A região administrativa",
    input.ra,
    REPORT_LIMITS.raMin,
    REPORT_LIMITS.raMax,
  )
  if (raError) errors.push(raError)

  const addressError = textLengthError(
    "O endereço",
    input.address,
    REPORT_LIMITS.addressMin,
    REPORT_LIMITS.addressMax,
  )
  if (addressError) errors.push(addressError)

  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    errors.push("A latitude informada é inválida.")
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    errors.push("A longitude informada é inválida.")
  }

  return errors
}

export function validateEditableReport(input: EditableReportInput): string[] {
  const errors: string[] = []

  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, input.category)) {
    errors.push("Selecione uma categoria válida.")
  }

  const titleError = textLengthError(
    "O título",
    input.title,
    REPORT_LIMITS.titleMin,
    REPORT_LIMITS.titleMax,
  )
  if (titleError) errors.push(titleError)

  if (input.description.trim().length > REPORT_LIMITS.descriptionMax) {
    errors.push(`A descrição deve ter no máximo ${REPORT_LIMITS.descriptionMax} caracteres.`)
  }

  const photoError = validatePhoto(input.photoFile)
  if (photoError) errors.push(photoError)

  return errors
}

export function photoExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const extension = extensions[mimeType]
  if (!extension) throw new Error("Unsupported photo MIME type")
  return extension
}
