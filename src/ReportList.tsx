import { CATEGORIES, STATUS_LABEL, type CategoryId, type Report, type Status } from './data'

const CATEGORY_LIST = Object.values(CATEGORIES)

const STATUS_DOT: Record<Status, string> = {
  aberto: '#c0533a',
  andamento: '#d9a520',
  resolvido: '#4a7a3f',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.round(diff / 3.6e6)
  if (h < 1) return 'agora há pouco'
  if (h < 24) return `há ${h}h`
  const d = Math.round(h / 24)
  return `há ${d}d`
}

export function ReportList({
  reports,
  selectedId,
  activeCats,
  statusFilter,
  truncated,
  onToggleCat,
  onStatus,
  onSelect,
}: {
  reports: Report[]
  selectedId: string | null
  activeCats: Set<CategoryId>
  statusFilter: Status | 'todos'
  truncated: boolean
  onToggleCat: (id: CategoryId) => void
  onStatus: (s: Status | 'todos') => void
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
          Filtrar por tipo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_LIST.map((c) => {
            const on = activeCats.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => onToggleCat(c.id)}
                style={on ? { background: c.color, borderColor: c.color } : undefined}
                className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
                  on ? 'text-paper' : 'border-line text-ash hover:border-ink hover:text-ink'
                }`}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex gap-1.5">
          {(['todos', 'aberto', 'andamento', 'resolvido'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStatus(s)}
              className={`flex-1 border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                statusFilter === s
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line text-ash hover:border-ink hover:text-ink'
              }`}
            >
              {s === 'todos' ? 'todos' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {truncated && (
          <p className="mt-3 border-l-2 border-terracota bg-terracota/[0.06] px-3 py-2 text-xs leading-relaxed text-ash" role="status">
            Mostrando os {reports.length} avisos mais recentes nesta área. Aproxime o mapa para refinar.
          </p>
        )}
      </div>

      <ul className="flex flex-col">
        {reports.map((r) => {
          const c = CATEGORIES[r.category]
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                className={`flex w-full gap-3 border-b border-line px-5 py-3.5 text-left transition-colors hover:bg-concrete ${
                  selectedId === r.id ? 'bg-concrete' : ''
                }`}
              >
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm text-sm"
                  style={{ background: c.color + '22' }}
                >
                  {c.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold">{r.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ash">
                    {r.ra} · {r.address}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ash">
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: STATUS_DOT[r.status] }}
                      />
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span>·</span>
                    <span>▲ {r.confirmations}</span>
                    <span>·</span>
                    <span>{timeAgo(r.createdAt)}</span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
        {reports.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-ash">
            Nenhum aviso com esses filtros.
          </li>
        )}
      </ul>

      <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-ash">
        Órgão responsável indicado é uma orientação. Emergências:{' '}
        <span className="font-mono text-ink">193 / 199</span>.
      </p>
    </div>
  )
}
