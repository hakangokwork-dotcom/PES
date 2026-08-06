import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONE_TEXT, type Tone } from '@/lib/ui/tone'

/* Tek kenarlık, gölge yok. rounded-xl/shadow-sm karışımı yerine tek kalıp. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-line-soft bg-surface', className)}>
      {children}
    </div>
  )
}

export function CardHeader({
  title, aside, className,
}: { title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3', className)}>
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {aside && <div className="shrink-0 text-[11px] text-faint">{aside}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-4', className)}>{children}</div>
}

/* Büyük sayı + değişim. Sayım kartı değil, ölçüm kartı:
   "Aktif Atölye: 12" gibi sayımlar üst şeride, buraya metrikler gelir. */
export function Metric({
  value, delta, note, tone = 'neutral',
}: { value: string; delta?: string; note?: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="num text-[30px] font-medium tracking-tight text-ink">{value}</span>
      {delta && <span className={cn('num text-[13px]', TONE_TEXT[tone])}>{delta}</span>}
      {note && <span className="ml-auto text-xs text-faint">{note}</span>}
    </div>
  )
}
