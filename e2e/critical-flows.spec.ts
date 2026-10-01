import {
  test,
  expect,
  openList,
  openReport,
  USER_ID,
  RECEIPT_ID,
  PHOTO,
} from "./fixtures"

test("filtro Meus avisos indisponível recupera o mapa mobile", async ({
  page,
  backend,
  isMobile,
}) => {
  test.skip(!isMobile, "O filtro existe no layout mobile")
  backend.missingMyReports = true
  await backend.open(page, true)
  const filter = page.getByRole("button", { name: "Meus avisos", exact: true })
  await filter.click()
  await expect(filter).toHaveAttribute("aria-pressed", "false")
  await expect(
    page.getByText(/O filtro Meus avisos está indisponível/),
  ).toBeVisible()
  await openList(page, isMobile)
  await expect(
    page.getByRole("button", { name: /Buraco de teste na via/ }),
  ).toBeVisible()
})

test("visitante consulta mapa, filtros e identidade pública sem controles de autor", async ({
  page,
  backend,
  isMobile,
}, info) => {
  await backend.open(page)
  await expect(page.locator(".leaflet-container")).toBeVisible()
  await openList(page, isMobile)
  await page.getByRole("button", { name: "Resolvido", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /Iluminação de teste resolvida/ }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Buraco de teste na via/ }),
  ).toBeHidden()
  await page.getByRole("button", { name: "todos", exact: true }).click()
  await page.getByRole("button", { name: /Buraco de teste na via/ }).click()
  await expect(page.getByText("Cidadão", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Editar|🗑️ Excluir|Atualizar status/ }),
  ).toHaveCount(0)
  const reads = backend.calls.filter((call) => call.path === "/rest/v1/reports")
  expect(reads.length).toBeGreaterThan(0)
  expect(
    reads.every(
      (call) =>
        !/author_id|author_name|user_id/.test(call.query.get("select") ?? ""),
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath("detalhe.png"),
    fullPage: true,
  })
})

