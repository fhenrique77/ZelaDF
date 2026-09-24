import type { Status } from "../data"

export const REPORT_STATUSES = ["aberto", "andamento", "resolvido"] as const

export const STATUS_REASON_LIMITS = {
  min: 10,
  max: 500,
} as const

const STATUS_TRANSITIONS: Record<Status, readonly Status[]> = {
  aberto: ["andamento", "resolvido"],
  andamento: ["aberto", "resolvido"],
  resolvido: ["aberto"],
}

export function allowedStatusTransitions(status: Status): readonly Status[] {
  return STATUS_TRANSITIONS[status]
}

export function isReportStatus(value: unknown): value is Status {
  return (
    typeof value === "string" &&
    (REPORT_STATUSES as readonly string[]).includes(value)
  )
}

export function isAllowedStatusTransition(
  currentStatus: Status,
  nextStatus: Status,
): boolean {
  return STATUS_TRANSITIONS[currentStatus].includes(nextStatus)
}

export function validateStatusTransition(
  currentStatus: Status,
  nextStatus: Status,
  reason: string,
): string | null {
  if (!isAllowedStatusTransition(currentStatus, nextStatus)) {
    return "Essa transição de status não é permitida."
  }

  const reasonLength = reason.trim().length
  if (reasonLength < STATUS_REASON_LIMITS.min) {
    return `Informe um motivo com pelo menos ${STATUS_REASON_LIMITS.min} caracteres.`
  }
  if (reasonLength > STATUS_REASON_LIMITS.max) {
    return `O motivo deve ter no máximo ${STATUS_REASON_LIMITS.max} caracteres.`
  }

  return null
}
