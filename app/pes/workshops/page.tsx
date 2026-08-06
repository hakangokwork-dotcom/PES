import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { LinkButton, PageHeader } from '@/components/ui'
import WorkshopsTable, { type WorkshopRow } from '@/components/pes/WorkshopsTable'

export const dynamic = 'force-dynamic'

/* REFERANS DÖNÜŞÜM — 1. ekran.
   Veri katmanı DEĞİŞMEDİ (withServerTenant, tenant-yerel state, aynı SQL).
   Değişenler:
   - max-w-6xl kaldırıldı: tablo ekranı tam genişlik.
   - başlık/eylem bloğu PageHeader'a taşındı.
   - tablo DataTable'a taşındı (sıralama + arama + yoğunluk + iskelet).
   - ham DB hata metni arayüzden çıktı; kullanıcıya tek cümle, detay log'a. */
export default async function WorkshopsPage({
  searchParams,
}: { searchParams: Promise<{ arsiv?: string }> }) {
  const { arsiv } = await searchParams
  const arsivGoster = arsiv === '1'

  let dbError = false

  const data = await withServerTenant(async (sql) => {
    const [satirlar, sayimlar] = await Promise.all([
      sql`
        SELECT w.*, kullanici_eposta(w.owner_user_id) AS owner_email
        FROM workshop w
        WHERE ${arsivGoster ? sql`TRUE` : sql`w.is_active`}
        ORDER BY w.code`,
      sql`
        SELECT count(*) FILTER (WHERE is_active)::int AS aktif,
               count(*) FILTER (WHERE NOT is_active)::int AS arsiv
        FROM workshop`,
    ])
    return { satirlar: satirlar as unknown as WorkshopRow[], sayimlar: sayimlar[0] }
  }).catch((err: unknown) => {
    /* Teknik ayrıntı log'a; kullanıcıya rolüne uygun tek cümle. */
    console.error('[workshops] sorgu hatası', err)
    dbError = true
    return { satirlar: [] as WorkshopRow[], sayimlar: { aktif: 0, arsiv: 0 } }
  })

  if (data === null) redirect('/login')

  const aktif = Number(data.sayimlar?.aktif ?? 0)
  const pasif = Number(data.sayimlar?.arsiv ?? 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Atölyeler' }]}
        title="Atölyeler"
        context={dbError ? 'Liste şu an yüklenemedi' : `${aktif} aktif · ${pasif} pasif`}
        actions={
          <>
            <LinkButton variant="ghost" href={arsivGoster ? '/pes/workshops' : '/pes/workshops?arsiv=1'}>
              {arsivGoster ? 'Pasifleri gizle' : 'Pasifleri göster'}
            </LinkButton>
            <LinkButton variant="secondary" href="/pes/workshops/import">İçe aktar</LinkButton>
            <LinkButton variant="primary" href="/pes/workshops/new">Yeni atölye</LinkButton>
          </>
        }
      />

      {dbError && (
        <p className="rounded-lg border border-danger-line bg-danger-soft/40 px-4 py-2.5 text-[13px] text-danger">
          Atölye listesi şu an yüklenemedi. Sayfayı yenileyin; sorun sürerse yöneticinize bildirin.
        </p>
      )}

      <WorkshopsTable rows={data.satirlar} />
    </div>
  )
}
