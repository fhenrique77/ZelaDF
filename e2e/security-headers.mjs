import assert from "node:assert/strict"

import { createServer } from "node:http"

import { readFile } from "node:fs/promises"

import path from "node:path"

import { chromium } from "@playwright/test"

const projectRoot = path.resolve(import.meta.dirname, "..")

const distRoot = path.join(projectRoot, "dist")

const vercel = JSON.parse(
  await readFile(path.join(projectRoot, "vercel.json"), "utf8"),
)

const headers = Object.fromEntries(
  vercel.headers
    .find(({ source }) => source === "/(.*)")
    .headers.map(({ key, value }) => [key, value]),
)

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",

  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
}

const app = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname

  const relative = pathname === "/" ? "index.html" : pathname.slice(1)

  const file = path.resolve(distRoot, relative)

  if (!file.startsWith(distRoot + path.sep)) {
    res.writeHead(404).end()

    return
  }

  try {
    const bytes = await readFile(file)

    res.writeHead(200, {
      ...headers,
      "Content-Type":
        contentTypes[path.extname(file)] ?? "application/octet-stream",
    })

    res.end(bytes)
  } catch {
    res.writeHead(404).end()
  }
})

const parent = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })

  res.end(
    '<!doctype html><title>External origin</title><iframe id="target"></iframe>',
  )
})

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  )

const close = (server) => new Promise((resolve) => server.close(resolve))

let browser

try {
  const appPort = await listen(app)

  const parentPort = await listen(parent)

  const appOrigin = `http://127.0.0.1:${appPort}`

  const parentOrigin = `http://127.0.0.1:${parentPort}`

  browser = await chromium.launch()

  const context = await browser.newContext()

  await context.route(/^https:\/\//, (route) => route.abort())

  const page = await context.newPage()

  await page.addInitScript(() => {
    window.__cspViolations = []

    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        uri: event.blockedURI,
      })
    })
  })

  await page.goto(appOrigin + "/", { waitUntil: "domcontentloaded" })

  await page
    .locator("#root")
    .getByText("ZelaDF", { exact: true })
    .first()
    .waitFor({ timeout: 10000 })

  const violations = await page.evaluate(() => window.__cspViolations)

  assert.deepEqual(
    violations,
    [],
    `The production bundle violated CSP: ${JSON.stringify(violations)}`,
  )

  for (const url of [
    "/",
    "/privacy.html",
    "/account-deletion.html",
    "/terms.html",
  ]) {
    const response = await page.request.get(appOrigin + url)

    assert.equal(response.status(), 200)

    for (const [key, value] of Object.entries(headers))
      assert.equal(response.headers()[key.toLowerCase()], value)

    const outer = await context.newPage()

    await outer.goto(parentOrigin)

    const target = appOrigin + url

    const blocked = outer.waitForEvent("console", {
      predicate: (message) =>
        message.type() === "error" &&
        message.text().includes("frame-ancestors"),

      timeout: 5000,
    })

    await outer.locator("#target").evaluate((iframe, src) => {
      iframe.src = src
    }, target)

    await blocked

    const frame = outer.frame({ url: target })

    const innerText = frame
      ? await frame
          .locator("body")
          .innerText()
          .catch(() => "")
      : ""

    assert.equal(innerText.trim(), "", `Framed content was rendered at ${url}`)

    await outer.close()
  }

  await context.close()

  process.stdout.write(
    "CSP rendered the app and blocked framing on four HTML routes. Security headers were present.\n",
  )
} finally {
  if (browser) await browser.close()

  await Promise.all([close(app), close(parent)])
}
