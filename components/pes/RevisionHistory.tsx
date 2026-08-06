'use client'

import { useState } from 'react'
import TermTip from './TermTip'

type Row = {
  staging_id: number
  workshop_id: number
  workshop_code: string | null
  donem: string
  revision_no: number
  source_ref: string | null
  revision_note: string | null
  submitted_at: string
  superseded_at: string | null
  is_current: boolean
  raw: Record<string, unknown>
  total_sc: string | number | null
  quality_status: string | null
}

type Group = { key: string; workshop_code: string; donem: string; revisions: Row[] }

/** Sayısal görünen ham değerleri karşılaştırılabilir hale getirir. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  const norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

/** İki sürüm arasında değişen alanları bulur. */
function diff(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])
  const changes: Array<{ field: string; from: unknown; to: unknown; pct: number | null }> = []

  for (const k of keys) {
    const a = prev?.[k] ?? null
    const b = next?.[k] ?? null
    if (String(a ?? '') === String(b ?? '')) continue

    const an = toNum(a), bn = toNum(b)
    const pct = an !== null && bn !== null && an !== 0 ? ((bn - an) / an) * 100 : null
    changes.push({ field: k, from: a, to: b, pct })
  }
  return changes
}

const fmt = (v: unknown) => {
  const n = toNum(v)
  return n === null ? (v === null || v === undefined || v === '' ? '—' : String(v)) : n.toLocaleString('tr-TR')
}

export default function RevisionHistory({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null)

  const groups: Group[] = Object.values(
    rows.reduce<Record<string, Group>>((acc, r) => {
      const key = `${r.workshop_code}|${r.donem}`
      acc[key] ??= { key, workshop_code: r.workshop_code ?? '—', donem: r.donem, revisions: [] }
      acc[key].revisions.push(r)
      return acc
    }, {}),
  )

  const revised = groups.filter((g) => g.revisions.length > 1)

  if (groups.length === 0) {
    return (
      <div className="bg-white border border-line-soft rounded-xl p-5">
        <p className="text-sm text-faint">
          Henüz içe aktarılmış beyan yok. Beyan yüklendikçe sürümleri burada birikir.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Beyan edilen dönem" value={groups.length} />
        <Stat
          label={<TermTip termKey="beyan_surumu">Revize edilmiş</TermTip>}
          value={revised.length}
          tone={revised.length > 0 ? 'warn' : 'neutral'}
        />
        <Stat
          label={<TermTip termKey="ham_beyan">Toplam sürüm</TermTip>}
          value={rows.length}
        />
      </div>

      <div className="space-y-3">
        {groups.map((g) => {
          const isOpen = open === g.key
          const latest = g.revisions[g.revisions.length - 1]
          const hasRevisions = g.revisions.length > 1

          return (
            <div key={g.key} className="bg-white border border-line-soft rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : g.key)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-canvas transition-colors text-left"
              >
                <span className="font-medium text-ink">{g.workshop_code}</span>
                <span className="text-faint">{g.donem}</span>

                {hasRevisions ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                    {g.revisions.length} sürüm
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-canvas text-faint">
                    tek beyan
                  </span>
                )}

                <span className="ml-auto text-xs text-faint">
                  son: {new Date(latest.submitted_at).toLocaleDateString('tr-TR')}
                </span>
                <span className="text-faint">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-line-soft px-5 py-4 space-y-4 bg-canvas">
                  {g.revisions.map((r, i) => {
                    const prev = i > 0 ? g.revisions[i - 1] : null
                    const changes = prev ? diff(prev.raw, r.raw) : []

                    return (
                      <div key={r.staging_id} className="text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-ink">Sürüm {r.revision_no}</span>
                          {r.is_current ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                              geçerli
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-line-soft text-muted">
                              geçersiz kılındı
                            </span>
                          )}
                          <span className="text-xs text-faint">
                            {new Date(r.submitted_at).toLocaleString('tr-TR')}
                          </span>
                          {r.source_ref && (
                            <code className="text-xs text-faint">{r.source_ref}</code>
                          )}
                          {r.total_sc !== null && (
                            <span className="text-xs text-faint">skor {Number(r.total_sc).toFixed(1)}</span>
                          )}
                        </div>

                        {r.revision_note && (
                          <p className="text-xs text-muted mt-1 italic">“{r.revision_note}”</p>
                        )}

                        {prev && (
                          changes.length === 0 ? (
                            <p className="text-xs text-faint mt-1.5">
                              Bir önceki sürümle aynı değerler.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-1">
                              {changes.map((c) => (
                                <div key={c.field} className="flex items-baseline gap-2 text-xs flex-wrap">
                                  <span className="text-muted min-w-[140px]">{c.field}</span>
                                  <span className="text-faint line-through">{fmt(c.from)}</span>
                                  <span className="text-faint">→</span>
                                  <span className="font-medium text-ink">{fmt(c.to)}</span>
                                  {c.pct !== null && (
                                    <span className={c.pct > 0 ? 'text-red-600' : 'text-green-700'}>
                                      {c.pct > 0 ? '+' : ''}{c.pct.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: React.ReactNode; value: number; tone?: 'warn' | 'neutral' }) {
  return (
    <div className="bg-white border border-line-soft rounded-xl p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-700' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
