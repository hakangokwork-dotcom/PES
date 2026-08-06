import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adayAtolyeler } from '@/lib/pes/aday-atolye'
import { yerlestir } from '@/lib/pes/yerlestir-kaydet'

/**
 * GET  /api/pes/work-orders/yerlestir?adet=10000&teslim=2026-12-31
 *        → puanlanmış aday atölye listesi (sihirbaz 3. adım)
 * POST /api/pes/work-orders/yerlestir
 *        → siparişi, zincirini ve bant tahsislerini yazar (sihirbaz 7. adım)
 */

function bugun(): string {
  return new Date().toISOString().slice(0, 10)
}

export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const adet = Number(u.searchParams.get('adet'))
  const teslim = u.searchParams.get('teslim') ?? ''

  if (!Number.isFinite(adet) || adet <= 0) {
    return NextResponse.json({ error: 'adet gerekli' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(teslim)) {
    return NextResponse.json({ error: 'teslim tarihi gerekli (YYYY-MM-DD)' }, { status: 400 })
  }

  const adaylar = await adayAtolyeler(sql, {
    adet,
    teslimTarihi: teslim,
    bugun: bugun(),
    tedarikMudurlugu: u.searchParams.get('tedarik'),
  })
  return NextResponse.json({ adaylar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()

  /* modelAdi burada: work_order.model_adi NOT NULL. Boş dize NOT NULL'ı
     geçer ama sipariş "adı olmayan model" olarak kayda girer — sessiz
     bozuk veri. İstemciden zorunlu istemek doğrusu. */
  const eksik = ['siparisNo', 'modelAdi', 'adet', 'teslimTarihi', 'workshopId', 'lineIds', 'asamaKodlari']
    .filter(k => b[k] === undefined || b[k] === null || b[k] === '')
  if (eksik.length) {
    return NextResponse.json({ error: `Eksik alan: ${eksik.join(', ')}` }, { status: 400 })
  }
  if (!Array.isArray(b.lineIds) || b.lineIds.length === 0) {
    return NextResponse.json({ error: 'En az bir bant seçilmeli' }, { status: 400 })
  }
  if (!Array.isArray(b.asamaKodlari) || b.asamaKodlari.length === 0) {
    return NextResponse.json({ error: 'En az bir aşama seçilmeli' }, { status: 400 })
  }

  try {
    const sonuc = await yerlestir(sql, tenant.tenantId, {
      siparisNo: String(b.siparisNo),
      musteri: String(b.musteri ?? ''),
      modelAdi: String(b.modelAdi),
      adet: Number(b.adet),
      teslimTarihi: String(b.teslimTarihi),
      bugun: bugun(),
      workshopId: Number(b.workshopId),
      lineIds: b.lineIds.map(Number),
      asamaKodlari: b.asamaKodlari.map(String),
    })
    return NextResponse.json(sonuc)
  } catch (err) {
    /* Teknik ayrıntı log'a, kullanıcıya tek cümle. */
    console.error('[yerlestir]', err)
    const msg = err instanceof Error ? err.message : 'Yerleştirme başarısız'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
})
