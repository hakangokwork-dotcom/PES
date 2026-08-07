import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { PageHeader } from '@/components/ui'
import {
  sablonlar as sablonlariOku, katalog as katalogOku, varsayilanSablon,
} from '@/lib/pes/olgunluk'
import OlgunlukKatalogPaneli from '@/components/pes/OlgunlukKatalogPaneli'

export const dynamic = 'force-dynamic'

/**
 * Olgunluk kataloğu yönetimi.
 *
 * Hangi sürümün açık olduğu URL'de taşınır (?sablon=3): kullanıcı bir
 * sürümü düzenlerken sekmeyi paylaşabilsin ve yenileme seçimi kaybetmesin.
 */
export default async function OlgunlukKatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ sablon?: string }>
}) {
  const { sablon: sablonParam } = await searchParams

  let dbError = ''
  const data = await withServerTenant(async (sql) => {
    const hepsi = await sablonlariOku(sql)
    if (hepsi.length === 0) return { hepsi, katalog: null }

    const istenen = parseInt(sablonParam ?? '')
    const secili = hepsi.find((s) => s.id === istenen) ?? varsayilanSablon(hepsi)
    const katalog = secili ? await katalogOku(sql, secili.id) : null
    return { hepsi, katalog }
  }).catch((err: unknown) => {
    dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
    return null
  })

  if (data === null && !dbError) redirect('/login')

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        crumbs={[{ label: 'PES', href: '/pes' }, { label: 'Olgunluk' }]}
        title="Olgunluk Kataloğu"
        context={
          dbError ? 'Bağlantı hatası'
          : !data?.katalog ? 'Katalog yüklenmemiş'
          : `${data.katalog.sablon.kod} · süreçler ve seviye maddeleri`
        }
      />

      {dbError && (
        <div className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3">
          <p className="text-[13px] text-danger">{dbError}</p>
        </div>
      )}

      {!dbError && !data?.katalog && (
        <div className="rounded-lg border border-line-soft bg-surface px-4 py-6">
          <p className="text-[13px] text-muted">
            Henüz katalog yok. Kaynak Excel&apos;den yüklemek için:{' '}
            <code className="num rounded bg-canvas px-1.5 py-0.5 text-xs">
              node scripts/import_olgunluk_katalog.mjs --uygula
            </code>
          </p>
        </div>
      )}

      {!dbError && data?.katalog && (
        <OlgunlukKatalogPaneli katalog={data.katalog} sablonlar={data.hepsi} />
      )}
    </div>
  )
}
