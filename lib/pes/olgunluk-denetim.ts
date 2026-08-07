import postgres from 'postgres'
import type { Kategori, Kriter, Surec, Taraf } from './olgunluk'

/**
 * Olgunluk denetimi — okuma katmanı (031).
 *
 * PUAN BURADA HESAPLANMAZ. Seviye v_olgunluk_surec_seviye'de, puan
 * v_olgunluk_denetim_ozet'te türetiliyor. Aynı kuralı ikinci kez
 * TypeScript'te yazmak, ekranla raporun zamanla ayrışması demekti;
 * hangisinin doğru olduğunu da kimse bilemezdi.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withServerTenant içi).
 */

export type Sonuc = 'EVET' | 'HAYIR' | 'KAPSAM_DISI'
export type DenetimDurum = 'taslak' | 'tamamlandi'

/* "Var/Yok" DEĞİL. Kriter bir varlık değil bir ÖNERMEDİR; sorulan şey
   "bu şey var mı" değil, "bu önerme bu atölye için doğru mu".
   Olumsuz kurulmuş maddelerde fark kritik: "Atölyede çocuk işçi
   çalıştırılmaz" + "Var" okunduğunda tam tersi anlaşılıyordu.
   DB değerleri (EVET/HAYIR) değişmedi — bunlar yalnız ekran etiketi. */
export const SONUC_ETIKET: Record<Sonuc, string> = {
  EVET: 'Sağlanıyor',
  HAYIR: 'Sağlanmıyor',
  KAPSAM_DISI: 'Kapsam dışı',
}

export interface DenetimBasligi {
  id: number
  workshop_id: number
  atolye_kodu: string
  atolye_adi: string
  sablon_id: number
  sablon_kod: string
  tarih: string
  denetci: string | null
  durum: DenetimDurum
  not_metni: string | null
}

export interface Cevap {
  kriter_id: number
  sonuc: Sonuc
  not_metni: string | null
}

/** Süreç başına türetilmiş seviye. NULL = değerlendirilmedi. */
export interface SurecSeviye {
  surec_id: number
  seviye: number | null
  cevapli_toplam: number
}

export interface DenetimOzet {
  puan: string | null
  max_puan: string | null
  yuzde: string | null
  degerlendirilen: number
  degerlendirilmeyen: number
}

export interface KategoriSeviye {
  kategori_id: number
  kategori_kod: string
  kategori_adi: string
  sira: number
  surec_adedi: number
  ortalama_seviye: string | null
  en_zayif_seviye: number | null
}

export interface DenetimDetay {
  baslik: DenetimBasligi
  kategoriler: Kategori[]
  surecler: Surec[]
  kriterler: Kriter[]
  cevaplar: Cevap[]
  seviyeler: SurecSeviye[]
  kategoriSeviyeleri: KategoriSeviye[]
  ozet: DenetimOzet | null
}

export async function denetimDetay(
  sql: postgres.TransactionSql,
  denetimId: number
): Promise<DenetimDetay | null> {
  const [baslik] = await sql`
    SELECT d.id, d.workshop_id, w.code AS atolye_kodu, w.name AS atolye_adi,
           d.sablon_id, s.kod AS sablon_kod,
           d.tarih::text AS tarih, d.denetci, d.durum, d.not_metni
      FROM olgunluk_denetim d
      JOIN workshop w        ON w.id = d.workshop_id
      JOIN olgunluk_sablon s ON s.id = d.sablon_id
     WHERE d.id = ${denetimId}`
  if (!baslik) return null

  const sablonId = baslik.sablon_id as number

  const kategoriler = await sql`
    SELECT id, kod, ad, sira, aktif FROM olgunluk_kategori
     WHERE sablon_id = ${sablonId} AND aktif ORDER BY sira, id`

  const surecler = await sql`
    SELECT s.id, s.kategori_id, s.kod, s.ad, s.agirlik::text AS agirlik,
           s.sira, s.aktif, s.not_metni,
           (SELECT count(*)::int FROM olgunluk_kriter k
             WHERE k.surec_id = s.id AND k.aktif) AS kriter_adedi
      FROM olgunluk_surec s
     WHERE s.sablon_id = ${sablonId} AND s.aktif
     ORDER BY s.sira, s.id`

  const kriterler = await sql`
    SELECT id, surec_id, seviye, sira, metin, taraf, zorunlu, aktif, 0 AS cevap_adedi
      FROM olgunluk_kriter
     WHERE sablon_id = ${sablonId} AND aktif
     ORDER BY seviye, sira, id`

  const cevaplar = await sql`
    SELECT kriter_id, sonuc, not_metni
      FROM olgunluk_denetim_kriter WHERE denetim_id = ${denetimId}`

  const seviyeler = await sql`
    SELECT surec_id, seviye, cevapli_toplam
      FROM v_olgunluk_surec_seviye WHERE denetim_id = ${denetimId}`

  const kategoriSeviyeleri = await sql`
    SELECT kategori_id, kategori_kod, kategori_adi, sira, surec_adedi,
           ortalama_seviye::text AS ortalama_seviye, en_zayif_seviye
      FROM v_olgunluk_kategori WHERE denetim_id = ${denetimId}
     ORDER BY sira`

  const [ozet] = await sql`
    SELECT puan::text, max_puan::text, yuzde::text, degerlendirilen, degerlendirilmeyen
      FROM v_olgunluk_denetim_ozet WHERE denetim_id = ${denetimId}`

  return {
    baslik: baslik as unknown as DenetimBasligi,
    kategoriler: kategoriler as unknown as Kategori[],
    surecler: surecler as unknown as Surec[],
    kriterler: kriterler as unknown as Kriter[],
    cevaplar: cevaplar as unknown as Cevap[],
    seviyeler: seviyeler as unknown as SurecSeviye[],
    kategoriSeviyeleri: kategoriSeviyeleri as unknown as KategoriSeviye[],
    ozet: (ozet as unknown as DenetimOzet) ?? null,
  }
}

