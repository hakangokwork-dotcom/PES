import { notFound, redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { PageHeader } from '@/components/ui'
import { denetimDetay } from '@/lib/pes/olgunluk-denetim'
import OlgunlukDenetimEkrani from '@/components/pes/OlgunlukDenetimEkrani'

export const dynamic = 'force-dynamic'

export default async function OlgunlukDenetimPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const denetimId = parseInt(id)
  if (!Number.isInteger(denetimId)) notFound()

  let dbError = ''
  const detay = await withServerTenant((sql) => denetimDetay(sql, denetimId))
    .catch((err: unknown) => {
      dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
      return null
    })

  if (detay === null && !dbError) redirect('/login')
  if (!dbError && !detay) notFound()

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        crumbs={[
          { label: 'PES', href: '/pes' },
          { label: 'Olgunluk', href: '/pes/olgunluk' },
          { label: 'Denetim' },
        ]}
        title="Olgunluk Denetimi"
        context={dbError ? 'Bağlantı hatası' : `${detay!.surecler.length} süreç · ${detay!.kriterler.length} madde`}
      />

      {dbError && (
        <div className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3">
          <p className="text-[13px] text-danger">{dbError}</p>
        </div>
      )}

      {!dbError && detay && <OlgunlukDenetimEkrani detay={detay} />}
    </div>
  )
}
