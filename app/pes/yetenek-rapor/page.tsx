import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'

export const dynamic = 'force-dynamic'

export default async function YetenekRaporPage() {
  const data = await withServerTenant(async (sql) => {
    let dims: Record<string, unknown>[] = []
    let lineData: Record<string, unknown>[] = []
    let workshopData: Record<string, unknown>[] = []
    let tableMissing = false

    try {
      lineData = await sql`
        SELECT lc.dimension_code, lc.value_code, COUNT(DISTINCT lc.line_id)::int AS bant_sayisi,
               SUM(pl.operator_count)::int AS toplam_operator,
               SUM(pl.daily_target)::int AS toplam_hedef,
               COUNT(DISTINCT pl.workshop_id)::int AS atolye_sayisi
        FROM line_capability lc
        JOIN production_line pl ON pl.id = lc.line_id AND pl.is_active = true
        WHERE lc.attribute_type = 'PROFILE'
        GROUP BY lc.dimension_code, lc.value_code
        ORDER BY lc.dimension_code, bant_sayisi DESC
      `
      dims = await sql`
        SELECT d.code, d.label, d.sort_order,
          json_agg(json_build_object('code', v.code, 'label', v.label) ORDER BY v.sort_order) AS vals
        FROM capability_dimension d
        LEFT JOIN capability_value v ON v.dimension_id = d.id
        GROUP BY d.id ORDER BY d.sort_order
      `
      workshopData = await sql`
        SELECT w.id, w.code, w.name, pl.id AS line_id, pl.code AS line_code, pl.name AS line_name,
               pl.operator_count, pl.daily_target,
               lc.dimension_code, lc.value_code
        FROM line_capability lc
        JOIN production_line pl ON pl.id = lc.line_id AND pl.is_active = true
        JOIN workshop w ON w.id = pl.workshop_id AND w.is_active = true
        WHERE lc.attribute_type = 'PROFILE'
        ORDER BY w.code, pl.code
      `
    } catch {
      tableMissing = true
    }
    return { dims, lineData, workshopData, tableMissing }
  })

  if (!data) redirect('/login')

  if (data.tableMissing) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Yetenek Kirilim Raporu</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          Yetenek tablolari henuz olusturulmamis. Supabase SQL Editor&apos;da 014_bant_attribute.sql dosyasini calistirin.
        </div>
      </div>
    )
  }

  const { dims, lineData, workshopData } = data

  const dimMap: Record<string, { label: string; vals: Record<string, string> }> = {}
  for (const d of dims) {
    const vals: Record<string, string> = {}
    for (const v of (d.vals as { code: string; label: string }[] ?? [])) {
      vals[v.code] = v.label
    }
    dimMap[d.code as string] = { label: d.label as string, vals }
  }

  const byDim: Record<string, { value_code: string; label: string; bant_sayisi: number; toplam_operator: number; toplam_hedef: number; atolye_sayisi: number }[]> = {}
  for (const r of lineData) {
    const dc = r.dimension_code as string
    if (!byDim[dc]) byDim[dc] = []
    byDim[dc].push({
      value_code: r.value_code as string,
      label: dimMap[dc]?.vals[r.value_code as string] || (r.value_code as string),
      bant_sayisi: r.bant_sayisi as number,
      toplam_operator: r.toplam_operator as number,
      toplam_hedef: r.toplam_hedef as number,
      atolye_sayisi: r.atolye_sayisi as number,
    })
  }

  const atolyeKlasmanMap: Record<string, { code: string; name: string; klasmanlar: Set<string>; bantSayisi: number; toplamOp: number; toplamHedef: number }> = {}
  for (const r of workshopData) {
    const wCode = r.code as string
    if (!atolyeKlasmanMap[wCode]) {
      atolyeKlasmanMap[wCode] = { code: wCode, name: r.name as string, klasmanlar: new Set(), bantSayisi: 0, toplamOp: 0, toplamHedef: 0 }
    }
    if ((r.dimension_code as string) === 'klasman') {
      atolyeKlasmanMap[wCode].klasmanlar.add(r.value_code as string)
    }
  }
  const linesSeen = new Set<number>()
  for (const r of workshopData) {
    const wCode = r.code as string
    const lineId = r.line_id as number
    if (!linesSeen.has(lineId)) {
      linesSeen.add(lineId)
      if (atolyeKlasmanMap[wCode]) {
        atolyeKlasmanMap[wCode].bantSayisi++
        atolyeKlasmanMap[wCode].toplamOp += (r.operator_count as number) || 0
        atolyeKlasmanMap[wCode].toplamHedef += (r.daily_target as number) || 0
      }
    }
  }

  const allKlasmans = [...new Set(workshopData.filter(r => (r.dimension_code as string) === 'klasman').map(r => r.value_code as string))].sort()

  const totalBant = linesSeen.size
  const totalOp = Object.values(atolyeKlasmanMap).reduce((s, a) => s + a.toplamOp, 0)
  const totalHedef = Object.values(atolyeKlasmanMap).reduce((s, a) => s + a.toplamHedef, 0)

  const fmt = (n: number) => n.toLocaleString('tr-TR')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Yetenek Kirilim Raporu</h1>
        <p className="text-sm text-faint">Tum atolyelerin bant yetenek profilleri — kapasite dagilimi</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-line-soft rounded-xl p-4 text-center">
          <p className="text-xs text-faint">Profil Tanimli Bant</p>
          <p className="text-2xl font-bold text-ink">{totalBant}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4 text-center">
          <p className="text-xs text-faint">Toplam Operator</p>
          <p className="text-2xl font-bold text-ink">{fmt(totalOp)}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4 text-center">
          <p className="text-xs text-faint">Gunluk Kapasite</p>
          <p className="text-2xl font-bold text-ink">{fmt(totalHedef)}</p>
          <p className="text-[10px] text-faint">adet/gun (aylik: {fmt(totalHedef * 22)})</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4 text-center">
          <p className="text-xs text-faint">Atolye Sayisi</p>
          <p className="text-2xl font-bold text-ink">{Object.keys(atolyeKlasmanMap).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(dimMap).map(([dimCode, dim]) => {
          const items = byDim[dimCode] ?? []
          if (items.length === 0) return null
          const maxBant = Math.max(...items.map(i => i.bant_sayisi), 1)
          return (
            <div key={dimCode} className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-canvas border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">{dim.label}</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(item => (
                  <div key={item.value_code} className="px-4 py-2 flex items-center gap-3">
                    <span className="text-sm text-gray-800 w-28 truncate">{item.label}</span>
                    <div className="flex-1">
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${(item.bant_sayisi / maxBant) * 100}%` }}></div>
                      </div>
                    </div>
                    <div className="text-right w-32 flex gap-2">
                      <span className="text-xs text-muted w-14">{item.bant_sayisi} bant</span>
                      <span className="text-xs text-faint w-18">{fmt(item.toplam_operator)} op</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {allKlasmans.length > 0 && Object.keys(atolyeKlasmanMap).length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-canvas border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Atolye x Klasman Matrisi</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-faint border-b border-gray-100">
                  <th className="text-left px-3 py-2 sticky left-0 bg-white">Atolye</th>
                  <th className="text-center px-1 py-2">Bant</th>
                  <th className="text-center px-1 py-2">Op</th>
                  <th className="text-center px-1 py-2">Kap/gun</th>
                  {allKlasmans.map(k => (
                    <th key={k} className="text-center px-2 py-2 min-w-[60px]">{dimMap['klasman']?.vals[k] || k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(atolyeKlasmanMap).map(a => (
                  <tr key={a.code} className="border-b border-gray-50 hover:bg-canvas">
                    <td className="px-3 py-2 font-medium text-ink sticky left-0 bg-white">{a.code} <span className="text-faint font-normal">— {a.name}</span></td>
                    <td className="text-center px-1 py-2">{a.bantSayisi}</td>
                    <td className="text-center px-1 py-2">{a.toplamOp}</td>
                    <td className="text-center px-1 py-2 font-mono">{fmt(a.toplamHedef)}</td>
                    {allKlasmans.map(k => (
                      <td key={k} className="text-center px-2 py-2">
                        {a.klasmanlar.has(k) ? (
                          <span className="inline-block w-5 h-5 rounded bg-emerald-500 text-white text-[10px] leading-5">✓</span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lineData.length === 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-8 text-center text-faint">
          Henuz bant yetenek profili tanimlanmamis. Atolye Profil sayfasindan bantlara yetenek atamasi yapin.
        </div>
      )}
    </div>
  )
}
