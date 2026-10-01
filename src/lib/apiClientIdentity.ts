import { Capacitor } from "@capacitor/core"
import { version } from "../../package.json"

/** Shared build label for aggregate API adoption metrics, never an install ID. */
export function apiClientIdentityHeader(): Record<string, string> {
  let platform = "web"
  try {
    const detected = Capacitor.getPlatform()
    platform =
      detected === "android" || detected === "web" ? detected : "unknown"
  } catch {
    // Browser preview without the native bridge is still a web client.
  }
  return { "X-ZelaDF-Client": `${platform}/${version}` }
}
