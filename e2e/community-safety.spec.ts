import {
  test,
  expect,
  openReport,
  openList,
  OTHER_ID,
  RECEIPT_ID,
} from "./fixtures"

test("denuncia falha sem inventar protocolo; bloqueio e desbloqueio atualizam avisos", async ({
  page,
  backend,
  isMobile,
}) => {
  await backend.open(page, true)
  await openReport(page, isMobile, "Iluminação de teste resolvida")
  await page
    .getByRole("button", { name: "Denunciar ou bloquear", exact: true })
    .click()
  backend.failSafety = true
  await page
    .getByRole("button", { name: "Enviar denúncia", exact: true })
    .click()
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível concluir",
  )
  await expect(page.getByText(/Protocolo:/)).toHaveCount(0)
  backend.failSafety = false
  await page.getByLabel("O que denunciar?").selectOption("author")
  await page
    .getByRole("button", { name: "Enviar denúncia", exact: true })
    .click()
  await expect(page.getByRole("status")).toContainText(RECEIPT_ID)
  const request = [...backend.calls]
    .reverse()
    .find((call) => call.path === "/rest/v1/rpc/flag_report")!
  expect(request.body).toMatchObject({
    p_report_id: OTHER_ID,
    p_target: "author",
  })
  expect(request.body).not.toHaveProperty("author_id")
  await page
    .getByRole("checkbox", { name: "Quero ocultar os avisos deste autor." })
    .check()
  await page
    .getByRole("button", { name: "Bloquear autor", exact: true })
    .click()
  await expect(
    page.getByText("Autor bloqueado. Para desfazer, abra Conta."),
  ).toBeVisible()
  await openList(page, isMobile)
  await expect(
    page.getByRole("button", { name: /Iluminação de teste resolvida/ }),
  ).toHaveCount(0)
  if (isMobile)
    await page.getByRole("button", { name: "Fechar", exact: true }).click()
  await page
    .getByRole("button", { name: "Solicitar exclusão da conta" })
    .click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByRole("checkbox", { name: "Quero desbloquear todos os autores." })
    .check()
  await dialog
    .getByRole("button", { name: "Desbloquear autores", exact: true })
    .click()
  await expect(dialog.getByRole("status")).toContainText(
    "Os autores foram desbloqueados.",
  )
  await dialog
    .getByRole("button", { name: "Fechar solicitação de exclusão" })
    .click()
  await openList(page, isMobile)
  await expect(
    page.getByRole("button", { name: /Iluminação de teste resolvida/ }),
  ).toBeVisible()
})

test("visitante precisa de login para denunciar e pode consultar as regras", async ({
  page,
  backend,
  isMobile,
}) => {
  await backend.open(page)
  await openReport(page, isMobile)
  await page
    .getByRole("button", { name: "Denunciar ou bloquear", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Entrar no ZelaDF" }),
  ).toBeVisible()
  expect(backend.count("/rest/v1/rpc/flag_report")).toBe(0)
  await page.goto("/terms.html")
  await expect(
    page.getByRole("heading", { name: "Regras da comunidade", exact: true }),
  ).toBeVisible()
})
