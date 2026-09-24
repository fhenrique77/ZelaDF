/**
 * Inicialização de plugins nativos do Capacitor.
 * Roda apenas no ambiente nativo configurado (atualmente Android), não no browser.
 */

import { Capacitor } from "@capacitor/core"
import { StatusBar, Style } from "@capacitor/status-bar"
import { SplashScreen } from "@capacitor/splash-screen"
import { logger } from "./observability"

export async function initNativePlugins() {
  if (!Capacitor.isNativePlatform()) return

  // Status bar: ícones escuros sobre fundo transparente.
  // A WebView se estende por trás da barra; o padding vem das
  // CSS safe areas (env(safe-area-inset-top)) no header.
  try {
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setOverlaysWebView({ overlay: true })

    // No Android, define a cor de fundo como transparente para o efeito
    // "content behind status bar". Outras plataformas exigem validação própria.
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#00000000" })
    }
  } catch (e) {
    logger.warn("capacitor.status_bar_failed", {
      error: e,
      operation: "initialize",
      platform: Capacitor.getPlatform(),
    })
  }

  // Esconder splash screen após a UI carregar
  try {
    await SplashScreen.hide({ fadeOutDuration: 300 })
  } catch (e) {
    logger.warn("capacitor.splash_hide_failed", {
      error: e,
      operation: "hide",
      platform: Capacitor.getPlatform(),
    })
  }
}
