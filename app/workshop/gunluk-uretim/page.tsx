'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { EmptyState, PageHeader } from '@/components/ui'
import GunlukUretimTablo from '@/components/pes/GunlukUretimTablo'

export default function Sayfa() {
  return (
    <Suspense fallback={<p className="text-[13px] text-faint">Yükleniyor…</p>}>
      <GunlukUretimSayfasi />
    </Suspense>
  )
}

function GunlukUretimSayfasi() {
  const wid = useSearchParams().get('wid')
  const workshopId = wid ? Number(wid) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Atölye', href: '/workshop' }, { label: 'Günlük Üretim' }]}
        title="Günlük Üretim"
      />
      <p className="-mt-2 text-[13px] text-muted">
        Bantların o gün çıkardığı adet. Girmek zorunlu değil — girilirse
        siparişin plan/gerçek karşılaştırması çıkar.
      </p>

      {!Number.isInteger(workshopId) ? (
        <EmptyState
          title="Önce atölye seçin"
          description="Sol üstteki “Aktif Atölye” listesinden bir atölye seçtiğinizde o atölyenin bantları listelenir."
        />
      ) : (
        <GunlukUretimTablo workshopId={workshopId as number} />
      )}
    </div>
  )
}
