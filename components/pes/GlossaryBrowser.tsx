'use client'

import { useMemo, useState } from 'react'
import type { MetricDefinition } from '@/lib/pes/metrics-ontology'

type Category = { code: string; label: string; count: number }

const THRESHOLD_STYLES: Record<string, string> = {
  green: 'bg-green-100 text-green-700 border-green-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
}

export default function GlossaryBrowser({
  metrics,
  categories,
}: {
  metrics: MetricDefinition[]
  categories: Category[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return metrics.filter((m) => {
      if (active && m.category !== active) return false
      if (!q) return true
      const haystack = [
        m.label, m.key, m.formula, m.notes ?? '', m.example ?? '',
        ...(m.aliases ?? []),
        ...m.sources.map((s) => `${s.table} ${s.column ?? ''} ${s.label}`),
      ].join(' ').toLocaleLowerCase('tr')
      return haystack.includes(q)
    })
  }, [metrics, query, active, ])

  return (
    <div className="space-y-5">
      {/* Arama + kategori filtresi */}
      <div className="space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Terim, formül veya tablo adı ara…"
          className="w-full border border-line rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={active === null} onClick={() => setActive(null)}>
            Tümü ({metrics.length})
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.code} active={active === c.code} onClick={() => setActive(c.code)}>
              {c.label} ({c.count})
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="text-xs text-faint">
        {filtered.length} terim
        {query && ` — "${query}" için`}
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white border border-line-soft rounded-xl p-6 text-center">
          <p className="text-sm text-faint">Eşleşen terim yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const isOpen = expanded === m.key
            return (
              <div key={m.key} className="bg-white border border-line-soft rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : m.key)}
                  className="w-full flex items-baseline gap-3 px-5 py-3.5 hover:bg-canvas transition-colors text-left"
                >
                  <span className="font-medium text-ink">{m.label}</span>
                  <code className="text-xs text-faint font-mono">{m.key}</code>
                  {m.unit && (
                    <span className="text-xs text-faint">{m.unit}</span>
                  )}
                  {m.direction && (
                    <span className="text-xs text-faint">
                      {m.direction === 'higher_better' ? '↑ yüksek iyi' : '↓ düşük iyi'}
                    </span>
                  )}
                  <span className="ml-auto text-faint">{isOpen ? '▾' : '▸'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-canvas">
                    {m.aliases && m.aliases.length > 0 && (
                      <p className="text-xs text-faint">
                        <span className="font-semibold">Literatürde:</span> {m.aliases.join(' · ')}
                      </p>
                    )}

                    <Field title="Formül">
                      <code className="text-xs bg-white border border-line-soft px-2.5 py-1.5 rounded block font-mono text-gray-800">
                        {m.formula}
                      </code>
                    </Field>

                    <Field title="Nereden geliyor">
                      <ul className="text-xs space-y-0.5">
                        {m.sources.map((s, i) => (
                          <li key={i}>
                            <code className="font-mono text-emerald-700">
                              {s.table}{s.column ? `.${s.column}` : ''}
                            </code>
                            <span className="text-faint"> — {s.label}</span>
                          </li>
                        ))}
                      </ul>
                    </Field>

                    {m.thresholds && m.thresholds.length > 0 && (
                      <Field title="Eşikler">
                        <div className="flex flex-wrap gap-1">
                          {m.thresholds.map((t, i) => {
                            const range = t.min != null && t.max != null
                              ? `${t.min}–${t.max}`
                              : t.min != null ? `≥${t.min}` : t.max != null ? `<${t.max}` : ''
                            return (
                              <span
                                key={i}
                                className={`text-[11px] px-2 py-0.5 rounded border ${THRESHOLD_STYLES[t.color]}`}
                              >
                                <span className="font-mono">{range}</span> {t.label}
                              </span>
                            )
                          })}
                        </div>
                      </Field>
                    )}

                    {m.example && (
                      <Field title="Örnek">
                        <p className="text-xs text-muted leading-relaxed">{m.example}</p>
                      </Field>
                    )}

                    {m.notes && (
                      <Field title="Neden böyle">
                        <p className="text-xs text-muted leading-relaxed">{m.notes}</p>
                      </Field>
                    )}

                    {m.literature && (
                      <p className="text-[11px] text-faint italic pt-1">
                        Kaynak: {m.literature}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-accent text-white border-accent'
          : 'bg-white text-muted border-line hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  )
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">
        {title}
      </div>
      {children}
    </div>
  )
}
