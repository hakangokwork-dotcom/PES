import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'

/**
 * /pes/model — teorik bülten listesi.
 * Bülten atölyeden bağımsızdır; fiyat atölye seçilince çıkar.
 */
export const dynamic = 'force-dynamic'

export default async function ModelListesi() {
  const data = await withServerTenant(async (sql) => sql`
    SELECT b.id, b.model_adi, b.plm_id, b.klasman_kodu, b.sezon,
           b.toplam_sn::float AS toplam_sn,
           count(DISTINCT o.id)::int AS operasyon_sayisi,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='KESIM'),0)::float AS kesim_sn,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='DIKIM'),0)::float AS dikim_sn,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='UKP'),0)::float AS ukp_sn,
           count(DISTINCT f.workshop_id)::int AS fiyatlanan_atolye
    FROM model_bulten b
    LEFT JOIN model_bulten_operasyon o ON o.bulten_id = b.id
    LEFT JOIN model_fiyat f ON f.bulten_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC`)

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Model Fiyatlama</h1>
          <p className="text-sm text-slate-500">
            {data.length} bülten ·{' '}
            <Link href="/pes/model/kutuphane" className="underline">operasyon kütüphanesi →</Link>
          </p>
        </div>
      </header>

      {data.length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Henüz bülten yok. Yüklemek için:{' '}
          <code>node scripts/import_model_bulten.mjs --dosya &quot;...xlsx&quot; --uygula</code>
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">PLM</th>
                <th className="text-left px-3 py-2">Klasman</th>
                <th className="text-right px-3 py-2">Operasyon</th>
                <th className="text-right px-3 py-2">Toplam dk</th>
                <th className="text-left px-3 py-2">Bölüm dağılımı</th>
                <th className="text-right px-3 py-2">Fiyatlanan atölye</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b: Record<string, unknown>) => {
                const top = Number(b.kesim_sn) + Number(b.dikim_sn) + Number(b.ukp_sn)
                const pay = (v: unknown) => top ? `${(Number(v) / top * 100).toFixed(0)}%` : '—'
                return (
                  <tr key={String(b.id)} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/pes/model/${b.id}`} className="underline font-medium">
                        {String(b.model_adi)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{String(b.plm_id ?? '—')}</td>
                    <td className="px-3 py-2 text-slate-500">{String(b.klasman_kodu ?? '—')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{String(b.operasyon_sayisi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(Number(b.toplam_sn) / 60).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                      K {pay(b.kesim_sn)} · D {pay(b.dikim_sn)} · U {pay(b.ukp_sn)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(b.fiyatlanan_atolye) > 0
                        ? <Link href={`/pes/model/${b.id}/fiyat`} className="underline">{String(b.fiyatlanan_atolye)}</Link>
                        : <Link href={`/pes/model/${b.id}/fiyat`} className="underline text-slate-400">fiyatla</Link>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
