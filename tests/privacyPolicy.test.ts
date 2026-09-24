import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("public privacy notice", () => {
  const policy = read("public/privacy.html")

  it.each([
    "Supabase",
    "Nominatim",
    "OpenStreetMap",
    "Google",
    "Firebase Cloud Messaging",
    "Vercel",
    "Unsplash",
  ])("documents the %s integration", (provider) => {
    expect(policy).toContain(provider)
  })

  it("documents public location, retention and account deletion limitations", () => {
    expect(policy).toContain("coordenadas exatas")
    expect(policy).toContain("Retenção e exclusão")
    expect(policy).toContain("exclusão completa de conta ainda não é automática")
  })
})
