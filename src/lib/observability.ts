type LogLevel = "info" | "warn" | "error"

export type LogContext = Record<string, unknown>

type ErrorShape = {
  name?: unknown
  code?: unknown
  status?: unknown
}

const SAFE_CONTEXT_KEYS = new Set([
  "code",
  "count",
  "failureCount",
  "method",
  "operation",
  "platform",
  "reason",
  "status",
  "successCount",
  "table",
])

function errorSummary(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object") return { name: "UnknownError" }

  const error = value as ErrorShape
  const summary: Record<string, string | number> = {
    name: typeof error.name === "string" ? error.name : "Error",
  }

  if (typeof error.code === "string" || typeof error.code === "number") {
    summary.code = error.code
  }
  if (typeof error.status === "number") summary.status = error.status

  return summary
}

export function sanitizeLogContext(context: LogContext = {}): LogContext {
  const sanitized: LogContext = {}

  for (const [key, value] of Object.entries(context)) {
    if (key === "error") {
      sanitized.error = errorSummary(value)
      continue
    }

    if (!SAFE_CONTEXT_KEYS.has(key)) continue
    if (["string", "number", "boolean"].includes(typeof value)) {
      sanitized[key] = value
    }
  }

  return sanitized
}

function write(level: LogLevel, event: string, context?: LogContext) {
  const sanitized = sanitizeLogContext(context)
  const args: unknown[] = [`[ZelaDF] ${event}`]
  if (Object.keys(sanitized).length > 0) args.push(sanitized)
  console[level](...args)
}

export const logger = {
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
}
