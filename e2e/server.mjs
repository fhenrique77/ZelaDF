import { createServer } from "vite"

// Never load .env or forward public variables inherited from a developer's terminal.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("VITE_")) delete process.env[key]
}
process.env.VITE_SUPABASE_URL = "https://e2e.supabase.invalid"
process.env.VITE_SUPABASE_ANON_KEY = "e2e-public-placeholder"
process.env.VITE_PUSH_ENABLED = "false"

const server = await createServer({
  envDir: false,
  base: "/",
  server: { host: "127.0.0.1", port: 4178, strictPort: true, open: false },
})
server.middlewares.use("/__e2e_health__", (_req, res) => {
  res.setHeader("Content-Type", "text/plain")
  res.end("ZelaDF isolated E2E server")
})
await server.listen()
