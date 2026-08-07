import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { taslakSablon, siraDogrula, dbHata } from '../_guard'

/**
 * Seviye maddeleri — denetimde tek tek işaretlenen satırlar.
 *
 *   POST   /api/pes/olgunluk/kriter   { surec_id, seviye, metin, taraf?, zorunlu? }
 *   PATCH  /api/pes/olgunluk/kriter   { id, ...değişen alanlar }
 *   PUT    /api/pes/olgunluk/kriter   { surec_id, seviye, sira: [id, id, ...] }
 *   DELETE /api/pes/olgunluk/kriter?id=88
 *
 * SIRA SEVİYE İÇİNDE: madde "seviye 2'nin 3. maddesi" olarak anlam taşır;
 * seviyeler arası tek bir global sıra olsaydı bir seviyeye madde eklemek
 * diğerlerinin numaralarını kaydırırdı.
 */

const TARAFLAR = new Set(['ATOLYE', 'MARKA'])

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = (await req.json()) as Record<string, unknown>
  const surecId = Number(body.surec_id)
  if (!Number.isInteger(surecId)) {
    return NextResponse.json({ error: 'Geçersiz süreç' }, { status: 400 })
  }
  const [surec] = await sql`SELECT id, sablon_id FROM olgunluk_surec WHERE id = ${surecId}`
  if (!surec) return NextResponse.json({ error: 'Süreç bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, surec.sablon_id as number)
  if ('hata' in g) return g.hata

  const seviye = Number(body.seviye)
  if (!Number.isInteger(seviye) || seviye < 1 || seviye > 3) {
    return NextResponse.json({ error: 'Seviye 1, 2 veya 3 olmalı' }, { status: 400 })
  }
  const metin = String(body.metin ?? '').trim()
  if (!metin) return NextResponse.json({ error: 'Madde metni gerekli' }, { status: 400 })

  const taraf = String(body.taraf ?? 'ATOLYE').toUpperCase()
  if (!TARAFLAR.has(taraf)) {
    return NextResponse.json({ error: 'Taraf ATOLYE veya MARKA olmalı' }, { status: 400 })
  }

  try {
    const [{ sonSira }] = await sql`
      SELECT COALESCE(max(sira), 0)::int AS "sonSira"
        FROM olgunluk_kriter WHERE surec_id = ${surecId} AND seviye = ${seviye}`
    const [satir] = await sql`
      INSERT INTO olgunluk_kriter
        (tenant_id, sablon_id, surec_id, seviye, sira, metin, taraf, zorunlu)
      VALUES (${tenant.tenantId}, ${g.sablonId}, ${surecId}, ${seviye}, ${sonSira + 1},
              ${metin}, ${taraf}, ${body.zorunlu === false ? false : true})
      RETURNING id`
    return NextResponse.json({ id: satir.id })
  } catch (e) {
    return dbHata(e)
  }
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const id = Number(body.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz madde' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id, surec_id FROM olgunluk_kriter WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Madde bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  const alanlar: Record<string, string | number | boolean> = {}
  if ('metin' in body) {
    const v = String(body.metin ?? '').trim()
    if (!v) return NextResponse.json({ error: 'Madde metni boş olamaz' }, { status: 400 })
    alanlar.metin = v
  }
  if ('taraf' in body) {
    const v = String(body.taraf ?? '').toUpperCase()
    if (!TARAFLAR.has(v)) {
      return NextResponse.json({ error: 'Taraf ATOLYE veya MARKA olmalı' }, { status: 400 })
    }
    alanlar.taraf = v
  }
  if ('zorunlu' in body) alanlar.zorunlu = Boolean(body.zorunlu)
  if ('aktif' in body) alanlar.aktif = Boolean(body.aktif)
  if ('seviye' in body) {
    const s = Number(body.seviye)
    if (!Number.isInteger(s) || s < 1 || s > 3) {
      return NextResponse.json({ error: 'Seviye 1, 2 veya 3 olmalı' }, { status: 400 })
    }
    // Seviye değişince madde yeni seviyenin sonuna gider; eski sıra
    // numarası orada başka bir maddeyle çakışırdı.
    const [{ sonSira }] = await sql`
      SELECT COALESCE(max(sira), 0)::int AS "sonSira"
        FROM olgunluk_kriter WHERE surec_id = ${mevcut.surec_id} AND seviye = ${s}`
    alanlar.seviye = s
    alanlar.sira = sonSira + 1
  }

  if (Object.keys(alanlar).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok' }, { status: 400 })
  }

  try {
    await sql`UPDATE olgunluk_kriter SET ${sql(alanlar)}, updated_at = now() WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})

export const PUT = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const surecId = Number(body.surec_id)
  const seviye = Number(body.seviye)
  if (!Number.isInteger(surecId) || !Number.isInteger(seviye)) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }
  const [surec] = await sql`SELECT sablon_id FROM olgunluk_surec WHERE id = ${surecId}`
  if (!surec) return NextResponse.json({ error: 'Süreç bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, surec.sablon_id as number)
  if ('hata' in g) return g.hata

  const idler = siraDogrula(body)
  if (!idler) return NextResponse.json({ error: 'Sıra listesi geçersiz' }, { status: 400 })

  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet FROM olgunluk_kriter
     WHERE surec_id = ${surecId} AND seviye = ${seviye} AND id = ANY(${idler}::int[])`
  if (adet !== idler.length) {
    return NextResponse.json({ error: 'Sıra listesi bu seviyeyle uyuşmuyor' }, { status: 400 })
  }

  const siralar = idler.map((_, i) => i + 1)
  await sql`
    UPDATE olgunluk_kriter k SET sira = v.sira, updated_at = now()
      FROM unnest(${idler}::int[], ${siralar}::int[]) AS v(id, sira)
     WHERE k.id = v.id`
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '')
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz madde' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id FROM olgunluk_kriter WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Madde bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  try {
    await sql`DELETE FROM olgunluk_kriter WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})
