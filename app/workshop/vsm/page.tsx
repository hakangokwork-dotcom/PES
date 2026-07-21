'use client'

/* VSM Analiz — atölye panelinde VSIM modülü. Akış atölye başına saklanır. */

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import VsimEmbed from '@/components/pes/VsimEmbed'

export default function VsmPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}>
      <VsmContent />
    </Suspense>
  )
}

function VsmContent() {
  const wid = useSearchParams().get('wid')
  /* Atölye seçilmemişken ortak "taslak" kovası — veri atölyelere karışmasın. */
  const storageKey = wid ? `provsm_studio_w${wid}_v1` : 'provsm_studio_taslak_v1'

  return <VsimEmbed storageKey={storageKey} />
}
