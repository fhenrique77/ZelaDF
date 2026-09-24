import { test as base, expect, type Page } from "@playwright/test"

export const USER_ID = "50000000-0000-0000-0000-000000000001"
export const OWN_ID = "50000000-0000-0000-0000-000000000011"
export const OTHER_ID = "50000000-0000-0000-0000-000000000012"
export const RECEIPT_ID = "50000000-0000-0000-0000-000000000099"
export const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
)

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "cidadao@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-09-01T12:00:00Z",
}
function session() {
  const expiry = Math.floor(Date.now() / 1000) + 3600
  const payload = Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      exp: expiry,
    }),
  ).toString("base64url")
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic-test-signature`,
    refresh_token: "synthetic-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiry,
    user,
  }
}

type ReportRow = {
  id: string
  title: string
  description: string
  category: string
  status: string
  ra: string
  address: string
  lat: number
  lng: number
  photo_url: string
  confirmations: number
  created_at: string
}
type Call = {
  path: string
  method: string
  body: Record<string, any> | null
  query: URLSearchParams
}
export class Backend {
  calls: Call[] = []
  unexpected: string[] = []
  errors: string[] = []
  consoleMessages: string[] = []
  authenticated = false
  operator = false
  failRead = false
  missingMyReports = false
  failVote = false
  failDelete = false
  failRequest = false
  failOtp = false
  failSafety = false
  termsAccepted = false
  liveTiles = false
  blocked = new Set<string>()
  voteDelay = 0
  geocodingRequests = 0
  voted = new Set<string>()
  owned = new Set([OWN_ID])
  receipt: null | {
    id: string
    created_at: string
    status: string
  } = null
  history: Record<string, unknown>[] = []
  rows: ReportRow[] = [
    {
      id: OWN_ID,
      title: "Buraco de teste na via",
      description: "Descrição sintética para validar o aviso.",
      category: "buraco",
      status: "aberto",
      ra: "Asa Sul",
      address: "Via de teste A",
      lat: -15.7939,
      lng: -47.8828,
      photo_url: "",
      confirmations: 2,
      created_at: "2026-09-01T12:00:00Z",
    },
    {
      id: OTHER_ID,
      title: "Iluminação de teste resolvida",
      description: "Outro aviso inteiramente sintético.",
      category: "poste",
      status: "resolvido",
      ra: "Asa Sul",
      address: "Via de teste B",
      lat: -15.795,
      lng: -47.884,
      photo_url: "",
      confirmations: 4,
      created_at: "2026-09-01T11:00:00Z",
    },
  ]
  count(path: string, method = "POST") {
    return this.calls.filter(
      (call) => call.path === path && call.method === method,
    ).length
  }
  async open(page: Page, authenticated = false, path = "/") {
    this.authenticated = authenticated
    if (authenticated) {
      await page.addInitScript(
        (value) =>
          localStorage.setItem("sb-e2e-auth-token", JSON.stringify(value)),
        session(),
      )
    }
    await page.goto(path)
    await expect(
      page.getByRole("heading", { name: "ZelaDF", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText("Carregando avisos…", { exact: true }),
    ).toBeHidden()
  }
}

export const test = base.extend<{ backend: Backend }>({
  backend: async ({ context, page }, use) => {
    const backend = new Backend()
    page.on("pageerror", (error) => backend.errors.push(error.message))
    page.on("console", (message) =>
      backend.consoleMessages.push(message.text()),
    )
    await context.route("**/*", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === "http://127.0.0.1:4178") return route.continue()
      if (url.hostname === "tile.openstreetmap.org" && backend.liveTiles && process.env.ZELADF_STORE_ASSETS === "1")
        return route.continue()
      if (url.hostname === "tile.openstreetmap.org")
        return route.fulfill({ contentType: "image/png", body: PHOTO })
      if (url.hostname === "fonts.googleapis.com")
        return route.fulfill({ contentType: "text/css", body: "" })
      if (url.hostname === "nominatim.openstreetmap.org") {
        backend.geocodingRequests++
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic geocoding failure" },
        })
      }
      if (url.hostname !== "e2e.supabase.invalid") {
        backend.unexpected.push(
          `${request.method()} ${url.origin}${url.pathname}`,
        )
        return route.abort()
      }
      let body = null
      try {
        body = request.postDataJSON()
      } catch {
        /* Multipart upload. */
      }
      const path = url.pathname
      const method = request.method()
      backend.calls.push({ path, method, body, query: url.searchParams })
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ status, json })
      const failure = () =>
        reply(
          { code: "TEST_FAILURE", message: "Synthetic service unavailable" },
          503,
        )
      if (method === "OPTIONS") return reply({})
      if (path === "/rest/v1/rpc/accept_community_terms") {
        if (backend.failSafety) return failure()
        backend.termsAccepted = true
        return route.fulfill({ status: 204 })
      }
      if (path === "/rest/v1/rpc/flag_report")
        return backend.failSafety ? failure() : reply(RECEIPT_ID)
      if (path === "/rest/v1/rpc/block_report_author") {
        if (backend.failSafety) return failure()
        backend.blocked.add(body.p_report_id)
        return route.fulfill({ status: 204 })
      }
      if (path === "/rest/v1/rpc/clear_my_community_blocks") {
        backend.blocked.clear()
        return route.fulfill({ status: 204 })
      }
      if (path === "/rest/v1/rpc/get_my_reports" && backend.missingMyReports)
        return reply(
          { code: "PGRST202", message: "Synthetic missing function" },
          404,
        )
      if (path === "/auth/v1/otp")
        return backend.failOtp ? failure() : reply({})
      if (path === "/auth/v1/verify" || path === "/auth/v1/token") {
        backend.authenticated = true
        return reply(session())
      }
      if (path === "/auth/v1/user") return reply(user)
      if (path === "/auth/v1/logout") {
        backend.authenticated = false
        return route.fulfill({ status: 204 })
      }
      if (path === "/rest/v1/rpc/current_user_is_operator")
        return reply(backend.authenticated && backend.operator)
      if (path === "/rest/v1/rpc/get_my_report_ids")
        return reply(
          backend.authenticated
            ? [...backend.owned].map((report_id) => ({ report_id }))
            : [],
        )
      if (path === "/rest/v1/votes")
        return reply([...backend.voted].map((report_id) => ({ report_id })))
      if (path === "/rest/v1/report_status_history")
        return reply(backend.history)
      if (path === "/rest/v1/account_deletion_requests")
        return reply(backend.receipt ? [backend.receipt] : [])
      if (path === "/rest/v1/rpc/request_account_deletion") {
        if (backend.failRequest) return failure()
        backend.receipt ??= {
          id: RECEIPT_ID,
          created_at: "2026-09-01T12:30:00Z",
          status: "pending",
        }
        return reply([backend.receipt])
      }
      if (path === "/rest/v1/rpc/set_report_vote") {
        if (backend.voteDelay)
          await new Promise((resolve) => setTimeout(resolve, backend.voteDelay))
        if (backend.failVote) return failure()
        const row = backend.rows.find((row) => row.id === body.p_report_id)!
        const previous = backend.voted.has(row.id)
        if (body.p_voted !== previous)
          row.confirmations += body.p_voted ? 1 : -1
        if (body.p_voted) backend.voted.add(row.id)
        else backend.voted.delete(row.id)
        return reply([
          { voted: body.p_voted, confirmations: row.confirmations },
        ])
      }
      if (path === "/rest/v1/rpc/change_report_status") {
        const row = backend.rows.find((row) => row.id === body.p_report_id)!
        backend.history = [
          {
            id: RECEIPT_ID,
            from_status: row.status,
            to_status: body.p_new_status,
            reason: body.p_reason,
            changed_at: "2026-09-01T12:30:00Z",
          },
        ]
        row.status = body.p_new_status
        return route.fulfill({ status: 204 })
      }
      if (path.startsWith("/storage/v1/object/public/"))
        return route.fulfill({ contentType: "image/png", body: PHOTO })
      if (path.startsWith("/storage/v1/object/"))
        return reply(
          method === "DELETE" ? [] : { Key: path.split("/object/")[1] },
        )
      if (
        path === "/rest/v1/reports" ||
        path === "/rest/v1/rpc/get_my_reports"
      ) {
        if (method === "GET" || path.endsWith("get_my_reports")) {
          if (backend.failRead) return failure()
          let rows = backend.rows.filter(
            (row) => !backend.authenticated || !backend.blocked.has(row.id),
          )
          const status =
            url.searchParams.get("status")?.slice(3) ?? body?.p_status
          const categories =
            url.searchParams.get("category")?.slice(4, -1).split(",") ??
            body?.p_categories
          if (status) rows = rows.filter((row) => row.status === status)
          if (categories?.length)
            rows = rows.filter((row) => categories.includes(row.category))
          if (path.endsWith("get_my_reports"))
            rows = rows.filter((row) => backend.owned.has(row.id))
          return reply(rows)
        }
        if (method === "POST") {
          const row = {
            ...backend.rows[0],
            ...body,
            id: "50000000-0000-0000-0000-000000000013",
            confirmations: 0,
            status: "aberto",
          }
          backend.rows.unshift(row)
          backend.owned.add(row.id)
          return reply(row, 201)
        }
        const row = backend.rows.find(
          (row) => row.id === url.searchParams.get("id")?.slice(3),
        )!
        if (method === "PATCH") {
          Object.assign(row, body)
          return reply(row)
        }
        if (method === "DELETE") {
          if (backend.failDelete)
            return reply({ code: "PGRST116", message: "No matching row" }, 406)
          backend.rows = backend.rows.filter((item) => item !== row)
          return reply({ id: row.id, photo_url: row.photo_url })
        }
      }
      backend.unexpected.push(`${method} ${path}`)
      return reply({ message: "Unexpected mocked endpoint" }, 501)
    })
    await use(backend)
    expect(
      backend.unexpected,
      "Unexpected requests were blocked, never sent externally",
    ).toEqual([])
    expect(backend.errors, "Browser JavaScript exceptions").toEqual([])
  },
})
export { expect }

export async function openList(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: /▤ Avisos/ }).click()
}
export async function openReport(
  page: Page,
  mobile: boolean,
  title = "Buraco de teste na via",
) {
  await openList(page, mobile)
  await page.getByRole("button", { name: new RegExp(title) }).click()
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible()
}
