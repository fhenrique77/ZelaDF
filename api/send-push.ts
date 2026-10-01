import type { VercelRequest, VercelResponse } from "@vercel/node"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { createClient } from "@supabase/supabase-js"
import { timingSafeEqual } from "node:crypto"
import { logger } from "../src/lib/observability.js"

type ClaimedStatusEvent = {
  report_id: string
  author_id: string
  title: string
  to_status: "aberto" | "andamento" | "resolvido"
}

type PushMessage = {
  tokens: string[]
  title: string
  body: string
  reportId: string
}

type PushDeliveryResult = {
  successCount: number
  failureCount: number
  invalidTokens: string[]
}

type MessagingResponse = {
  error?: { code?: string } | null
}

export type SendPushDependencies = {
  expectedSecret?: string
  claimEvent: (eventId: string) => Promise<ClaimedStatusEvent | null>
  findTokens: (authorId: string) => Promise<string[]>
  sendNotification: (message: PushMessage) => Promise<PushDeliveryResult>
  deleteTokens: (tokens: string[]) => Promise<void>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestSecret(req: VercelRequest): string | undefined {
  const header = req.headers.authorization ?? req.headers["x-webhook-secret"]
  return Array.isArray(header) ? undefined : header
}

function sameSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) return false
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function invalidTokensFromResponses(
  tokens: string[],
  responses: MessagingResponse[],
) {
  return responses.flatMap((result, index) => {
    const code = result.error?.code
    return code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
      ? [tokens[index]]
      : []
  })
}

export function createSendPushHandler(dependencies: SendPushDependencies) {
  return async function sendPushHandler(
    req: VercelRequest,
    res: VercelResponse,
  ) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }

    if (!dependencies.expectedSecret) {
      logger.error("push.webhook_secret_missing", {
        operation: "authenticate",
      })
      return res.status(503).json({ error: "Push service unavailable" })
    }

    if (!sameSecret(requestSecret(req), dependencies.expectedSecret)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    if (!isObject(req.body)) {
      return res.status(400).json({ error: "Invalid webhook payload" })
    }

    const { type, table, record } = req.body

    if (table !== "push_status_events" || type !== "INSERT") {
      return res.status(200).json({ message: "Webhook ignored" })
    }

    if (!isObject(record) || typeof record.id !== "string" || !UUID.test(record.id)) {
      return res.status(400).json({ error: "Invalid status event payload" })
    }

    try {
      const event = await dependencies.claimEvent(record.id)
      if (!event) {
        return res.status(200).json({ message: "Event unavailable or already claimed" })
      }
      const tokens = await dependencies.findTokens(event.author_id)
      if (tokens.length === 0) {
        return res.status(200).json({ message: "No registered devices" })
      }

      const statusLabels: Record<string, string> = {
        aberto: "está Aberto",
        andamento: "está Em andamento",
        resolvido: "foi Resolvido",
      }
      const label = statusLabels[event.to_status]
      const response = await dependencies.sendNotification({
        tokens,
        title: "Atualização no seu aviso!",
        body: `O aviso "${event.title}" agora ${label}.`,
        reportId: event.report_id,
      })

      let invalidTokensRemoved = 0
      if (response.invalidTokens.length > 0) {
        try {
          await dependencies.deleteTokens(response.invalidTokens)
          invalidTokensRemoved = response.invalidTokens.length
        } catch (error) {
          // Evita reenviar notificações entregues somente porque o cleanup falhou.
          logger.error("push.invalid_token_cleanup_failed", {
            error,
            count: response.invalidTokens.length,
            operation: "delete",
          })
        }
      }

      logger.info("push.delivery_completed", {
        failureCount: response.failureCount,
        operation: "send",
        successCount: response.successCount,
      })

      return res.status(200).json({
        success: true,
        sent: response.successCount,
        failed: response.failureCount,
        invalidTokensRemoved,
      })
    } catch (error) {
      logger.error("push.delivery_failed", { error, operation: "send" })
      return res.status(500).json({ error: "Push delivery failed" })
    }
  }
}

function createProductionDependencies(): SendPushDependencies {
  if (process.env.PUSH_ENABLED !== "true") {
    throw new Error("Push service is disabled")
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  const expectedSecret = process.env.PUSH_SECRET

  if (!supabaseUrl || !supabaseServiceKey || !serviceAccountJson || !expectedSecret) {
    throw new Error("Push service configuration is incomplete")
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const firebaseApp =
    getApps()[0] ??
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    })

  return {
    expectedSecret,
    async claimEvent(eventId) {
      const { data, error } = await supabase.rpc("claim_push_status_event", {
        p_event_id: eventId,
      })
      if (error) throw error
      if (!Array.isArray(data) || data.length > 1) {
        throw new Error("Invalid push event claim response")
      }
      if (data.length === 0) return null
      const row: unknown = data[0]
      if (!isObject(row) || typeof row.report_id !== "string" ||
          typeof row.author_id !== "string" || typeof row.title !== "string" ||
          !["aberto", "andamento", "resolvido"].includes(String(row.to_status))) {
        throw new Error("Invalid push event claim response")
      }
      return row as ClaimedStatusEvent
    },
    async findTokens(authorId) {
      const { data, error } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("user_id", authorId)

      if (error) throw error

      const rows = (data ?? []) as Array<{ token?: unknown }>
      return rows.flatMap((row) =>
        typeof row.token === "string" && row.token.length > 0
          ? [row.token]
          : [],
      )
    },
    async deleteTokens(tokens) {
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .in("token", tokens)

      if (error) throw error
    },
    async sendNotification(message) {
      const result: PushDeliveryResult = {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      }
      for (let index = 0; index < message.tokens.length; index += 500) {
        const tokens = message.tokens.slice(index, index + 500)
        const response = await getMessaging(firebaseApp).sendEachForMulticast({
          tokens,
          notification: { title: message.title, body: message.body },
          data: { reportId: message.reportId },
        })
        result.successCount += response.successCount
        result.failureCount += response.failureCount
        result.invalidTokens.push(...invalidTokensFromResponses(tokens, response.responses))
      }
      return result
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await createSendPushHandler(createProductionDependencies())(req, res)
  } catch (error) {
    logger.error("push.configuration_failed", {
      error,
      operation: "initialize",
    })
    return res.status(503).json({ error: "Push service unavailable" })
  }
}
