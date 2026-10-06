/**
 * Bölgesel 3D dakika maliyeti — yönetim (merkez).
 *
 * dk_maliyet DÖNEM VERSİYONLUDUR: bir ay, kendisinden küçük/eşit en yakın
 * dönemin değeriyle hesaplanır. Yeni dönem eklemek geçmiş ayları bozmaz;
 * var olan dönemi düzeltmek o dönemden bir sonraki döneme kadarki ayları
 * değiştirir. Bütün canlı hesaplar tabloyu her açılışta okur — ayrıca
 * "yeniden hesapla" adımı yoktur. model_fiyat'ta SAKLANMIŞ fiyatlar
 * bilerek değişmez (karar anı, bkz. 039).
 *
 * Geçmiş tetikleyiciyle yazılır (052). Kim/açıklama bu modülün işlem
 * içinde kurduğu pes.kullanici / pes.aciklama ayarlarından gelir.
 */
import type postgres from 'postgres'

type Sql = postgres.TransactionSql

export const BOLGELER = [1, 2, 3, 4, 5, 6] as const
export type Bolge = (typeof BOLGELER)[number]

export type DonemSatiri = { donem: string; degerler: Record<number, number | null> }

export type GecmisSatiri = {
  id: number
  donem: string
  bolge: number
  islem: 'ekle' | 'guncelle' | 'sil'
  eski_tl: number | null
  yeni_tl: number | null
  degistiren: string
  aciklama: string | null
  degisti_at: string
}

export type KayitGirdisi = {
  donem: string
  degerler: Record<number, number>
  aciklama: string | null
}

const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Ham istek gövdesini doğrular. Hata metni ekranda gösterilir. */
export function kayitDogrula(b: unknown): { ok: true; girdi: KayitGirdisi } | { ok: false; hata: string } {
  const g = (b ?? {}) as Record<string, unknown>
  const donem = String(g.donem ?? '').trim()
  if (!DONEM_RE.test(donem)) return { ok: false, hata: 'Dönem YYYY-AA biçiminde olmalı (ör. 2026-09).' }
  const ham = (g.degerler ?? {}) as Record<string, unknown>
  const degerler: Record<number, number> = {}
  for (const b of BOLGELER) {
    const v = ham[b] ?? ham[String(b)]
    const s = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    if (v === undefined || v === null || v === '' || !Number.isFinite(s)) {
      return { ok: false, hata: `${b}. bölge için değer girilmeli.` }
    }
    // Üst sınır yazım hatasını yakalamak için (6,45 yerine 645).
    if (s <= 0 || s >= 100) return { ok: false, hata: `${b}. bölge değeri 0 ile 100 TL/dk arasında olmalı.` }
    degerler[b] = Math.round(s * 100) / 100
  }
  const aciklama = typeof g.aciklama === 'string' && g.aciklama.trim() ? g.aciklama.trim().slice(0, 500) : null
  return { ok: true, girdi: { donem, degerler, aciklama } }
}

/** Satır listesini dönem × bölge matrisine çevirir, en yeni dönem önce. */
export function matrise(satirlar: Array<{ donem: string; bolge: number; dk_maliyet_tl: number | string }>): DonemSatiri[] {
  const m = new Map<string, Record<number, number | null>>()
  for (const s of satirlar) {
    const d = m.get(s.donem) ?? Object.fromEntries(BOLGELER.map((b) => [b, null]))
    d[s.bolge] = Number(s.dk_maliyet_tl)
    m.set(s.donem, d)
  }
  return [...m.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([donem, degerler]) => ({ donem, degerler }))
}

/** Bir önceki döneme göre değişim oranı; önceki yoksa null. */
export function degisimOrani(simdi: number | null, onceki: number | null): number | null {
  if (simdi === null || onceki === null || onceki === 0) return null
  return simdi / onceki - 1
}

async function kimlikKur(sql: Sql, kullanici: string | null, aciklama: string | null) {
  await sql`SELECT set_config('pes.kullanici', ${kullanici ?? ''}, true),
                   set_config('pes.aciklama', ${aciklama ?? ''}, true)`
}

export async function donemleriOku(sql: Sql): Promise<DonemSatiri[]> {
  const r = await sql`SELECT donem, bolge, dk_maliyet_tl::float AS dk_maliyet_tl FROM dk_maliyet`
  return matrise(r as unknown as Array<{ donem: string; bolge: number; dk_maliyet_tl: number }>)
}

