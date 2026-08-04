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
          <h1 className="text-2xl font-bold text-gray-900">Atölye Profili ve Denetimler</h1>
          <p className="text-gray-500 mt-1">
            {dbError
              ? 'Bağlantı hatası'
              : `${data.ozet?.profilli ?? 0} atölyede künye · ${data.ozet?.denetim ?? 0} denetim kaydı`}
          </p>
        </div>
        <Link
          href={arsivDahil ? '/pes/atolye-profil' : '/pes/atolye-profil?arsiv=1'}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          {arsivDahil ? 'Pasifleri gizle' : 'Pasifleri göster'}
        </Link>
      </div>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{dbError}</p>
        </div>
      )}

      {/* Kaynak veri henüz tam eşleşmediyse bunu sayfada söyle — sessizce
          eksik rapor göstermek, eksik olduğunu bilmemekten kötüdür. */}
      {!dbError && (data.ozet?.eslesmeyen_satir ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Kaynak Excel&apos;de <strong>{data.ozet?.eslesmeyen_satir}</strong> satır
          henüz bir atölyeye bağlanmadı (sistemde karşılığı olmayan tüzel kişilikler
          ve elle onay bekleyen belirsiz eşleşmeler). Bu satırlar
          <code className="mx-1 px-1 bg-amber-100 rounded">workshop_profil_staging</code>
          tablosunda duruyor; aşağıdaki rapor yalnız eşleşmiş atölyeleri kapsar.
        </div>
      )}

      {!dbError && <AtolyeProfilTablo satirlar={data.satirlar} arsivDahil={arsivDahil} />}
    </div>
  )
}
