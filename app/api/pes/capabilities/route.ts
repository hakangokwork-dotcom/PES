import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const action = req.nextUrl.searchParams.get('action') || 'dimensions'
  const lineId = req.nextUrl.searchParams.get('line_id')

  if (action === 'dimensions') {
    const dims = await sql`SELECT d.*, json_agg(json_build_object('id', v.id, 'code', v.code, 'label', v.label, 'sort_order', v.sort_order, 'tenant_id', v.tenant_id) ORDER BY v.sort_order) AS values
      FROM capability_dimension d
      LEFT JOIN capability_value v ON v.dimension_id = d.id
      GROUP BY d.id ORDER BY d.sort_order`
    return NextResponse.json({ dimensions: dims })
  }

  if (action === 'line_profile' && lineId) {
    const caps = await sql`SELECT dimension_code, value_code, attribute_type, proficiency
      FROM line_capability WHERE line_id = ${Number(lineId)} AND attribute_type = 'PROFILE'`
    return NextResponse.json({ capabilities: caps })
  }

  if (action === 'summary' && lineId) {
    const summary = await sql`
      SELECT d.label AS boyut, d.sort_order,
        string_agg(cv.label, ' / ' ORDER BY cv.sort_order) AS degerler,
        count(*)::int AS sayi
      FROM line_capability lc
      JOIN capability_dimension d ON d.code = lc.dimension_code
      JOIN capability_value cv ON cv.code = lc.value_code AND cv.dimension_id = d.id
      WHERE lc.line_id = ${Number(lineId)} AND lc.attribute_type = 'PROFILE'
      GROUP BY d.label, d.sort_order ORDER BY d.sort_order`
    return NextResponse.json({ summary })
  }

  return NextResponse.json({ error: 'Gecersiz action' }, { status: 400 })
})

/* Bandın yetenek profili — GÖNDERİLEN LİSTE NİHAİDİR (sil-ve-yaz).
   İstemci tam listeyi gönderir; listede olmayan silinmiş sayılır. Kısmi
   güncelleme yok, çünkü kullanıcı ekranda profilin tamamını görüp kaydediyor. */
const kaydetSemasi = z.object({
  line_id: z.number().int().positive(),
  capabilities: z.array(z.object({
    dimension_code: z.string().min(1).max(50),
    value_code: z.string().min(1).max(50),
    /* 0-3 ölçeği: bkz. migration 023. Verilmezse 1 = "yapabilir". */
    proficiency: z.number().int().min(0).max(3).default(1),
  })).max(500),
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const parsed = kaydetSemasi.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { line_id, capabilities } = parsed.data

  /* Bant bu tenant'a mı ait? RLS zaten süzer; sessiz 0-satır yerine açık
     404 dönmek yanlış bant id'sini görünür kılar. */
  const [line] = await sql`SELECT id FROM production_line WHERE id = ${line_id}`
  if (!line) return NextResponse.json({ error: 'Bant bulunamadı' }, { status: 404 })

  /* Katalogda olmayan kod sessizce yazılmasın: ekranda görünmeyen, hiçbir
     rapora düşmeyen ölü kayıt üretir ve fark edilmesi çok sonra olur. */
  if (capabilities.length) {
    const gecerli = await sql`
      SELECT d.code AS dim, v.code AS val
      FROM capability_dimension d JOIN capability_value v ON v.dimension_id = d.id`
    const kume = new Set(gecerli.map((r) => `${r.dim}|${r.val}`))
    const bilinmeyen = capabilities.filter((c) => !kume.has(`${c.dimension_code}|${c.value_code}`))
    if (bilinmeyen.length) {
      return NextResponse.json(
        { error: `Katalogda olmayan yetenek: ${bilinmeyen[0].dimension_code}/${bilinmeyen[0].value_code}` },
        { status: 400 }
      )
    }
  }

  await sql`DELETE FROM line_capability WHERE line_id = ${line_id} AND attribute_type = 'PROFILE'`

  if (capabilities.length > 0) {
    const rows = capabilities.map((c) => ({
      tenant_id: tenant.tenantId,
      line_id,
      dimension_code: c.dimension_code,
      value_code: c.value_code,
      attribute_type: 'PROFILE',
      proficiency: c.proficiency,
    }))
    await sql`INSERT INTO line_capability ${sql(rows, 'tenant_id', 'line_id', 'dimension_code', 'value_code', 'attribute_type', 'proficiency')}
      ON CONFLICT (line_id, dimension_code, value_code, attribute_type)
      DO UPDATE SET proficiency = EXCLUDED.proficiency`
  }

  return NextResponse.json({ ok: true, saved: capabilities.length })
})
