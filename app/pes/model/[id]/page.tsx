import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import BolumEz from './BolumEz'

/**
 * /pes/model/[id] — bültenin satırları.
 * Her satırın bölümü elle ezilebilir; ezilen satır 'elle' işaretiyle
 * kalır ve kural yeniden uygulandığında korunur.
 */
export const dynamic = 'force-dynamic'

const BOLUM_RENK: Record<string, string> = {
  KESIM: 'bg-amber-100 text-amber-800',
  DIKIM: 'bg-blue-100 text-blue-800',
  UKP: 'bg-emerald-100 text-emerald-800',
}

export default async function BultenDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bultenId = Number(id)
  if (!Number.isInteger(bultenId)) notFound()

  const data = await withServerTenant(async (sql) => {
    const [bulten] = await sql`SELECT * FROM model_bulten WHERE id = ${bultenId}`
    if (!bulten) return { bulten: null, satirlar: [], toplam: null }
    const satirlar = await sql`
      SELECT id, sira_no, seviye1, seviye2, seviye3, cevrim_sn::float AS cevrim_sn,
             tip, makine_kodu, bolum, bolum_kaynak
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId} ORDER BY sira_no`
    const [toplam] = await sql`
      SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float AS ukp,
             count(*) FILTER (WHERE bolum_kaynak='elle')::int AS elle
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}`
    return { bulten, satirlar, toplam }
  })

  if (!data) redirect('/login')
  if (!data.bulten) notFound()
  const { bulten, satirlar, toplam } = data
  const top = Number(toplam?.kesim) + Number(toplam?.dikim) + Number(toplam?.ukp)

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{String(bulten.model_adi)}</h1>
        <p className="text-sm text-slate-500">
          {String(bulten.plm_id ?? 'PLM yok')} · {satirlar.length} operasyon ·{' '}
          {(top / 60).toFixed(2)} dk ·{' '}
          <Link href={`/pes/model/${bultenId}/fiyat`} className="underline">fiyatla →</Link>
          {' · '}<Link href="/pes/model" className="underline">tüm modeller</Link>
        </p>
      </header>

      <div className="flex h-6 rounded overflow-hidden text-xs" role="img" aria-label="Bölüm dağılımı">
        {(['kesim', 'dikim', 'ukp'] as const).map((k, i) => {
          const v = Number(toplam?.[k])
          if (!v) return null
          const renk = ['#f59e0b', '#2563eb', '#10b981'][i]
          return (
            <div key={k} style={{ width: `${v / top * 100}%`, background: renk }}
                 className="text-white flex items-center justify-center"
                 title={`${k.toUpperCase()}: ${v} sn`}>
              {v / top > 0.08 ? `${k.toUpperCase()} ${(v / top * 100).toFixed(0)}%` : ''}
            </div>
          )
        })}
      </div>

      {Number(toplam?.elle) > 0 && (
        <p className="text-sm text-amber-700">
          {String(toplam?.elle)} satırın bölümü elle seçilmiş; kural yeniden uygulansa da korunur.
        </p>
      )}

      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-right px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Aşama</th>
              <th className="text-left px-3 py-2">Operasyon</th>
              <th className="text-right px-3 py-2">Çevrim (sn)</th>
              <th className="text-left px-3 py-2">Tip</th>
              <th className="text-left px-3 py-2">Makine</th>
              <th className="text-left px-3 py-2">Bölüm</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s: Record<string, unknown>) => (
              <tr key={String(s.id)} className="border-t hover:bg-slate-50">
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{String(s.sira_no)}</td>
                <td className="px-3 py-1.5">{String(s.seviye1 ?? '—')}</td>
                <td className="px-3 py-1.5">
                  {String(s.seviye2 ?? '—')}
                  {s.seviye3 ? <span className="block text-xs text-slate-400">{String(s.seviye3)}</span> : null}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(s.cevrim_sn).toFixed(0)}</td>
                <td className="px-3 py-1.5 text-slate-600">{String(s.tip ?? '—')}</td>
                <td className="px-3 py-1.5 text-slate-400 text-xs">{String(s.makine_kodu ?? '—')}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${BOLUM_RENK[String(s.bolum)] ?? ''}`}>
                    {String(s.bolum)}
                  </span>
                  <BolumEz bultenId={bultenId} operasyonId={Number(s.id)}
                           bolum={String(s.bolum)} kaynak={String(s.bolum_kaynak)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Bölüm, <code>(aşama, tip)</code> kurallarıyla atanır. Aşama tek başına yetmez:
        “Son İşlem” karışıktır — paça kıvırma ve punteriz dikim, ütüleme ve paket UKP.
        Yanlış gördüğün satırı burada ezebilirsin; ezilen satır kural yeniden
        uygulandığında korunur.
      </p>
    </main>
  )
}
