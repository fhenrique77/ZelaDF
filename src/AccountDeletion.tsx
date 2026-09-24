import { useEffect, useRef, useState } from "react"
import { useAuth } from "./auth/AuthProvider"
import { AuthModal } from "./auth/AuthModal"
import { PRIVACY_POLICY_URL } from "./lib/privacy"
import { CommunityBlocks } from "./CommunitySafety"
import {
  fetchAccountDeletionRequest,
  requestAccountDeletion,
  type AccountDeletionRequest,
} from "./lib/accountDeletion"

const INTENT_KEY = "zeladf.account-deletion.intent"

function hasIntent() {
  if (
    new URLSearchParams(window.location.search).get("account-deletion") === "1"
  )
    return true
  try {
    return sessionStorage.getItem(INTENT_KEY) === "1"
  } catch {
    return false
  }
}

function rememberIntent(open: boolean) {
  // Only a UI intention, never an identity, token or submitted request.
  try {
    if (open) sessionStorage.setItem(INTENT_KEY, "1")
    else sessionStorage.removeItem(INTENT_KEY)
  } catch {
    /* Navigation remains available when storage is blocked. */
  }
}

export function AccountDeletionEntry({
  onContentChanged = () => {},
}: {
  onContentChanged?: () => void
}) {
  const [open, setOpen] = useState(hasIntent)
  useEffect(() => {
    rememberIntent(open)
  }, [open])

  const close = () => {
    rememberIntent(false)
    const url = new URL(window.location.href)
    url.searchParams.delete("account-deletion")
    window.history.replaceState(window.history.state, "", url)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Solicitar exclusão da conta"
        title="Solicitar exclusão da conta"
        className="min-h-8 px-1 text-xs text-ash underline underline-offset-2 hover:text-cerrado"
      >
        Conta
      </button>
      {open && (
        <AccountDeletionDialog
          onClose={close}
          onContentChanged={onContentChanged}
        />
      )}
    </>
  )
}

type DialogProps = {
  onClose: () => void
  onContentChanged: () => void
}

function AccountDeletionDialog({ onClose, onContentChanged }: DialogProps) {
  const { user, loading: authLoading } = useAuth()
  const dialog = useRef<HTMLDialogElement>(null)
  const active = useRef(false)
  const submitting = useRef(false)
  const [showAuth, setShowAuth] = useState(false)
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null)
  const [loading, setLoading] = useState(Boolean(user))
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    active.current = true
    const element = dialog.current
    element?.showModal()
    return () => {
      active.current = false
      element?.close()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAccountDeletionRequest()
      .then((value) => {
        if (!cancelled) setRequest(value)
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "O canal de exclusão está indisponível no momento. Tente novamente mais tarde.",
          )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, revision])

  const submit = async () => {
    if (!user || !confirmed || submitting.current || loading || request) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const receipt = await requestAccountDeletion()
      if (active.current) setRequest(receipt)
    } catch {
      if (active.current)
        setError(
          "Não foi possível confirmar o registro. Tente novamente; um pedido já recebido não será duplicado.",
        )
    } finally {
      submitting.current = false
      if (active.current) setBusy(false)
    }
  }

  const closeDialog = () => {
    // Close while mounted so the browser can restore focus to the opener.
    dialog.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="account-deletion-title"
      onCancel={(event) => {
        event.preventDefault()
        closeDialog()
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border border-line bg-paper p-5 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          id="account-deletion-title"
          className="font-display text-xl font-bold"
        >
          Excluir conta e dados
        </h2>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Fechar solicitação de exclusão"
          className="min-h-9 min-w-9 text-xl"
        >
          ×
        </button>
      </div>
      <p className="mt-3 text-sm">
        Solicite a exclusão da sua conta ZelaDF, avisos, fotos, votos e
        inscrições de notificações. O pedido será analisado pelo responsável
        antes da remoção dos dados.
      </p>
      <p className="mt-2 text-sm">
        A conta continua ativa enquanto o pedido é atendido. Após a exclusão, os
        dados removidos não poderão ser recuperados pelo aplicativo.
      </p>
      <p className="mt-2 text-sm">
        <a
          className="text-cerrado underline"
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noreferrer"
        >
          Consulte a política de privacidade
        </a>{" "}
        para informações sobre retenção e backups.
      </p>

      {authLoading ? (
        <p role="status" className="mt-4">
          Verificando sessão…
        </p>
      ) : !user ? (
        <div className="mt-5">
          <p className="text-sm">
            Entre na conta que deseja excluir para confirmar a autoria do
            pedido.
          </p>
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="mt-3 bg-cerrado px-4 py-2 text-paper"
          >
            Entrar para solicitar exclusão
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="mt-4">
          Consultando solicitação…
        </p>
      ) : request ? (
        <div role="status" className="mt-5 border border-line p-3">
          <p className="font-semibold">
            {request.status === "in_review"
              ? "Solicitação em análise"
              : "Solicitação recebida"}
          </p>
          <p className="mt-2 break-all text-sm">Protocolo: {request.id}</p>
          <p className="text-sm">
            Registrada em {new Date(request.createdAt).toLocaleString("pt-BR")}
          </p>
          <p className="mt-2 text-sm">
            Este protocolo confirma o pedido. A exclusão da conta ainda não foi
            concluída.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          {!error && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={busy}
                  className="mt-1"
                />
                Quero solicitar a exclusão desta conta e dos dados associados.
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={!confirmed || busy}
                className="mt-4 bg-terracota px-4 py-2 text-paper disabled:opacity-50"
              >
                {busy ? "Registrando…" : "Registrar solicitação"}
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4">
          <p role="alert" className="text-sm text-terracota">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            disabled={busy}
            className="mt-2 text-sm underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {user && <CommunityBlocks onChanged={onContentChanged} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </dialog>
  )
}
