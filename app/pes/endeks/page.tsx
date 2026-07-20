import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import IndexManager from '@/components/pes/IndexManager'

export const dynamic = 'force-dynamic'

export default async function EndeksPage() {
  const data = await withServerTenant(async (sql) => {
    const [series, values, map] = await Promise.all([
      sql`SELECT code, label, kind, unit, description FROM index_series ORDER BY sort_order, code`,
      sql`SELECT id, series_code, donem, value, source, note FROM price_index ORDER BY series_code, donem DESC`,
      sql`
        SELECT m.group_code, m.series_code, m.rationale, s.label AS series_label
        FROM expense_group_index_map m
        JOIN index_series s ON s.code = m.series_code
        ORDER BY m.group_code
      `,
    ])
    return { series, values, map }
  })

  if (!data) redirect('/login')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fiyat Endeksleri</h1>
        <p className="text-gray-500 mt-1">
          Dönemler arası karşılaştırmanın enflasyondan arındırılması için kullanılır.
          Değerler <strong>elle girilir</strong> — sistem TÜİK/TCMB verisini kendiliğinden
          çekmez ve eksik dönem için tahmin üretmez.
        </p>
      </div>

      <IndexManager
        series={data.series as never}
        values={data.values as never}
        map={data.map as never}
      />
    </div>
  )
}
