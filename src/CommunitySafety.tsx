import { useEffect, useRef, useState } from "react"
import { useAuth } from "./auth/AuthProvider"
import { AuthModal } from "./auth/AuthModal"
import {
  blockReportAuthor,
  clearCommunityBlocks,
  flagReport,
  FLAG_REASONS,
  type FlagReason,
} from "./lib/communitySafety"

export function CommunitySafety({
  reportId,
  isOwner,
  onChanged,
}: {
  reportId: string
  isOwner: boolean
  onChanged: () => void
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [target, setTarget] = useState<"report" | "author">("report")
  const [reason, setReason] = useState<FlagReason>("spam")
  const [details, setDetails] = useState("")
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const active = useRef(true)
  const pending = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const start = () => {
    if (!user) setShowAuth(true)
    else setOpen((value) => !value)
  }
  const perform = async (block: boolean) => {
    if (!user || pending.current || (block && !confirmBlock)) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      if (block) {
        await blockReportAuthor(reportId)
        if (active.current) onChanged()
      } else {
        const id = await flagReport(reportId, target, reason, details)
        if (active.current) setReceipt(id)
      }
    } catch (err) {
      if (active.current)
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível concluir. Tente novamente.",
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <section className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={start}
        aria-expanded={open}
        className="min-h-11 w-full text-sm text-ash underline underline-offset-2"
      >
        Denunciar ou bloquear
      </button>
      {open && (
        <div className="space-y-3 border border-line bg-concrete/40 p-3 text-sm">
          <p>
            Denuncie conteúdo ou comportamento que viole as regras. Sua conta
            não será mostrada ao autor.
          </p>
          {receipt ? (
            <p role="status">
              Denúncia recebida para análise. Protocolo:{" "}
              <span className="break-all font-mono text-xs">{receipt}</span>
            </p>
          ) : (
            <>
              <label className="block">
                O que denunciar?
                <select
                  aria-label="O que denunciar?"
                  value={target}
                  onChange={(e) =>
                    setTarget(e.target.value as "report" | "author")
                  }
                  disabled={busy}
                  className="mt-1 block w-full border border-line bg-paper p-2"
                >
                  <option value="report">Este aviso</option>
                  <option value="author">O autor deste aviso</option>
                </select>
              </label>
              <label className="block">
                Motivo
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as FlagReason)}
                  disabled={busy}
                  className="mt-1 block w-full border border-line bg-paper p-2"
                >
                  {Object.entries(FLAG_REASONS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Detalhes (opcional)
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={500}
                  disabled={busy}
                  className="mt-1 block w-full border border-line bg-paper p-2"
                />
              </label>
              <p className="text-xs text-ash">
                Não inclua telefone, documentos ou outros dados pessoais na
                denúncia.
              </p>
              <button
                type="button"
                onClick={() => void perform(false)}
                disabled={busy}
                className="min-h-11 w-full border border-terracota px-3 py-2 text-terracota disabled:opacity-50"
              >
                {busy ? "Aguarde…" : "Enviar denúncia"}
              </button>
            </>
          )}
          {!isOwner && (
            <div className="border-t border-line pt-3">
              <p className="text-xs">
                Bloquear oculta os avisos desta conta enquanto você estiver
                conectado. Você pode desfazer em Conta.
              </p>
              <label className="my-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmBlock}
                  onChange={(e) => setConfirmBlock(e.target.checked)}
                  disabled={busy}
                />
                Quero ocultar os avisos deste autor.
              </label>
              <button
                type="button"
                onClick={() => void perform(true)}
                disabled={busy || !confirmBlock}
                className="min-h-11 w-full border border-line px-3 py-2 disabled:opacity-50"
              >
                Bloquear autor
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-terracota">
              {error}
            </p>
          )}
        </div>
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </section>
  )
}

export function CommunityBlocks({ onChanged }: { onChanged: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const clear = async () => {
    if (!confirmed || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await clearCommunityBlocks()
      if (active.current) {
        setConfirmed(false)
        setMessage("Os autores foram desbloqueados.")
        onChanged()
      }
    } catch (err) {
      if (active.current)
        setMessage(
          err instanceof Error ? err.message : "Não foi possível desbloquear.",
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <section className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
      <h3 className="font-semibold">Autores bloqueados</h3>
      <p>Desbloquear volta a mostrar os avisos das contas que você bloqueou.</p>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={busy}
        />
        Quero desbloquear todos os autores.
      </label>
      <button
        type="button"
        onClick={() => void clear()}
        disabled={!confirmed || busy}
        className="min-h-11 border border-line px-3 py-2 disabled:opacity-50"
      >
        Desbloquear autores
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  )
}
