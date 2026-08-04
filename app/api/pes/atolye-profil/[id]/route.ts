import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Tek atölyenin künyesi ve denetim kayıtları.
 *
 *   PATCH  /api/pes/atolye-profil/12                  künye alanlarını yaz
 *   POST   /api/pes/atolye-profil/12                  yeni denetim ekle
 *   DELETE /api/pes/atolye-profil/12?denetim=45       denetim sil
 *
 * AKTİFLİK BURADA DEĞİL: o workshop.is_active ve /api/pes/workshops/[id]
 * PATCH ile çevrilir (029c — tek kaynak). Buraya da koymak iki kapılı
 * bir anahtar yaratırdı.
 */

/* Serbest metin künye alanları. Beyaz liste: gövdeden gelen rastgele
   anahtarın kolona dönüşmemesi için. */
const METIN_ALANLAR = [
  't_kod', 'bw_atolye_adi', 'odito_adi', 'atolye_unvani',
  'tedarik_mudurlugu', 'teknik_mudur', 'fku', 'yetkili_kisi',
  'calisma_sekli', 'uretim_tipi', 'inspection', 'kapasite_tipi',
  'on_uretim_numunesi', 'subjektif_sinif', 'is_ortakligi_leveli',
  'risk_seviyesi', 'bolge_ad', 'ozel_not',
] as const

const SAYI_ALANLAR = [
  'bant_sayisi', 'aylik_kapasite', 'calisan_sayisi', 'calisan_sayisi_alt',
] as const

function temizle(body: Record<string, unknown>) {
  const alanlar: Record<string, string | number | null> = {}
  for (const a of METIN_ALANLAR) {
    if (!(a in body)) continue
    const v = body[a]
    const s = v === null || v === undefined ? null : String(v).trim()
    alanlar[a] = s === '' ? null : s
  }
  for (const a of SAYI_ALANLAR) {
    if (!(a in body)) continue
    const v = body[a]
    if (v === null || v === undefined || String(v).trim() === '') { alanlar[a] = null; continue }
    const n = Number(String(v).replace(',', '.'))
    if (!Number.isFinite(n)) return { hata: `${a} sayı olmalı` }
    alanlar[a] = Math.round(n)
  }
  return { alanlar }
}

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const body = (await req.json()) as Record<string, unknown>
  const { alanlar, hata } = temizle(body)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  if (!alanlar || Object.keys(alanlar).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok' }, { status: 400 })
  }

  // Atölye bu tenant'ta mı — RLS zaten süzer, ama 404'ü net verelim.
  const [w] = await sql`SELECT id FROM workshop WHERE id = ${wid}`
  if (!w) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  const [mevcut] = await sql`SELECT workshop_id FROM workshop_profil WHERE workshop_id = ${wid}`

  if (mevcut) {
    await sql`
      UPDATE workshop_profil SET ${sql(alanlar)}, updated_at = now()
       WHERE workshop_id = ${wid}`
  } else {
    // 44 atölyenin künyesi hiç eşleşmedi; elle doldurulabilsin.
    await sql`
      INSERT INTO workshop_profil ${sql({
        workshop_id: wid, tenant_id: tenant.tenantId,
        ...alanlar, eslesme_yontemi: 'elle', data_confidence: 'yuksek',
      })}`
  }

  const [satir] = await sql`SELECT * FROM workshop_profil WHERE workshop_id = ${wid}`
  return NextResponse.json({ profil: satir })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const body = (await req.json()) as Record<string, unknown>
  const tip = String(body.tip ?? '').toUpperCase()
  if (tip !== 'WKYS' && tip !== 'SOSYAL') {
    return NextResponse.json({ error: 'Denetim tipi WKYS veya SOSYAL olmalı' }, { status: 400 })
  }
  const tarih = String(body.tarih ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
    return NextResponse.json({ error: 'Tarih gerekli' }, { status: 400 })
  }

  let puan: number | null = null
  if (body.puan !== null && body.puan !== undefined && String(body.puan).trim() !== '') {
    puan = Number(String(body.puan).replace(',', '.'))
    if (!Number.isFinite(puan) || puan < 0 || puan > 100) {
      return NextResponse.json({ error: 'Puan 0-100 arası olmalı' }, { status: 400 })
    }
  }
  const sinifHam = String(body.sinif ?? '').trim().toUpperCase()
  const sinif = /^[ABCD][+-]?$/.test(sinifHam) ? sinifHam : null

  const [w] = await sql`SELECT id FROM workshop WHERE id = ${wid}`
  if (!w) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  // Aynı tip+tarih varsa üzerine yazar — çift kayıt yerine düzeltme.
  const [satir] = await sql`
    INSERT INTO workshop_denetim ${sql({
      workshop_id: wid, tenant_id: tenant.tenantId,
      tip, tarih, puan, sinif, kaynak: 'elle',
    })}
    ON CONFLICT (workshop_id, tip, tarih) DO UPDATE SET
      puan = EXCLUDED.puan, sinif = EXCLUDED.sinif, kaynak = 'elle'
    RETURNING *`
  return NextResponse.json({ denetim: satir })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = parseInt(params.id)
  const denetimId = parseInt(new URL(req.url).searchParams.get('denetim') ?? '')
  if (!Number.isInteger(wid) || !Number.isInteger(denetimId)) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }
  const silinen = await sql`
    DELETE FROM workshop_denetim
     WHERE id = ${denetimId} AND workshop_id = ${wid}
     RETURNING id`
  if (silinen.length === 0) {
    return NextResponse.json({ error: 'Denetim bulunamadı' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
