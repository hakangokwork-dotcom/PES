import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Tezgâh kalemi: ekle / taşı / kaldır.
 *
 * BİTİŞ TARİHİ YAZILMAZ. Kapasiteden türetilir (plan-tezgah.ts).
 * Yazsaydık bandın günlük hedefi değişince sessizce eskirdi.
 *
 * workshop_id GÖVDEDEN ALINMAZ, banttan türetilir. İstemcinin yollayacağı
 * atölye ile bandın gerçek atölyesi çelişirse ortaya hiçbir ekranın doğru
 * gösteremeyeceği bir satır çıkar.
 */

const GECERLI_TARIH = /^\d{4}-\d{2}-\d{2}$/

/** Bandın atölyesi — yoksa null. */
async function bantAtolyesi(
  sql: Parameters<Parameters<typeof withTenantRoute>[0]>[1]['sql'],
  lineId: number,
): Promise<number | null> {
  const [b] = await sql`
    SELECT workshop_id FROM production_line WHERE id = ${lineId}
  ` as unknown as Array<{ workshop_id: number }>
  return b?.workshop_id ?? null
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const taslakId = Number(b.taslak_id)
  const workOrderId = Number(b.work_order_id)
  const lineId = Number(b.line_id)
  const baslangic = String(b.baslangic ?? '')
  const adet = Number(b.adet)

  if (!Number.isInteger(taslakId) || !Number.isInteger(workOrderId) || !Number.isInteger(lineId)) {
    return NextResponse.json({ error: 'taslak_id, work_order_id ve line_id zorunlu' }, { status: 400 })
  }
  if (!GECERLI_TARIH.test(baslangic)) {
    return NextResponse.json({ error: 'baslangic YYYY-MM-DD olmalı' }, { status: 400 })
  }
  if (!Number.isInteger(adet) || adet <= 0) {
    return NextResponse.json({ error: 'adet pozitif tam sayı olmalı' }, { status: 400 })
  }

  const workshopId = await bantAtolyesi(sql, lineId)
  if (workshopId === null) {
    return NextResponse.json({ error: 'Bant bulunamadı' }, { status: 404 })
  }

  /* Aynı iş emri aynı banda iki kez bırakılırsa yeni satır değil GÜNCELLEME:
     sürükleyip aynı yere bırakmak çift kayıt üretmemeli. */
  const [row] = await sql`
    INSERT INTO plan_taslak_kalem
      (taslak_id, tenant_id, work_order_id, workshop_id, line_id, baslangic, adet)
    VALUES (${taslakId}, ${tenant.tenantId}, ${workOrderId}, ${workshopId},
            ${lineId}, ${baslangic}, ${adet})
    ON CONFLICT (taslak_id, work_order_id, line_id) DO UPDATE
      SET baslangic = EXCLUDED.baslangic, adet = EXCLUDED.adet, updated_at = now()
    RETURNING id, work_order_id, workshop_id, line_id, baslangic::text, adet
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ kalem: row })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }

  const lineId = b.line_id === undefined ? null : Number(b.line_id)
  const baslangic = b.baslangic === undefined ? null : String(b.baslangic)
  const adet = b.adet === undefined ? null : Number(b.adet)

  if (baslangic !== null && !GECERLI_TARIH.test(baslangic)) {
    return NextResponse.json({ error: 'baslangic YYYY-MM-DD olmalı' }, { status: 400 })
  }
  if (adet !== null && (!Number.isInteger(adet) || adet <= 0)) {
    return NextResponse.json({ error: 'adet pozitif tam sayı olmalı' }, { status: 400 })
  }

  let workshopId: number | null = null
  if (lineId !== null) {
    if (!Number.isInteger(lineId)) {
      return NextResponse.json({ error: 'line_id tam sayı olmalı' }, { status: 400 })
    }
    workshopId = await bantAtolyesi(sql, lineId)
    if (workshopId === null) {
      return NextResponse.json({ error: 'Bant bulunamadı' }, { status: 404 })
    }
  }

  /* COALESCE: verilmeyen alan DEĞİŞMEZ. Taşıma yalnız tarihi, yalnız bandı
     ya da ikisini birden değiştirebilir; her biri ayrı uç olsaydı istemci
     iki çağrı yapar ve arada tutarsız bir hâl görünürdü. */
  const [row] = await sql`
    UPDATE plan_taslak_kalem SET
      line_id     = coalesce(${lineId}::int, line_id),
      workshop_id = coalesce(${workshopId}::int, workshop_id),
      baslangic   = coalesce(${baslangic}::date, baslangic),
      adet        = coalesce(${adet}::int, adet),
      updated_at  = now()
    WHERE id = ${id}
    RETURNING id, work_order_id, workshop_id, line_id, baslangic::text, adet
  ` as unknown as Array<Record<string, unknown>>

  if (!row) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })
  return NextResponse.json({ kalem: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    DELETE FROM plan_taslak_kalem WHERE id = ${id} RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!row) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })
  return NextResponse.json({ silinen: row.id })
})
