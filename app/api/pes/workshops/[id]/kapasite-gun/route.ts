import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { gunEkle } from '@/lib/pes/yerlestirme'

/**
 * Atölyenin TOPLAM günlük kapasitesinin gün bazlı sapması (tasarım K1).
 *
 *   GET    /api/pes/workshops/12/kapasite-gun?baslangic=&bitis=
 *   PUT    /api/pes/workshops/12/kapasite-gun  { baslangic, bitis, gunlukKapasite, sebep }
 *   DELETE /api/pes/workshops/12/kapasite-gun?baslangic=&bitis=
 *
 * Giriş ARALIK olarak gelir, satırlara açılır — kimse otuz günü tek tek
 * yazmaz. Kayıt yoksa aktif bantların daily_target toplamı geçerlidir;
 * bu uç o varsayılanı değiştirmez, yalnız sapmayı kaydeder.
 *
 * Kapasite 0 yazılabilir: atölye o gün kapalıdır. Kaydı SİLMEK ise
 * "sapma yok, varsayılana dön" demektir — ikisi farklı şeydir.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

function atolyeNo(params: { id: string }): number | null {
  const n = parseInt(params.id)
  return Number.isInteger(n) ? n : null
}

export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = atolyeNo(params)
  if (wid === null) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const u = new URL(req.url)
  const b = u.searchParams.get('baslangic')
  const s = u.searchParams.get('bitis')
  if (!b || !s || !TARIH.test(b) || !TARIH.test(s)) {
    return NextResponse.json({ error: 'baslangic ve bitis YYYY-AA-GG gerekli' }, { status: 400 })
  }

  const kapasiteler = await sql`
    SELECT tarih::text, gunluk_kapasite, sebep
      FROM workshop_kapasite_gun
     WHERE workshop_id = ${wid} AND tarih BETWEEN ${b} AND ${s}
     ORDER BY tarih`
  return NextResponse.json({ kapasiteler })
})

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = atolyeNo(params)
  if (wid === null) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const body = await req.json()
  const baslangic = String(body.baslangic ?? '')
  const bitis = String(body.bitis ?? '')
  const kapasite = Number(body.gunlukKapasite)

  if (!TARIH.test(baslangic) || !TARIH.test(bitis)) {
    return NextResponse.json({ error: 'baslangic ve bitis YYYY-AA-GG gerekli' }, { status: 400 })
  }
  if (bitis < baslangic) {
    return NextResponse.json({ error: 'bitis baslangictan önce olamaz' }, { status: 400 })
  }
  if (!Number.isFinite(kapasite) || kapasite < 0) {
    return NextResponse.json({ error: 'Kapasite 0 ya da daha büyük olmalı' }, { status: 400 })
  }
  /* Bir yıldan uzun aralık büyük ihtimalle yazım hatasıdır; sessizce
     yüzlerce satır açmak yerine reddet. */
  const gunSayisi = Math.round((Date.parse(bitis) - Date.parse(baslangic)) / 86_400_000) + 1
  if (gunSayisi > 366) {
    return NextResponse.json({ error: 'Aralık en fazla bir yıl olabilir' }, { status: 400 })
  }

  const [atolye] = await sql`SELECT id FROM workshop WHERE id = ${wid}`
  if (!atolye) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  const satirlar = []
  for (let t = baslangic; t <= bitis; t = gunEkle(t, 1)) {
    satirlar.push({
      workshop_id: wid,
      tenant_id: tenant.tenantId,
      tarih: t,
      gunluk_kapasite: Math.round(kapasite),
      sebep: body.sebep ? String(body.sebep) : null,
    })
  }

  await sql`
    INSERT INTO workshop_kapasite_gun ${sql(satirlar)}
    ON CONFLICT (workshop_id, tarih) DO UPDATE SET
      gunluk_kapasite = EXCLUDED.gunluk_kapasite,
      sebep = EXCLUDED.sebep`

  return NextResponse.json({ ok: true, gunSayisi: satirlar.length })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = atolyeNo(params)
  if (wid === null) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const u = new URL(req.url)
  const b = u.searchParams.get('baslangic')
  const s = u.searchParams.get('bitis')
  if (!b || !s || !TARIH.test(b) || !TARIH.test(s)) {
    return NextResponse.json({ error: 'baslangic ve bitis YYYY-AA-GG gerekli' }, { status: 400 })
  }

  const silinen = await sql`
    DELETE FROM workshop_kapasite_gun
     WHERE workshop_id = ${wid} AND tarih BETWEEN ${b} AND ${s}
    RETURNING tarih`
  return NextResponse.json({ ok: true, silinen: silinen.length })
})
