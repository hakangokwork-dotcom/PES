import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { atolyeProfilSatirlari, type AtolyeProfilSatiri } from '@/lib/pes/atolye-profil'
import AtolyeProfilTablo from '@/components/pes/AtolyeProfilTablo'

export const dynamic = 'force-dynamic'

export default async function AtolyeProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ arsiv?: string }>
}) {
  const { arsiv } = await searchParams
  const arsivDahil = arsiv === '1'

  let dbError = ''
  const data = await withServerTenant(async (sql) => {
    const satirlar = await atolyeProfilSatirlari(sql, { arsivDahil })
    const [ozet] = await sql`
      SELECT
        (SELECT count(*)::int FROM workshop_profil)  AS profilli,
        (SELECT count(*)::int FROM workshop_denetim) AS denetim,
        (SELECT count(*)::int FROM workshop_profil_staging
           WHERE eslesen_workshop_id IS NULL)        AS eslesmeyen_satir`
    return { satirlar, ozet }
  }).catch((err: unknown) => {
    dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
    return { satirlar: [] as AtolyeProfilSatiri[], ozet: null }
  })

  if (data === null) redirect('/login')

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Atölye Profili ve Denetimler</h1>
          <p className="text-faint mt-1">
            {dbError
              ? 'Bağlantı hatası'
              : `${data.ozet?.profilli ?? 0} atölyede künye · ${data.ozet?.denetim ?? 0} denetim kaydı`}
          </p>
        </div>
        <Link
          href={arsivDahil ? '/pes/atolye-profil' : '/pes/atolye-profil?arsiv=1'}
          className="px-4 py-2 border border-line text-body rounded-lg hover:bg-canvas transition-colors text-sm font-medium"
        >
          {arsivDahil ? 'Pasifleri gizle' : 'Pasifleri göster'}
        </Link>
      </div>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{dbError}</p>
        </div>
      )}

      {/* Boş künye normal bir durum, hata değil: kullanıcılar zamanla
          doldurur. Bu yüzden uyarı tonunda değil, bilgi tonunda. */}
      {!dbError && (data.ozet?.eslesmeyen_satir ?? 0) > 0 && (
        <p className="text-sm text-faint">
          Künyesi boş atölyeler listede yer alır; alanları atölye sayfasındaki
          &quot;Profil &amp; Denetim&quot; sekmesinden doldurabilirsiniz. Kaynak
          Excel&apos;in bağlanmamış {data.ozet?.eslesmeyen_satir} satırı
          silinmedi, staging tablosunda duruyor.
        </p>
      )}

      {!dbError && <AtolyeProfilTablo satirlar={data.satirlar} arsivDahil={arsivDahil} />}
    </div>
  )
}
