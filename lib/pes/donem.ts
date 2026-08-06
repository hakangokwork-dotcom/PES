import type postgres from 'postgres'

/**
 * Dönem (yıl-ay) — tek kaynak.
 *
 * SORUN: scoring, production, quality, costs ekranlarının her biri kendi
 * `useState(2026)` yıl seçicisini taşıyordu ve yıl listesi `2025 / 2026`
 * olarak koda gömülüydü. Kullanıcı Mart'a bakarken Kalite'ye geçince
 * sessizce içinde bulunulan aya dönüyordu — analitik bir üründe bu,
 * yanlış dönemin verisine bakıp doğru sanmak demek.
 *
 * ÇÖZÜM: dönem URL'de (`?donem=2026-03`) durur. Ekranlar arası geçişte
 * korunur, tarayıcı geri tuşu çalışır, bağlantı paylaşılabilir.
 */

export type Donem = { yil: number; ay: number }

export const AY_ADLARI = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/** `2026-03` → { yil: 2026, ay: 3 }. Bozuk girdide null. */
export function donemCoz(ham: string | null | undefined): Donem | null {
  if (!ham) return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(ham.trim())
  if (!m) return null
  const yil = Number(m[1])
  const ay = Number(m[2])
  if (ay < 1 || ay > 12) return null
  if (yil < 2000 || yil > 2100) return null
  return { yil, ay }
}

export function donemYaz(d: Donem): string {
  return `${d.yil}-${String(d.ay).padStart(2, '0')}`
}

export function donemEtiket(d: Donem): string {
  return `${AY_ADLARI[d.ay]} ${d.yil}`
}

/**
 * Veride gerçekten bulunan dönemler — sabit yıl listesi yerine.
 * En yeni başta.
 *
 * Veri hiç yoksa içinde bulunulan ay tek seçenek olarak döner; seçici
 * boş kalmasın, kullanıcı "sistem bozuk" sanmasın.
 */
export async function mevcutDonemler(sql: postgres.TransactionSql): Promise<Donem[]> {
  const rows = await sql`
    SELECT DISTINCT year::int AS yil, month::int AS ay
    FROM monthly_production
    ORDER BY yil DESC, ay DESC` as unknown as Donem[]

  if (rows.length > 0) return rows

  const simdi = new Date()
  return [{ yil: simdi.getUTCFullYear(), ay: simdi.getUTCMonth() + 1 }]
}

/** URL'deki dönem geçersizse veya yoksa en yeni döneme düşer. */
export function etkinDonem(ham: string | null | undefined, mevcut: Donem[]): Donem {
  return donemCoz(ham) ?? mevcut[0] ?? {
    yil: new Date().getUTCFullYear(), ay: new Date().getUTCMonth() + 1,
  }
}
