import { useEffect, useRef, useState } from "react"
import { CommunitySafety } from "./CommunitySafety"
import {
  CATEGORIES,
  STATUS_LABEL,
  type CategoryId,
  type Report,
  type Status,
} from "./data"
import {
  PHOTO_ACCEPT,
  REPORT_LIMITS,
  validateEditableReport,
  validatePhoto,
} from "./lib/reportValidation"
import { PUBLIC_AUTHOR_NAME } from "./lib/privacy"
import {
  acceptCommunityTerms,
  COMMUNITY_TERMS_URL,
} from "./lib/communitySafety"
import {
  STATUS_REASON_LIMITS,
  allowedStatusTransitions,
} from "./lib/reportStatus"
import type { ReportStatusHistory } from "./lib/reportService"

const STATUS_STYLE: Record<Status, string> = {
  aberto: "bg-terracota text-paper",
  andamento: "bg-[#d9a520] text-ink",
  resolvido: "bg-[#4a7a3f] text-paper",
}

const CATEGORY_LIST = Object.values(CATEGORIES)

export type EditReportData = {
  title: string
  description: string
  category: CategoryId
  photoFile: File | null
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ReportDetail({
  report,
  hasVoted,
  votePending,
  voteUnavailable = false,
  isOwner,
  onClose,
  onVote,
  onDelete,
  onEdit,
  isOperator,
  statusHistory,
  statusHistoryLoading,
  onStatusChange,
  onCommunityChanged = () => {},
}: {
  report: Report
  hasVoted: boolean
  votePending: boolean
  voteUnavailable?: boolean
  isOwner: boolean
  onClose: () => void
  onVote: () => void
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string, data: EditReportData) => Promise<void>
  isOperator: boolean
  statusHistory: ReportStatusHistory[]
  statusHistoryLoading: boolean
  onStatusChange: (id: string, status: Status, reason: string) => Promise<void>
  onCommunityChanged?: () => void
}) {
  const c = CATEGORIES[report.category]
  const telHref = `tel:${c.fone.replace(/[^0-9+]/g, "")}`

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(report.title)
  const [editDesc, setEditDesc] = useState(report.description)
  const [editCat, setEditCat] = useState<CategoryId>(report.category)
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState<Status>(
    allowedStatusTransitions(report.status)[0] ?? report.status,
  )
  const [statusReason, setStatusReason] = useState("")
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const editFileRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  useEffect(() => {
    setNextStatus(allowedStatusTransitions(report.status)[0] ?? report.status)
    setStatusReason("")
    setStatusError(null)
  }, [report.id, report.status])

  const clearEditPhoto = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setEditPhotoFile(null)
    setEditPhotoPreview(null)
    if (editFileRef.current) editFileRef.current.value = ""
  }

  const cancelEditing = () => {
    setEditing(false)
    setEditTitle(report.title)
    setEditDesc(report.description)
    setEditCat(report.category)
    setOperationError(null)
    clearEditPhoto()
  }

  const handleEditPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const photoError = validatePhoto(file)
    if (photoError) {
      setOperationError(photoError)
      event.target.value = ""
      return
    }
    clearEditPhoto()
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setEditPhotoFile(file)
    setEditPhotoPreview(previewUrl)
    setOperationError(null)
  }

  const handleSave = async () => {
    const errors = validateEditableReport({
      title: editTitle,
      description: editDesc,
      category: editCat,
      photoFile: editPhotoFile,
    })
    if (errors.length > 0) {
      setOperationError(errors[0])
      return
    }

    setSaving(true)
    setOperationError(null)
    try {
      await acceptCommunityTerms()
      await onEdit(report.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || "Sem descrição adicional.",
        category: editCat,
        photoFile: editPhotoFile,
      })
      setEditing(false)
      clearEditPhoto()
    } catch (error) {
      setOperationError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as alterações.",
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setOperationError(null)
    try {
      await onDelete(report.id)
    } catch (error) {
      setOperationError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o aviso.",
      )
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const handleStatusChange = async () => {
    setStatusSaving(true)
    setStatusError(null)
    try {
      await onStatusChange(report.id, nextStatus, statusReason)
      setStatusReason("")
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status.",
      )
    } finally {
      setStatusSaving(false)
    }
  }

  return (
    <div className="animate-drop scroll-thin fixed inset-x-0 bottom-0 z-[700] max-h-[85%] overflow-y-auto rounded-t-2xl border border-line bg-paper shadow-[0_-16px_50px_-20px_rgba(22,55,106,0.5)] safe-bottom lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:max-h-[calc(100%-2rem)] lg:w-[340px] lg:rounded-none lg:shadow-[0_24px_60px_-20px_rgba(22,55,106,0.5)]">
      <div className="relative">
        <div className="aspect-[3/2] w-full bg-concrete">
          {report.photo ? (
            <img
              src={report.photo}
              alt={`Foto do problema: ${report.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-concrete text-5xl">
              {c.emoji}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center bg-paper/90 text-ink transition-colors hover:bg-ink hover:text-paper"
          aria-label="Fechar"
        >
          ✕
        </button>
        <span
          className="absolute left-3 top-3 flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-paper"
          style={{ background: c.color }}
        >
          {c.emoji} {c.label}
        </span>
      </div>

      <div className="p-4">
        {/* Modo edição */}
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ash">
                Categoria
              </label>
              <select
                value={editCat}
                onChange={(e) => setEditCat(e.target.value as CategoryId)}
                className="w-full border border-line bg-concrete px-3 py-2 text-sm text-ink outline-none focus:border-cerrado"
              >
                {CATEGORY_LIST.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ash">
                Título
              </label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                minLength={REPORT_LIMITS.titleMin}
                maxLength={REPORT_LIMITS.titleMax}
                className="w-full border border-line bg-concrete px-3 py-2 text-sm text-ink outline-none focus:border-cerrado"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ash">
                Descrição
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={REPORT_LIMITS.descriptionMax}
                rows={3}
                className="w-full resize-none border border-line bg-concrete px-3 py-2 text-sm text-ink outline-none focus:border-cerrado"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ash">
                Substituir foto
              </label>
              <input
                ref={editFileRef}
                type="file"
                accept={PHOTO_ACCEPT}
                capture="environment"
                onChange={handleEditPhoto}
                hidden
              />
              <button
                type="button"
                onClick={() => editFileRef.current?.click()}
                className="flex w-full items-center gap-3 border border-dashed border-line px-3 py-2 text-left text-xs text-ash transition-colors hover:border-ink hover:text-ink"
              >
                {editPhotoPreview || report.photo ? (
                  <img
                    src={editPhotoPreview ?? report.photo}
                    alt="Prévia da foto"
                    className="h-10 w-10 bg-concrete object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 place-items-center bg-concrete text-lg">
                    {c.emoji}
                  </span>
                )}
                {editPhotoFile ? "Nova foto selecionada" : "Escolher nova foto"}
              </button>
              <p className="mt-1 text-[11px] text-ash">
                JPEG, PNG ou WebP, até 5 MB.
              </p>
            </div>
            {operationError && (
              <p
                role="alert"
                className="border-l-2 border-terracota bg-terracota/[0.07] px-3 py-2 text-sm text-terracota"
              >
                {operationError}
              </p>
            )}
            <p className="mb-3 text-xs text-ash">
              Ao salvar, aceito as{" "}
              <a
                href={COMMUNITY_TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                regras da comunidade
              </a>{" "}
              para o texto e a foto que publico.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-cerrado py-2 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep"
              >
                {saving ? "Salvando…" : "✓ Salvar"}
              </button>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="flex-1 border border-line py-2 font-display text-sm font-semibold text-ash transition-colors hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Modo visualização normal */}
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold leading-tight">
                {report.title}
              </h2>
              <span
                className={`shrink-0 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_STYLE[report.status]}`}
              >
                {STATUS_LABEL[report.status]}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-ink/80">
              {report.description}
            </p>

            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
              <Row label="Local">
                {report.ra} · {report.address}
              </Row>
              <Row label="Coordenadas">
                <span className="font-mono text-xs">
                  {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                </span>
              </Row>
              <Row label="Registrado">{fullDate(report.createdAt)}</Row>
              <Row label="Registrado por">{PUBLIC_AUTHOR_NAME}</Row>
            </dl>

            {/* Responsible agency + direct phone — the heart of the app */}
            <div className="mt-4 border-l-2 border-cerrado bg-cerrado/[0.06] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cerrado">
                Órgão sugerido para contato
              </p>
              <p className="mt-1 font-display text-base font-bold text-cerrado-deep">
                {c.orgaoSigla}
              </p>
              <p className="text-xs text-ash">{c.orgao}</p>
              <a
                href={telHref}
                className="mt-3 flex items-center justify-center gap-2 bg-cerrado py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep"
              >
                📞 Ligar {c.fone}
              </a>
            </div>

            <button
              onClick={onVote}
              disabled={votePending || voteUnavailable}
              className={`mt-4 flex w-full items-center justify-center gap-2 border py-2.5 font-display text-sm font-semibold transition-colors ${
                hasVoted
                  ? "border-terracota bg-terracota text-paper"
                  : "border-ink bg-ink text-paper hover:border-terracota hover:bg-terracota"
              } disabled:cursor-wait disabled:opacity-60`}
            >
              {votePending
                ? "Atualizando…"
                : voteUnavailable
                  ? "Confirmação indisponível"
                  : hasVoted
                    ? "✓ Você confirmou"
                    : "▲ Confirmo que existe"}
              <span className="font-mono text-xs opacity-80">
                ({report.confirmations})
              </span>
            </button>
            <p className="mt-2 text-center text-[11px] text-ash">
              {voteUnavailable
                ? "Atualize os avisos para consultar sua confirmação antes de votar."
                : hasVoted
                  ? "Seu voto entrou no total. Toque de novo para remover."
                  : "Um voto por conta. O total registra confirmações da comunidade."}
            </p>

            <CommunitySafety
              reportId={report.id}
              isOwner={isOwner}
              onChanged={onCommunityChanged}
            />
            {isOperator && (
              <section className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cerrado">
                  Operação ZelaDF
                </p>
                <div className="mt-2 grid gap-2">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-ash">
                    Novo status
                  </label>
                  <select
                    value={nextStatus}
                    onChange={(event) =>
                      setNextStatus(event.target.value as Status)
                    }
                    disabled={statusSaving}
                    className="w-full border border-line bg-concrete px-3 py-2 text-sm text-ink outline-none focus:border-cerrado"
                  >
                    {allowedStatusTransitions(report.status).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>

                  <label className="font-mono text-[10px] uppercase tracking-wider text-ash">
                    Motivo
                  </label>
                  <textarea
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                    minLength={STATUS_REASON_LIMITS.min}
                    maxLength={STATUS_REASON_LIMITS.max}
                    rows={3}
                    disabled={statusSaving}
                    className="w-full resize-none border border-line bg-concrete px-3 py-2 text-sm text-ink outline-none focus:border-cerrado"
                  />

                  {statusError && (
                    <p
                      role="alert"
                      className="border-l-2 border-terracota bg-terracota/[0.07] px-3 py-2 text-sm text-terracota"
                    >
                      {statusError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleStatusChange}
                    disabled={statusSaving}
                    className="bg-cerrado py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado-deep disabled:opacity-60"
                  >
                    {statusSaving ? "Atualizando…" : "Atualizar status"}
                  </button>
                </div>

                <div className="mt-4 border-t border-line pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ash">
                    Histórico
                  </p>
                  {statusHistoryLoading ? (
                    <p className="mt-2 text-xs text-ash">Carregando…</p>
                  ) : statusHistory.length === 0 ? (
                    <p className="mt-2 text-xs text-ash">
                      Nenhuma alteração registrada.
                    </p>
                  ) : (
                    <ol className="mt-2 space-y-3">
                      {statusHistory.map((entry) => (
                        <li
                          key={entry.id}
                          className="border-l-2 border-line pl-3"
                        >
                          <p className="text-xs font-semibold text-ink">
                            {STATUS_LABEL[entry.fromStatus]} →{" "}
                            {STATUS_LABEL[entry.toStatus]}
                          </p>
                          <p className="mt-0.5 text-xs text-ink/75">
                            {entry.reason}
                          </p>
                          <time className="mt-1 block font-mono text-[9px] uppercase tracking-wider text-ash">
                            {fullDate(entry.changedAt)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            )}

            {/* Botões do autor: Editar e Excluir */}
            {isOwner && (
              <div className="mt-4 border-t border-line pt-4">
                {operationError && (
                  <p
                    role="alert"
                    className="mb-3 border-l-2 border-terracota bg-terracota/[0.07] px-3 py-2 text-sm text-terracota"
                  >
                    {operationError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditTitle(report.title)
                      setEditDesc(report.description)
                      setEditCat(report.category)
                      clearEditPhoto()
                      setConfirmDelete(false)
                      setEditing(true)
                      setOperationError(null)
                    }}
                    className="flex-1 border border-cerrado py-2 font-display text-sm font-semibold text-cerrado transition-colors hover:bg-cerrado hover:text-paper"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`flex-1 border py-2 font-display text-sm font-semibold transition-colors ${
                      confirmDelete
                        ? "border-red-600 bg-red-600 text-paper"
                        : "border-terracota text-terracota hover:bg-terracota hover:text-paper"
                    }`}
                  >
                    {deleting
                      ? "Excluindo…"
                      : confirmDelete
                        ? "Confirmar exclusão?"
                        : "🗑️ Excluir"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type DetailRowProps = {
  label: string
  children: React.ReactNode
}

function Row({ label, children }: DetailRowProps) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ash">
        {label}
      </dt>
      <dd className="text-right text-ink/90">{children}</dd>
    </div>
  )
}
