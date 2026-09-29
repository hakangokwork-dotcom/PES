import { Eye } from 'lucide-react'

/* Merkez kullanıcısı bir atölyenin ekranına onun gözünden bakarken, o
   ekrandaki işlemin atölyeye ait olduğunu söyler. Form ayrıca
   <fieldset disabled> ile kilitlenir; bu yalnız nedenini anlatır. */
export default function MerkezGorunumuUyari({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
      <Eye className="mt-0.5 size-4 shrink-0 text-faint" strokeWidth={1.8} />
      <span><strong className="text-ink">Merkez görünümü.</strong> {children}</span>
    </p>
  )
}
