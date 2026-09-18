import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemEtiket } from '@/lib/pes/donem'
import Form from './Form'

export const dynamic = 'force-dynamic'

export default async function EkonomiGiris({
  searchParams,
}: { searchParams: Promise<{ donem?: string; atolye?: string }> }) {
  const sp = await searchParams
  const simdi = new Date()
  const donem = donemCoz(sp.donem) ?? { yil: simdi.getFullYear(), ay: simdi.getMonth() + 1 }
  const workshopId = sp.atolye ? Number(sp.atolye) : null

  const data = await withServerTenant(async (sql) => {
    const atolyeler = await sql`
      SELECT id, name FROM workshop WHERE is_active ORDER BY name
    ` as Array<{ id: number; name: string }>

    const mevcut = workshopId
      ? (await sql`
          SELECT * FROM workshop_economy
          WHERE workshop_id = ${workshopId}
            AND year = ${donem.yil} AND month = ${donem.ay}
        `)[0] ?? null
      : null

    return { atolyeler, mevcut }
  })

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ekonomi satırı girişi</h1>
        <p className="text-sm text-slate-500">
          {donemEtiket(donem)} ·{' '}
          <Link href="/pes/ekonomi" className="underline">panoya dön</Link>
        </p>
      </header>

      <p className="text-sm bg-slate-50 border rounded px-3 py-2 max-w-2xl">
        Burada yalnız <strong>giderde olmayan</strong> alanlar var. Gider kalemleri{' '}
        <Link href="/pes/expenses/import" className="underline">Gider Yükle</Link> akışında kalır.
        {data.mevcut?.source === 'turetilmis' && (
          <span className="block mt-1 text-amber-700">
            Bu satır çok aylı bir beyandan türetilmişti. Kaydedersen "elle" kaynaklı olur
            ve anket bağı kopar.
          </span>
        )}
      </p>

      <Form atolyeler={data.atolyeler} donem={donem}
            mevcut={data.mevcut as Record<string, string | number | null> | null}
            workshopId={workshopId} />
    </main>
  )
}