test("visitante precisa entrar antes de publicar ou votar", async ({
  page,
  backend,
  isMobile,
}) => {
  await backend.open(page)
  await page.getByRole("button", { name: /Novo aviso|Avisar/ }).click()
  await expect(
    page.getByRole("heading", { name: "Entrar no ZelaDF" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Fechar", exact: true }).click()
  await openReport(page, isMobile)
  await page.getByRole("button", { name: /Confirmo que existe/ }).click()
  await expect(
    page.getByRole("heading", { name: "Entrar no ZelaDF" }),
  ).toBeVisible()
  expect(backend.count("/rest/v1/reports")).toBe(0)
  expect(backend.count("/rest/v1/rpc/set_report_vote")).toBe(0)
})

test("login por e-mail trata falha, verifica código e encerra sessão", async ({
  page,
  backend,
}) => {
  await backend.open(page)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.getByPlaceholder("seu@email.com").fill("cidadao@example.invalid")
  backend.failOtp = true
  await page.getByRole("button", { name: "Enviar código", exact: true }).click()
  await expect(page.getByPlaceholder("seu@email.com")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Enviar código", exact: true }),
  ).toBeEnabled()
  backend.failOtp = false
  await page.getByRole("button", { name: "Enviar código", exact: true }).click()
  await page.getByPlaceholder("000000").fill("123456")
  await page.getByRole("button", { name: "Verificar", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Entrar no ZelaDF" }),
  ).toBeHidden()
  await page.getByRole("button", { name: "Sair", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible()
  expect(backend.count("/auth/v1/verify")).toBe(1)
  expect(backend.count("/auth/v1/logout")).toBe(1)
})

test("espera de OTP persiste ao fechar e recarregar e libera reenvio", async ({
  page,
  backend,
}) => {
  await backend.open(page)
  await page.clock.install()
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.getByPlaceholder("seu@email.com").fill("cidadao@example.invalid")
  await page.getByRole("button", { name: "Enviar código", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /Reenviar código em/ }),
  ).toBeDisabled()
  await page.getByRole("button", { name: "Fechar", exact: true }).click()
  await page.reload()
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.getByPlaceholder("seu@email.com").fill("cidadao@example.invalid")
  await expect(
    page.getByRole("button", { name: /Enviar código em/ }),
  ).toBeDisabled()
  expect(backend.count("/auth/v1/otp")).toBe(1)
  await page.clock.fastForward(61_000)
  await page.getByRole("button", { name: "Enviar código", exact: true }).click()
  await expect(page.getByPlaceholder("000000")).toBeVisible()
  expect(backend.count("/auth/v1/otp")).toBe(2)
})

test("falha de leitura mostra erro e permite recuperação sem dados de demonstração", async ({
  page,
  backend,
}) => {
  backend.failRead = true
  await backend.open(page)
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível carregar os avisos",
  )
  await expect(page.getByText(/Modo demonstração/)).toHaveCount(0)
  backend.failRead = false
  await page
    .getByRole("button", { name: "tentar novamente", exact: true })
    .click()
  await expect(page.getByRole("alert")).toBeHidden()
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(2)
})

test("voto lento bloqueia repetição, falha desfaz contagem e permite nova tentativa", async ({
  page,
  backend,
  isMobile,
}) => {
  await backend.open(page, true)
  await openReport(page, isMobile)
  backend.voteDelay = 700
  backend.failVote = true
  await page.getByRole("button", { name: /Confirmo que existe/ }).click()
  await expect(
    page.getByRole("button", { name: /Atualizando…/ }),
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: /Confirmo que existe/ }),
  ).toContainText("(2)")
  expect(backend.count("/rest/v1/rpc/set_report_vote")).toBe(1)
  backend.failVote = false
  await page.getByRole("button", { name: /Confirmo que existe/ }).click()
  await expect(
    page.getByRole("button", { name: /Você confirmou/ }),
  ).toContainText("(3)")
  await page.getByRole("button", { name: /Você confirmou/ }).click()
  await expect(
    page.getByRole("button", { name: /Confirmo que existe/ }),
  ).toContainText("(2)")
  expect(
    backend.calls
      .filter((call) => call.path === "/rest/v1/votes")
      .every((call) => call.method === "GET"),
  ).toBe(true)
})

test("criação valida consentimento e foto, envia apenas campos públicos", async ({
  page,
  backend,
}) => {
  await backend.open(page, true)
  await page.getByRole("button", { name: /Novo aviso|Avisar/ }).click()
  await expect(
    page.getByText("Toque no mapa para marcar o local", { exact: false }),
  ).toBeVisible()
  await page
    .locator(".leaflet-container")
    .click({ position: { x: 90, y: 200 } })
  const form = page.locator("form")
  expect(backend.geocodingRequests).toBe(0)
  await form
    .getByRole("button", { name: "Sugerir endereço", exact: true })
    .click()
  await expect(form.getByRole("alert")).toContainText(
    "Preencha os campos manualmente",
  )
  expect(backend.geocodingRequests).toBe(1)
  await form
    .getByPlaceholder("Ex.: Buraco fundo na faixa da direita")
    .fill("Novo aviso sintético")
  await form.getByPlaceholder("Asa Sul", { exact: true }).fill("Asa Sul")
  await form.getByPlaceholder("SQS 510").fill("Endereço de teste")
  await expect(
    form.getByRole("button", { name: "Publicar aviso" }),
  ).toBeDisabled()
  const fileInput = form.locator("input[type=file]:not([capture])")
  await fileInput.setInputFiles({
    name: "invalid.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  })
  await expect(form.getByRole("alert")).toBeVisible()
  await expect(form.getByAltText("Prévia", { exact: true })).toHaveCount(0)
  await fileInput.setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: PHOTO,
  })
  await expect(form.getByAltText("Prévia", { exact: true })).toBeVisible()
  await form.getByRole("checkbox").check()
  backend.failSafety = true
  await form.getByRole("button", { name: "Publicar aviso" }).click()
  await expect(form.getByRole("alert")).toContainText("Não foi possível")
  expect(backend.count("/rest/v1/reports", "POST")).toBe(0)
  expect(
    backend.calls.some(
      (call) => call.method === "POST" && call.path.startsWith("/storage/"),
    ),
  ).toBe(false)
  await expect(form.getByAltText("Prévia", { exact: true })).toBeVisible()
  backend.failSafety = false
  await form.getByRole("button", { name: "Publicar aviso" }).click()
  await expect(
    page.getByRole("heading", { name: "Novo aviso sintético", exact: true }),
  ).toBeVisible()
  const creation = backend.calls.find(
    (call) => call.path === "/rest/v1/reports" && call.method === "POST",
  )!
  expect(Object.keys(creation.body!).sort()).toEqual([
    "address",
    "category",
    "description",
    "lat",
    "lng",
    "photo_url",
    "ra",
    "title",
  ])
  expect(backend.termsAccepted).toBe(true)
  const consentIndex = backend.calls.findIndex(
    (call) => call.path === "/rest/v1/rpc/accept_community_terms",
  )
  const uploadIndex = backend.calls.findIndex(
    (call) => call.method === "POST" && call.path.startsWith("/storage/"),
  )
  expect(consentIndex).toBeGreaterThanOrEqual(0)
  expect(uploadIndex).toBeGreaterThan(consentIndex)
  expect(
    backend.calls.some(
      (call) =>
        call.method === "POST" &&
        call.path.startsWith(`/storage/v1/object/report-photos/${USER_ID}/`),
    ),
  ).toBe(true)
})

test("edição e exclusão exigem confirmação e linha retornada antes de limpar foto", async ({
  page,
  backend,
  isMobile,
}) => {
  backend.rows[0].photo_url = `https://e2e.supabase.invalid/storage/v1/object/public/report-photos/${USER_ID}/old.png`
  await backend.open(page, true)
  await openReport(page, isMobile)
  await page.getByRole("button", { name: /✏️ Editar/ }).click()
  await page.getByRole("textbox").first().fill("Aviso editado no navegador")
  backend.failSafety = true
  await page.getByRole("button", { name: /✓ Salvar/ }).click()
  await expect(page.getByRole("alert")).toContainText("Não foi possível")
  expect(backend.count("/rest/v1/reports", "PATCH")).toBe(0)
  await expect(page.getByRole("textbox").first()).toHaveValue("Aviso editado no navegador")
  backend.failSafety = false
  await page.getByRole("button", { name: /✓ Salvar/ }).click()
  await expect(
    page.getByRole("heading", { name: "Aviso editado no navegador" }),
  ).toBeVisible()
  backend.failDelete = true
  await page.getByRole("button", { name: /🗑️ Excluir/ }).click()
  expect(backend.count("/rest/v1/reports", "DELETE")).toBe(0)
  await page
    .getByRole("button", { name: "Confirmar exclusão?", exact: true })
    .click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível confirmar a exclusão" }),
  ).toBeVisible()
  expect(backend.count("/storage/v1/object/report-photos", "DELETE")).toBe(0)
  backend.failDelete = false
  await page.getByRole("button", { name: /🗑️ Excluir/ }).click()
  await page
    .getByRole("button", { name: "Confirmar exclusão?", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Aviso editado no navegador" }),
  ).toBeHidden()
  expect(backend.count("/storage/v1/object/report-photos", "DELETE")).toBe(1)
})

test("conta não autora não recebe edição ou exclusão", async ({
  page,
  backend,
  isMobile,
}) => {
  backend.owned.clear()
  await backend.open(page, true)
  await openReport(page, isMobile)
  await expect(
    page.getByRole("button", { name: /✏️ Editar|🗑️ Excluir|Atualizar status/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /Confirmo que existe/ }),
  ).toBeEnabled()
})

test("operador precisa justificar transição e vê histórico retornado", async ({
  page,
  backend,
  isMobile,
}) => {
  backend.operator = true
  await backend.open(page, true)
  await openReport(page, isMobile)
  await page
    .getByRole("button", { name: "Atualizar status", exact: true })
    .click()
  await expect(page.getByRole("alert")).toBeVisible()
  expect(backend.count("/rest/v1/rpc/change_report_status")).toBe(0)
  await page
    .locator("textarea")
    .fill("Verificação sintética da equipe de teste.")
  await page
    .getByRole("button", { name: "Atualizar status", exact: true })
    .click()
  await expect(
    page.getByText("Verificação sintética da equipe de teste.", {
      exact: true,
    }),
  ).toBeVisible()
  expect(backend.count("/rest/v1/rpc/change_report_status")).toBe(1)
  expect(
    backend.calls.some(
      (call) => call.path === "/rest/v1/reports" && call.method === "PATCH",
    ),
  ).toBe(false)
})

test("solicitação de exclusão mantém foco, exige confirmação e recupera protocolo", async ({
  page,
  backend,
}, info) => {
  await backend.open(page, true)
  const entry = page.getByRole("button", {
    name: "Solicitar exclusão da conta",
    exact: true,
  })
  await entry.click()
  const dialog = page.getByRole("dialog", { name: "Excluir conta e dados" })
  const submit = dialog.getByRole("button", {
    name: "Registrar solicitação",
    exact: true,
  })
  await expect(submit).toBeDisabled()
  await dialog
    .getByRole("checkbox", { name: /Quero solicitar a exclusão/ })
    .focus()
  // A native modal makes the background inert, including programmatic focus.
  await entry.evaluate((element) => element.focus())
  await expect(
    dialog.getByRole("checkbox", { name: /Quero solicitar a exclusão/ }),
  ).toBeFocused()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab")
    // Chromium may move focus to browser chrome (activeElement becomes body).
    // No background control in the document may receive focus.
    expect(
      await dialog.evaluate((element) => ({
        modal: element.matches(":modal"),
        backgroundFocused:
          document.activeElement !== document.body &&
          !element.contains(document.activeElement),
      })),
    ).toEqual({ modal: true, backgroundFocused: false })
  }
  await dialog
    .getByRole("checkbox", { name: /Quero solicitar a exclusão/ })
    .check()
  await submit.click()
  await expect(dialog.getByRole("status")).toContainText(RECEIPT_ID)
  await expect(dialog.getByRole("status")).toContainText(
    "ainda não foi concluída",
  )
  await page.screenshot({ path: info.outputPath("protocolo.png") })
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(entry).toBeFocused()
  await entry.click()
  await expect(dialog.getByRole("status")).toContainText(RECEIPT_ID)
  expect(backend.count("/rest/v1/rpc/request_account_deletion")).toBe(1)
  await dialog
    .getByRole("button", { name: "Fechar solicitação de exclusão" })
    .click()
  await expect(dialog).toBeHidden()
  await expect(entry).toBeFocused()
})

test("falha no pedido de exclusão não inventa protocolo e permite tentar novamente", async ({
  page,
  backend,
}) => {
  await backend.open(page, true, "/?account-deletion=1")
  backend.failRequest = true
  const dialog = page.getByRole("dialog", { name: "Excluir conta e dados" })
  await dialog
    .getByRole("checkbox", { name: /Quero solicitar a exclusão/ })
    .check()
  await dialog
    .getByRole("button", { name: "Registrar solicitação", exact: true })
    .click()
  await expect(dialog.getByRole("alert")).toContainText(
    "Não foi possível confirmar o registro",
  )
  await expect(dialog.getByText(/Protocolo:/)).toHaveCount(0)
  backend.failRequest = false
  await dialog
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click()
  await dialog
    .getByRole("button", { name: "Registrar solicitação", exact: true })
    .click()
  await expect(dialog.getByRole("status")).toContainText(RECEIPT_ID)
  expect(backend.consoleMessages.join("\n")).not.toContain(
    "synthetic-refresh-token",
  )
})

test("páginas públicas abrem o pedido sem exigir Android e login fica acessível", async ({
  page,
  backend,
}) => {
  await backend.open(page, false, "/")
  await page.goto("/privacy.html")
  await expect(
    page.getByRole("heading", { name: "Política de Privacidade - ZelaDF" }),
  ).toBeVisible()
  await page
    .getByRole("link", {
      name: "Solicitar exclusão da conta e dos dados",
      exact: true,
    })
    .click()
  await page
    .getByRole("link", { name: "Abrir solicitação de exclusão", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Excluir conta e dados" })
  await dialog
    .getByRole("button", { name: "Entrar para solicitar exclusão" })
    .click()
  await expect(page.getByPlaceholder("seu@email.com")).toBeVisible()
  await page.getByPlaceholder("seu@email.com").fill("cidadao@example.invalid")
  await page.getByRole("button", { name: "Enviar código", exact: true }).click()
  await page.getByPlaceholder("000000").fill("123456")
  await page.getByRole("button", { name: "Verificar", exact: true }).click()
  await expect(
    dialog.getByRole("button", { name: "Registrar solicitação", exact: true }),
  ).toBeVisible()
  expect(backend.count("/rest/v1/rpc/request_account_deletion")).toBe(0)
})

test("GPS só é solicitado por ação do usuário e a negativa preserva o mapa", async ({
  page,
  backend,
}) => {
  await page.addInitScript(() => {
    let requests = 0
    Object.defineProperty(window, "__gpsRequests", { get: () => requests })
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (_success: PositionCallback, error: PositionErrorCallback) => {
        requests++
        error({
          code: 1,
          message: "User denied geolocation",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        })
      },
    })
  })
  await backend.open(page)
  expect(await page.evaluate(() => Reflect.get(window, "__gpsRequests"))).toBe(
    0,
  )
  await page.getByTitle("Minha localização", { exact: true }).click()
  await expect(page.getByText(/Localização bloqueada/)).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, "__gpsRequests"))).toBe(
    1,
  )
  await expect(page.locator(".leaflet-container")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Novo aviso|Avisar/ }),
  ).toBeEnabled()
})

