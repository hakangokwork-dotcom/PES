import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

function readSheet(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
  let headerRow = 0
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i]
    if (Array.isArray(row) && row.some(c => typeof c === 'string' && ['id', 'klasman_ad', 'ad', 'tam_ad', 'mtm'].includes(c as string))) {
      headerRow = i
      break
    }
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: headerRow })
}

export const POST = withTenantRoute(async (req, { sql }) => {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'file gerekli' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const result: Record<string, number> = {}

  const sheetMap: Record<string, string> = {}
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase().replace(/[^a-z_0-9]/g, '')
    if (lower.includes('urun_tipi')) sheetMap['urun_tipi'] = name
    else if (lower.includes('ek_parca_varyant') || lower.includes('varyant')) sheetMap['ek_parca_varyant'] = name
    else if (lower.includes('ek_parca_tipi') || lower.includes('ek_parca')) sheetMap['ek_parca_tipi'] = name
    else if (lower.includes('operasyon_zamani') || lower.includes('zamani')) sheetMap['operasyon_zamani'] = name
    else if (lower.includes('operasyon_grup') || lower.includes('op_grup')) sheetMap['operasyon_grup'] = name
    else if (lower.includes('makine')) sheetMap['makine_tipi'] = name
    else if (lower.includes('operasyon')) sheetMap['operasyon'] = name
  }

  const mapUrunTipi: Record<number, number> = {}
  const mapEkParcaTipi: Record<number, number> = {}
  const mapEkParcaVaryant: Record<number, number> = {}
  const mapOpGrup: Record<number, number> = {}
  const mapOperasyon: Record<number, number> = {}
  const mapMakine: Record<number, number> = {}

  if (sheetMap['urun_tipi']) {
    const rows = readSheet(workbook, sheetMap['urun_tipi'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const klasman = String(r['klasman_ad'] ?? '').trim()
      if (!klasman) continue
      const [row] = await sql`INSERT INTO ref_urun_tipi (klasman_ad, segment, kumas_grubu, urun_grubu, kol_tipi, ozellik)
        VALUES (${klasman}, ${String(r['segment'] ?? '') || null}, ${String(r['kumas_grubu'] ?? '') || null},
                ${String(r['urun_grubu'] ?? '') || null}, ${String(r['kol_tipi'] ?? '') || null}, ${String(r['ozellik'] ?? '') || null})
        ON CONFLICT (klasman_ad) DO UPDATE SET segment=EXCLUDED.segment, kumas_grubu=EXCLUDED.kumas_grubu,
          urun_grubu=EXCLUDED.urun_grubu, kol_tipi=EXCLUDED.kol_tipi, ozellik=EXCLUDED.ozellik RETURNING id`
      if (row && excelId) mapUrunTipi[excelId] = row.id as number
      count++
    }
    result['urun_tipi'] = count
  }

  if (sheetMap['ek_parca_tipi']) {
    const rows = readSheet(workbook, sheetMap['ek_parca_tipi'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const ad = String(r['ad'] ?? '').trim()
      if (!ad) continue
      const [row] = await sql`INSERT INTO ref_ek_parca_tipi (ad) VALUES (${ad}) ON CONFLICT (ad) DO UPDATE SET ad=EXCLUDED.ad RETURNING id`
      if (row && excelId) mapEkParcaTipi[excelId] = row.id as number
      count++
    }
    result['ek_parca_tipi'] = count
  }

  if (sheetMap['ek_parca_varyant']) {
    const rows = readSheet(workbook, sheetMap['ek_parca_varyant'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const tamAd = String(r['tam_ad'] ?? '').trim()
      const excelBaseId = Number(r['ek_parca_tipi_id'])
      if (!tamAd) continue
      const dbBaseId = mapEkParcaTipi[excelBaseId]
      if (!dbBaseId) continue
      const [row] = await sql`INSERT INTO ref_ek_parca_varyant (ek_parca_tipi_id, tam_ad, ozellikler)
        VALUES (${dbBaseId}, ${tamAd}, ${String(r['ozellikler'] ?? '') || null})
        ON CONFLICT (tam_ad) DO UPDATE SET ozellikler=EXCLUDED.ozellikler RETURNING id`
      if (row && excelId) mapEkParcaVaryant[excelId] = row.id as number
      count++
    }
    result['ek_parca_varyant'] = count
  }

  if (sheetMap['operasyon_grup']) {
    const rows = readSheet(workbook, sheetMap['operasyon_grup'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const ad = String(r['ad'] ?? '').trim()
      if (!ad) continue
      const [row] = await sql`INSERT INTO ref_operasyon_grup (ad) VALUES (${ad}) ON CONFLICT (ad) DO UPDATE SET ad=EXCLUDED.ad RETURNING id`
      if (row && excelId) mapOpGrup[excelId] = row.id as number
      count++
    }
    result['operasyon_grup'] = count
  }

  if (sheetMap['makine_tipi']) {
    const rows = readSheet(workbook, sheetMap['makine_tipi'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const ad = String(r['ad'] ?? '').trim()
      if (!ad) continue
      const [row] = await sql`INSERT INTO ref_makine_tipi (ad, aciklama) VALUES (${ad}, ${String(r['aciklama'] ?? '') || null})
        ON CONFLICT (ad) DO UPDATE SET aciklama=EXCLUDED.aciklama RETURNING id`
      if (row && excelId) mapMakine[excelId] = row.id as number
      count++
    }
    result['makine_tipi'] = count
  }

  if (sheetMap['operasyon']) {
    const rows = readSheet(workbook, sheetMap['operasyon'])
    let count = 0
    for (const r of rows) {
      const excelId = Number(r['id'])
      const ad = String(r['ad'] ?? '').trim()
      if (!ad) continue
      const makineTipiId = r['makine_tipi_id'] ? mapMakine[Number(r['makine_tipi_id'])] ?? null : null
      const [row] = await sql`INSERT INTO ref_operasyon (ad, makine_tipi_id)
        VALUES (${ad}, ${makineTipiId}) ON CONFLICT (ad) DO UPDATE SET makine_tipi_id=COALESCE(EXCLUDED.makine_tipi_id, ref_operasyon.makine_tipi_id) RETURNING id`
      if (row && excelId) mapOperasyon[excelId] = row.id as number
      count++
    }
    result['operasyon'] = count
  }

  if (sheetMap['operasyon_zamani']) {
    const rows = readSheet(workbook, sheetMap['operasyon_zamani'])
    let count = 0
    let skipped = 0
    const BATCH_SIZE = 200

    const mapped: { urun_tipi_id: number; ek_parca_varyant_id: number; operasyon_grup_id: number; operasyon_id: number; mtm: number; mtm_min: number | null; mtm_max: number | null; mtm_ortalama: number | null; mtm_std: number | null; orneklem: number; varyasyon_yuzde: number | null; guven_seviyesi: string | null }[] = []

    for (const r of rows) {
      const dbUrunId = mapUrunTipi[Number(r['urun_tipi_id'])]
      const dbVaryantId = mapEkParcaVaryant[Number(r['ek_parca_varyant_id'])]
      const dbGrupId = mapOpGrup[Number(r['operasyon_grup_id'])]
      const dbOpId = mapOperasyon[Number(r['operasyon_id'])]
      const mtm = Number(r['mtm'] ?? 0)
      if (!dbUrunId || !dbVaryantId || !dbGrupId || !dbOpId || mtm <= 0) { skipped++; continue }
      mapped.push({
        urun_tipi_id: dbUrunId, ek_parca_varyant_id: dbVaryantId,
        operasyon_grup_id: dbGrupId, operasyon_id: dbOpId,
        mtm, mtm_min: Number(r['mtm_min'] ?? '') || null, mtm_max: Number(r['mtm_max'] ?? '') || null,
        mtm_ortalama: Number(r['mtm_ortalama'] ?? '') || null, mtm_std: Number(r['mtm_std'] ?? '') || null,
        orneklem: Number(r['orneklem'] ?? 1), varyasyon_yuzde: Number(r['varyasyon_yuzde'] ?? '') || null,
        guven_seviyesi: String(r['guven_seviyesi'] ?? '') || null,
      })
    }

    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE)
      await sql`
        INSERT INTO ref_operasyon_zamani ${sql(batch, 'urun_tipi_id', 'ek_parca_varyant_id', 'operasyon_grup_id', 'operasyon_id', 'mtm', 'mtm_min', 'mtm_max', 'mtm_ortalama', 'mtm_std', 'orneklem', 'varyasyon_yuzde', 'guven_seviyesi')}
        ON CONFLICT (urun_tipi_id, ek_parca_varyant_id, operasyon_grup_id, operasyon_id)
        DO UPDATE SET mtm=EXCLUDED.mtm, mtm_min=EXCLUDED.mtm_min, mtm_max=EXCLUDED.mtm_max,
          mtm_ortalama=EXCLUDED.mtm_ortalama, mtm_std=EXCLUDED.mtm_std, orneklem=EXCLUDED.orneklem,
          varyasyon_yuzde=EXCLUDED.varyasyon_yuzde, guven_seviyesi=EXCLUDED.guven_seviyesi
      `
      count += batch.length
    }

    result['operasyon_zamani'] = count
    result['operasyon_zamani_skipped'] = skipped
  }

  return NextResponse.json({ ok: true, result, message: 'Referans veri yuklendi' })
}, { internalAdmin: true })
