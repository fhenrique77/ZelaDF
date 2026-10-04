import { REPORT_LIMITS, validatePhoto } from "./reportValidation"

const MAX_EDGE = 2048
const MAX_PIXELS = 25_000_000
const QUALITY = 0.88
const normalized = new WeakMap<File, Promise<File>>()

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("N\u00e3o foi poss\u00edvel ler a foto."))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function encode(file: File): Promise<File> {
  const error = validatePhoto(file)
  if (error) throw new Error(error)
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = file.type === "image/jpeg" && signature[0] === 0xff &&
    signature[1] === 0xd8 && signature[2] === 0xff
  const png = file.type === "image/png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)
  const webp = file.type === "image/webp" &&
    [82, 73, 70, 70].every((byte, index) => signature[index] === byte) &&
    [87, 69, 66, 80].every((byte, index) => signature[index + 8] === byte)
  if (!jpeg && !png && !webp) {
    throw new Error("O formato real da foto n\u00e3o corresponde ao arquivo selecionado.")
  }
  const image = await decode(file)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height || width * height > MAX_PIXELS) {
    throw new Error("A foto tem dimens\u00f5es inv\u00e1lidas ou grandes demais.")
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("N\u00e3o foi poss\u00edvel preparar a foto.")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY))
  if (!blob || blob.type !== "image/jpeg" || blob.size === 0 || blob.size > REPORT_LIMITS.photoMaxBytes) {
    throw new Error("N\u00e3o foi poss\u00edvel preparar a foto para envio.")
  }
  // Only rendered pixels are encoded; source EXIF and other source chunks are not copied.
  return new File([blob], "foto.jpg", { type: "image/jpeg" })
}

export function prepareReportPhoto(file: File): Promise<File> {
  let pending = normalized.get(file)
  if (!pending) {
    pending = encode(file)
    normalized.set(file, pending)
  }
  return pending
}
