import { afterEach, describe, expect, it, vi } from "vitest"
import { logger, sanitizeLogContext } from "./observability"

describe("observability", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("mantém somente metadados operacionais permitidos", () => {
    const sanitized = sanitizeLogContext({
      operation: "insert",
      status: 500,
      token: "secret-token",
      email: "cidadao@example.com",
      phone: "+5561999999999",
      payload: { title: "dado pessoal" },
    })

    expect(sanitized).toEqual({ operation: "insert", status: 500 })
  })

  it("não registra mensagem ou stack de erros", () => {
    const error = Object.assign(
      new Error("cidadao@example.com secret-token +5561999999999"),
      { code: "PGRST001" },
    )

    expect(sanitizeLogContext({ error })).toEqual({
      error: { name: "Error", code: "PGRST001" },
    })
  })

  it("emite evento estruturado sem contexto sensível", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    logger.error("report.create_failed", {
      error: new Error("private payload"),
      operation: "insert",
      token: "secret-token",
    })

    expect(consoleError).toHaveBeenCalledWith("[ZelaDF] report.create_failed", {
      error: { name: "Error" },
      operation: "insert",
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "secret-token",
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private payload",
    )
  })
})
