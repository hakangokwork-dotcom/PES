import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { buttonClass, type Size, type Variant } from './buttonStyles'

/* Kod tabanında "link gibi davranan düğme" çok fazla (CSV Import, Yeni Atölye,
   Atölye Paneli…). Hepsi bunu kullanır; Button ile aynı stilleri paylaşır. */
export function LinkButton({
  variant = 'secondary', size = 'md', icon, className, children, ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link {...rest} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  )
}
