import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { gunlukSatirlar, gunlukKaydet } from '@/lib/pes/gunluk-uretim'

/**
 * Atölyenin günlük üretim girişi (tasarım K6).
 *
 *   GET /api/pes/workshops/12/gunluk-uretim?tarih=2026-08-07
 *   PUT /api/pes/workshops/12/gunluk-uretim
 *       { atamaId, tarih, adet: number|null, hataliAdet }
 *
 * adet null → o günün kaydı silinir. adet 0 → "bugün hiç çıkmadı"
 * olarak KAYDEDİLİR; ikisi farklı bilgidir.
 */

const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const tarih = new URL(req.url).searchParams.get('tarih') ?? ''
  if (!TARIH.test(tarih)) {
    return NextResponse.json({ error: 'tarih YYYY-AA-GG olmalı' }, { status: 400 })
  }

  const satirlar = await gunlukSatirlar(sql, wid, tarih)
  return NextResponse.json({ satirlar })
})

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const b = await req.json()
  const atamaId = Number(b.atamaId)
  const tarih = String(b.tarih ?? '')
  if (!Number.isInteger(atamaId)) return NextResponse.json({ error: 'atamaId gerekli' }, { status: 400 })
  if (!TARIH.test(tarih)) return NextResponse.json({ error: 'tarih YYYY-AA-GG olmalı' }, { status: 400 })

  /* Tahsis GERÇEKTEN bu atölyenin bandına mı ait? RLS yalnız tenant'ı
     süzer; atölye sınırını burada koymazsak bir atölye başkasının
     üretimini yazabilirdi. */
  const [sahip] = await sql`
    SELECT a.id
    FROM work_order_stage_atama a
    JOIN production_line pl ON pl.id = a.line_id
    WHERE a.id = ${atamaId} AND pl.workshop_id = ${wid}`
  if (!sahip) return NextResponse.json({ error: 'Tahsis bu atölyede bulunamadı' }, { status: 404 })

  const ham = b.adet
  const bosaltiliyor = ham === null || ham === undefined || String(ham).trim() === ''

  let adet: number | null = null
  if (!bosaltiliyor) {
    adet = Number(String(ham).replace(',', '.'))
    if (!Number.isFinite(adet) || adet < 0) {
      return NextResponse.json({ error: 'Adet 0 veya daha büyük olmalı' }, { status: 400 })
    }
    adet = Math.round(adet)
  }

  const hamHatali = b.hataliAdet
  let hatali = Number(String(hamHatali ?? 0).replace(',', '.') || 0)
  if (!Number.isFinite(hatali) || hatali < 0) hatali = 0
  hatali = Math.round(hatali)

  await gunlukKaydet(sql, tenant.tenantId, atamaId, tarih, adet, hatali)

  const satirlar = await gunlukSatirlar(sql, wid, tarih)
  const satir = satirlar.find(s => s.atamaId === atamaId) ?? null
  return NextResponse.json({ ok: true, satir })
})
