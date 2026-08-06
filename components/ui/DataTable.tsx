'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_ROW, type Tone } from '@/lib/ui/tone'

export type Column<T> = {
  key: string
  label: string
  /** Sayısal kolon: sağa dayalı + mono + tabular. */
  numeric?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  sortable?: boolean
  /** Sıralama için ham değer. Verilmezse row[key] kullanılır. */
  sortValue?: (row: T) => number | string | null | undefined
  render?: (row: T) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Eşik altı satırı ince sol şeritle işaretler. */
  rowTone?: (row: T) => Tone
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  loading?: boolean
  /** rows boşken gösterilecek blok (EmptyState) */
  empty?: ReactNode
  /** Üst şerit: arama, dönem rozeti, filtreler */
  toolbar?: ReactNode
  /** Alt şerit: kayıt sayısı, CSV indir */
  footer?: ReactNode
  density?: 'tight' | 'relaxed'
  /** Uzun tablolarda başlık sabitlenir. */
  stickyHeader?: boolean
}

export function DataTable<T>({
  columns, rows, rowKey, rowTone, initialSort, loading = false,
  empty, toolbar, footer, density = 'tight', stickyHeader = true,
}: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find(c => c.key === sort.key)
    if (!col) return rows
    const val = (r: T) =>
      col.sortValue ? col.sortValue(r) : (r as Record<string, unknown>)[col.key] as number | string | null
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const d = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'tr')
      return sort.dir === 'asc' ? d : -d
    })
  }, [rows, sort, columns])

  function toggle(col: Column<T>) {
    if (col.sortable === false) return
    setSort(s =>
      s?.key === col.key
        ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        /* Sayısal kolonda ilk tık büyükten küçüğe — aranan genelde uç değer. */
        : { key: col.key, dir: col.numeric ? 'desc' : 'asc' })
  }

  const pad = density === 'tight' ? 'px-4 py-2.5' : 'px-4 py-3.5'

  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      {toolbar && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">{toolbar}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map(col => {
                const active = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'border-b border-line bg-canvas px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em]',
                      stickyHeader && 'sticky top-0 z-10',
                      active ? 'text-ink' : 'text-faint',
                      col.numeric || col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.sortable === false ? '' : 'cursor-pointer select-none hover:text-ink',
                    )}
                    onClick={() => toggle(col)}
                  >
                    <span className={cn('inline-flex items-center gap-1', (col.numeric || col.align === 'right') && 'flex-row-reverse')}>
                      {col.label}
                      {active && (sort!.dir === 'asc'
                        ? <ArrowUp className="size-3" strokeWidth={2.4} />
                        : <ArrowDown className="size-3" strokeWidth={2.4} />)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.map(row => {
              const tone = rowTone?.(row) ?? 'neutral'
              return (
                <tr key={rowKey(row)} className={cn('border-b border-line-soft last:border-0 hover:bg-canvas', TONE_ROW[tone])}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={cn(
                        pad, 'align-middle',
                        col.numeric ? 'num text-right' : col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              )
            })}

            {/* Yükleme sırasında tablo BOŞALMAZ: iskelet satırlar durur. */}
            {loading && Array.from({ length: rows.length ? 2 : 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-line-soft last:border-0">
                {columns.map(col => (
                  <td key={col.key} className={pad}>
                    <span className={cn(
                      'block h-[11px] rounded-[3px] bg-line-soft',
                      col.numeric ? 'ml-auto w-12' : 'w-28',
                    )} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && empty && <div className="p-4">{empty}</div>}

      {footer && (
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5 text-xs text-faint">{footer}</div>
      )}
    </div>
  )
}

/* Yoğunluk anahtarı — sayfa DataTable'ın density prop'unu bununla besler. */
export function DensityToggle({
  value, onChange,
}: { value: 'tight' | 'relaxed'; onChange: (v: 'tight' | 'relaxed') => void }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-faint">
      {(['tight', 'relaxed'] as const).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-[5px] px-2 py-1 transition-colors',
            value === v ? 'border border-line bg-canvas text-ink' : 'hover:text-ink',
          )}
        >
          {v === 'tight' ? 'sıkı' : 'rahat'}
        </button>
      ))}
    </div>
  )
}
