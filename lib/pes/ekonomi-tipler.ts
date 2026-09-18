/**
 * Atölye ekonomi modeli — tipler ve parametre varsayılanları.
 *
 * Kaynak: Atolye_Gider_Model.xlsx (PARAMETRE + VERI_GIRIS + HESAP sayfaları).
 * Tasarım: docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md
 *
 * Bu dosyada hesap YOK. Hesap ekonomi-hesap.ts'te; oradaki her fonksiyon
 * FORMULLER sayfasındaki bir satıra karşılık gelir.
 */

/** Dönem versiyonlu model parametreleri (economy_param tablosunun satırları). */
export type EkonomiParam = {
  /** Brüt asgari ücret, TL/ay. PARAMETRE!B4 */
  min_wage_gross: number
  /** Net asgari ücret, TL/ay. PARAMETRE!B5 — maaş/kişi kıyaslamasında kullanılır. */
  min_wage_net: number
  /** İşveren maliyeti (imalat, 5 puan SGK indirimi), TL/ay. PARAMETRE!B6 */
  employer_cost: number
  /** Asgari ücret desteği, TL/ay. PARAMETRE!B7 */
  wage_support: number
  /** Günlük çalışma dakikası (molalar hariç). PARAMETRE!B8 */
  minutes_per_day: number
  /** Aylık nominal çalışma günü. PARAMETRE!B9 */
  nominal_days: number
  /** Aylık efektif çalışma günü (tatil/izin/devamsızlık sonrası). PARAMETRE!B10 */
  effective_days: number
  /** Kesim verimliliği (MTM → gerçek dakika). PARAMETRE!B14 */
  eff_cutting: number
  /** Dikim verimliliği. PARAMETRE!B15 */
  eff_sewing: number
  /** UKP verimliliği. PARAMETRE!B16 */
  eff_ukp: number
  /** Hedef tedarikçi marjı. PARAMETRE!B17 */
  target_margin: number
  /** Kesim maaş ağırlığı (dakika maliyeti dağıtımı). PARAMETRE!B19 */
  weight_cutting: number
  /** Dikim maaş ağırlığı. PARAMETRE!B20 */
  weight_sewing: number
  /** UKP maaş ağırlığı. PARAMETRE!B21 */
  weight_ukp: number
  /** Boş gün ciro düzeltmesi açık mı (1 = evet). PARAMETRE!B23 */
  revenue_adj_on: number
  /** Boş gün düzeltme paydası (gün). PARAMETRE!B24 */
  revenue_adj_divisor: number
}

/** 2026-01 başlangıç değerleri. economy_param boşsa seed olarak yazılır. */
export const VARSAYILAN_PARAM: EkonomiParam = {
  min_wage_gross: 33030,
  min_wage_net: 28075.5,
  employer_cost: 39223.13,
  wage_support: 1270,
  minutes_per_day: 540,
  nominal_days: 22,
  effective_days: 19.5,
  eff_cutting: 0.75,
  eff_sewing: 0.65,
  eff_ukp: 0.75,
  target_margin: 0.15,
  weight_cutting: 1,
  weight_sewing: 1,
  weight_ukp: 1,
  revenue_adj_on: 1,
  revenue_adj_divisor: 24,
}

/**
 * monthly_expense'in 28 gider kalemi. Teşvik BURADA YOK — gider değil,
 * mahsup kalemidir ve brüt toplama girmez.
 *
 * ukp_consumables ve vehicle_depr migration 037 ile eklenir.
 */
export const GIDER_KALEMLERI = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
  'food', 'transport', 'cargo', 'rent', 'building_depr',
  'electricity', 'water', 'gas', 'thread', 'needle',
  'ukp_consumables', 'consumables', 'machine_maint', 'machine_depr',
  'vehicle_depr', 'vehicle', 'stationery', 'isg', 'consulting',
  'official_fees', 'insurance', 'communication', 'other',
] as const

export type GiderKalemi = (typeof GIDER_KALEMLERI)[number]

/** İşçilik sayılan beş kalem (HESAP!P — FORMULLER satır 15). */
export const ISCILIK_KALEMLERI: readonly GiderKalemi[] = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
]

/** Bir atölyenin bir ayına ait gider satırı. Eksik kalem null. */
export type GiderSatiri = Partial<Record<GiderKalemi, number | null>> & {
  /** Alınan teşvik, TL/ay. Gider değil — net giderden düşülür. */
  incentive_amount: number | null
}

/** workshop_economy satırı: giderde olmayan alanlar. */
export type EkonomiSatiri = {
  /** Aylık ciro, boş gün düzeltmesi ÖNCESİ (fatura toplamı ÷ ay sayısı). */
  revenue_declared: number | null
  /** Boş / dışarı çalışılan gün, aylık ortalama. */
  idle_days: number | null
  /** Beyan edilen aylık adet (bant kapasitesi tahmini). */
  qty_declared: number | null
  nominal_days: number | null
  actual_days: number | null
  hours_per_day: number | null
  cutting_staff: number | null
  sewing_staff: number | null
  ukp_staff: number | null
  office_staff: number | null
  area_m2: number | null
  source: 'anket' | 'elle' | 'turetilmis'
}

export type EkonomiGirdi = {
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
  param: EkonomiParam
  /** dk_maliyet tablosundan, atölyenin teşvik bölgesine göre. Yoksa null. */
  dkMaliyet3D: number | null
  /** PES üretim kaydından gerçekleşen adet. Yoksa null. */
  qtyActual: number | null
}

/**
 * 36 türetilmiş gösterge. Hesaplanamayan her alan null döner — 0 DEĞİL.
 * 0 "hesaplandı ve sıfır çıktı", null "hesaplanamadı" demektir; ekranda
 * ikisi farklı görünür.
 *
 * HESAP sayfasının 37. sütunu Marj sırası akran türevlidir ve burada değil,
 * ekonomi-akran.ts'in marjSirasi() fonksiyonunda hesaplanır.
 */
export type EkonomiRasyo = {
  toplamKisi: number | null
  uretimKisi: number | null
  dikimPayi: number | null

  aylikCiro: number | null
  aylikAdet: number | null
  ortFiyatAdet: number | null
  brutGider: number | null
  tesvik: number | null
  netGider: number | null
  karZarar: number | null
  marj: number | null

  iscilikToplam: number | null
  iscilikPayi: number | null
  iscilikDisiKisi: number | null
  iscilikYukKatsayisi: number | null

  ciroKisi: number | null
  netGiderKisi: number | null
  maasKisi: number | null
  adetDikimci: number | null

  nominalDikimDk: number | null
  fiiliDikimDk: number | null
  uretimKisiDk: number | null
  kisiDkMaliyet: number | null
  kesimDkMaliyet: number | null
  dikimDkMaliyet: number | null
  ukpDkMaliyet: number | null
  dikimDkCiro: number | null
  dakikaMarji: number | null
  fiiliDikimDkMaliyet: number | null
  asgariDkCarpani: number | null
  dikimDkAdet: number | null

  basabasFiyat: number | null
  adilFiyat: number | null
  fiyatSapmasi: number | null

  referans3D: number | null
  dkMaliyet3DOran: number | null
}