export async function gecmisiOku(sql: Sql, limit = 200): Promise<GecmisSatiri[]> {
  const r = await sql`
    SELECT id, donem, bolge, islem, eski_tl::float AS eski_tl, yeni_tl::float AS yeni_tl,
           degistiren, aciklama, degisti_at::text AS degisti_at
    FROM dk_maliyet_gecmis ORDER BY degisti_at DESC, id DESC LIMIT ${limit}`
  return r as unknown as GecmisSatiri[]
}

/** Dönemin altı bölgesini yazar (ekle ya da güncelle). Geçmişi tetikleyici tutar. */
export async function donemKaydet(
  sql: Sql, tenantId: string, kullanici: string | null, g: KayitGirdisi,
): Promise<{ eklenen: number; guncellenen: number }> {
  await kimlikKur(sql, kullanici, g.aciklama)
  const once = await sql`SELECT bolge, dk_maliyet_tl::float AS tl FROM dk_maliyet WHERE donem = ${g.donem}` as unknown as Array<{ bolge: number; tl: number }>
  const varolan = new Map(once.map((r) => [r.bolge, r.tl]))
  let eklenen = 0
  let guncellenen = 0
  for (const b of BOLGELER) {
    const v = g.degerler[b]
    if (!varolan.has(b)) eklenen++
    else if (varolan.get(b) !== v) guncellenen++
    await sql`
      INSERT INTO dk_maliyet (tenant_id, donem, bolge, dk_maliyet_tl)
      VALUES (${tenantId}, ${g.donem}, ${b}, ${v})
      ON CONFLICT (donem, bolge) DO UPDATE SET dk_maliyet_tl = EXCLUDED.dk_maliyet_tl`
  }
  return { eklenen, guncellenen }
}

/** Dönemi siler. Son kalan dönem silinemez — her hesap bir 3D değerine dayanır. */
export async function donemSil(
  sql: Sql, kullanici: string | null, donem: string, aciklama: string | null,
): Promise<{ ok: true; silinen: number } | { ok: false; hata: string }> {
  if (!DONEM_RE.test(donem)) return { ok: false, hata: 'Geçersiz dönem' }
  const [n] = await sql`SELECT count(DISTINCT donem)::int AS n FROM dk_maliyet` as unknown as Array<{ n: number }>
  if (n.n <= 1) return { ok: false, hata: 'Son kalan dönem silinemez.' }
  await kimlikKur(sql, kullanici, aciklama)
  const r = await sql`DELETE FROM dk_maliyet WHERE donem = ${donem} RETURNING id`
  return { ok: true, silinen: r.length }
}

/**
 * Bir dönemin geçerli olduğu aralık: kendisinden sonraki döneme kadar.
 * `bitis` null ise "bundan sonraki her ay".
 */
export function gecerlilikAraligi(donemler: string[], donem: string): { baslangic: string; bitis: string | null } {
  const sonraki = donemler.filter((d) => d > donem).sort()[0] ?? null
  if (!sonraki) return { baslangic: donem, bitis: null }
  const [y, a] = sonraki.split('-').map(Number)
  const onceki = a === 1 ? `${y - 1}-12` : `${y}-${String(a - 1).padStart(2, '0')}`
  return { baslangic: donem, bitis: onceki }
}

export type GecmisIslem = {
  anahtar: string
  degisti_at: string
  donem: string
  islem: GecmisSatiri['islem']
  degistiren: string
  aciklama: string | null
  /** Bölge → { eski, yeni }. Değişmeyen bölge yok. */
  bolgeler: Record<number, { eski: number | null; yeni: number | null }>
}

/**
 * Aynı işlemde yazılan satırları birleştirir: bir dönem kaydı altı bölgeyi
 * tek işlemde yazar ve hepsi aynı now() zamanını taşır. Ekranda altı satır
 * yerine tek satır.
 */
export function gecmisiGrupla(satirlar: GecmisSatiri[]): GecmisIslem[] {
  const m = new Map<string, GecmisIslem>()
  for (const s of satirlar) {
    const k = [s.degisti_at, s.donem, s.islem, s.degistiren, s.aciklama ?? ''].join('|')
    const g = m.get(k) ?? {
      anahtar: k, degisti_at: s.degisti_at, donem: s.donem, islem: s.islem,
      degistiren: s.degistiren, aciklama: s.aciklama, bolgeler: {},
    }
    g.bolgeler[s.bolge] = { eski: s.eski_tl, yeni: s.yeni_tl }
    m.set(k, g)
  }
  return [...m.values()]
}
