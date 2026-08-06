import { cn } from '@/lib/utils'

/* Button ve LinkButton aynı haritaları paylaşır — iki yerde tanımlanmaz. */
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

export const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
  ghost: 'text-muted hover:bg-canvas hover:text-ink',
  danger: 'bg-surface text-danger border border-danger-line hover:bg-danger-soft',
}

export const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[5px]',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-md',
  lg: 'h-11 px-[18px] text-sm gap-2 rounded-md',
}

export function buttonClass(variant: Variant, size: Size, className?: string) {
  return cn(
    'inline-flex items-center justify-center font-medium whitespace-nowrap',
    'transition-colors outline-none focus-visible:ring-3 focus-visible:ring-accent/25',
    'disabled:opacity-45 disabled:pointer-events-none',
    VARIANT[variant], SIZE[size], className,
  )
}
