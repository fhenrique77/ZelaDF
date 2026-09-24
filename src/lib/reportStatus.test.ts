import { describe, expect, it } from "vitest"
import {
  STATUS_REASON_LIMITS,
  allowedStatusTransitions,
  isAllowedStatusTransition,
  isReportStatus,
  validateStatusTransition,
} from "./reportStatus"

describe("report status workflow", () => {
  it("permite avanço, correção e reabertura sem pular para andamento", () => {
    expect(allowedStatusTransitions("aberto")).toEqual([
      "andamento",
      "resolvido",
    ])
    expect(allowedStatusTransitions("andamento")).toEqual([
      "aberto",
      "resolvido",
    ])
    expect(allowedStatusTransitions("resolvido")).toEqual(["aberto"])
  })

  it("rejeita permanência e transição de resolvido para andamento", () => {
    expect(isAllowedStatusTransition("resolvido", "andamento")).toBe(false)
    expect(
      validateStatusTransition("aberto", "aberto", "Motivo suficiente"),
    ).toBe("Essa transição de status não é permitida.")
    expect(
      validateStatusTransition("resolvido", "andamento", "Motivo suficiente"),
    ).toBe("Essa transição de status não é permitida.")
  })

  it("reconhece somente os status do contrato", () => {
    expect(isReportStatus("aberto")).toBe(true)
    expect(isReportStatus("andamento")).toBe(true)
    expect(isReportStatus("resolvido")).toBe(true)
    expect(isReportStatus("pendente")).toBe(false)
    expect(isReportStatus(null)).toBe(false)
  })

  it("exige motivo dentro dos limites adotados", () => {
    expect(validateStatusTransition("aberto", "andamento", "curto")).toBe(
      `Informe um motivo com pelo menos ${STATUS_REASON_LIMITS.min} caracteres.`,
    )
    expect(
      validateStatusTransition(
        "aberto",
        "andamento",
        "x".repeat(STATUS_REASON_LIMITS.max + 1),
      ),
    ).toBe(
      `O motivo deve ter no máximo ${STATUS_REASON_LIMITS.max} caracteres.`,
    )
    expect(
      validateStatusTransition(
        "aberto",
        "andamento",
        "Equipe iniciou a análise.",
      ),
    ).toBeNull()
  })
})
