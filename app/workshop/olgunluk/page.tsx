import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { atolyeOlgunluk } from '@/lib/pes/olgunluk-denetim'
import AtolyeOzDegerlendirme from '@/components/pes/AtolyeOzDegerlendirme'

export const dynamic = 'force-dynamic'

/**
 * Atölyenin kendi olgunluk öz değerlendirmesi (034).
 *
 * ATÖLYE SEÇİCİ YOK — atölye oturumdan gelir. Panelin geri kalanı hâlâ
 * `?wid=` okuyor; buradaki desen onun da gideceği yer: hangi atölye
 * olduğunu kullanıcı söylemez, oturum bilir.
 *
 * Merkez kullanıcısı (atölye bağı olmayan) buraya girerse hangi atölye
 * olduğu belirsizdir; kendi ekranına yönlendirilir.
 */
export default async function AtolyeOlgunlukPage() {
  const tenant = await requireSession()
  if (!tenant.workshopId) redirect('/pes/olgunluk')

  const data = await withServerTenant(async (sql) => {
    const olgunluk = await atolyeOlgunluk(sql, tenant.workshopId!)
    const [w] = await sql`SELECT id, code, name FROM workshop WHERE id = ${tenant.workshopId}`
    return { olgunluk, atolye: w as unknown as { id: number; code: string; name: string } }
  })

  if (!data) redirect('/login')

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/workshop" className="text-sm text-faint hover:text-ink">← Panel</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Olgunluk Öz Değerlendirmesi
        </h1>
        <p className="num mt-1 text-[13px] text-muted">
          {data.atolye?.code} · {data.atolye?.name}
        </p>
      </div>

      <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
        Burada kendi durumunuzu siz işaretlersiniz. Bu <strong>öz değerlendirmedir</strong>;
        denetçinin yaptığı resmi denetimden ayrı tutulur ve sınıfınızı belirlemez.
        Amacı, denetim öncesi nerede olduğunuzu görmeniz ve eksikleri önceden kapatmanız.
      </p>

      <AtolyeOzDegerlendirme workshopId={tenant.workshopId} veri={data.olgunluk} />
    </div>
  )
}
