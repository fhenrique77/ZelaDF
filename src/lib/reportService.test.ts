import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const preparePhoto = vi.hoisted(() => vi.fn())

vi.mock("./reportPhoto", () => ({ prepareReportPhoto: preparePhoto }))

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storage: { from: vi.fn() },
}))

vi.mock("./supabaseClient", () => ({
  isConfigured: true,
  supabase: supabaseMock,
}))

import {
  createReport,
  changeReportStatus,
  deleteReport,
  fetchMyVotes,
  fetchOperatorAccess,
  fetchReportStatusHistory,
  fetchReports,
  storedPhotoPath,
  setReportVote,
  updateReport,
} from "./reportService"

type QueryResponse = {
  data?: unknown
  error?: unknown
  count?: number | null
}

type QueryMock = ReturnType<typeof createQuery>

function createQuery(response: QueryResponse) {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    limit: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    then: vi.fn(),
    update: vi.fn(),
  }

  for (const method of [
    "delete",
    "eq",
    "gte",
    "in",
    "insert",
    "limit",
    "lte",
    "order",
    "select",
    "single",
    "update",
  ] as const) {
    query[method].mockReturnValue(query)
  }
  query.then.mockImplementation((resolve, reject) =>
    Promise.resolve(response).then(resolve, reject),
  )

  return query
}

function routeQueries(routes: Record<string, QueryMock[]>) {
  supabaseMock.from.mockImplementation((table: string) => {
    const query = routes[table]?.shift()
    if (!query) throw new Error(`Unexpected query for ${table}`)
    return query
  })
}

const dbReport = {
  id: "10000000-0000-0000-0000-000000000001",
  category: "buraco",
  title: "Buraco na via",
  description: "Descrição",
  ra: "Plano Piloto",
  address: "Via de teste",
  lat: -15.79,
  lng: -47.88,
  photo_url: "",
  status: "aberto",
  confirmations: 1,
  created_at: "2026-09-04T12:00:00.000Z",
  author_id: "20000000-0000-0000-0000-000000000001",
  author_name: "Autor",
}

const storage = new Map<string, string>()

