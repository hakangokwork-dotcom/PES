import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { taslakSablon, siraDogrula, dbHata } from '../_guard'

/**
 * Katalog süreçleri (33 satırlık liste).
 *
 *   POST   /api/pes/olgunluk/surec    { sablon_id, kategori_id, kod, ad, agirlik? }
 *   PATCH  /api/pes/olgunluk/surec    { id, ...değişen alanlar }
 *   PUT    /api/pes/olgunluk/surec    { sablon_id, sira: [id, id, ...] }
 *   DELETE /api/pes/olgunluk/surec?id=12
 *
 * SİLME İKİ YOLLU: hiç kullanılmamış süreç gerçekten silinir; kriterleri
 * cevaplanmışsa FK RESTRICT durdurur ve kullanıcıya "pasife alın" denir.
 * Sessizce pasife almak, kullanıcının sildim sandığı satırı raporda
 * bırakırdı.
 */

function agirlikCoz(v: unknown): number | { hata: string } {
  const n = Number(String(v ?? '1').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return { hata: 'Ağırlık pozitif bir sayı olmalı' }
  return n
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = (await req.json()) as Record<string, unknown>
  const g = await taslakSablon(sql, Number(body.sablon_id))
  if ('hata' in g) return g.hata

  const kod = String(body.kod ?? '').trim()
  const ad = String(body.ad ?? '').trim()
  const kategoriId = Number(body.kategori_id)
  if (!kod || !ad) return NextResponse.json({ error: 'Kod ve ad gerekli' }, { status: 400 })
  if (!Number.isInteger(kategoriId)) {
    return NextResponse.json({ error: 'Kategori seçilmeli' }, { status: 400 })
  }
  const agirlik = agirlikCoz(body.agirlik)
  if (typeof agirlik === 'object') return NextResponse.json({ error: agirlik.hata }, { status: 400 })

  const [kat] = await sql`
    SELECT id FROM olgunluk_kategori WHERE id = ${kategoriId} AND sablon_id = ${g.sablonId}`
  if (!kat) return NextResponse.json({ error: 'Kategori bu sürüme ait değil' }, { status: 400 })

  try {
    const [{ sonSira }] = await sql`
      SELECT COALESCE(max(sira), 0)::int AS "sonSira"
        FROM olgunluk_surec WHERE sablon_id = ${g.sablonId}`
    const [satir] = await sql`
      INSERT INTO olgunluk_surec
        (tenant_id, sablon_id, kategori_id, kod, ad, agirlik, sira, not_metni)
      VALUES (${tenant.tenantId}, ${g.sablonId}, ${kategoriId}, ${kod}, ${ad},
              ${agirlik}, ${sonSira + 1}, ${String(body.not_metni ?? '').trim() || null})
      RETURNING id`
    return NextResponse.json({ id: satir.id })
  } catch (e) {
    return dbHata(e)
  }
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const id = Number(body.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz süreç' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id FROM olgunluk_surec WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Süreç bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  const alanlar: Record<string, string | number | boolean | null> = {}
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
  if ('kategori_id' in body) {
    const kid = Number(body.kategori_id)
    const [kat] = await sql`
      SELECT id FROM olgunluk_kategori WHERE id = ${kid} AND sablon_id = ${g.sablonId}`
    if (!kat) return NextResponse.json({ error: 'Kategori bu sürüme ait değil' }, { status: 400 })
    alanlar.kategori_id = kid
  }
  if ('agirlik' in body) {
    const a = agirlikCoz(body.agirlik)
    if (typeof a === 'object') return NextResponse.json({ error: a.hata }, { status: 400 })
    alanlar.agirlik = a
  }
  if ('aktif' in body) alanlar.aktif = Boolean(body.aktif)
  if ('not_metni' in body) alanlar.not_metni = String(body.not_metni ?? '').trim() || null

  if (Object.keys(alanlar).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok' }, { status: 400 })
  }

  try {
    await sql`UPDATE olgunluk_surec SET ${sql(alanlar)}, updated_at = now() WHERE id = ${id}`
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

  // Gelen id'lerin hepsi bu şablona ait olmalı: aksi halde başka bir
  // sürümün sıraları sessizce ezilir.
  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet FROM olgunluk_surec
     WHERE sablon_id = ${g.sablonId} AND id = ANY(${idler}::int[])`
  if (adet !== idler.length) {
    return NextResponse.json({ error: 'Sıra listesi bu sürümle uyuşmuyor' }, { status: 400 })
  }

  const siralar = idler.map((_, i) => i + 1)
  await sql`
    UPDATE olgunluk_surec s SET sira = v.sira, updated_at = now()
      FROM unnest(${idler}::int[], ${siralar}::int[]) AS v(id, sira)
     WHERE s.id = v.id`
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '')
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz süreç' }, { status: 400 })

  const [mevcut] = await sql`SELECT sablon_id FROM olgunluk_surec WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Süreç bulunamadı' }, { status: 404 })
  const g = await taslakSablon(sql, mevcut.sablon_id as number)
  if ('hata' in g) return g.hata

  try {
    await sql`DELETE FROM olgunluk_surec WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})
