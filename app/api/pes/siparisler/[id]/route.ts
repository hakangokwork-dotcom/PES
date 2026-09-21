import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { kodlariDogrula, kunyeyiAyikla } from '@/lib/pes/kunye'

/**
 *   PATCH  /api/pes/siparisler/57  — künye ve temel alanlar
 *   DELETE /api/pes/siparisler/57  — yalnız Taslak (K7)
 *
 * workshop_id ve durum BURADAN DEĞİŞMEZ: yerleştirme yazar. İki yerden
 * yazılan atama zamanla birbirini tutmaz.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Kritik']

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz sipariş' }, { status: 400 })
  const b = await req.json()

  const [wo] = await sql`SELECT id FROM work_order WHERE id = ${id}`
  if (!wo) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })

  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })
  if (b.teslim_tarihi !== undefined && b.teslim_tarihi && !TARIH.test(String(b.teslim_tarihi))) {
    return NextResponse.json({ error: 'Teslim tarihi YYYY-AA-GG olmalı' }, { status: 400 })
  }
  if (b.siparis_miktari !== undefined
      && (!Number.isInteger(Number(b.siparis_miktari)) || Number(b.siparis_miktari) <= 0)) {
    return NextResponse.json({ error: 'Adet 0’dan büyük tam sayı olmalı' }, { status: 400 })
  }

  const metin = (v: unknown) =>
    (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim())
  const alanlar: Record<string, unknown> = { ...kunye }
  for (const k of ['musteri', 'model_adi', 'stil_kodu', 'sezon', 'siparis_no'] as const) {
    const v = metin(b[k]); if (v !== undefined) alanlar[k] = v
  }
  if (b.siparis_miktari !== undefined) alanlar.siparis_miktari = Number(b.siparis_miktari)
  if (b.teslim_tarihi !== undefined) alanlar.teslim_tarihi = b.teslim_tarihi || null
  if (b.oncelik !== undefined && ONCELIKLER.includes(b.oncelik)) alanlar.oncelik = b.oncelik
  if (alanlar.model_adi === null) return NextResponse.json({ error: 'Model adı boş olamaz' }, { status: 400 })
  if (Object.keys(alanlar).length === 0) return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })

  await sql`UPDATE work_order SET ${sql(alanlar)}, updated_at = now() WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz sipariş' }, { status: 400 })
  const [wo] = await sql`SELECT durum, workshop_id FROM work_order WHERE id = ${id}`
  if (!wo) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  if (wo.durum !== 'Taslak' || wo.workshop_id !== null) {
    return NextResponse.json(
      { error: 'Yerleştirilmiş sipariş havuzdan silinemez; iş emri ekranından iptal edin' },
      { status: 409 })
  }
  await sql`DELETE FROM work_order WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
