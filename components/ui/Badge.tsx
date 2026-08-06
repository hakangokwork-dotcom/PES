import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type Tone } from '@/lib/ui/tone'

/* Kural: sınıflandırma (tip, kategori, kaynak) her zaman tone="neutral".
   Renk yalnızca bir eşiğe göre iyi/kötü söylediğinde kullanılır. */
export function Badge({
  tone = 'neutral', className, children,
}: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-[4px] px-2 py-[3px] text-[11px] font-medium tracking-[0.04em]',
      TONE_BADGE[tone], className,
    )}>
      {children}
    </span>
  )
}
