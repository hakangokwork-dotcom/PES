import type { ReactNode } from 'react'

/* Boş durum nedeni söyler VE bir sonraki adımı verir.
   "Veri bekleniyor" tek başına yeterli değil. */
export function EmptyState({
  title, description, action,
}: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-5 py-8 text-center">
      <span className="text-sm font-semibold text-ink">{title}</span>
      {description && (
        <span className="max-w-[320px] text-[13px] leading-relaxed text-faint">{description}</span>
      )}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
