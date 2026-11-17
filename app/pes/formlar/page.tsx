import { Suspense } from 'react'
import UretimFormlari from '@/components/pes/UretimFormlari'

/* 059: merkez — tüm atölyelerin üretim formları. Koruma layout'ta. */
export default function MerkezFormlarPage() {
  return <Suspense><UretimFormlari atolyeId={null} /></Suspense>
}
