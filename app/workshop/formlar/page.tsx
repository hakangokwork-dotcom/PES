import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import UretimFormlari from '@/components/pes/UretimFormlari'

export const dynamic = 'force-dynamic'

/* 059: atölyenin üretim formları. Atölye oturumdan gelir. */
export default async function AtolyeFormlarPage() {
  const tenant = await requireSession()
  if (!tenant.workshopId) redirect('/workshop')
  return <Suspense><UretimFormlari atolyeId={tenant.workshopId} /></Suspense>
}
