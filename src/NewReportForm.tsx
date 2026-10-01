import { useEffect, useRef, useState } from "react"
import { CATEGORIES, type CategoryId, type Report } from "./data"
import { reverseGeocode } from "./lib/geocoding"
import { PRIVACY_POLICY_URL } from "./lib/privacy"
import {
  acceptCommunityTerms,
  COMMUNITY_TERMS_URL,
} from "./lib/communitySafety"
import {
  PHOTO_ACCEPT,
  REPORT_LIMITS,
  validatePhoto,
  validateReport,
} from "./lib/reportValidation"

const CATEGORY_LIST = Object.values(CATEGORIES)

type SubmitData = Omit<Report, "id" | "createdAt" | "confirmations" | "status"> & {
  photoFile: File | null
  idempotencyKey: string
}

export function NewReportForm({
  coords,
  onCancel,
  onSubmit,
}: {
  coords: {
    lat: number
    lng: number
  }
  onCancel: () => void
  onSubmit: (data: SubmitData) => Promise<void>
}) {
  const [category, setCategory] = useState<CategoryId>("buraco")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [ra, setRa] = useState("")
  const [address, setAddress] = useState("")
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publicationAcknowledged, setPublicationAcknowledged] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null)

  const c = CATEGORIES[category]
  const valid =
    title.trim() &&
    ra.trim() &&
    address.trim() &&
    publicationAcknowledged &&
    !submitting

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const photoError = validatePhoto(file)
      if (photoError) {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
        setError(photoError)
        setPhoto(null)
        setPhotoFile(null)
        e.target.value = ""
        return
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const previewUrl = URL.createObjectURL(file)
      previewUrlRef.current = previewUrl
      setPhoto(previewUrl)
      setPhotoFile(file)
      setError(null)
    }
  }

  const handleGeocode = async () => {
    setGeocoding(true)
    setError(null)
    const result = await reverseGeocode(coords.lat, coords.lng)
    if (result.ra) setRa(result.ra)
    if (result.address) setAddress(result.address)
    if (!result.ra || !result.address) {
      setError(
        "Não foi possível sugerir o endereço. Preencha os campos manualmente.",
      )
    }
    setGeocoding(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const errors = validateReport({
      category,
      title,
      description,
      ra,
      address,
      lat: coords.lat,
      lng: coords.lng,
      photoFile,
    })
    if (errors.length > 0) {
      setError(errors[0])
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await acceptCommunityTerms()
      const fingerprint = JSON.stringify([
        category, title.trim(), description.trim(), ra.trim(), address.trim(),
        coords.lat, coords.lng, photoFile?.name, photoFile?.size,
        photoFile?.type, photoFile?.lastModified,
      ])
      if (submissionRef.current?.fingerprint !== fingerprint) {
        submissionRef.current = { fingerprint, key: crypto.randomUUID() }
      }
      await onSubmit({
        category,
        title: title.trim(),
        description: description.trim() || "Sem descrição adicional.",
        ra: ra.trim(),
        address: address.trim(),
        lat: coords.lat,
        lng: coords.lng,
        photo: photo ?? "",
        photoFile,
        idempotencyKey: submissionRef.current.key,
      })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível publicar o aviso. Tente novamente.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="animate-drop scroll-thin max-h-full w-full max-w-md overflow-y-auto border border-line bg-paper shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-display text-lg font-bold">Novo aviso</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ash">
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center text-ash transition-colors hover:text-ink"
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <Label>Tipo de problema</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORY_LIST.map((cat) => {
                const on = category === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    style={
                      on
                        ? {
                            borderColor: cat.color,
                            background: cat.color + "18",
                          }
                        : undefined
                    }
                    className={`flex items-center gap-2 border px-2.5 py-2 text-left text-xs transition-colors ${
                      on ? "text-ink" : "border-line text-ash hover:border-ink"
                    }`}
                  >
                    <span className="text-base">{cat.emoji}</span>
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-l-2 border-cerrado bg-cerrado/[0.06] px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-cerrado">
              Contato sugerido: {c.orgaoSigla}
            </p>
            <p className="text-xs text-ash">{c.orgao}</p>
          </div>

          <div className="border border-line bg-concrete/40 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-ash">
              O preenchimento automático envia as coordenadas selecionadas ao
              Nominatim. Você também pode preencher o endereço manualmente.
            </p>
            <button
              type="button"
              onClick={handleGeocode}
              disabled={geocoding}
              className="mt-2 border border-cerrado px-3 py-1.5 font-display text-xs font-semibold text-cerrado transition-colors hover:bg-cerrado hover:text-paper disabled:opacity-50"
            >
              {geocoding ? "Consultando…" : "Sugerir endereço"}
            </button>
          </div>

          <Field label="Título" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={REPORT_LIMITS.titleMin}
              maxLength={REPORT_LIMITS.titleMax}
              placeholder="Ex.: Buraco fundo na faixa da direita"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Região adm." required>
              <div className="relative">
                <input
                  value={ra}
                  onChange={(e) => setRa(e.target.value)}
                  minLength={REPORT_LIMITS.raMin}
                  maxLength={REPORT_LIMITS.raMax}
                  placeholder={geocoding ? "Detectando…" : "Asa Sul"}
                  className={inputCls}
                />
                {geocoding && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-cerrado border-t-transparent" />
                  </span>
                )}
              </div>
            </Field>
            <Field label="Endereço" required>
              <div className="relative">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  minLength={REPORT_LIMITS.addressMin}
                  maxLength={REPORT_LIMITS.addressMax}
                  placeholder={geocoding ? "Detectando…" : "SQS 510"}
                  className={inputCls}
                />
                {geocoding && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-cerrado border-t-transparent" />
                  </span>
                )}
              </div>
            </Field>
          </div>

          {geocoding && (
            <p role="status" className="text-center text-[11px] text-cerrado">
              Consultando endereço no Nominatim…
            </p>
          )}

          <Field label="Descrição">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={REPORT_LIMITS.descriptionMax}
              rows={3}
              placeholder="Detalhe o problema, há quanto tempo, riscos…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          <div>
            <Label>Foto</Label>
            <input
              ref={fileRef}
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={handleFile}
              hidden
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              hidden
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 border border-dashed border-line px-3 py-2.5 text-left text-sm text-ash transition-colors hover:border-ink hover:text-ink"
            >
              {photo ? (
                <img
                  src={photo}
                  alt="Prévia"
                  className="h-12 w-12 object-cover"
                />
              ) : (
                <span className="grid h-12 w-12 place-items-center bg-concrete text-lg">
                  📷
                </span>
              )}
              {photo ? "Trocar foto do álbum" : "Escolher foto do álbum"}
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="mt-2 min-h-11 w-full border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-concrete"
            >
              Tirar foto
            </button>
            <p className="mt-1 text-[11px] text-ash">
              JPEG, PNG ou WebP, até 5 MB. Evite rostos, placas e outros dados
              pessoais.
            </p>
          </div>

          <label className="flex items-start gap-2 border border-line bg-concrete/40 px-3 py-2.5 text-xs leading-relaxed text-ash">
            <input
              type="checkbox"
              checked={publicationAcknowledged}
              onChange={(event) =>
                setPublicationAcknowledged(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 shrink-0 accent-cerrado"
            />
            <span>
              Entendo que localização exata, endereço, texto e foto do aviso
              serão públicos. Li a{" "}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-cerrado underline underline-offset-2"
              >
                Política de Privacidade
              </a>
              {" e aceito as "}
              <a
                href={COMMUNITY_TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-cerrado underline underline-offset-2"
              >
                Regras da comunidade
              </a>
              .
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="border-l-2 border-terracota bg-terracota/[0.07] px-3 py-2 text-sm text-terracota"
            >
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-line py-2.5 font-display text-sm font-semibold text-ash transition-colors hover:border-ink hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="flex-1 bg-terracota py-2.5 font-display text-sm font-semibold text-paper transition-colors hover:bg-cerrado disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-paper border-t-transparent" />
                Enviando…
              </span>
            ) : (
              "Publicar aviso"
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputCls =
  "w-full border border-line bg-concrete/40 px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ash/70 focus:border-cerrado focus:bg-paper"

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
      {children}
    </p>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash">
        {label}
        {required && <span className="text-terracota"> *</span>}
      </span>
      {children}
    </label>
  )
}
