// components/pes/surec/AdimSartname.tsx
'use client'

import { Badge } from '@/components/ui'
import { DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'

export type SartnameOzet = {
  id: number; kumas_kategorisi: string; asama: string; revizyon: number; durum: string
  onaylayan: string | null; onay_tarihi: string | null; nokta_sayisi: number
}

/** Atölye için salt okunur: şartnameyi merkez yönetir. */
export default function AdimSartname({ sartnameler, modelVar }: { sartnameler: SartnameOzet[]; modelVar: boolean }) {
  if (!modelVar) return <p className="text-sm text-faint">Bu iş emrine model bülteni bağlı değil; merkez bağlayınca şartname burada görünür.</p>
  if (sartnameler.length === 0) return <p className="text-sm text-faint">Bu model için ölçü şartnamesi yok. Ölçü girilemez; merkeze bildirin.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-faint"><tr><th className="py-1">Aşama</th><th>Kategori</th><th>Rev.</th><th>POM</th><th>Durum</th></tr></thead>
      <tbody>
        {sartnameler.map(s => (
          <tr key={s.id} className="border-t border-line-soft">
            <td className="py-1">{ASAMA_ETIKET[s.asama]}</td><td>{s.kumas_kategorisi}</td>
            <td className="num">{s.revizyon}</td><td className="num">{s.nokta_sayisi}</td>
            <td>
              <Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge>
              {s.durum === 'Önerilen' && s.asama === 'FINAL' && <span className="ml-2 text-xs text-faint">sevkiyat kabulü için müşteri onayı bekleniyor</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
