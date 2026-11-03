'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense } from 'react'
import { PageHeader } from '@/components/ui'
import GunlukUretimTablo from '@/components/pes/GunlukUretimTablo'

export default function Sayfa() {
  return (
    <Suspense fallback={<p className="text-[13px] text-faint">Yükleniyor…</p>}>
      <GunlukUretimSayfasi />
    </Suspense>
  )
}

function GunlukUretimSayfasi() {
  const wid = useAktifAtolyeId()
  const workshopId = wid ? Number(wid) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Atölye', href: '/workshop' }, { label: 'Günlük Üretim' }]}
        title="Günlük Üretim"
      />
      <p className="-mt-2 text-[13px] text-muted">
        Bantların o gün için planı ve çıkardığı adet. Plan boşsa bandın
        varsayılan payı geçerlidir; yeni modele başlarken 2000 yerine 1800
        yazmak sizin kararınız. Gerçekleşen zorunlu değil — girilirse
        plan/gerçek karşılaştırması çıkar.
      </p>

      {!Number.isInteger(workshopId) ? (
        <AtolyeSecilmedi />
      ) : (
        <GunlukUretimTablo workshopId={workshopId as number} />
      )}
    </div>
  )
}
