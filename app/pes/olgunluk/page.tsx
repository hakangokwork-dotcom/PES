import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { PageHeader } from '@/components/ui'
import { filoDurumu } from '@/lib/pes/olgunluk-denetim'
import OlgunlukFiloTablosu from '@/components/pes/OlgunlukFiloTablosu'

export const dynamic = 'force-dynamic'

/**
 * "Atölye atölye hangi durumdalar" ekranı.
 *
 * Satır = atölye, kolon = kategori, hücre = 0-3 seviye. Tek bakışta hem
 * bir atölyenin zayıf ekseni hem de bir kategorinin filo genelindeki
 * durumu okunur.
 */
export default async function OlgunlukPage({
  searchParams,
}: {
  searchParams: Promise<{ pasif?: string }>
}) {
  const { pasif } = await searchParams
  const pasifDahil = pasif === '1'

  let dbError = ''
  const data = await withServerTenant(async (sql) => {
    const filo = await filoDurumu(sql, { pasifDahil })
    const atolyeler = await sql`
      SELECT id, code, name FROM workshop WHERE is_active ORDER BY code`
    const [yayin] = await sql`
      SELECT id, kod FROM olgunluk_sablon WHERE durum = 'yayinda'`
    return {
      filo,
      atolyeler: atolyeler as unknown as { id: number; code: string; name: string }[],
      yayin: (yayin as unknown as { id: number; kod: string }) ?? null,
    }
  }).catch((err: unknown) => {
    dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
    return null
  })

  if (data === null && !dbError) redirect('/login')

  const denetimli = data?.filo.satirlar.filter((s) => s.son_denetim).length ?? 0

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        crumbs={[{ label: 'PES', href: '/pes' }, { label: 'Olgunluk' }]}
        title="Olgunluk Durumu"
        context={
          dbError ? 'Bağlantı hatası'
          : `${denetimli} / ${data?.filo.satirlar.length ?? 0} atölyede tamamlanmış denetim` +
            (data?.yayin ? ` · yayındaki sürüm ${data.yayin.kod}` : ' · yayında sürüm yok')
        }
        actions={
          <>
            <Link href={pasifDahil ? '/pes/olgunluk' : '/pes/olgunluk?pasif=1'}
                  className="rounded-md border border-line px-3.5 py-2 text-[13px] font-medium text-body hover:bg-canvas">
              {pasifDahil ? 'Pasifleri gizle' : 'Pasifleri göster'}
            </Link>
            <Link href="/pes/olgunluk/katalog"
                  className="rounded-md border border-line px-3.5 py-2 text-[13px] font-medium text-body hover:bg-canvas">
              Katalog
            </Link>
          </>
        }
      />

      {dbError && (
        <div className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3">
          <p className="text-[13px] text-danger">{dbError}</p>
        </div>
      )}

      {!dbError && data && (
        <OlgunlukFiloTablosu
          satirlar={data.filo.satirlar}
          kategoriKodlari={data.filo.kategoriKodlari}
          atolyeler={data.atolyeler}
          yayindaSurumVar={data.yayin !== null}
        />
      )}
    </div>
  )
}
