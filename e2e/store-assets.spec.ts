// Optional artifact capture. Real OSM tiles only; Auth/reports remain synthetic.
import { mkdir } from "node:fs/promises"
import { test, expect, openList, openReport } from "./fixtures"
test.use({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
})
test("capturar materiais da loja", async ({ page, backend }) => {
  test.skip(
    process.env.ZELADF_STORE_ASSETS !== "1",
    "Captura opcional, fora da suite funcional",
  )
  await mkdir("release/assets", { recursive: true })
  backend.liveTiles = true
  backend.rows[0].title = "Buraco na via da Asa Sul"
  backend.rows[0].description =
    "Buraco na faixa da direita, próximo ao cruzamento. Atenção ao passar pelo local."
  backend.rows[1].title = "Iluminação da via restabelecida"
  backend.rows[1].description = "A iluminação do trecho voltou a funcionar."
  await backend.open(page, true)
  await expect
    .poll(() => page.locator(".leaflet-tile-loaded").count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(3)
  await page.screenshot({
    path: "release/assets/01-mapa.jpg",
    type: "jpeg",
    quality: 95,
  })
  await openList(page, true)
  await page.screenshot({
    path: "release/assets/02-avisos.jpg",
    type: "jpeg",
    quality: 95,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Fechar", exact: true }).click()
  await openReport(page, true, backend.rows[0].title)
  await page.screenshot({
    path: "release/assets/03-detalhe.jpg",
    type: "jpeg",
    quality: 95,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.goto("/release/feature-graphic.svg")
  await expect(page.locator("svg")).toBeVisible()
  // CSS scale gives exactly 1024x500, independently of the device pixel ratio.
  await page
    .locator("svg")
    .screenshot({
      path: "release/assets/feature-graphic.jpg",
      type: "jpeg",
      quality: 95,
      scale: "css",
    })
})
