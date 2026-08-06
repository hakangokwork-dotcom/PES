'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { getMetric, getShortDefinition, METRIC_CATEGORIES } from '@/lib/pes/metrics-ontology'

/**
 * İki kademeli terim yardımı:
 *
 *   BALON  — üzerine gelince (veya odaklanınca) kısa tanım. Okuma akışını
 *            bozmaz; "bu ne demekti" sorusunu yerinde cevaplar.
 *   PENCERE — tıklayınca formül, kaynak tablo, eşikler, örnek ve
 *            gerekçe. "Nereden geliyor, neden böyle" sorusu için.
 *
 * Terimin kendisi metnin içinde kalır (noktalı alt çizgi), ayrı bir ikon
 * aramaya gerek kalmaz.
 */
export default function TermTip({
  termKey,
  children,
  showIcon = false,
}: {
  termKey: string
  /** Gösterilecek metin. Verilmezse ontolojideki etiket kullanılır. */
  children?: React.ReactNode
  /** Metin yerine yalnız (?) ikonu göster */
  showIcon?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)
  const panelId = useId()

  const metric = getMetric(termKey)
  const short = getShortDefinition(termKey)

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

  // Ontolojide tanımsız terim: sessizce düz metin göster, uygulamayı bozma
  if (!metric) return <>{children ?? termKey}</>

  const label = children ?? metric.label

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setHovered(false) }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={
          showIcon
            ? 'inline-flex items-center justify-center w-4 h-4 rounded-full border border-line text-[11px] text-faint hover:border-emerald-500 hover:text-emerald-600 transition-colors align-middle'
            : 'inline text-left underline decoration-dotted decoration-line underline-offset-2 hover:decoration-emerald-600 hover:text-emerald-700 transition-colors cursor-help'
        }
      >
        {showIcon ? '?' : label}
      </button>

      {/* BALON — kısa tanım */}
      {hovered && !open && short && (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1.5 w-64 bg-accent text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
        >
          <span className="block font-semibold mb-0.5">{metric.label}</span>
          <span className="block text-faint leading-snug">{short}</span>
          <span className="block text-faint mt-1 text-[11px]">Detay için tıklayın</span>
        </span>
      )}

      {/* PENCERE — tam açıklama */}
      {open && (
        <span
          id={panelId}
          className="absolute z-50 left-0 top-full mt-1.5 w-96 max-w-[90vw] bg-white border border-line-soft rounded-xl shadow-2xl p-4 text-left block"
        >
          <span className="flex items-start justify-between gap-2 mb-2">
            <span>
              <span className="block text-sm font-semibold text-ink">{metric.label}</span>
              <span className="block text-[11px] text-faint uppercase tracking-wider">
                {METRIC_CATEGORIES[metric.category]} · {metric.unit}
              </span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false) }}
              className="text-faint hover:text-ink text-sm leading-none"
              aria-label="Kapat"
            >
              ✕
            </button>
          </span>

          {metric.aliases && metric.aliases.length > 0 && (
            <span className="block text-[11px] text-faint mb-2">
              Literatürde: {metric.aliases.join(' · ')}
            </span>
          )}

          <Block title="Formül">
            <code className="text-xs bg-canvas px-2 py-1.5 rounded block font-mono leading-relaxed text-ink">
              {metric.formula}
            </code>
          </Block>

          <Block title="Nereden geliyor">
            <span className="block text-xs space-y-0.5">
              {metric.sources.map((s, i) => (
                <span key={i} className="block">
                  <span className="font-mono text-emerald-700">
                    {s.table}{s.column ? `.${s.column}` : ''}
                  </span>
                  <span className="text-faint"> — {s.label}</span>
                </span>
              ))}
            </span>
          </Block>

          {metric.thresholds && metric.thresholds.length > 0 && (
            <Block title="Eşikler">
              <span className="flex flex-wrap gap-1">
                {metric.thresholds.map((t, i) => {
                  const range = t.min != null && t.max != null
                    ? `${t.min}–${t.max}`
                    : t.min != null ? `≥${t.min}` : t.max != null ? `<${t.max}` : ''
                  return (
                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded border ${THRESHOLD_STYLES[t.color]}`}>
                      <span className="font-mono">{range}</span> {t.label}
                    </span>
                  )
                })}
              </span>
            </Block>
          )}

          {metric.example && (
            <Block title="Örnek">
              <span className="block text-xs text-muted leading-relaxed">{metric.example}</span>
            </Block>
          )}

          {metric.notes && (
            <Block title="Neden böyle">
              <span className="block text-xs text-muted leading-relaxed">{metric.notes}</span>
            </Block>
          )}

          {metric.literature && (
            <span className="block text-[11px] text-faint pt-2 border-t border-line-soft italic">
              Kaynak: {metric.literature}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span className="block mb-3">
      <span className="block text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">
        {title}
      </span>
      {children}
    </span>
  )
}

const THRESHOLD_STYLES: Record<string, string> = {
  green: 'bg-green-100 text-green-700 border-green-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  blue: 'bg-canvas text-muted border-line',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
}
