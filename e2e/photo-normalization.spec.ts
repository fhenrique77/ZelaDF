import { readFile } from "node:fs/promises"
import { test, expect } from "@playwright/test"

const source = await readFile("e2e/fixtures/photo-with-gps-exif.jpg")
const oriented = await readFile("e2e/fixtures/photo-orientation-6.jpg")

test("re-encodes a JPEG with GPS EXIF before it can be uploaded", async ({ page }) => {
  expect(source.includes(Buffer.from("Exif\0\0"))).toBe(true)
  await page.goto("/")
  const result = await page.evaluate(async (bytes) => {
    const modulePath = "/src/lib/reportPhoto.ts"
    const { prepareReportPhoto } = await import(modulePath) as typeof import("../src/lib/reportPhoto")
    const original = new File([new Uint8Array(bytes)], "original.jpg", { type: "image/jpeg" })
    const prepared = await prepareReportPhoto(original)
    const bitmap = await createImageBitmap(prepared)
    return { type: prepared.type, name: prepared.name, width: bitmap.width,
      height: bitmap.height, bytes: Array.from(new Uint8Array(await prepared.arrayBuffer())) }
  }, Array.from(source))
  const encoded = Buffer.from(result.bytes)
  expect(result).toMatchObject({ type: "image/jpeg", name: "foto.jpg", width: 16, height: 12 })
  expect(encoded.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  expect(encoded.includes(Buffer.from("Exif\0\0"))).toBe(false)
  expect(encoded.includes(Buffer.from([0xff, 0xe1]))).toBe(false)
})

test("rejects bytes that are not a decodable image", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/reportPhoto.ts"
    const { prepareReportPhoto } = await import(modulePath) as typeof import("../src/lib/reportPhoto")
    const fake = new File(["not a jpeg"], "fake.jpg", { type: "image/jpeg" })
    try {
      await prepareReportPhoto(fake)
      return "accepted"
    } catch {
      return "rejected"
    }
  })
  expect(result).toBe("rejected")
})

test("rejects a MIME label that disagrees with the image bytes", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async (bytes) => {
    const modulePath = "/src/lib/reportPhoto.ts"
    const { prepareReportPhoto } = await import(modulePath) as typeof import("../src/lib/reportPhoto")
    const mismatched = new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" })
    try {
      await prepareReportPhoto(mismatched)
      return "accepted"
    } catch {
      return "rejected"
    }
  }, Array.from(source))
  expect(result).toBe("rejected")
})

test("keeps PNG and WebP photos usable while encoding JPEG", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/reportPhoto.ts"
    const { prepareReportPhoto } = await import(modulePath) as typeof import("../src/lib/reportPhoto")
    const canvas = document.createElement("canvas")
    canvas.width = 20
    canvas.height = 12
    const context = canvas.getContext("2d")!
    context.fillStyle = "red"
    context.fillRect(0, 0, 20, 12)
    const rows = []
    for (const mime of ["image/png", "image/webp"]) {
      const sourceBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("encode failed")), mime))
      const sourceFile = new File([sourceBlob], "source", { type: mime })
      const prepared = await prepareReportPhoto(sourceFile)
      const bitmap = await createImageBitmap(prepared)
      rows.push({ source: mime, type: prepared.type, width: bitmap.width, height: bitmap.height })
    }
    return rows
  })
  expect(result).toEqual([
    { source: "image/png", type: "image/jpeg", width: 20, height: 12 },
    { source: "image/webp", type: "image/jpeg", width: 20, height: 12 },
  ])
})

test("preserves displayed orientation when EXIF is removed", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async (bytes) => {
    const modulePath = "/src/lib/reportPhoto.ts"
    const { prepareReportPhoto } = await import(modulePath) as typeof import("../src/lib/reportPhoto")
    const original = new File([new Uint8Array(bytes)], "camera.jpg", { type: "image/jpeg" })
    const prepared = await prepareReportPhoto(original)
    const bitmap = await createImageBitmap(prepared)
    return { width: bitmap.width, height: bitmap.height,
      hasExif: new Uint8Array(await prepared.arrayBuffer()).some((byte, index, all) =>
        byte === 0xff && all[index + 1] === 0xe1) }
  }, Array.from(oriented))
  expect(result).toEqual({ width: 12, height: 16, hasExif: false })
})
