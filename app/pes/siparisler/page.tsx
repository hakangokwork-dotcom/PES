import { Suspense } from 'react'
import { PageHeader } from '@/components/ui'
import SiparisListesi from '@/components/pes/siparisler/SiparisListesi'

export const dynamic = 'force-dynamic'

/* Havuz ekranı (spec K4). Liste istemciden /api/pes/siparisler ile gelir;
   künye seçenekleri /api/pes/katalog'dan tek istekle. */
export default function SiparislerPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Siparişler' }]}
        title="Siparişler"
        context="Gelen PO'lar önce havuza yazılır, künyesi girilir, sonra atölyeye atanır"
      />
      <Suspense fallback={<p className="text-[13px] text-faint">Yükleniyor…</p>}>
        <SiparisListesi />
      </Suspense>
    </div>
  )
}
