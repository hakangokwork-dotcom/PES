'use client'

import { useState, useRef, useEffect } from 'react'
import { getMetric, METRIC_CATEGORIES } from '@/lib/pes/metrics-ontology'

interface MetricInfoProps {
  metricKey: string
  /** Override edilecek değer (hesap zamanında, isteğe bağlı) */
  value?: number | string | null
  /** İkon boyutu (px) */
  size?: number
  /** Sadece icon (true) ya da label + icon (false) */
  iconOnly?: boolean
}

const COLOR_CLASSES: Record<string, string> = {
  green:  'bg-green-100  text-green-700  border-green-200',
  amber:  'bg-amber-100  text-amber-700  border-amber-200',
  red:    'bg-red-100    text-red-700    border-red-200',
  blue:   'bg-blue-100   text-blue-700   border-blue-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
}

export default function MetricInfo({ metricKey, value, size = 14, iconOnly = true }: MetricInfoProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const metric = getMetric(metricKey)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!metric) {
    return iconOnly ? null : <span className="text-xs text-faint">{metricKey}</span>
  }

  return (
    <span ref={ref as React.MutableRefObject<HTMLSpanElement>} className="inline-flex items-center gap-1 relative">
      {!iconOnly && <span className="text-xs text-muted">{metric.label}</span>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center rounded-full text-faint hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
        style={{ width: size + 4, height: size + 4 }}
        title={`${metric.label} — formül & kaynak`}
        aria-label={`${metric.label} bilgisi`}
      >
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm.75 9V7H7v.75h.5V11h-.5v.75h2v-.75H8.75ZM8 4.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 top-full mt-1 w-80 bg-white border border-line-soft rounded-lg shadow-xl p-4 text-left"
          style={{ minWidth: 320 }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h4 className="text-sm font-semibold text-ink">{metric.label}</h4>
              <p className="text-[10px] text-faint uppercase tracking-wider">
                {METRIC_CATEGORIES[metric.category]} · {metric.unit}
                {metric.direction && (
                  <span className="ml-1">
                    {metric.direction === 'higher_better' ? ' · ↑ yüksek iyi' : ' · ↓ düşük iyi'}
                  </span>
                )}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-faint hover:text-gray-700 text-sm">✕</button>
          </div>

          {value !== undefined && value !== null && (
            <div className="mb-3 px-3 py-2 bg-canvas rounded border border-gray-100">
              <div className="text-[10px] uppercase tracking-wider text-faint">Değer</div>
              <div className="text-lg font-mono font-semibold text-ink">
                {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
                <span className="text-xs text-faint ml-1">{metric.unit}</span>
              </div>
            </div>
          )}

          <Section title="Formül">
            <code className="text-xs bg-canvas px-2 py-1.5 rounded block font-mono leading-relaxed">
              {metric.formula}
            </code>
          </Section>

          <Section title="Kaynak">
            <ul className="text-xs space-y-1">
              {metric.sources.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-faint mt-0.5">•</span>
                  <div>
                    <span className="font-mono text-emerald-700">
                      {s.table}{s.column ? `.${s.column}` : ''}
                    </span>
                    {s.label && <span className="text-faint ml-1">— {s.label}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {metric.thresholds && metric.thresholds.length > 0 && (
            <Section title="Eşikler">
              <div className="flex flex-wrap gap-1">
                {metric.thresholds.map((t, i) => {
                  const cls = COLOR_CLASSES[t.color] || COLOR_CLASSES.amber
                  const range = t.min != null && t.max != null
                    ? `${t.min}–${t.max}`
                    : t.min != null ? `≥${t.min}` : t.max != null ? `<${t.max}` : ''
                  return (
                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded border ${cls}`}>
                      {range && <span className="font-mono">{range}</span>} {t.label}
                    </span>
                  )
                })}
              </div>
            </Section>
          )}

          {metric.example && (
            <Section title="Örnek">
              <p className="text-xs text-muted">{metric.example}</p>
            </Section>
          )}

          {metric.notes && (
            <p className="text-[10px] text-faint mt-3 pt-2 border-t border-gray-100 italic">
              {metric.notes}
            </p>
          )}
        </div>
      )}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold mb-1">{title}</div>
      {children}
    </div>
  )
}

// Kategori etiketleri metrics-ontology'den gelir — burada kopyası tutulmuyor.
// (Kopya vardı ve ontolojiye yeni kategori eklenince sessizce tip hatası
//  verdi; tek kaynak olması bunu yapısal olarak engelliyor.)
