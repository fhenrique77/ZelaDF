// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NewReportForm } from "./NewReportForm"

vi.mock("./lib/geocoding", () => ({ reverseGeocode: vi.fn() }))

let root: Root
let container: HTMLDivElement

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:photo-preview")
      static revokeObjectURL = vi.fn()
    },
  )
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <NewReportForm
        coords={{ lat: -15.8, lng: -47.9 }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    ),
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("photo selection", () => {
  it("opens separate system picker and camera inputs only after a click", async () => {
    const inputs = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    ]
    const gallery = inputs.find((input) => !input.hasAttribute("capture"))!
    const camera = inputs.find((input) => input.hasAttribute("capture"))!
    const galleryClick = vi.spyOn(gallery, "click").mockImplementation(() => {})
    const cameraClick = vi.spyOn(camera, "click").mockImplementation(() => {})
    expect(camera.accept).toBe("image/*")
    expect(camera.getAttribute("capture")).toBe("environment")
    expect(gallery.accept).toBe("image/jpeg,image/png,image/webp")
    expect(galleryClick).not.toHaveBeenCalled()
    expect(cameraClick).not.toHaveBeenCalled()
    const buttons = [...container.querySelectorAll("button")]
    await act(async () =>
      buttons.find((button) => button.textContent === "Tirar foto")!.click(),
    )
    expect(cameraClick).toHaveBeenCalledOnce()
    expect(galleryClick).not.toHaveBeenCalled()
    await act(async () =>
      buttons
        .find((button) =>
          button.textContent?.includes("Escolher foto do álbum"),
        )!
        .click(),
    )
    expect(galleryClick).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    "validates selected photos even when capture is %s",
    async (capture) => {
      const input = container.querySelector<HTMLInputElement>(
        capture ? "input[capture]" : 'input[type="file"]:not([capture])',
      )!
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
      })
      await act(async () =>
        input.dispatchEvent(new Event("change", { bubbles: true })),
      )
      expect(container.querySelector('img[alt="Prévia"]')).not.toBeNull()
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["invalid"], "image.svg", { type: "image/svg+xml" })],
      })
      await act(async () =>
        input.dispatchEvent(new Event("change", { bubbles: true })),
      )
      expect(container.querySelector('img[alt="Prévia"]')).toBeNull()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview")
      expect(container.textContent).toContain("JPEG")
    },
  )
})
