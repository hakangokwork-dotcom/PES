'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
/* VSM Analiz — atölye panelinde VSIM modülü. Akış atölye başına saklanır. */

import { Suspense } from 'react'
import VsimEmbed from '@/components/pes/VsimEmbed'

export default function VsmPage() {
  return (
    <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}>
      <VsmContent />
    </Suspense>
  )
}

function VsmContent() {
  const wid = useAktifAtolyeId()
  /* Atölye seçilmemişken ortak "taslak" kovası — veri atölyelere karışmasın. */
  const storageKey = wid ? `provsm_studio_w${wid}_v1` : 'provsm_studio_taslak_v1'

  return <VsimEmbed storageKey={storageKey} kayitKapsami={wid ? 'atolye' : undefined} />
}
