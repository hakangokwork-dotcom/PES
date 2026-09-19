import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Bant rezervasyonu (tasarım K5).
 *
 *   POST   /api/pes/rezerve
 *          { lineId, baslangic, bitis, adet?, sahip, gecerlilikBitis, notlar? }
 *   DELETE /api/pes/rezerve?id=123
 *
 * line_schedule'da tip='REZERVE' olarak yaşar — bakım ve izinle aynı
 * tabloda durur, aynı çakışma kontrolünden geçer, yeni tablo gerekmez.
 *
 * SAHİP ve GEÇERLİLİK ZORUNLU. Veritabanında CHECK var; burada da
 * kontrol ediyoruz ki kullanıcı anlaşılır bir hata görsün, 500 değil.
 * Sahipsiz ve süresiz rezerve, birkaç ay içinde kimsenin silmeye cesaret
 * edemediği bloklara dönüşür.
 *
 * adet boş bırakılabilir: bandın tamamı tutulur.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()

  const lineId = Number(b.lineId)
  const baslangic = String(b.baslangic ?? '')
  const bitis = String(b.bitis ?? '')
  const gecerlilikBitis = String(b.gecerlilikBitis ?? '')
  const sahip = String(b.sahip ?? '').trim()
  const adet = b.adet === null || b.adet === undefined || b.adet === '' ? null : Number(b.adet)

  if (!Number.isInteger(lineId)) {
    return NextResponse.json({ error: 'Bant seçilmedi' }, { status: 400 })
  }
  if (!TARIH.test(baslangic) || !TARIH.test(bitis) || bitis < baslangic) {
    return NextResponse.json({ error: 'Geçerli bir tarih aralığı gerekli' }, { status: 400 })
  }
  if (!sahip) {
    return NextResponse.json({ error: 'Rezervenin sahibi yazılmalı' }, { status: 400 })
  }
  if (!TARIH.test(gecerlilikBitis)) {
    return NextResponse.json({ error: 'Geçerlilik bitiş tarihi yazılmalı' }, { status: 400 })
  }
  if (adet !== null && (!Number.isFinite(adet) || adet <= 0)) {
    return NextResponse.json(
      { error: 'Adet 0’dan büyük olmalı ya da boş bırakılmalı' }, { status: 400 })
  }

  const [bant] = await sql`SELECT id FROM production_line WHERE id = ${lineId}`
  if (!bant) return NextResponse.json({ error: 'Bant bulunamadı' }, { status: 404 })

  const [satir] = await sql`
    INSERT INTO line_schedule ${sql({
      line_id: lineId,
      tenant_id: tenant.tenantId,
      baslangic_tarihi: baslangic,
      bitis_tarihi: bitis,
      tip: 'REZERVE',
      adet: adet === null ? null : Math.round(adet),
      sahip,
      gecerlilik_bitis: gecerlilikBitis,
      notlar: b.notlar ? String(b.notlar) : null,
    })}
    RETURNING id`

  return NextResponse.json({ ok: true, id: satir.id })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  }

  /* tip kontrolü kasıtlı: bu uçla bakım ya da izin bloğu silinemesin. */
  const silinen = await sql`
    DELETE FROM line_schedule WHERE id = ${id} AND tip = 'REZERVE' RETURNING id`
  if (!silinen.length) {
    return NextResponse.json({ error: 'Rezerve bulunamadı' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
