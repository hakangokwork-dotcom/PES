import type { ReactNode } from 'react'
import Link from 'next/link'

/* Her ekranın tepesindeki blok. Sıra sabit: kırıntı yolu → başlık →
   sayılarla bağlam satırı → sağda en fazla ÜÇ eylem, yalnızca biri primary. */
export function PageHeader({
  crumbs, title, context, actions,
}: {
  crumbs?: { label: string; href?: string }[]
  title: string
  context?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-2">
      <div className="flex flex-col gap-1">
        {crumbs && crumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-faint">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-line">/</span>}
                {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : c.label}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-serif text-[30px] leading-tight font-medium tracking-tight text-ink">{title}</h1>
        {context && <div className="num text-sm text-muted">{context}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
