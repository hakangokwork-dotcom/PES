import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'
import { gerekceGerekli, PLAN_GEREKCELERI } from '@/lib/pes/is-emri-adim'

/**
 * İş emri adımı (work_order_stage) güncelleme. COALESCE deseni: gönderilmeyen
 * ya da null alan değişmez (null firmayı silmez — firma kaldırma 2a dışı).
 *
 * 064: önceden girilmiş plan tarihi değişiyorsa gerekce_kodu zorunlu (DIGER ise
 * gerekce_notu da). Gerekçe işlem-yerel ayarla tetikleyiciye geçer ve
 * adim_plan_gecmisi'ne yazılır.
 */
const GEREKCE_KODLARI = new Set<string>(PLAN_GEREKCELERI.map(g => g.kod))

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const id = idOku(body.id == null ? null : String(body.id))
  if (id === null) return gecersizKimlik()

  const [eski] = await sql`SELECT plan_baslangic::text, plan_bitis::text FROM work_order_stage WHERE id = ${id}`
  if (!eski) return NextResponse.json({ error: 'Adım bulunamadı' }, { status: 404 })
  const kod: string | null = body.gerekce_kodu || null
  const not: string | null = body.gerekce_notu ? String(body.gerekce_notu).trim() || null : null
  // null alan COALESCE ile değişmez; gerekçe kuralına da girmesin.
  const yeni = Object.fromEntries((['plan_baslangic', 'plan_bitis'] as const)
    .filter(k => body[k] != null).map(k => [k, String(body[k]).slice(0, 10)]))
  if (gerekceGerekli(eski, yeni) && !kod) {
    return NextResponse.json({ error: 'Plan tarihi değişiyor: gerekçe seçin.' }, { status: 400 })
  }
  if (kod && !GEREKCE_KODLARI.has(kod)) return NextResponse.json({ error: 'Geçersiz gerekçe' }, { status: 400 })
  if (kod === 'DIGER' && !not) return NextResponse.json({ error: '"Diğer" gerekçesinde not zorunlu.' }, { status: 400 })
  if (body.is_ortagi_id != null) {
    // FK RLS'i aşar; firmanın bu kiracıda görünür olduğunu burada doğrula.
    const ortak = idOku(String(body.is_ortagi_id))
    const [o] = ortak === null ? [] : await sql`SELECT id FROM is_ortagi WHERE id = ${ortak}`
    if (!o) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })
  }
  await sql`SELECT set_config('app.plan_gerekce', ${kod ?? ''}, true), set_config('app.plan_notu', ${not ?? ''}, true)`

  const [row] = await sql`UPDATE work_order_stage SET
    line_id          = COALESCE(${body.line_id ?? null},          line_id),
    is_ortagi_id     = COALESCE(${body.is_ortagi_id ?? null},     is_ortagi_id),
    plan_baslangic   = COALESCE(${body.plan_baslangic ?? null},   plan_baslangic),
    plan_bitis       = COALESCE(${body.plan_bitis ?? null},       plan_bitis),
    plan_sure_dk     = COALESCE(${body.plan_sure_dk ?? null},     plan_sure_dk),
    gercek_baslangic = COALESCE(${body.gercek_baslangic ?? null}, gercek_baslangic),
    gercek_bitis     = COALESCE(${body.gercek_bitis ?? null},     gercek_bitis),
    gercek_sure_dk   = COALESCE(${body.gercek_sure_dk ?? null},   gercek_sure_dk),
    durum            = COALESCE(${body.durum ?? null},            durum),
    ilerleme_pct     = COALESCE(${body.ilerleme_pct ?? null},     ilerleme_pct),
    uretilen_adet    = COALESCE(${body.uretilen_adet ?? null},    uretilen_adet),
    hatali_adet      = COALESCE(${body.hatali_adet ?? null},      hatali_adet),
    notlar           = COALESCE(${body.notlar ?? null},           notlar),
    updated_at       = now()
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ stage: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM work_order_stage WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
