import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { bildirimDogrula } from '@/lib/pes/plan-bildirim'

/**
 * Plan bildirimi: gecikme (atölye → planlamacı) ve değişiklik
 * (planlamacı → atölye).
 *
 * TİPİ KİM YAZABİLİR, BURADA SINIRLANIR. RLS satır seviyesinde çalışıyor
 * ve iki taraf da kendi satırını yazabiliyor; "atölye gecikme bildirir,
 * iç ekip değişiklik bildirir" kuralı kolon değil ROL kuralı olduğu için
 * politikayla ifade edilemez.
 *
 * Kendi kendine bildirim yok: atölye kendi planını değiştirdiğini
 * bildiremez (o zaten gecikmedir), iç ekip de gecikme uyduramaz.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const tip = String(b.tip ?? '')
  const workOrderId = Number(b.work_order_id)
  const yeniBitis = String(b.yeni_bitis ?? '')
  const eskiBitis = b.eski_bitis ? String(b.eski_bitis) : null
  const gerekceKodu = b.gerekce_kodu ? String(b.gerekce_kodu) : null
  const not = b.not ? String(b.not).slice(0, 1000) : null

  const atolyeMi = tenant.workshopId !== null

  if (atolyeMi && tip !== 'gecikme') {
    return NextResponse.json(
      { error: 'Atölye yalnız gecikme bildirebilir' }, { status: 403 })
  }
  if (!atolyeMi && tip !== 'degisiklik') {
    return NextResponse.json(
      { error: 'Merkez yalnız plan değişikliği bildirebilir' }, { status: 403 })
  }
  if (!Number.isInteger(workOrderId)) {
    return NextResponse.json({ error: 'work_order_id zorunlu' }, { status: 400 })
  }

  const hatalar = bildirimDogrula({ tip, yeniBitis, gerekceKodu, not })
  if (hatalar.length > 0) {
    return NextResponse.json({ error: hatalar[0].mesaj, hatalar }, { status: 400 })
  }
  if (eskiBitis !== null && !/^\d{4}-\d{2}-\d{2}$/.test(eskiBitis)) {
    return NextResponse.json({ error: 'eski_bitis YYYY-AA-GG olmalı' }, { status: 400 })
  }

  /* İş emrinin atölyesi kaynaktan okunur; gövdeden gelen bir workshop_id'ye
     güvenilmez. Atölye kendi işi olmayan bir emir için bildirim yazamasın. */
  const [wo] = await sql`
    SELECT id, workshop_id FROM work_order WHERE id = ${workOrderId}
  ` as unknown as Array<{ id: number; workshop_id: number | null }>
  if (!wo) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  if (wo.workshop_id === null) {
    return NextResponse.json(
      { error: 'Bu iş emri henüz bir atölyeye bağlı değil' }, { status: 400 })
  }
  if (atolyeMi && wo.workshop_id !== tenant.workshopId) {
    return NextResponse.json({ error: 'Bu iş emri sizin değil' }, { status: 403 })
  }

  const [row] = await sql`
    INSERT INTO plan_bildirim
      (tenant_id, workshop_id, work_order_id, tip, eski_bitis, yeni_bitis,
       gerekce_kodu, not_metni)
    VALUES (${tenant.tenantId}, ${wo.workshop_id}, ${workOrderId}, ${tip},
            ${eskiBitis}::date, ${yeniBitis}::date, ${gerekceKodu}, ${not})
    RETURNING id, tip, eski_bitis::text, yeni_bitis::text, gerekce_kodu, created_at
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ bildirim: row })
})

/** Okundu işaretle. İÇERİK DEĞİŞTİRİLMEZ — bildirim kaydı sabittir. */
export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    UPDATE plan_bildirim SET okundu_at = now()
     WHERE id = ${id} AND okundu_at IS NULL
    RETURNING id, okundu_at
  ` as unknown as Array<{ id: number; okundu_at: string }>
  if (!row) return NextResponse.json({ error: 'Bildirim bulunamadı ya da zaten okundu' }, { status: 404 })
  return NextResponse.json({ bildirim: row })
})
