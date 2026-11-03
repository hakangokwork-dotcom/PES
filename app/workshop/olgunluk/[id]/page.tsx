import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { denetimDetay, atolyeYazabilirMi } from '@/lib/pes/olgunluk-denetim'
import OlgunlukDenetimEkrani from '@/components/pes/OlgunlukDenetimEkrani'

export const dynamic = 'force-dynamic'

/**
 * Atölye panelinde olgunluk kaydı. Öz değerlendirme burada doldurulur;
 * merkezin resmi denetimi burada SALT OKUNUR açılır — atölye süreç
 * kırılımını görsün diye. Eskiden iki bağlantı da /pes'e gidiyordu ve
 * atölye hesabı oradan geri atılıyordu.
 */
export default async function AtolyeOlgunlukKayitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const tenant = await requireSession()
  const wid = tenant.workshopId
  if (!wid) redirect('/workshop')

  const { id } = await params
  const denetimId = parseInt(id)
  if (!Number.isInteger(denetimId)) notFound()

  const detay = await withServerTenant((sql) => denetimDetay(sql, denetimId))
  // RLS başka atölyenin kaydını zaten göstermez; bu satır niyeti belgeler.
  if (!detay || detay.baslik.workshop_id !== wid) notFound()

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Link href="/workshop/olgunluk" className="text-sm text-faint hover:text-ink">← Olgunluk</Link>
      <OlgunlukDenetimEkrani
        detay={detay}
        geriHref="/workshop/olgunluk"
        geriEtiket="Özete dön"
        saltOkunur={!atolyeYazabilirMi(wid, detay.baslik.tur)}
      />
    </div>
  )
}
