import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Field: etiket + kontrol + yardım/hata. Hata metni alanın ALTINDA durur;
   sayfanın tepesindeki kırmızı kutu artık kullanılmıyor. */
export function Field({
  label, hint, error, className, children,
}: { label?: string; hint?: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">
          {label}
        </label>
      )}
      {children}
      {(error || hint) && (
        <span className={cn('text-xs leading-snug', error ? 'text-danger' : 'text-faint')}>
          {error || hint}
        </span>
      )}
    </div>
  )
}

const BASE =
  'h-9 w-full rounded-md border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors ' +
  'placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 ' +
  'disabled:bg-canvas disabled:text-faint'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  align?: 'left' | 'right'
  /** Birim etiketi: TL/dk, adet, sn… */
  suffix?: string
  invalid?: boolean
}

export function Input({ align = 'left', suffix, invalid, className, ...rest }: InputProps) {
  const numeric = align === 'right' || rest.type === 'number'
  const field = (
    <input
      {...rest}
      className={cn(
        BASE,
        invalid ? 'border-danger-line' : 'border-line',
        numeric && 'text-right num',
        suffix && 'pr-1',
        className,
      )}
    />
  )
  if (!suffix) return field
  return (
    <div className={cn(
      'flex h-9 items-center rounded-md border bg-surface pr-2.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15',
      invalid ? 'border-danger-line' : 'border-line',
    )}>
      <input
        {...rest}
        className={cn('h-full w-full border-0 bg-transparent px-2.5 text-[13px] text-ink outline-none', numeric && 'text-right num', className)}
      />
      <span className="shrink-0 pl-1.5 text-xs text-faint">{suffix}</span>
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(BASE, 'appearance-none border-line pr-8', className)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint"
      />
    </div>
  )
}
