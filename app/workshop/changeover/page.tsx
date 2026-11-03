'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import ModelDegisimEkrani from '@/components/pes/ModelDegisimEkrani'
import { Suspense } from 'react'

export default function AtolyeModelDegisimWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><AtolyeModelDegisimPage /></Suspense>
}

function AtolyeModelDegisimPage() {
  const wid = useAktifAtolyeId()
  if (!wid) return <AtolyeSecilmedi />
  return <ModelDegisimEkrani atolyeId={wid} />
}
