import postgres from 'postgres'

/**
 * Olgunluk kataloğu — okuma katmanı (031).
 *
 * Katalog VERİDİR, kod değil: kriter metinleri her revizyonda değişiyor
 * (elimizdeki kaynak zaten v4). Bu yüzden panel, denetim ekranı ve rapor
 * hepsi buradan okur; kriter listesi hiçbir yerde sabit yazılmaz.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withServerTenant içi) —
 * aksi halde RLS tenant context'i yok sayar ve 0 satır döner.
 */

export type SablonDurum = 'taslak' | 'yayinda' | 'arsiv'

export const SABLON_DURUM_ETIKET: Record<SablonDurum, string> = {
  taslak: 'Taslak',
  yayinda: 'Yayında',
  arsiv: 'Arşiv',
}

export type Taraf = 'ATOLYE' | 'MARKA'

export interface Sablon {
  id: number
  kod: string
  ad: string
  aciklama: string | null
  durum: SablonDurum
  yayin_tarihi: string | null
  klon_kaynak_id: number | null
  denetim_adedi: number
}

export interface Kategori {
  id: number
  kod: string
  ad: string
  sira: number
  aktif: boolean
}

export interface Surec {
  id: number
  kategori_id: number
  kod: string
  ad: string
  agirlik: string
  sira: number
  aktif: boolean
  not_metni: string | null
  kriter_adedi: number
}

export interface Kriter {
  id: number
  surec_id: number
  seviye: number
  sira: number
  metin: string
  taraf: Taraf
  zorunlu: boolean
  aktif: boolean
  /** Kaç denetimde cevaplanmış. >0 ise silinemez, yalnız pasife alınır. */
  cevap_adedi: number
}

export interface Katalog {
  sablon: Sablon
  kategoriler: Kategori[]
  surecler: Surec[]
  kriterler: Kriter[]
}

export const SEVIYE_ETIKET: Record<number, string> = {
  0: 'Kötü',
  1: 'Gelişime Açık',
  2: 'İyi Durumda',
  3: 'Mükemmel',
}

/** Tüm şablonlar + kaç denetime bağlı oldukları (silinebilir mi kararı için). */
export async function sablonlar(sql: postgres.TransactionSql): Promise<Sablon[]> {
  const rows = await sql`
    SELECT s.id, s.kod, s.ad, s.aciklama, s.durum,
           s.yayin_tarihi::text AS yayin_tarihi,
           s.klon_kaynak_id,
           (SELECT count(*)::int FROM olgunluk_denetim d WHERE d.sablon_id = s.id) AS denetim_adedi
      FROM olgunluk_sablon s
     ORDER BY s.created_at DESC, s.id DESC`
  return rows as unknown as Sablon[]
}

/**
 * Tek şablonun tam kataloğu. Üç ayrı sorgu, tek JOIN yerine:
 * kriter sayısı süreç sayısının ~5 katı, tek sorguda süreç alanları
 * kriter başına tekrarlanır ve panel her tuşta bunu yeniden çeker.
 */
export async function katalog(
  sql: postgres.TransactionSql,
  sablonId: number
): Promise<Katalog | null> {
  const [sablon] = await sql`
    SELECT s.id, s.kod, s.ad, s.aciklama, s.durum,
           s.yayin_tarihi::text AS yayin_tarihi,
           s.klon_kaynak_id,
           (SELECT count(*)::int FROM olgunluk_denetim d WHERE d.sablon_id = s.id) AS denetim_adedi
      FROM olgunluk_sablon s
     WHERE s.id = ${sablonId}`
  if (!sablon) return null

  const kategoriler = await sql`
    SELECT id, kod, ad, sira, aktif
      FROM olgunluk_kategori
     WHERE sablon_id = ${sablonId}
     ORDER BY sira, id`

  const surecler = await sql`
    SELECT s.id, s.kategori_id, s.kod, s.ad, s.agirlik::text AS agirlik,
           s.sira, s.aktif, s.not_metni,
           (SELECT count(*)::int FROM olgunluk_kriter k
             WHERE k.surec_id = s.id AND k.aktif) AS kriter_adedi
      FROM olgunluk_surec s
     WHERE s.sablon_id = ${sablonId}
     ORDER BY s.sira, s.id`

  const kriterler = await sql`
    SELECT k.id, k.surec_id, k.seviye, k.sira, k.metin, k.taraf, k.zorunlu, k.aktif,
           (SELECT count(*)::int FROM olgunluk_denetim_kriter dk
             WHERE dk.kriter_id = k.id) AS cevap_adedi
      FROM olgunluk_kriter k
     WHERE k.sablon_id = ${sablonId}
     ORDER BY k.seviye, k.sira, k.id`

  return {
    sablon: sablon as unknown as Sablon,
    kategoriler: kategoriler as unknown as Kategori[],
    surecler: surecler as unknown as Surec[],
    kriterler: kriterler as unknown as Kriter[],
  }
}