/* ---------------------------------------------------------------- */

export interface FiloSatiri {
  workshop_id: number
  atolye_kodu: string
  atolye_adi: string
  is_active: boolean
  tedarik_mudurlugu: string | null
  denetim_id: number | null
  son_denetim: string | null
  denetci: string | null
  yuzde: string | null
  sinif: string
  degerlendirilen: number | null
  degerlendirilmeyen: number | null
  /** kategori kodu -> ortalama seviye (0-3). Isı haritasının hücreleri. */
  kategoriler: Record<string, number | null>
  /** Açık taslak denetim varsa id'si — "devam et" bağlantısı için. */
  taslak_id: number | null
}

/**
 * "Atölye atölye hangi durumdalar" — her atölye için son TAMAMLANMIŞ
 * denetim ve kategori kırılımı.
 *
 * Denetimi olmayan atölye de döner (sinif='YOK'). Raporun asıl aradığı
 * şey çoğu zaman budur: hangi atölyeye hiç bakılmamış.
 */
export async function filoDurumu(
  sql: postgres.TransactionSql,
  opts: { pasifDahil?: boolean } = {}
): Promise<{ satirlar: FiloSatiri[]; kategoriKodlari: { kod: string; ad: string }[] }> {
  const satirlar = await sql`
    SELECT a.workshop_id, a.atolye_kodu, a.atolye_adi, a.is_active,
           a.tedarik_mudurlugu, a.denetim_id,
           a.son_denetim::text AS son_denetim, a.denetci,
           a.yuzde::text AS yuzde, a.sinif,
           a.degerlendirilen, a.degerlendirilmeyen,
           (SELECT d.id FROM olgunluk_denetim d
             WHERE d.workshop_id = a.workshop_id AND d.durum = 'taslak'
             ORDER BY d.tarih DESC, d.id DESC LIMIT 1) AS taslak_id
      FROM v_atolye_olgunluk a
     WHERE ${opts.pasifDahil ? sql`TRUE` : sql`a.is_active`}
     ORDER BY
       -- Önce hiç denetlenmemişler, sonra düşük skorlar: ekranın üstü
       -- "aksiyon gereken" ile başlasın.
       (a.son_denetim IS NULL) DESC,
       a.yuzde ASC NULLS FIRST,
       a.atolye_kodu`

  const hucreler = await sql`
    SELECT a.workshop_id, k.kategori_kod, k.ortalama_seviye::float8 AS seviye
      FROM v_atolye_olgunluk a
      JOIN v_olgunluk_kategori k ON k.denetim_id = a.denetim_id
     WHERE a.denetim_id IS NOT NULL`

  // Kolon başlıkları YAYINDAKİ şablondan gelir: bir atölyenin denetimi
  // eski sürümdense o sürümün kategorileri ısı haritasında kolon açmaz,
  // hücresi boş kalır. Tersi olsaydı tablo sürüm sayısı kadar genişlerdi.
  const kategoriKodlari = await sql`
    SELECT k.kod, k.ad
      FROM olgunluk_kategori k
      JOIN olgunluk_sablon s ON s.id = k.sablon_id
     WHERE k.aktif AND s.durum = 'yayinda'
     ORDER BY k.sira, k.id`

  const harita = new Map<number, Record<string, number | null>>()
  for (const h of hucreler as unknown as
       { workshop_id: number; kategori_kod: string; seviye: number | null }[]) {
    const mevcut = harita.get(h.workshop_id) ?? {}
    mevcut[h.kategori_kod] = h.seviye
    harita.set(h.workshop_id, mevcut)
  }

  return {
    satirlar: (satirlar as unknown as FiloSatiri[]).map((s) => ({
      ...s,
      kategoriler: harita.get(s.workshop_id) ?? {},
    })),
    kategoriKodlari: kategoriKodlari as unknown as { kod: string; ad: string }[],
  }
}

/** Seviye (0-3) -> ısı haritası rengi. Nötr gri ile marka yeşili arası. */
export function seviyeRengi(seviye: number | null | undefined): string {
  if (seviye === null || seviye === undefined) return 'bg-canvas text-faint'
  if (seviye < 0.5) return 'bg-danger-soft text-danger'
  if (seviye < 1.5) return 'bg-warn-soft text-warn'
  if (seviye < 2.5) return 'bg-canvas text-body'
  return 'bg-accent-soft text-accent-ink'
}

/** Kriterin puana girip girmediği — MARKA maddeleri atölyeyi bağlamaz. */
export function puanaGirer(taraf: Taraf, zorunlu: boolean): boolean {
  return taraf === 'ATOLYE' && zorunlu
}
