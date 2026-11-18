// lib/pes/is-emri-adim.ts
/* Sürüm 2a: iş emri adımı — iş ortağı tipleri, plan değişikliği gerekçeleri,
   sorun etkileri. Listeler 064'teki CHECK kısıtlarıyla aynı tutulur (test). */

export const ORTAK_TIPLERI = ['Kumaşçı', 'Aksesuar', 'Kesimhane', 'Atölye', 'Yıkamacı', 'UKP', 'Baskı', 'Nakış', 'Diğer'] as const
export type OrtakTipi = (typeof ORTAK_TIPLERI)[number]

/* 044 gerekçe kodları + iki ek. Atölyenin ve planlamacının dili aynı kalsın. */
export const PLAN_GEREKCELERI = [
  { kod: 'KAPASITE_YOK', ad: 'Kapasite yok' },
  { kod: 'MALZEME_GEC', ad: 'Malzeme geç geldi' },
  { kod: 'ONCEKI_IS_GECIKTI', ad: 'Önceki iş gecikti' },
  { kod: 'MAKINE_ARIZA', ad: 'Makine arızası' },
  { kod: 'ISGUCU_YETERSIZ', ad: 'İşgücü yetersiz' },
  { kod: 'NUMUNE_ONAY_BEKLIYOR', ad: 'Numune onayı bekleniyor' },
  { kod: 'TATIL_IZIN', ad: 'Tatil / izin' },
  { kod: 'MUSTERI_TALEBI', ad: 'Müşteri talebi' },
  { kod: 'KALITE_SORUNU', ad: 'Kalite sorunu' },
  { kod: 'DIGER', ad: 'Diğer (not zorunlu)' },
] as const

export const SORUN_ETKILERI = ['Gecikme', 'Kalite', 'Maliyet', 'Diğer'] as const

type Plan = { plan_baslangic?: string | null; plan_bitis?: string | null }

/** Önceden girilmiş bir plan tarihi değişiyorsa gerekçe istenir; ilk giriş gerekçesizdir. */
export function gerekceGerekli(eski: Plan, yeni: Plan): boolean {
  return (['plan_baslangic', 'plan_bitis'] as const).some(k =>
    k in yeni && eski[k] != null && (yeni[k] ?? null) !== eski[k])
}

/** İş ortağının serbestçe değişen alanları (unvan/tip hariç). */
export const ORTAK_ILETISIM = ['kisa_ad', 'vergi_no', 'adres', 'il', 'telefon', 'eposta', 'notlar'] as const

/** Gövdede gelen iletişim alanlarını kırpar; boş dize NULL olur. Gelmeyen alan dokunulmaz. */
export function iletisimAlanlari(b: Record<string, unknown>): Record<string, string | null> {
  const v: Record<string, string | null> = {}
  for (const k of ORTAK_ILETISIM) if (k in b) v[k] = b[k] == null ? null : String(b[k]).trim() || null
  return v
}