/**
 * Panelin göstereceği şablon: yayındaki varsa o, yoksa en yeni taslak.
 * "Hangi sürümü düzenliyorum" sorusu ekranda hep açık dursun diye
 * seçim URL'de taşınır; bu yalnız varsayılanı verir.
 */
export function varsayilanSablon(hepsi: Sablon[]): Sablon | null {
  return hepsi.find((s) => s.durum === 'yayinda')
      ?? hepsi.find((s) => s.durum === 'taslak')
      ?? hepsi[0]
      ?? null
}

/** Yalnız taslak şablon düzenlenebilir — 031'deki kilit trigger'ın arayüz karşılığı. */
export function duzenlenebilir(sablon: Sablon): boolean {
  return sablon.durum === 'taslak'
}

/**
 * Şablonu yeni bir TASLAK sürüme kopyalar ve yeni id'yi döndürür.
 *
 * NEDEN GEREKLİ: yayındaki şablon kilitli. Kriter değiştirmenin tek yolu
 * yeni sürüm açmak; böylece eski denetimler kendi sorularıyla okunmaya
 * devam eder.
 *
 * NEDEN KOD ÜZERİNDEN EŞLEME: kategori ve süreç id'leri kopyada değişir,
 * dolayısıyla kriterin surec_id'si doğrudan taşınamaz. Kod (sablon_id, kod)
 * içinde benzersiz olduğu için join tekildir. id eşlemesini uygulama
 * tarafında Map ile kurmak N+1 sorgu demek olurdu.
 */
export async function sablonKlonla(
  sql: postgres.TransactionSql,
  opts: { kaynakId: number; tenantId: string; kod: string; ad?: string }
): Promise<number> {
  const [kaynak] = await sql`
    SELECT id, kod, ad FROM olgunluk_sablon WHERE id = ${opts.kaynakId}`
  if (!kaynak) throw new Error('Kaynak şablon bulunamadı')

  const [yeni] = await sql`
    INSERT INTO olgunluk_sablon (tenant_id, kod, ad, aciklama, durum, klon_kaynak_id)
    VALUES (${opts.tenantId}, ${opts.kod},
            ${opts.ad?.trim() || `${kaynak.ad} (${opts.kod})`},
            ${`${kaynak.kod} sürümünden kopyalandı`}, 'taslak', ${kaynak.id})
    RETURNING id`

  await sql`
    INSERT INTO olgunluk_kategori (tenant_id, sablon_id, kod, ad, sira, aktif)
    SELECT tenant_id, ${yeni.id}, kod, ad, sira, aktif
      FROM olgunluk_kategori WHERE sablon_id = ${kaynak.id}`

  await sql`
    INSERT INTO olgunluk_surec
      (tenant_id, sablon_id, kategori_id, kod, ad, agirlik, sira, aktif, not_metni)
    SELECT s.tenant_id, ${yeni.id}, yk.id, s.kod, s.ad, s.agirlik, s.sira, s.aktif, s.not_metni
      FROM olgunluk_surec s
      JOIN olgunluk_kategori ek ON ek.id = s.kategori_id
      JOIN olgunluk_kategori yk ON yk.sablon_id = ${yeni.id} AND yk.kod = ek.kod
     WHERE s.sablon_id = ${kaynak.id}`

  await sql`
    INSERT INTO olgunluk_kriter
      (tenant_id, sablon_id, surec_id, seviye, sira, metin, taraf, zorunlu, aktif)
    SELECT k.tenant_id, ${yeni.id}, ys.id, k.seviye, k.sira, k.metin, k.taraf, k.zorunlu, k.aktif
      FROM olgunluk_kriter k
      JOIN olgunluk_surec es ON es.id = k.surec_id
      JOIN olgunluk_surec ys ON ys.sablon_id = ${yeni.id} AND ys.kod = es.kod
     WHERE k.sablon_id = ${kaynak.id}`

  return yeni.id as number
}
