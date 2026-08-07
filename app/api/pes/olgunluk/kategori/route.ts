import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { taslakSablon, siraDogrula, dbHata } from '../_guard'

/**
 * Radar eksenleri.
 *
 *   POST   /api/pes/olgunluk/kategori   { sablon_id, kod, ad }
 *   PATCH  /api/pes/olgunluk/kategori   { id, kod?, ad?, aktif? }
 *   PUT    /api/pes/olgunluk/kategori   { sablon_id, sira: [id, id, ...] }
 *   DELETE /api/pes/olgunluk/kategori?id=4
 *
 * Silme yalnız BOŞ kategoride mümkün: süreç -> kategori FK'sı RESTRICT.
 * Dolu kategoriyi silmek süreçleri sahipsiz bırakırdı, o yüzden önce
 * süreçler taşınmalı. Hata mesajı bunu söyler.
 */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = (await req.json()) as Record<string, unknown>
  const g = await taslakSablon(sql, Number(body.sablon_id))
  if ('hata' in g) return g.hata

  const kod = String(body.kod ?? '').trim()
  const ad = String(body.ad ?? '').trim()
  if (!kod || !ad) return NextResponse.json({ error: 'Kod ve ad gerekli' }, { status: 400 })

  try {
    const [{ sonSira }] = await sql`
      SELECT COALESCE(max(sira), 0)::int AS "sonSira"
        FROM olgunluk_kategori WHERE sablon_id = ${g.sablonId}`
    const [satir] = await sql`
      INSERT INTO olgunluk_kategori (tenant_id, sablon_id, kod, ad, sira)
      VALUES (${tenant.tenantId}, ${g.sablonId}, ${kod}, ${ad}, ${sonSira + 1})
      RETURNING id`
    return NextResponse.json({ id: satir.id })
  } catch (e) {
    return dbHata(e)
  }
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const id = Number(body.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz kategori' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id FROM olgunluk_kategori WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Kategori bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  const alanlar: Record<string, string | boolean> = {}
  if ('kod' in body) {
    const v = String(body.kod ?? '').trim()
    if (!v) return NextResponse.json({ error: 'Kod boş olamaz' }, { status: 400 })
    alanlar.kod = v
  }
  if ('ad' in body) {
    const v = String(body.ad ?? '').trim()
    if (!v) return NextResponse.json({ error: 'Ad boş olamaz' }, { status: 400 })
    alanlar.ad = v
  }
  if ('aktif' in body) alanlar.aktif = Boolean(body.aktif)

  if (Object.keys(alanlar).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok' }, { status: 400 })
  }
  try {
    await sql`UPDATE olgunluk_kategori SET ${sql(alanlar)}, updated_at = now() WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})

export const PUT = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const g = await taslakSablon(sql, Number(body.sablon_id))
  if ('hata' in g) return g.hata

  const idler = siraDogrula(body)
  if (!idler) return NextResponse.json({ error: 'Sıra listesi geçersiz' }, { status: 400 })

  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet FROM olgunluk_kategori
     WHERE sablon_id = ${g.sablonId} AND id = ANY(${idler}::int[])`
  if (adet !== idler.length) {
    return NextResponse.json({ error: 'Sıra listesi bu sürümle uyuşmuyor' }, { status: 400 })
  }

  const siralar = idler.map((_, i) => i + 1)
  await sql`
    UPDATE olgunluk_kategori k SET sira = v.sira, updated_at = now()
      FROM unnest(${idler}::int[], ${siralar}::int[]) AS v(id, sira)
     WHERE k.id = v.id`
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '')
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz kategori' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id FROM olgunluk_kategori WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Kategori bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet FROM olgunluk_surec WHERE kategori_id = ${id}`
  if (adet > 0) {
    return NextResponse.json({
      error: `Kategoride ${adet} süreç var; önce başka kategoriye taşıyın.`,
    }, { status: 409 })
  }

  try {
    await sql`DELETE FROM olgunluk_kategori WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})
