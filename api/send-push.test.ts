import type { VercelRequest, VercelResponse } from "@vercel/node"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createSendPushHandler,
  invalidTokensFromResponses,
  type SendPushDependencies,
} from "./send-push"

const updatePayload = {
  type: "UPDATE",
  table: "reports",
  record: {
    id: "10000000-0000-0000-0000-000000000001",
    author_id: "20000000-0000-0000-0000-000000000001",
    status: "resolvido",
    title: "Buraco na via",
  },
  old_record: { status: "aberto" },
}

type ResponseState = {
  status?: number
  body?: unknown
}

function createDependencies(
  overrides: Partial<SendPushDependencies> = {},
): SendPushDependencies {
  return {
    expectedSecret: "test-secret",
    findTokens: vi.fn().mockResolvedValue(["device-token"]),
    deleteTokens: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    }),
    ...overrides,
  }
}

function createResponse() {
  const state: ResponseState = {}
  const response = {
    status: vi.fn((status: number) => {
      state.status = status
      return response
    }),
    json: vi.fn((body: unknown) => {
      state.body = body
      return response
    }),
  }

  return { response: response as unknown as VercelResponse, state }
}

async function execute(
  dependencies: SendPushDependencies,
  request: Partial<VercelRequest>,
) {
  const { response, state } = createResponse()
  await createSendPushHandler(dependencies)(
    {
      method: "POST",
      headers: { authorization: "test-secret" },
      body: updatePayload,
      ...request,
    } as VercelRequest,
    response,
  )
  return state
}

describe("send-push webhook", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("aceita somente POST", async () => {
    const state = await execute(createDependencies(), { method: "GET" })

    expect(state).toEqual({
      status: 405,
      body: { error: "Method not allowed" },
    })
  })

  it("falha fechado quando o segredo não está configurado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const state = await execute(
      createDependencies({ expectedSecret: undefined }),
      {},
    )

    expect(state).toEqual({
      status: 503,
      body: { error: "Push service unavailable" },
    })
  })

  it("rejeita segredo incorreto", async () => {
    const state = await execute(createDependencies(), {
      headers: { authorization: "wrong-secret" },
    })

    expect(state).toEqual({ status: 401, body: { error: "Unauthorized" } })
  })

  it("rejeita update de report malformado", async () => {
    const state = await execute(createDependencies(), {
      body: { type: "UPDATE", table: "reports", record: {} },
    })

    expect(state).toEqual({
      status: 400,
      body: { error: "Invalid report update payload" },
    })
  })

  it("ignora eventos sem mudança de status", async () => {
    const dependencies = createDependencies()
    const state = await execute(dependencies, {
      body: {
        ...updatePayload,
        old_record: { status: "resolvido" },
      },
    })

    expect(state).toEqual({
      status: 200,
      body: { message: "Status unchanged" },
    })
    expect(dependencies.findTokens).not.toHaveBeenCalled()
  })

  it("rejeita transição fora do ciclo operacional", async () => {
    const dependencies = createDependencies()
    const state = await execute(dependencies, {
      body: {
        ...updatePayload,
        record: { ...updatePayload.record, status: "andamento" },
        old_record: { status: "resolvido" },
      },
    })

    expect(state).toEqual({
      status: 400,
      body: { error: "Invalid status transition" },
    })
    expect(dependencies.findTokens).not.toHaveBeenCalled()
  })

  it("consulta tokens e envia notificação por dependências simuladas", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    const dependencies = createDependencies()
    const state = await execute(dependencies, {})

    expect(dependencies.findTokens).toHaveBeenCalledWith(
      updatePayload.record.author_id,
    )
    expect(dependencies.sendNotification).toHaveBeenCalledWith({
      tokens: ["device-token"],
      title: "Atualização no seu aviso!",
      body: 'O aviso "Buraco na via" agora foi Resolvido.',
      reportId: updatePayload.record.id,
    })
    expect(state).toEqual({
      status: 200,
      body: {
        success: true,
        sent: 1,
        failed: 0,
        invalidTokensRemoved: 0,
      },
    })
  })

  it("remove tokens que o FCM declarou inválidos", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    const dependencies = createDependencies({
      findTokens: vi.fn().mockResolvedValue(["valid-token", "expired-token"]),
      sendNotification: vi.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        invalidTokens: ["expired-token"],
      }),
    })
    const state = await execute(dependencies, {})

    expect(dependencies.deleteTokens).toHaveBeenCalledWith(["expired-token"])
    expect(state).toEqual({
      status: 200,
      body: {
        success: true,
        sent: 1,
        failed: 1,
        invalidTokensRemoved: 1,
      },
    })
  })

  it("não repete entregas quando somente o cleanup de token falha", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const dependencies = createDependencies({
      sendNotification: vi.fn().mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        invalidTokens: ["expired-token"],
      }),
      deleteTokens: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    })
    const state = await execute(dependencies, {})

    expect(state).toEqual({
      status: 200,
      body: {
        success: true,
        sent: 0,
        failed: 1,
        invalidTokensRemoved: 0,
      },
    })
  })

  it("não expõe detalhes internos quando a entrega falha", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const dependencies = createDependencies({
      findTokens: vi
        .fn()
        .mockRejectedValue(new Error("user@example.com secret-token")),
    })
    const state = await execute(dependencies, {})

    expect(state).toEqual({
      status: 500,
      body: { error: "Push delivery failed" },
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "user@example.com",
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "secret-token",
    )
  })
})

describe("FCM invalid tokens", () => {
  it("remove apenas códigos que invalidam definitivamente o registro", () => {
    expect(
      invalidTokensFromResponses(["invalid", "expired", "retry", "valid"], [
        { error: { code: "messaging/invalid-registration-token" } },
        {
          error: {
            code: "messaging/registration-token-not-registered",
          },
        },
        { error: { code: "messaging/server-unavailable" } },
        {},
      ]),
    ).toEqual(["invalid", "expired"])
  })
})
