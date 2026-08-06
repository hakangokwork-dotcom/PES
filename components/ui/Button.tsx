import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type Size, type Variant } from './buttonStyles'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** true iken etiket DEĞİŞMEZ, yanına spinner gelir — düğme zıplamaz. */
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary', size = 'md', loading = false,
  icon, className, children, disabled, ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {loading
        ? <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-current/35 border-t-current" />
        : icon}
      {children}
    </button>
  )
}