test("GPS permitido centraliza o mapa somente após o toque", async ({ page, backend }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (success: PositionCallback) => success({
        coords: { latitude: -15.86, longitude: -48.04, accuracy: 10,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now(),
      } as GeolocationPosition),
    })
  })
  await backend.open(page)
  await page.getByTitle("Minha localização", { exact: true }).click()
  await expect.poll(() => backend.calls.filter(call => call.path === "/rest/v1/reports")
    .some(call => call.query.getAll("lat").some(value => value.startsWith("gte.-15.8")))).toBe(true)
  await expect(page.getByText(/GPS indisponível|Localização bloqueada/)).toHaveCount(0)
  expect(backend.geocodingRequests).toBe(0)
})

test("GPS indisponível permite continuar usando o mapa", async ({ page, backend }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (_success: PositionCallback, error: PositionErrorCallback) => error({
        code: 2, message: "Position unavailable", PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
      }),
    })
  })
  await backend.open(page)
  await page.getByTitle("Minha localização", { exact: true }).click()
  await expect(page.getByText(/GPS indisponível no momento/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Novo aviso|Avisar/ })).toBeEnabled()
})

test("perda de rede mostra erro e permite recuperar os avisos", async ({ page, context, backend }) => {
  await backend.open(page)
  await context.setOffline(true)
  await page.route("**/rest/v1/**", route => route.abort("internetdisconnected"))
  await page.getByTitle("Atualizar avisos", { exact: true }).click()
  await expect(page.getByText(/Não foi possível|Falha ao carregar/).first()).toBeVisible()
  await context.setOffline(false)
  await page.unroute("**/rest/v1/**")
  await page.getByTitle("Atualizar avisos", { exact: true }).click()
  await expect(page.getByText(/Não foi possível carregar os avisos/)).toHaveCount(0)
  await expect(page.locator(".leaflet-container")).toBeVisible()
})

test("substituição de foto remove a anterior após salvar", async ({ page, backend, isMobile }) => {
  backend.rows[0].photo_url = `https://e2e.supabase.invalid/storage/v1/object/public/report-photos/${USER_ID}/old.png`
  await backend.open(page, true)
  await openReport(page, isMobile)
  await page.getByRole("button", { name: /✏️ Editar/ }).click()
  await page.locator("input[type=file]").setInputFiles({
    name: "replacement.png", mimeType: "image/png", buffer: PHOTO,
  })
  await page.getByRole("button", { name: /✓ Salvar/ }).click()
  await expect.poll(() => backend.count("/storage/v1/object/report-photos", "DELETE")).toBe(1)
  const update = backend.calls.find(call => call.path === "/rest/v1/reports" && call.method === "PATCH")
  expect(String(update?.body?.photo_url)).toContain(`/report-photos/${USER_ID}/`)
  expect(String(update?.body?.photo_url)).not.toContain("old.png")
})
