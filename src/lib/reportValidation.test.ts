import { describe, expect, it } from "vitest"
import {
  REPORT_LIMITS,
  photoExtension,
  validatePhoto,
  validateReport,
} from "./reportValidation"

const validInput = {
  category: "buraco" as const,
  title: "Buraco na via",
  description: "Próximo à faixa da direita.",
  ra: "Plano Piloto",
  address: "Via de teste",
  lat: -15.79,
  lng: -47.88,
  photoFile: null,
}

describe("reportValidation", () => {
  it("aceita um aviso válido", () => {
    expect(validateReport(validInput)).toEqual([])
  })

  it("rejeita textos e coordenadas fora dos limites", () => {
    const errors = validateReport({
      ...validInput,
      title: "abc",
      description: "x".repeat(REPORT_LIMITS.descriptionMax + 1),
      lat: 91,
      lng: Number.NaN,
    })

    expect(errors).toHaveLength(4)
    expect(errors.join(" ")).toContain("título")
    expect(errors.join(" ")).toContain("descrição")
    expect(errors.join(" ")).toContain("latitude")
    expect(errors.join(" ")).toContain("longitude")
  })

  it("rejeita foto vazia, grande ou com MIME não permitido", () => {
    expect(validatePhoto(new File([], "vazia.jpg", { type: "image/jpeg" }))).toContain(
      "vazia",
    )
    expect(
      validatePhoto(
        new File([new Uint8Array(REPORT_LIMITS.photoMaxBytes + 1)], "foto.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).toContain("5 MB")
    expect(validatePhoto(new File(["x"], "foto.gif", { type: "image/gif" }))).toContain(
      "JPEG",
    )
  })

  it("deriva extensão somente de MIME permitido", () => {
    expect(photoExtension("image/jpeg")).toBe("jpg")
    expect(photoExtension("image/webp")).toBe("webp")
    expect(() => photoExtension("image/gif")).toThrow()
  })
})