describe("reportService", () => {
  beforeAll(() => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    storage.clear()
    supabaseMock.from.mockReset()
    supabaseMock.rpc.mockReset()
    supabaseMock.storage.from.mockReset()
    preparePhoto.mockReset().mockImplementation(async (file: File) => file)
  })

  it("consulta bounds e filtros no banco com limite sentinela", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [dbReport], error: null })

    const result = await fetchReports({
      bounds: { south: -16, west: -48, north: -15, east: -47 },
      categories: ["buraco"],
      status: "aberto",
      userId: dbReport.author_id,
      onlyMine: true,
      limit: 200,
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_my_reports", {
      p_south: -16,
      p_west: -48,
      p_north: -15,
      p_east: -47,
      p_categories: ["buraco"],
      p_status: "aberto",
      p_limit: 201,
    })
    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0]).toMatchObject({ isOwner: true })
    expect(result.truncated).toBe(false)
    expect(result.source).toBe("supabase")
  })

  it("propaga falha remota sem substituir por dados demo", async () => {
    const reportsQuery = createQuery({ data: null, error: { code: "network" } })
    routeQueries({ reports: [reportsQuery] })

    await expect(
      fetchReports({
        bounds: { south: -16, west: -48, north: -15, east: -47 },
      }),
    ).rejects.toMatchObject({ code: "fetch" })
  })

  it.each([
    ["PGRST202", "fetch_mine_unavailable"],
    ["42501", "fetch"],
    ["network", "fetch"],
  ])(
    "classifica erro %s de meus avisos sem consultar dados privados",
    async (remoteCode, expectedCode) => {
      supabaseMock.rpc.mockResolvedValue({
        data: null,
        error: { code: remoteCode },
      })
      await expect(
        fetchReports({
          bounds: { south: -16, west: -48, north: -15, east: -47 },
          userId: dbReport.author_id,
          onlyMine: true,
        }),
      ).rejects.toMatchObject({ code: expectedCode })
      expect(supabaseMock.from).not.toHaveBeenCalled()
    },
  )

  it("separa dados públicos da consulta de autoria da sessão", async () => {
    const reportsQuery = createQuery({ data: [dbReport], error: null })
    routeQueries({ reports: [reportsQuery] })
    supabaseMock.rpc.mockResolvedValue({
      data: [{ report_id: dbReport.id }],
      error: null,
    })

    const result = await fetchReports({
      bounds: { south: -16, west: -48, north: -15, east: -47 },
      userId: dbReport.author_id,
    })

    expect(reportsQuery.select).toHaveBeenCalledWith(
      expect.not.stringContaining("author_"),
    )
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_my_report_ids", {
      p_report_ids: [dbReport.id],
    })
    expect(result.reports[0]).toMatchObject({ isOwner: true })
    expect(result.reports[0]).not.toHaveProperty("authorId")
    expect(result.reports[0]).not.toHaveProperty("authorName")
  })

  it("cria aviso e confirmação inicial do autor", async () => {
    const reportsQuery = createQuery({ data: dbReport, error: null })
    routeQueries({ reports: [reportsQuery] })
    supabaseMock.rpc.mockResolvedValue({
      data: [{ voted: true, confirmations: 1 }],
      error: null,
    })

    const result = await createReport({
      category: "buraco",
      title: "Buraco na via",
      description: "Descrição",
      ra: "Plano Piloto",
      address: "Via de teste",
      lat: -15.79,
      lng: -47.88,
      photoFile: null,
      authorId: dbReport.author_id,
    })

    expect(reportsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Buraco na via",
      }),
    )
    expect(reportsQuery.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        author_id: expect.anything(),
        author_name: expect.anything(),
        confirmations: expect.anything(),
        status: expect.anything(),
      }),
    )
    expect(supabaseMock.rpc).toHaveBeenCalledWith("set_report_vote", {
      p_report_id: dbReport.id,
      p_voted: true,
      p_device_id: expect.any(String),
    })
    expect(result.report).toMatchObject({
      id: dbReport.id,
      category: "buraco",
      isOwner: true,
    })
    expect(result.report).not.toHaveProperty("authorName")
    expect(result.initialVoteFailed).toBe(false)
  })

  it("shows the quota error for a direct report insert", async () => {
    const reportsQuery = createQuery({ data: null, error: { code: "PT429" } })
    routeQueries({ reports: [reportsQuery] })
    await expect(createReport({
      category: "buraco", title: "Buraco na via", description: "Detalhes",
      ra: "Plano Piloto", address: "Via de teste", lat: -15.79, lng: -47.88,
      photoFile: null, authorId: dbReport.author_id,
    })).rejects.toMatchObject({ code: "create", message: expect.stringContaining("Limite de publica") })
    expect(reportsQuery.insert).toHaveBeenCalledOnce()
  })

  it("recusa criação configurada sem identidade autenticada", async () => {
    await expect(
      createReport({
        category: "buraco",
        title: "Buraco na via",
        description: "Descrição",
        ra: "Plano Piloto",
        address: "Via de teste",
        lat: -15.79,
        lng: -47.88,
        photoFile: null,
      }),
    ).rejects.toMatchObject({ code: "create" })

    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(supabaseMock.storage.from).not.toHaveBeenCalled()
  })

  it("define o voto pela RPC e usa a contagem canônica retornada", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ voted: true, confirmations: 2 }],
      error: null,
    })

    const result = await setReportVote(dbReport.id, true)

    expect(supabaseMock.rpc).toHaveBeenCalledWith("set_report_vote", {
      p_report_id: dbReport.id,
      p_voted: true,
      p_device_id: expect.any(String),
    })
    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(result).toEqual({ voted: true, confirmations: 2 })
  })

  it("não consulta votos internos para visitantes", async () => {
    await expect(fetchMyVotes(undefined, [dbReport.id])).resolves.toEqual(
      new Set(),
    )
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it("consulta somente os votos da conta autenticada", async () => {
    const votesQuery = createQuery({
      data: [{ report_id: dbReport.id }],
      error: null,
    })
    routeQueries({ votes: [votesQuery] })

    const result = await fetchMyVotes(dbReport.author_id, [dbReport.id])

    expect(votesQuery.eq).not.toHaveBeenCalled()
    expect(result).toEqual(new Set([dbReport.id]))
  })

  it("exclui o aviso e deixa votos para o cascade do banco", async () => {
    const reportsQuery = createQuery({ data: dbReport, error: null })
    routeQueries({ reports: [reportsQuery] })

    await expect(deleteReport(dbReport.id)).resolves.toEqual({
      photoCleanupFailed: false,
    })

    expect(reportsQuery.delete).toHaveBeenCalledOnce()
    expect(reportsQuery.eq).toHaveBeenCalledWith("id", dbReport.id)
    expect(reportsQuery.select).toHaveBeenCalledWith("id,photo_url")
    expect(reportsQuery.single).toHaveBeenCalledOnce()
  })

  it("remove do bucket a foto pertencente ao aviso excluído", async () => {
    const reportsQuery = createQuery({
      data: {
        id: dbReport.id,
        photo_url:
          "https://example.supabase.co/storage/v1/object/public/report-photos/foto.jpg",
      },
      error: null,
    })
    routeQueries({ reports: [reportsQuery] })
    const remove = vi.fn().mockResolvedValue({ error: null })
    supabaseMock.storage.from.mockReturnValue({ remove })

    await expect(deleteReport(dbReport.id)).resolves.toEqual({
      photoCleanupFailed: false,
    })

    expect(remove).toHaveBeenCalledWith(["foto.jpg"])
  })

  it("não tenta excluir imagens externas", async () => {
    const reportsQuery = createQuery({
      data: { ...dbReport, photo_url: "https://images.unsplash.com/foto.jpg" },
      error: null,
    })
    routeQueries({ reports: [reportsQuery] })

    await deleteReport(dbReport.id)

    expect(supabaseMock.storage.from).not.toHaveBeenCalled()
    expect(storedPhotoPath("https://images.unsplash.com/foto.jpg")).toBeNull()
  })

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "PGRST116" } },
    { data: { id: "outro-aviso", photo_url: "" }, error: null },
  ])(
    "não anuncia exclusão nem remove foto sem confirmar a linha: %j",
    async (response) => {
      routeQueries({ reports: [createQuery(response)] })

      await expect(deleteReport(dbReport.id)).rejects.toMatchObject({
        code: "delete",
      })
      expect(supabaseMock.storage.from).not.toHaveBeenCalled()
    },
  )

  it("avisa quando a exclusão foi confirmada mas o cleanup da foto falhou", async () => {
    routeQueries({
      reports: [
        createQuery({
          data: {
            id: dbReport.id,
            photo_url:
              "https://example.supabase.co/storage/v1/object/public/report-photos/foto.jpg",
          },
          error: null,
        }),
      ],
    })
    supabaseMock.storage.from.mockReturnValue({
      remove: vi
        .fn()
        .mockResolvedValue({ error: { code: "storage_unavailable" } }),
    })

    await expect(deleteReport(dbReport.id)).resolves.toEqual({
      photoCleanupFailed: true,
    })
  })

  it("edita somente os campos permitidos", async () => {
    const reportsQuery = createQuery({
      data: { ...dbReport, title: "Título corrigido" },
      error: null,
    })
    routeQueries({ reports: [reportsQuery] })

    const result = await updateReport({
      id: dbReport.id,
      authorId: dbReport.author_id,
      title: "Título corrigido",
    })

    expect(reportsQuery.update).toHaveBeenCalledWith({
      title: "Título corrigido",
    })
    expect(result.report.title).toBe("Título corrigido")
    expect(result.photoCleanupFailed).toBe(false)
  })

  it("propaga falha de voto para permitir rollback da interface", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "denied" },
    })

    await expect(setReportVote(dbReport.id, true)).rejects.toMatchObject({
      code: "vote",
    })
  })

  it("rejeita resposta de voto sem contagem válida", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ voted: true, confirmations: -1 }],
      error: null,
    })

    await expect(setReportVote(dbReport.id, true)).rejects.toMatchObject({
      code: "vote",
    })
  })

  it("shows the Storage quota error before a direct report insert", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { statusCode: "429", code: "PT429" } })
    supabaseMock.storage.from.mockReturnValue({ upload })
    await expect(createReport({
      category: "buraco", title: "Buraco na via", description: "Detalhes",
      ra: "Plano Piloto", address: "Via de teste", lat: -15.79, lng: -47.88,
      photoFile: new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }),
      authorId: dbReport.author_id,
    })).rejects.toMatchObject({ code: "photo_upload", message: expect.stringContaining("Limite de fotos") })
    expect(upload).toHaveBeenCalledOnce()
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it("interrompe a criação quando o upload falha", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { code: "upload" } })
    supabaseMock.storage.from.mockReturnValue({ upload })
    const photo = new File(["source"], "foto.webp", { type: "image/webp" })
    const prepared = new File(["normalized"], "foto.jpg", { type: "image/jpeg" })
    preparePhoto.mockResolvedValueOnce(prepared)

    await expect(
      createReport({
        category: "buraco",
        title: "Buraco na via",
        description: "Descrição",
        ra: "Plano Piloto",
        address: "Via de teste",
        lat: -15.79,
        lng: -47.88,
        photoFile: photo,
        authorId: dbReport.author_id,
      }),
    ).rejects.toMatchObject({ code: "photo_upload" })

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${dbReport.author_id}/`)),
      prepared,
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    )
    expect(preparePhoto).toHaveBeenCalledWith(photo)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it("remove o upload novo quando a criação no banco falha", async () => {
    const reportsQuery = createQuery({ data: null, error: { code: "insert" } })
    routeQueries({ reports: [reportsQuery] })
    const remove = vi.fn().mockResolvedValue({ error: null })
    supabaseMock.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: {
          publicUrl:
            "https://example.supabase.co/storage/v1/object/public/report-photos/nova.jpg",
        },
      }),
      remove,
    })

    await expect(
      createReport({
        category: "buraco",
        title: "Buraco na via",
        description: "Descrição",
        ra: "Plano Piloto",
        address: "Via de teste",
        lat: -15.79,
        lng: -47.88,
        photoFile: new File(["foto"], "foto.jpg", { type: "image/jpeg" }),
        authorId: dbReport.author_id,
      }),
    ).rejects.toMatchObject({ code: "create" })

    expect(remove).toHaveBeenCalledWith(["nova.jpg"])
  })

  it("remove a foto anterior depois de substituir com sucesso", async () => {
    const newPhotoUrl =
      "https://example.supabase.co/storage/v1/object/public/report-photos/nova.webp"
    const oldPhotoUrl =
      "https://example.supabase.co/storage/v1/object/public/report-photos/antiga.jpg"
    const reportsQuery = createQuery({
      data: { ...dbReport, photo_url: newPhotoUrl },
      error: null,
    })
    routeQueries({ reports: [reportsQuery] })
    const remove = vi.fn().mockResolvedValue({ error: null })
    supabaseMock.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi
        .fn()
        .mockReturnValue({ data: { publicUrl: newPhotoUrl } }),
      remove,
    })

    const result = await updateReport({
      id: dbReport.id,
      authorId: dbReport.author_id,
      title: dbReport.title,
      description: dbReport.description,
      category: "buraco",
      photoFile: new File(["foto"], "foto.webp", { type: "image/webp" }),
      currentPhotoUrl: oldPhotoUrl,
    })

    expect(result.report.photo).toBe(newPhotoUrl)
    expect(result.photoCleanupFailed).toBe(false)
    expect(supabaseMock.storage.from().upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${dbReport.author_id}/`)),
      expect.any(File),
      expect.objectContaining({ contentType: "image/webp", upsert: false }),
    )
    expect(remove).toHaveBeenCalledWith(["antiga.jpg"])
  })

  it("retorna alerta quando o aviso existe mas o voto inicial falha", async () => {
    const reportsQuery = createQuery({ data: dbReport, error: null })
    routeQueries({ reports: [reportsQuery] })
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "denied" },
    })

    const result = await createReport({
      category: "buraco",
      title: "Buraco na via",
      description: "Descrição",
      ra: "Plano Piloto",
      address: "Via de teste",
      lat: -15.79,
      lng: -47.88,
      photoFile: null,
      authorId: dbReport.author_id,
    })

    expect(result.report.id).toBe(dbReport.id)
    expect(result.initialVoteFailed).toBe(true)
  })

  it("consulta o papel operacional pela função protegida", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null })

    await expect(fetchOperatorAccess()).resolves.toBe(true)
    expect(supabaseMock.rpc).toHaveBeenCalledWith("current_user_is_operator")
  })

  it("oculta controles operacionais enquanto a migration não está disponível", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    })

    await expect(fetchOperatorAccess()).resolves.toBe(false)
  })

  it("carrega o histórico sem selecionar o identificador do operador", async () => {
    const historyQuery = createQuery({
      data: [
        {
          id: "30000000-0000-0000-0000-000000000001",
          from_status: "aberto",
          to_status: "andamento",
          reason: "Equipe iniciou a análise.",
          changed_at: "2026-09-04T14:00:00.000Z",
        },
      ],
      error: null,
    })
    routeQueries({ report_status_history: [historyQuery] })

    const history = await fetchReportStatusHistory(dbReport.id)

    expect(historyQuery.select).toHaveBeenCalledWith(
      "id,from_status,to_status,reason,changed_at",
    )
    expect(historyQuery.select).toHaveBeenCalledWith(
      expect.not.stringContaining("changed_by"),
    )
    expect(historyQuery.eq).toHaveBeenCalledWith("report_id", dbReport.id)
    expect(history).toEqual([
      {
        id: "30000000-0000-0000-0000-000000000001",
        fromStatus: "aberto",
        toStatus: "andamento",
        reason: "Equipe iniciou a análise.",
        changedAt: "2026-09-04T14:00:00.000Z",
      },
    ])
  })

  it("altera status somente pela RPC e normaliza o motivo", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    await changeReportStatus({
      reportId: dbReport.id,
      currentStatus: "aberto",
      nextStatus: "andamento",
      reason: "  Equipe iniciou a análise.  ",
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith("change_report_status", {
      p_report_id: dbReport.id,
      p_new_status: "andamento",
      p_reason: "Equipe iniciou a análise.",
    })
  })

  it("rejeita transição inválida antes de acessar o banco", async () => {
    await expect(
      changeReportStatus({
        reportId: dbReport.id,
        currentStatus: "resolvido",
        nextStatus: "andamento",
        reason: "Equipe iniciou a análise.",
      }),
    ).rejects.toMatchObject({ code: "validation" })

    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })
})
