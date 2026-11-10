import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONE_TEXT, type Tone } from '@/lib/ui/tone'

/* Tek kalıp: yumuşak köşe, ince kenar, çok hafif gölge (Claude tasarım dili). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-line-soft bg-surface shadow-[0_1px_2px_rgba(31,30,27,0.04)]', className)}>
      {children}
    </div>
  )
}

export function CardHeader({
  title, aside, className,
}: { title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5', className)}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {aside && <div className="shrink-0 text-[11px] text-faint">{aside}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

/* Büyük sayı + değişim. Sayım kartı değil, ölçüm kartı:
   "Aktif Atölye: 12" gibi sayımlar üst şeride, buraya metrikler gelir. */
export function Metric({
  value, delta, note, tone = 'neutral',
}: { value: string; delta?: string; note?: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="num font-serif text-[34px] leading-none font-medium tracking-tight text-ink">{value}</span>
      {delta && <span className={cn('num text-[13px]', TONE_TEXT[tone])}>{delta}</span>}
      {note && <span className="ml-auto text-xs text-faint">{note}</span>}
    </div>
  )
}
