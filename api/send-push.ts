import type { VercelRequest, VercelResponse } from "@vercel/node"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { createClient } from "@supabase/supabase-js"
import { logger } from "../src/lib/observability.js"
import {
  isAllowedStatusTransition,
  isReportStatus,
} from "../src/lib/reportStatus.js"

type ReportRecord = {
  id: string
  status: string
  title: string
  author_id?: string | null
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
  findTokens: (authorId: string) => Promise<string[]>
  sendNotification: (message: PushMessage) => Promise<PushDeliveryResult>
  deleteTokens: (tokens: string[]) => Promise<void>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isReportRecord(value: unknown): value is ReportRecord {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.title === "string" &&
    (value.author_id === undefined ||
      value.author_id === null ||
      typeof value.author_id === "string")
  )
}

function previousStatus(value: unknown): string | null {
  if (!isObject(value) || typeof value.status !== "string") return null
  return value.status
}

function requestSecret(req: VercelRequest): string | undefined {
  const header = req.headers.authorization ?? req.headers["x-webhook-secret"]
  return Array.isArray(header) ? header[0] : header
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

    if (requestSecret(req) !== dependencies.expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    if (!isObject(req.body)) {
      return res.status(400).json({ error: "Invalid webhook payload" })
    }

    const { type, table, record, old_record: oldRecord } = req.body

    if (table !== "reports" || type !== "UPDATE") {
      return res.status(200).json({ message: "Webhook ignored" })
    }

    const oldStatus = previousStatus(oldRecord)
    if (!isReportRecord(record) || oldStatus === null) {
      return res.status(400).json({ error: "Invalid report update payload" })
    }

    if (record.status === oldStatus) {
      return res.status(200).json({ message: "Status unchanged" })
    }

    if (
      !isReportStatus(oldStatus) ||
      !isReportStatus(record.status) ||
      !isAllowedStatusTransition(oldStatus, record.status)
    ) {
      return res.status(400).json({ error: "Invalid status transition" })
    }

    if (!record.author_id) {
      return res.status(200).json({ message: "Report has no author" })
    }

    try {
      const tokens = await dependencies.findTokens(record.author_id)
      if (tokens.length === 0) {
        return res.status(200).json({ message: "No registered devices" })
      }

      const statusLabels: Record<string, string> = {
        aberto: "está Aberto",
        andamento: "está Em andamento",
        resolvido: "foi Resolvido",
      }
      const label = statusLabels[record.status] ?? record.status
      const response = await dependencies.sendNotification({
        tokens,
        title: "Atualização no seu aviso!",
        body: `O aviso "${record.title}" agora ${label}.`,
        reportId: record.id,
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

  if (!supabaseUrl || !supabaseServiceKey || !serviceAccountJson) {
    throw new Error("Push service configuration is incomplete")
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const firebaseApp =
    getApps()[0] ??
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    })

  return {
    expectedSecret: process.env.PUSH_SECRET,
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
      const response = await getMessaging(firebaseApp).sendEachForMulticast({
        tokens: message.tokens,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: {
          reportId: message.reportId,
        },
      })

      const invalidTokens = invalidTokensFromResponses(
        message.tokens,
        response.responses,
      )

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      }
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
