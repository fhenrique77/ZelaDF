// @vitest-environment jsdom

import { act } from "react"

import { createRoot, type Root } from "react-dom/client"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Report } from "./data"

const mocks = vi.hoisted(() => ({ download: vi.fn() }))

vi.mock("./lib/supabaseClient", () => ({
  isConfigured: true,

  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/report-photos/${path}`,
          },
        }),

        download: mocks.download,
      }),
    },
  },
}))

vi.mock("./CommunitySafety", () => ({ CommunitySafety: () => null }))

import { ReportDetail } from "./ReportDetail"

const managed =
  "https://project.supabase.co/storage/v1/object/public/report-photos/owner/photo.png"

const report: Report = {
  id: "report-1",
  category: "buraco",
  title: "Photo report",
  description: "Detail",

  ra: "Plano Piloto",
  address: "Synthetic",
  lat: -15.79,
  lng: -47.88,

  photo: managed,
  status: "aberto",
  confirmations: 0,

  createdAt: "2026-09-05T12:00:00Z",
  isOwner: false,
}

let container: HTMLDivElement

let root: Root

let revokedUrls: string[]

async function render(photo: string, id = report.id) {
  await act(async () =>
    root.render(
      <ReportDetail
        report={{ ...report, id, photo }}
        hasVoted={false}
        votePending={false}
        isOwner={false}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        isOperator={false}
        statusHistory={[]}
        statusHistoryLoading={false}
        onStatusChange={vi.fn()}
      />,
    ),
  )
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)

  revokedUrls = []

  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(_obj: Blob | MediaSource): string {
        return "blob:authorized-photo"
      }

      static revokeObjectURL(url: string): void {
        revokedUrls.push(url)
      }
    },
  )

  container = document.createElement("div")

  document.body.append(container)

  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())

  container.remove()

  mocks.download.mockReset()

  vi.unstubAllGlobals()
})

describe("managed report photos", () => {
  it("renders only the authorized download and revokes its blob URL", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["photo"]), error: null })

    await render(managed)

    expect(mocks.download).toHaveBeenCalledWith("owner/photo.png")

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:authorized-photo",
    )

    await act(async () => root.unmount())

    expect(revokedUrls).toContain("blob:authorized-photo")

    root = createRoot(container)
  })

  it("does not fall back to a saved public URL after a denied download", async () => {
    mocks.download.mockResolvedValue({ data: null, error: new Error("denied") })

    await render(managed)

    expect(container.querySelector("img")).toBeNull()

    expect(container.innerHTML).not.toContain(managed)
  })

  it("loads a managed path through this project's Storage even if its saved URL has another host", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["photo"]), error: null })

    await render(managed.replace("project.supabase.co", "old-host.invalid"))

    expect(mocks.download).toHaveBeenCalledWith("owner/photo.png")

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:authorized-photo",
    )
  })

  it("downloads a saved render URL through the private object route", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["photo"]), error: null })

    const rendered = managed.replace("/object/public/", "/render/image/public/")

    await render(rendered)

    expect(mocks.download).toHaveBeenCalledWith("owner/photo.png")

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:authorized-photo",
    )
  })

  it.each([
    "https://attacker.supabase.co/pixel?viewer=unique",
    "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?viewer=unique",
  ])("does not request a legacy author-controlled external URL: %s", async (external) => {
    await render(external)
    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toContain(external)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it("keeps local file previews and fixed seed photos available", async () => {
    await render("blob:local-preview", "local-123")
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:local-preview")

    const seedPhoto = "https://images.unsplash.com/photo-1515162305285-0293e4767cc2"
    await render(seedPhoto, "00000000-0000-0000-0000-000000000001")
    expect(container.querySelector("img")?.getAttribute("src")).toBe(seedPhoto)
  })

  it("still renders demonstration photos from external hosts", async () => {
    const external = "https://images.unsplash.com/photo-1515162305285-0293e4767cc2"

    await render(external, "demo-1")

    expect(container.querySelector("img")?.getAttribute("src")).toBe(external)

    expect(mocks.download).not.toHaveBeenCalled()
  })
})
