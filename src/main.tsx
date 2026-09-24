import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { AuthProvider } from "./auth/AuthProvider"
import { initNativePlugins } from "./lib/capacitor"
import "./index.css"

// Inicializar plugins nativos do Capacitor (status bar, splash screen)
initNativePlugins()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
