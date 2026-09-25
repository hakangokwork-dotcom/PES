import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import {
  cevapDogrula, gecisGecerli, GEREKCE_KODLARI,
  type GerekceKodu, type TeklifDurumu,
} from '@/lib/pes/plan-onay'

/**
 * Atölyenin teklife cevabı: kabul / revizyon önerisi / ret.
 *
 * ATÖLYE OTURUMDAN GELİR. Gövdedeki bir workshop_id'ye güvenilmez; RLS
 * zaten başka atölyenin teklifini göstermez ama saldırıyı hiç mümkün
 * kılmamak doğru.
 *
 * HANGİ KOLONUN DEĞİŞEBİLECEĞİNİ BU UÇ SINIRLAR. RLS satır seviyesinde
 * çalışıyor; atölye kendi teklif satırını güncelleyebiliyor. Kolon
 * seviyesi kısıt PostgreSQL'de GRANT ile yapılır ve uygulama tek rolle
 * (pes_app) bağlandığı için orada uygulanamadı — sınır burada.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (!tenant.workshopId) {
    return NextResponse.json(
      { error: 'Bu uç yalnız atölye kullanıcısı içindir' }, { status: 403 })
  }

  const b = await req.json()
  const teklifId = Number(b.teklif_id)
  const durum = String(b.durum ?? '') as TeklifDurumu
  const gerekceKodu = b.gerekce_kodu ? String(b.gerekce_kodu) as GerekceKodu : null
  const not = b.not ? String(b.not).slice(0, 1000) : null

  if (!Number.isInteger(teklifId)) {
    return NextResponse.json({ error: 'teklif_id zorunlu' }, { status: 400 })
  }
  if (!['kabul', 'revizyon', 'ret'].includes(durum)) {
    return NextResponse.json(
      { error: "durum 'kabul', 'revizyon' ya da 'ret' olmalı" }, { status: 400 })
  }
  if (gerekceKodu !== null && !GEREKCE_KODLARI.includes(gerekceKodu)) {
    return NextResponse.json({ error: 'Geçersiz gerekçe kodu' }, { status: 400 })
  }

  /* Yukarıdaki kontrol 'bekliyor'u zaten eledi; tip bunu bilmiyor. */
  const hatalar = cevapDogrula({
    durum: durum as 'kabul' | 'revizyon' | 'ret', gerekceKodu, not,
  })
  if (hatalar.length > 0) {
    return NextResponse.json({ error: hatalar[0].mesaj, hatalar }, { status: 400 })
  }

  const [teklif] = await sql`
    SELECT id, durum, workshop_id FROM plan_teklif WHERE id = ${teklifId}
  ` as unknown as Array<{ id: number; durum: TeklifDurumu; workshop_id: number }>

  if (!teklif) return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 })
  if (teklif.workshop_id !== tenant.workshopId) {
    return NextResponse.json({ error: 'Bu teklif sizin değil' }, { status: 403 })
  }
  if (!gecisGecerli(teklif.durum, durum)) {
    return NextResponse.json(
      { error: `Bu teklif zaten cevaplanmış (${teklif.durum}). Yeni tur planlamacıdan gelir.` },
      { status: 409 })
  }

  /* Revizyon önerisi kalemlere yazılır: hangi işe ne önerdiği kalem
     seviyesinde durmalı, yoksa planlamacı neyi kaydıracağını bilemez. */
  if (durum === 'revizyon' && Array.isArray(b.kalemler)) {
    for (const k of b.kalemler) {
      const id = Number(k.id)
      if (!Number.isInteger(id)) continue
      const kb = k.karsi_baslangic ? String(k.karsi_baslangic) : null
      const ka = k.karsi_adet === null || k.karsi_adet === undefined ? null : Number(k.karsi_adet)
      if (kb !== null && !/^\d{4}-\d{2}-\d{2}$/.test(kb)) {
        return NextResponse.json({ error: 'karsi_baslangic YYYY-MM-DD olmalı' }, { status: 400 })
      }
      if (ka !== null && (!Number.isInteger(ka) || ka <= 0)) {
        return NextResponse.json({ error: 'karsi_adet pozitif tam sayı olmalı' }, { status: 400 })
      }
      await sql`
        UPDATE plan_teklif_kalem SET
          karsi_baslangic = ${kb}::date,
          karsi_adet      = ${ka}::int,
          karsi_not       = ${k.karsi_not ? String(k.karsi_not).slice(0, 500) : null}
        WHERE id = ${id} AND teklif_id = ${teklifId}`
    }
  }

  const [row] = await sql`
    UPDATE plan_teklif SET
      durum = ${durum}, gerekce_kodu = ${gerekceKodu}, cevap_notu = ${not},
      cevap_at = now()
    WHERE id = ${teklifId}
    RETURNING id, durum, gerekce_kodu, cevap_at
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ teklif: row })
})
