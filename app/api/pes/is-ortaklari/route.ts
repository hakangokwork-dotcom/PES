// app/api/pes/is-ortaklari/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { ORTAK_TIPLERI, iletisimAlanlari } from '@/lib/pes/is-emri-adim'

/**
 * İş ortağı (064). Okuma kiracı içi herkes (atölye de); yazma yalnız merkez.
 *
 *   GET  /api/pes/is-ortaklari?tip=&q=&aktif=1  → { ortaklar }
 *   POST /api/pes/is-ortaklari  { tip, unvan, kisa_ad?, vergi_no?, adres?, il?, telefon?, eposta?, notlar? }
 *        Atölye tipi burada açılmaz: atölye kaydı açılınca tetikleyiciyle gelir.
 */
const merkezDegil = () => NextResponse.json({ error: 'İş ortaklarını yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute(async (req, { sql }) => {
  const p = req.nextUrl.searchParams
  const tip = p.get('tip') || null
  const q = p.get('q')?.trim() ? `%${p.get('q')!.trim()}%` : null
  const aktif = p.get('aktif') === '1'
  const ortaklar = await sql`
    SELECT id, tip, unvan, kisa_ad, vergi_no, adres, il, telefon, eposta, notlar, aktif, workshop_id,
           giren_taraf, giren_eposta, girildi_at
      FROM is_ortagi
     WHERE (${tip}::text IS NULL OR tip = ${tip})
       AND (${q}::text IS NULL OR unvan ILIKE ${q} OR kisa_ad ILIKE ${q})
       AND (${!aktif} OR aktif)
     ORDER BY tip, unvan`
  return NextResponse.json({ ortaklar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const b = await req.json()
  if (!ORTAK_TIPLERI.includes(b.tip)) return NextResponse.json({ error: 'Geçersiz firma tipi' }, { status: 400 })
  if (b.tip === 'Atölye') return NextResponse.json({ error: 'Atölyeler atölye ekranından açılır' }, { status: 400 })
  const unvan = String(b.unvan ?? '').trim()
  if (!unvan) return NextResponse.json({ error: 'Unvan zorunlu' }, { status: 400 })
  try {
    const [o] = await sql`
      INSERT INTO is_ortagi ${sql({ ...iletisimAlanlari(b), tenant_id: tenant.tenantId, tip: b.tip, unvan })}
      RETURNING id`
    return NextResponse.json({ id: o.id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: `${b.tip} tipinde "${unvan}" zaten kayıtlı` }, { status: 409 })
    }
    throw e
  }
})
