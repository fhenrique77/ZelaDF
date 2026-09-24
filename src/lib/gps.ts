/**
 * GPS do dispositivo via Capacitor Geolocation.
 * Fallback para o centro de Brasília se não disponível.
 */

import { Capacitor } from "@capacitor/core"
import { Geolocation } from "@capacitor/geolocation"
import { RA_CENTER } from "../data"
import { logger } from "./observability"

export type LatLng = {
  lat: number
  lng: number
}

type GpsErrorDetails = {
  code?: unknown
  message?: unknown
}

export type GpsResult = {
  position: LatLng
  /** true se obteve a posição real do dispositivo */
  success: boolean
  /** Motivo se falhou (para exibir ao usuário) */
  reason?: "denied" | "unavailable" | "timeout"
}

/**
 * Tenta obter a localização real do dispositivo.
 * Retorna o centro de Brasília como fallback + motivo da falha.
 */
export async function getCurrentPosition(): Promise<GpsResult> {
  const fallback: LatLng = { lat: RA_CENTER[0], lng: RA_CENTER[1] }

  try {
    // No app nativo, verifica/solicita permissão explicitamente
    if (Capacitor.isNativePlatform()) {
      const perms = await Geolocation.checkPermissions()
      if (perms.location !== "granted") {
        const req = await Geolocation.requestPermissions()
        if (req.location !== "granted") {
          return { position: fallback, success: false, reason: "denied" }
        }
      }
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000,
    })

    return {
      position: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      },
      success: true,
    }
  } catch (e: unknown) {
    logger.warn("gps.position_failed", {
      error: e,
      operation: "get_current_position",
      platform: Capacitor.getPlatform(),
    })

    // GeolocationPositionError is an object, not an Error instance. Its numeric
    // code remains reliable when the browser localizes the message.
    const details =
      e !== null && typeof e === "object" ? e as GpsErrorDetails : null
    const msg =
      typeof details?.message === "string"
        ? details.message.toLowerCase()
        : String(e).toLowerCase()

    if (
      details?.code === 1 ||
      msg.includes("denied") ||
      msg.includes("permission")
    ) {
      return { position: fallback, success: false, reason: "denied" }
    }
    if (details?.code === 3 || msg.includes("timeout")) {
      return { position: fallback, success: false, reason: "timeout" }
    }

    return { position: fallback, success: false, reason: "unavailable" }
  }
}
