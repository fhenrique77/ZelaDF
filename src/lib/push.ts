import { Capacitor } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { supabase } from "./supabaseClient"
import { logger } from "./observability"

const PUSH_TOKEN_KEY = "zeladf.push.token"
const PUSH_TOKEN_OWNER_KEY = "zeladf.push.owner"

let activeUserId: string | null = null
let listenersRegistered = false

function pushEnabled() {
  return import.meta.env.VITE_PUSH_ENABLED === "true"
}

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function rememberToken(token: string, userId: string) {
  const storage = localStorageOrNull()
  storage?.setItem(PUSH_TOKEN_KEY, token)
  storage?.setItem(PUSH_TOKEN_OWNER_KEY, userId)
}

function forgetToken() {
  const storage = localStorageOrNull()
  storage?.removeItem(PUSH_TOKEN_KEY)
  storage?.removeItem(PUSH_TOKEN_OWNER_KEY)
}

async function saveToken(token: string, userId: string) {
  if (!supabase) return false

  const storage = localStorageOrNull()
  const previousToken = storage?.getItem(PUSH_TOKEN_KEY)
  const previousOwnerId = storage?.getItem(PUSH_TOKEN_OWNER_KEY)

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform: Capacitor.getPlatform(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  )

  if (error) {
    logger.error("push.token_store_failed", {
      error,
      operation: "upsert",
      platform: Capacitor.getPlatform(),
    })
    return false
  }

  rememberToken(token, userId)

  if (previousToken && previousToken !== token && previousOwnerId === userId) {
    const { error: cleanupError } = await supabase
      .from("push_tokens")
      .delete()
      .eq("token", previousToken)
      .eq("user_id", userId)

    if (cleanupError) {
      logger.error("push.replaced_token_cleanup_failed", {
        error: cleanupError,
        operation: "delete",
        platform: Capacitor.getPlatform(),
      })
    }
  }

  return true
}

async function deleteStoredToken(userId: string) {
  const storage = localStorageOrNull()
  const token = storage?.getItem(PUSH_TOKEN_KEY)
  const ownerId = storage?.getItem(PUSH_TOKEN_OWNER_KEY)

  if (!token || ownerId !== userId || !supabase) return

  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("token", token)
    .eq("user_id", userId)

  if (error) {
    logger.error("push.token_delete_failed", {
      error,
      operation: "delete",
      platform: Capacitor.getPlatform(),
    })
  }
}

async function setupPushListeners() {
  if (listenersRegistered) return

  await PushNotifications.addListener("registration", async (token) => {
    const userId = activeUserId
    if (!userId) return

    await saveToken(token.value, userId)
  })

  await PushNotifications.addListener("registrationError", (error) => {
    logger.error("push.native_registration_failed", {
      error,
      operation: "register",
      platform: Capacitor.getPlatform(),
    })
  })

  await PushNotifications.addListener("pushNotificationReceived", () => {
    logger.info("push.notification_received", {
      operation: "receive",
      platform: Capacitor.getPlatform(),
    })
  })

  await PushNotifications.addListener("pushNotificationActionPerformed", () => {
    logger.info("push.notification_opened", {
      operation: "open",
      platform: Capacitor.getPlatform(),
    })
  })

  listenersRegistered = true
}

/**
 * Ativa push somente após uma ação explícita da interface.
 * A flag permanece desligada por padrão até a infraestrutura externa ser validada.
 */
export async function registerForPushNotifications(userId: string) {
  if (!pushEnabled() || !Capacitor.isNativePlatform() || !supabase) {
    return false
  }

  try {
    let permission = await PushNotifications.checkPermissions()

    if (
      permission.receive === "prompt" ||
      permission.receive === "prompt-with-rationale"
    ) {
      permission = await PushNotifications.requestPermissions()
    }

    if (permission.receive !== "granted") {
      logger.warn("push.permission_denied", {
        operation: "request_permission",
        platform: Capacitor.getPlatform(),
      })
      return false
    }

    activeUserId = userId
    await setupPushListeners()
    await PushNotifications.register()
    return true
  } catch (error) {
    logger.error("push.registration_failed", {
      error,
      operation: "register",
      platform: Capacitor.getPlatform(),
    })
    return false
  }
}

/** Remove o vínculo antes de encerrar a sessão e invalida o token nativo. */
export async function unregisterPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) return

  try {
    await deleteStoredToken(userId)
  } catch (error) {
    logger.error("push.token_delete_failed", {
      error,
      operation: "delete",
      platform: Capacitor.getPlatform(),
    })
  }

  try {
    await PushNotifications.unregister()
  } catch (error) {
    logger.error("push.native_unregister_failed", {
      error,
      operation: "unregister",
      platform: Capacitor.getPlatform(),
    })
  }

  try {
    await PushNotifications.removeAllListeners()
  } catch (error) {
    logger.error("push.listener_cleanup_failed", {
      error,
      operation: "remove_listeners",
      platform: Capacitor.getPlatform(),
    })
  } finally {
    activeUserId = null
    listenersRegistered = false
    forgetToken()
  }
}
