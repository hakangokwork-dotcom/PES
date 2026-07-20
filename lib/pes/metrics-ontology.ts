/**
 * PES Metric Ontology — şeffaf hesaplama katmanı
 *
 * Kullanıcının görüceği her sayının formülü, kaynağı (tablo.kolon),
 * birimi, yönü ve eşikleri burada. UI'da MetricInfo component'i bu
 * metadata'yı tooltip/modal olarak gösterir.
 *
 * Kaynak: PES_HESAPLAMA_SOZLUGU.md (project root)
 */

export type Direction = 'higher_better' | 'lower_better'

export interface MetricSource {
  table: string
  column?: string
  label: string
}

export interface MetricThreshold {
  min?: number
  max?: number
  color: 'green' | 'amber' | 'red' | 'blue' | 'orange'
  label: string
}

export interface MetricDefinition {
  key: string
  label: string
  /** Sektörde sıkça kullanılan alternatif adlandırmalar (literatür) */
  aliases?: string[]
  category:
    | 'production'      // genel üretim sayımları
    | 'effectiveness'   // Drucker: "doğru şeyi yapma" — output/goal
    | 'efficiency'      // Drucker: "doğru yapma" — output/input veya standard/actual
    | 'productivity'    // birim girdi başına çıktı
    | 'cost'
    | 'quality'
    | 'oee'
    | 'vsm'
    | 'downtime'
    | 'workforce'
    | 'score'
    | 'eder'
    | 'delivery'        // teslimat / buyer metrikleri
    | 'data_quality'    // beyan güven skoru (migration 022)
    | 'expense_group'   // kanonik gider grupları G1-G8 (021)
    | 'inflation'       // enflasyon düzeltmesi / reel değer (022d)
    | 'revision'        // beyan sürüm yönetimi (022c)
  formula: string
  unit: string
  direction?: Direction
  sources: MetricSource[]
  thresholds?: MetricThreshold[]
  example?: string
  notes?: string
  /** Literatür kaynağı (kısa) — bkz. konfeksiyon_kpi_literatur_ontolojik_sozluk.md */
  literature?: string
}

export const METRICS: Record<string, MetricDefinition> = {
  // ─────── 1. ÜRETİM ETKİLİLİK (sahada "Verimlilik" denir, literatürde Production Attainment) ───────
  verimlilik: {
    key: 'verimlilik',
    label: 'Verimlilik (Hedef Tutturma)',
    aliases: ['Production Attainment', 'Schedule Attainment', 'Plan Adherence', 'Target Achievement Rate'],
    category: 'effectiveness',
    formula: '(Gerçek Üretim / Hedef Üretim) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'monthly_production', column: 'actual_qty', label: 'Gerçek Üretim' },
      { table: 'monthly_production', column: 'target_qty', label: 'Hedef Üretim' },
    ],
    thresholds: [
      { min: 90, color: 'green',  label: 'İyi' },
      { min: 70, max: 90, color: 'amber', label: 'Ortalama' },
      { max: 70, color: 'red',    label: 'Kritik' },
    ],
    example: 'Hedef 3000, Gerçek 2700 → %90',
    notes: 'Literatürde bu metrik "Production Attainment" — bir EFFECTIVENESS (etkililik) ölçüsüdür, gerçek "Efficiency" değildir. Drucker: "Effectiveness = doğru şeyi yapma; output/goal". Kaynak verimliliği için bkz. hat_verimliligi metric.',
    literature: 'OpsDog Production Attainment; Drucker (1974); konfeksiyon_kpi_literatur §2',
  },

  toplam_kapasite: {
    key: 'toplam_kapasite',
    label: 'Toplam Kapasite',
    category: 'production',
    formula: 'Dikim Op × Çalışma Günü × Net Saat × 60',
    unit: 'dk/ay',
    sources: [
      { table: 'workshop',         column: 'sewing_staff',  label: 'Dikim Operatörü' },
      { table: 'monthly_expense',  column: 'work_days',     label: 'Çalışma Günü' },
      { table: 'workshop',         column: 'net_hours_day', label: 'Net Saat (varsayılan 9)' },
    ],
    example: '185 op × 22 gün × 9 saat × 60 dk = 2.196.000 dk/ay',
  },

  burut_hedef: {
    key: 'burut_hedef',
    label: 'Brüt Üretim Hedefi',
    category: 'production',
    formula: 'Toplam Kapasite (dk) / Model SAM (dk)',
    unit: 'adet/ay',
    sources: [
      { table: '(hesaplama)', label: 'Toplam Kapasite' },
      { table: 'eder_model',  column: 'toplam_sure', label: 'Model SAM' },
    ],
    example: '2.196.000 dk / 12,26 dk = 179.117 adet/ay',
  },

  darbogaz_kapasitesi: {
    key: 'darbogaz_kapasitesi',
    label: 'Darboğaz Günlük Kapasite',
    category: 'production',
    formula: '(Net Saat × 3600) / Darboğaz Süresi (sn)',
    unit: 'adet/gün',
    sources: [
      { table: 'workshop', column: 'net_hours_day', label: 'Net Saat' },
      { table: '(hesaplama)', label: 'En uzun operasyonun efektif süresi' },
    ],
    example: '(9 × 3600) / 56,55 sn = 573 adet/gün',
  },

  // ─────── 2. MALİYET ───────
  toplam_gider: {
    key: 'toplam_gider',
    label: 'Toplam Gider',
    category: 'cost',
    formula: 'Personel + SGK + Yemek + Elektrik + Su + Doğalgaz + Servis + Araç + Kargo + Makine Bakım + İplik + Diğer',
    unit: 'TL/ay',
    sources: [
      { table: 'monthly_expense', label: '12 ana gider kalemi' },
    ],
  },

  tl_dk: {
    key: 'tl_dk',
    label: 'Dakika Maliyeti (TL/dk)',
    category: 'cost',
    formula: 'Toplam Gider / (Verimli Op × Çalışma Günü × Net Saat × 60)',
    unit: 'TL/dk',
    direction: 'lower_better',
    sources: [
      { table: '(hesaplama)',     label: 'Toplam Gider' },
      { table: 'workshop',        column: 'sewing_staff',  label: 'Verimli Op (CMT: dikim+kesim+UKP, M: dikim)' },
      { table: 'monthly_expense', column: 'work_days',     label: 'Çalışma Günü' },
      { table: 'workshop',        column: 'net_hours_day', label: 'Net Saat' },
    ],
    thresholds: [
      { max: 6,    color: 'green', label: 'İyi (hedef 6,00)' },
      { min: 6, max: 7, color: 'amber', label: 'Uyarı' },
      { min: 7,    color: 'red',   label: 'Kritik' },
    ],
    example: '1.648.000 TL / (288 op × 22 gün × 540 dk) = 0,48 TL/dk',
    notes: 'Atölye tipi (CMT/CM/MT/M) verimli operasyon kapsamını belirler',
  },

  tl_dk_referans: {
    key: 'tl_dk_referans',
    label: 'Sektör Referans TL/dk',
    category: 'cost',
    formula: 'Bölgesel sabit (dk_maliyet tablosu)',
    unit: 'TL/dk',
    sources: [
      { table: 'dk_maliyet', column: 'value', label: 'Bölgeye göre referans' },
    ],
    notes: 'Atölyenin gerçek TL/dk değeri bu referansla karşılaştırılır',
  },

  adet_maliyeti: {
    key: 'adet_maliyeti',
    label: 'Adet Başı Maliyet',
    category: 'cost',
    formula: '(SAM × TL/dk) / (Verimlilik / 100)',
    unit: 'TL/adet',
    direction: 'lower_better',
    sources: [
      { table: 'eder_model', column: 'toplam_sure', label: 'SAM' },
      { table: '(hesaplama)', label: 'TL/dk' },
      { table: '(hesaplama)', label: 'Verimlilik' },
    ],
    example: '(12,26 dk × 5,82 TL/dk) / 0,90 = 79,28 TL/adet',
  },

  marj: {
    key: 'marj',
    label: 'Net Marj',
    category: 'cost',
    formula: '((Hedef Ciro − Toplam Gider) / Hedef Ciro) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'monthly_expense', column: 'target_revenue',   label: 'Hedef Ciro' },
      { table: '(hesaplama)',                                 label: 'Toplam Gider' },
    ],
    thresholds: [
      { min: 15,        color: 'green', label: 'İyi' },
      { min: 8, max: 15, color: 'amber', label: 'Uyarı' },
      { max: 8,         color: 'red',   label: 'Kritik' },
    ],
    example: '((2.200.000 − 1.648.000) / 2.200.000) × 100 = %25,1',
  },

  // ─────── 3. EDER MALİYET ───────
  eder_maliyet: {
    key: 'eder_maliyet',
    label: 'Eder Maliyet (1 adet)',
    category: 'eder',
    formula: 'Toplam Süre (dk) × DK Maliyet (TL/dk)',
    unit: 'TL',
    sources: [
      { table: 'eder_model', column: 'toplam_sure', label: 'Toplam Süre' },
      { table: 'dk_maliyet', column: 'value',       label: 'Bölgesel TL/dk' },
    ],
    example: '12,26 dk × 5,82 TL/dk = 71,35 TL',
  },

  bant_verimliligi: {
    key: 'bant_verimliligi',
    label: 'Bant Verimliliği',
    category: 'eder',
    formula: '(Toplam Süre / (Darboğaz × Toplam Kişi)) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'eder_alt_operasyon', label: 'Toplam süreler ve kişi sayısı' },
    ],
  },

  // ─────── 4. KALİTE ───────
  fpq: {
    key: 'fpq',
    label: 'İlk Geçiş Kalitesi (FPQ)',
    category: 'quality',
    formula: '(İlk Geçiş Adedi / Kontrol Edilen) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'quality_record', column: 'first_pass_qty', label: 'İlk Geçiş Adedi' },
      { table: 'quality_record', column: 'inspected_qty',  label: 'Kontrol Edilen' },
    ],
    thresholds: [
      { min: 95,         color: 'green', label: 'İyi' },
      { min: 90, max: 95, color: 'amber', label: 'Uyarı' },
      { max: 90,         color: 'red',   label: 'Kritik' },
    ],
  },

  red_orani: {
    key: 'red_orani',
    label: 'Red Oranı',
    category: 'quality',
    formula: '(Red Edilen / Kontrol Edilen) × 100',
    unit: '%',
    direction: 'lower_better',
    sources: [
      { table: 'quality_record', column: 'rejected_qty',  label: 'Red Edilen' },
      { table: 'quality_record', column: 'inspected_qty', label: 'Kontrol Edilen' },
    ],
    thresholds: [
      { max: 1,  color: 'green', label: 'İyi' },
      { min: 1, max: 3, color: 'amber', label: 'Uyarı' },
      { min: 3,  color: 'red',   label: 'Kritik' },
    ],
  },

  // ─────── 5. OEE & VSM ───────
  oee: {
    key: 'oee',
    label: 'OEE (Genel Ekipman Etkinliği)',
    category: 'oee',
    formula: 'Kullanılabilirlik × Performans × Kalite',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: '(hesaplama)', label: 'Kullanılabilirlik = (Planlanan − Plansız Duruş) / Planlanan' },
      { table: '(hesaplama)', label: 'Performans = (Gerçek × İdeal CT) / Çalışma Süresi' },
      { table: '(hesaplama)', label: 'Kalite = (Toplam − Hatalı) / Toplam' },
    ],
    thresholds: [
      { min: 85,         color: 'green',  label: 'Dünya Standardı' },
      { min: 75, max: 85, color: 'blue',   label: 'İyi' },
      { min: 65, max: 75, color: 'amber',  label: 'Kabul Edilebilir' },
      { max: 65,         color: 'red',    label: 'Kabul Edilemez' },
    ],
  },

  takt_time: {
    key: 'takt_time',
    label: 'Takt Time',
    category: 'vsm',
    formula: 'Net Kullanılabilir Süre (sn) / Günlük Talep (adet)',
    unit: 'sn/adet',
    sources: [
      { table: '(hesaplama)', label: '(Vardiya dk − Mola dk) × 60' },
      { table: '(parametre)', label: 'Günlük Talep' },
    ],
    example: '(540 − 60) × 60 / 350 = 82,3 sn',
    notes: 'CT > Takt Time olan operasyon DARBOĞAZ',
  },

  pce: {
    key: 'pce',
    label: 'PCE — Değer Katma Oranı',
    category: 'vsm',
    formula: '(Değer Katan Süre / Toplam Lead Time) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: '(hesaplama)', label: 'VA: dikiş, overlok, ütü gibi dönüştüren işler' },
      { table: '(hesaplama)', label: 'Lead Time: VA + WIP bekleme' },
    ],
    thresholds: [
      { min: 25,         color: 'green', label: 'Mükemmel (Lean)' },
      { min: 15, max: 25, color: 'blue',  label: 'İyi' },
      { min: 5,  max: 15, color: 'amber', label: 'Ortalama' },
      { max: 5,          color: 'red',   label: 'Kritik' },
    ],
  },

  hat_dengeleme: {
    key: 'hat_dengeleme',
    label: 'Hat Dengeleme Verimliliği',
    category: 'vsm',
    formula: 'Toplam CT / (Operatör × Max CT) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'eder_alt_operasyon', label: 'Operasyon süreleri ve kişi sayıları' },
    ],
    thresholds: [
      { min: 85,         color: 'green', label: 'İyi' },
      { min: 70, max: 85, color: 'amber', label: 'Ortalama' },
      { max: 70,         color: 'red',   label: 'Kötü' },
    ],
  },

  hat_verimliligi: {
    key: 'hat_verimliligi',
    label: 'Hat Verimliliği',
    aliases: ['Line Efficiency'],
    category: 'efficiency',
    formula: '(Toplam SMV × Gerçek Üretim) / (Çalışma Dk × Operatör) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'eder_model',         column: 'toplam_sure', label: 'SMV' },
      { table: 'monthly_production', column: 'actual_qty',  label: 'Gerçek Üretim' },
    ],
    thresholds: [
      { min: 88,         color: 'green', label: 'Mükemmel' },
      { min: 80, max: 88, color: 'blue',  label: 'İyi' },
      { min: 70, max: 80, color: 'amber', label: 'Ortalama' },
      { min: 60, max: 70, color: 'orange', label: 'Zayıf' },
      { max: 60,         color: 'red',   label: 'Kritik' },
    ],
    notes: 'Klasik IE tanımı: kazanılan standart dakika / müsait dakika. Bu GERÇEK bir efficiency ölçüsüdür (output/input). "Verimlilik" sahada Production Attainment ile karıştırılır — bu metrik kaynak kullanım kalitesini ölçer.',
    literature: 'Sarkar (onlineclothingstudy); Bongomin et al. 2020; konfeksiyon_kpi_literatur §4.3',
  },

  // ─────── 6. DURUŞ ───────
  durus_etkisi: {
    key: 'durus_etkisi',
    label: 'Duruş Kapasite Etkisi',
    category: 'downtime',
    formula: 'Toplam Duruş (dk) / Toplam Kapasite (dk) × 100',
    unit: '%',
    direction: 'lower_better',
    sources: [
      { table: 'downtime_record', column: 'duration_min',   label: 'Duruş Süresi' },
      { table: '(hesaplama)',                                label: 'Toplam Kapasite' },
    ],
    thresholds: [
      { max: 3,  color: 'green', label: 'İyi' },
      { min: 3, max: 5, color: 'amber', label: 'Uyarı' },
      { min: 5,  color: 'red',   label: 'Kritik' },
    ],
  },

  // ─────── 7. İŞGÜCÜ ───────
  isgucu_devir: {
    key: 'isgucu_devir',
    label: 'İşgücü Devir Oranı',
    category: 'workforce',
    formula: '(Aydan Ayrılan / Toplam Personel) × 100',
    unit: '%',
    direction: 'lower_better',
    sources: [
      { table: 'workforce_turnover', column: 'left_count', label: 'Aydan Ayrılan' },
      { table: 'workshop',           column: 'total_staff', label: 'Toplam Personel' },
    ],
    thresholds: [
      { max: 5,  color: 'green', label: 'İyi' },
      { min: 5, max: 10, color: 'amber', label: 'Uyarı' },
      { min: 10, color: 'red',   label: 'Kritik' },
    ],
  },

  // ─────── 8. SKORLAMA ───────
  composite_score: {
    key: 'composite_score',
    label: 'Bileşik Skor',
    category: 'score',
    formula: 'Verimlilik×30% + Kalite×25% + Teslimat×20% + Maliyet×15% + Uyum×10%',
    unit: 'puan',
    direction: 'higher_better',
    sources: [
      { table: '(hesaplama)', label: 'Verimlilik (Gerçek/Hedef)' },
      { table: '(hesaplama)', label: 'Kalite (FPQ)' },
      { table: '(hesaplama)', label: 'Teslimat (zamanında)' },
      { table: '(hesaplama)', label: 'Maliyet (marj + 50 offset)' },
      { table: '(hesaplama)', label: 'Uyum (100 − duruş/10)' },
    ],
    thresholds: [
      { min: 85,         color: 'green',  label: 'Stratejik' },
      { min: 70, max: 85, color: 'blue',   label: 'Gelişen' },
      { min: 55, max: 70, color: 'amber',  label: 'İzlemede' },
      { min: 40, max: 55, color: 'orange', label: 'Risk' },
      { max: 40,         color: 'red',    label: 'Kritik' },
    ],
  },

  // ═════════════════════════════════════════════════════════════
  //  EK METRİKLER — Konfeksiyon KPI Literatür Sözlüğü'nden
  //  (konfeksiyon_kpi_literatur_ontolojik_sozluk.md)
  // ═════════════════════════════════════════════════════════════

  // ─────── ETKİLİLİK ───────
  production_attainment: {
    key: 'production_attainment',
    label: 'Hedef Tutturma',
    aliases: ['Production Attainment', 'Schedule Attainment', 'Plan Adherence'],
    category: 'effectiveness',
    formula: '(Gerçek Üretim / Hedef Üretim) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'monthly_production', column: 'actual_qty', label: 'Gerçek Üretim' },
      { table: 'monthly_production', column: 'target_qty', label: 'Hedef Üretim' },
    ],
    notes: '"verimlilik" key\'inin literatür terminolojisindeki adı. EFFECTIVENESS ölçüsüdür (output/goal). Kaynak verimliliği hat_verimliligi ile ölçülür.',
    literature: 'OpsDog Production Attainment; konfeksiyon_kpi_literatur §2',
  },

  // ─────── İŞGÜCÜ EFFICIENCY ÜÇLÜSÜ ───────
  operator_performance: {
    key: 'operator_performance',
    label: 'Operatör Performansı',
    aliases: ['Operator Performance', 'Performance Rating'],
    category: 'efficiency',
    formula: '(Earned Standard Minutes / On-Standard Time) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'operator_performance', label: 'Earned SAM' },
      { table: 'operator_performance', label: 'On-Standard süre (parça beklemek hariç)' },
    ],
    example: '1000 adet × 0.40 SAM = 400 std dk; 420 dk on-standard → %95.2',
    notes: 'Operatörün ÇALIŞIRKEN standart hıza ne kadar yakın olduğu. Operatörün sorumluluğundadır. Performance × Utilization = Operator Efficiency.',
    literature: 'Lean Stitch; konfeksiyon_kpi_literatur §4.2',
  },

  operator_utilization: {
    key: 'operator_utilization',
    label: 'Operatör Doluluk Oranı',
    aliases: ['Operator Utilization'],
    category: 'efficiency',
    formula: '(On-Standard Time / Attended Time) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'operator_performance', label: 'Attended (vardiya) süre' },
      { table: 'operator_performance', label: 'Off-standard süre (bekleme, arıza, eğitim)' },
    ],
    example: 'Vardiya 480 dk, off-standard 60 dk → 420/480 = %87.5',
    notes: 'Operatöre verilen sürenin ne kadarının on-standard işe ayrılabildiği. YÖNETİCİNİN sorumluluğu (besleme, denge, makine bakım).',
    literature: 'konfeksiyon_kpi_literatur §4.2',
  },

  operator_efficiency: {
    key: 'operator_efficiency',
    label: 'Operatör Verimliliği',
    aliases: ['Operator Efficiency'],
    category: 'efficiency',
    formula: '(Earned Standard Minutes / Attended Time) × 100 = Performance × Utilization',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'operator_performance', label: 'Earned SAM' },
      { table: 'operator_performance', label: 'Attended Time (vardiya)' },
    ],
    example: '0.952 × 0.875 = %83.3',
    thresholds: [
      { min: 80,         color: 'green', label: 'İyi' },
      { min: 65, max: 80, color: 'amber', label: 'Ortalama' },
      { max: 65,         color: 'red',   label: 'Kritik' },
    ],
    notes: 'Performance ve Utilization\'ın bileşkesidir; toplam kaynak kullanım kalitesi.',
    literature: 'konfeksiyon_kpi_literatur §4.2',
  },

  // ─────── KALİTE GENİŞLETME ───────
  dhu: {
    key: 'dhu',
    label: 'DHU (Yüz Adetteki Hata)',
    aliases: ['Defects per Hundred Units'],
    category: 'quality',
    formula: '(Total Defects Found / Total Units Inspected) × 100',
    unit: 'hata/100 adet',
    direction: 'lower_better',
    sources: [
      { table: 'quality_record', column: 'defect_count',   label: 'Toplam Hata Sayısı' },
      { table: 'quality_record', column: 'inspected_qty',  label: 'İncelenen Adet' },
    ],
    notes: 'Bir parçada birden fazla hata olabileceği için DHU > %100 olabilir. "Hata yoğunluğu" metriğidir, oran değildir. Defective % ile karıştırma: DHU hata sayar, Defective % hatalı parça sayar.',
    literature: 'konfeksiyon_kpi_literatur §6.1',
  },

  defective_pct: {
    key: 'defective_pct',
    label: 'Hatalı Parça Oranı',
    aliases: ['Defective %', 'Reject Rate'],
    category: 'quality',
    formula: '(Defective Units / Total Units Inspected) × 100',
    unit: '%',
    direction: 'lower_better',
    sources: [
      { table: 'quality_record', column: 'rejected_qty',   label: 'Hatalı/Red Adet' },
      { table: 'quality_record', column: 'inspected_qty',  label: 'İncelenen Adet' },
    ],
    thresholds: [
      { max: 1,         color: 'green', label: 'İyi' },
      { min: 1, max: 3, color: 'amber', label: 'Uyarı' },
      { min: 3,         color: 'red',   label: 'Kritik' },
    ],
    notes: 'PES\'teki red_orani metric\'i ile aynı şey. Bir parçada n hata olsa da o parça "1 hatalı" sayılır (DHU\'nun aksine ≤ %100).',
    literature: 'konfeksiyon_kpi_literatur §6.2',
  },

  rft: {
    key: 'rft',
    label: 'İlk Seferde Doğru (RFT)',
    aliases: ['Right First Time', 'First-Pass Yield (FPY)'],
    category: 'quality',
    formula: '(Units Passed Without Rework / Total Units) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'quality_record', column: 'first_pass_qty', label: 'İlk Geçişte Geçen' },
      { table: 'quality_record', column: 'inspected_qty',  label: 'Toplam İncelenen' },
    ],
    notes: 'PES\'teki FPQ metric\'i ile aynı kavram. Lean Six Sigma\'da FPY (First-Pass Yield) olarak anılır.',
    literature: 'konfeksiyon_kpi_literatur §6.3',
  },

  rty: {
    key: 'rty',
    label: 'Birikmiş Geçiş Verimi (RTY)',
    aliases: ['Rolled Throughput Yield'],
    category: 'quality',
    formula: 'FPY₁ × FPY₂ × ... × FPYₙ',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'quality_record', label: 'Her aşamanın FPY değeri' },
    ],
    example: '10 aşama × her biri %95 FPY → 0.95¹⁰ = %59.9',
    notes: 'Çok-aşamalı süreçte gerçek "iyi geçiş" oranı. "Hidden factory"nin (gizli yeniden işleme) boyutunu gösterir. Tek aşamalı FPQ aldatıcı; RTY gerçeği söyler.',
    literature: 'konfeksiyon_kpi_literatur §6.4',
  },

  // ─────── BUYER / TESLİMAT ───────
  cut_to_ship: {
    key: 'cut_to_ship',
    label: 'Kesim-Sevkiyat Oranı',
    aliases: ['Cut-to-Ship Ratio'],
    category: 'delivery',
    formula: 'Total Cut Quantity / Total Shipped Quantity',
    unit: 'oran',
    direction: 'lower_better',
    sources: [
      { table: 'work_order', column: 'cut_qty',     label: 'Kesilen Adet' },
      { table: 'work_order', column: 'shipped_qty', label: 'Sevk Edilen' },
    ],
    notes: 'Hedef = 1.00. >1.00 fazla kesim/fire, <1.00 eksik sevkiyat. Kumaş fire ve hata kaybını yansıtır.',
    literature: 'konfeksiyon_kpi_literatur §6.5',
  },

  order_to_ship: {
    key: 'order_to_ship',
    label: 'Sipariş-Sevkiyat Oranı',
    aliases: ['Order-to-Ship Ratio'],
    category: 'delivery',
    formula: 'Total Ordered Quantity / Total Shipped Quantity',
    unit: 'oran',
    direction: 'lower_better',
    sources: [
      { table: 'work_order', column: 'order_qty',   label: 'Sipariş Adet' },
      { table: 'work_order', column: 'shipped_qty', label: 'Sevk Edilen' },
    ],
    notes: 'Hedef = 1.00. Buyer açısından en kritik vendor değerlendirme metriği. Eksik sevkiyat = sözleşme cezası.',
    literature: 'konfeksiyon_kpi_literatur §6.6',
  },

  otd: {
    key: 'otd',
    label: 'Zamanında Teslimat (OTD)',
    aliases: ['On-Time Delivery'],
    category: 'delivery',
    formula: '(Zamanında Sevk Edilen Sipariş / Toplam Sipariş) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'work_order', column: 'shipped_at',   label: 'Sevk Tarihi' },
      { table: 'work_order', column: 'deadline',     label: 'Termin' },
    ],
    thresholds: [
      { min: 95,         color: 'green', label: 'İyi' },
      { min: 85, max: 95, color: 'amber', label: 'Uyarı' },
      { max: 85,         color: 'red',   label: 'Kritik' },
    ],
    notes: 'Buyer\'ların vendor scorecard\'ında en önemli metrik. %95+ hedeflenir.',
    literature: 'konfeksiyon_kpi_literatur §8',
  },

  // ─────── COMPOSITE — APPAREL ÖZGÜN ───────
  ole: {
    key: 'ole',
    label: 'OLE (İşgücü Etkililiği)',
    aliases: ['Overall Labor Effectiveness'],
    category: 'oee',
    formula: 'Labor Availability × Labor Performance × Labor Quality',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: '(hesaplama)', label: 'Availability: çalışılan dk / planlanan dk' },
      { table: '(hesaplama)', label: 'Performance: earned SAM / on-standard süre' },
      { table: '(hesaplama)', label: 'Quality: iyi parça / toplam' },
    ],
    notes: 'OEE\'nin işgücü versiyonu — konfeksiyon gibi emek-yoğun, makine-az endüstriler için OEE\'den DAHA UYGUN. Konfeksiyon OEE tipik %40-60 (Koç 2025) ama OLE doğru ölçer.',
    literature: 'Koç et al. 2025; konfeksiyon_kpi_literatur §5.3',
  },

  // ─────── VSM GENİŞLETME ───────
  pitch_time: {
    key: 'pitch_time',
    label: 'Pitch Time (Hedef Tempo)',
    aliases: ['Pitch Time'],
    category: 'vsm',
    formula: 'Total Garment SAM / # of Operators',
    unit: 'dk/operatör',
    sources: [
      { table: 'eder_model', column: 'toplam_sure', label: 'Garment SAM' },
      { table: 'production_line', column: 'operator_count', label: 'Operatör Sayısı' },
    ],
    example: '40 dk SAM, 10 operatör → Pitch = 4 dk/operatör',
    notes: 'Hattın dengelenmiş hedef ritmi. Her operasyonun bu süreye yakın dengelenmesi hedeflenir.',
    literature: 'konfeksiyon_kpi_literatur §4.4',
  },

  marker_efficiency: {
    key: 'marker_efficiency',
    label: 'Pastal Verimliliği',
    aliases: ['Marker Efficiency', 'Fabric Utilization'],
    category: 'efficiency',
    formula: '(Net Kumaş Alanı / Pastal Alanı) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: '(kesim verisi)', label: 'Pastal alan + parça toplam alanı' },
    ],
    thresholds: [
      { min: 88,         color: 'green', label: 'İyi' },
      { min: 80, max: 88, color: 'amber', label: 'Ortalama' },
      { max: 80,         color: 'red',   label: 'Kötü (yüksek fire)' },
    ],
    notes: 'Kesim hattının fire kontrolü. %85-90 hedef, kumaş maliyetinde doğrudan etki.',
    literature: 'konfeksiyon_kpi_literatur §3.2',
  },

  pph: {
    key: 'pph',
    label: 'PPH (Operatör Saatlik Üretim)',
    aliases: ['Pieces per Operator per Hour'],
    category: 'productivity',
    formula: 'Units Produced / (# Operators × Working Hours)',
    unit: 'adet/op·sa',
    direction: 'higher_better',
    sources: [
      { table: 'monthly_production', column: 'actual_qty',  label: 'Üretilen Adet' },
      { table: 'workshop',           column: 'sewing_staff', label: 'Operatör Sayısı' },
      { table: 'workshop',           column: 'net_hours_day', label: 'Net Saat' },
    ],
    notes: 'Sahada en çok kullanılan, en kaba productivity metriği. SAM\'a normalize edilmediği için modeller arası karşılaştırma yanıltıcı olabilir.',
    literature: 'konfeksiyon_kpi_literatur §7.5',
  },

  capacity_utilization: {
    key: 'capacity_utilization',
    label: 'Kapasite Kullanımı',
    aliases: ['Capacity Utilization'],
    category: 'efficiency',
    formula: '(Actual Output / Maximum Possible Output) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'monthly_production', column: 'actual_qty', label: 'Gerçekleşen' },
      { table: '(hesaplama)',                              label: 'Teorik max kapasite' },
    ],
    notes: 'Attainment\'a benzer ama paydası TEORİK kapasite (efficiency × effectiveness bileşkesi). Hedef = planlanan üretim, max = teorik tavanı yansıtır.',
    literature: 'konfeksiyon_kpi_literatur §7.4',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BEYAN GÜVEN SKORU (migration 022)
  //  "Bu sayıya ne kadar güvenebilirim?" sorusunun cevabı.
  //  Verinin kendisi değil, verinin KALİTESİ ölçülür.
  // ═══════════════════════════════════════════════════════════════
  guven_skoru: {
    key: 'guven_skoru',
    label: 'Güven Skoru',
    aliases: ['Data Confidence', 'Declaration Quality Score'],
    category: 'data_quality',
    formula: '(Doluluk + Tutarlılık + Makullük + Çapraz Kontrol) / 4',
    unit: '0-100',
    direction: 'higher_better',
    sources: [
      { table: 'declaration_quality', column: 'total_sc', label: 'Toplam güven skoru' },
    ],
    thresholds: [
      { min: 70, color: 'green', label: 'Kabul edilebilir' },
      { min: 50, max: 70, color: 'amber', label: 'Kırpılmış' },
      { max: 50, color: 'red', label: 'Düzeltme bekliyor' },
    ],
    example: 'Doluluk 44, diğer üçü 100 → (44+100+100+100)/4 = 86 → kabul edilebilir.',
    notes: 'NEDEN VAR: Beyana dayalı bir sistemde en büyük risk, kötü verinin iyi veriyle aynı ağırlıkta işlem görmesidir. Karşılaştırma havuzuna yalnız skoru eşiği geçen beyanlar girer; böylece "eksik doldurulmuş form" ile "özenle doldurulmuş form" aynı kefeye konmaz. Tek bir kritik hata (error) varsa toplam puan yüksek olsa bile kayıt kabul edilmez.',
  },

  doluluk_skoru: {
    key: 'doluluk_skoru',
    label: 'Doluluk',
    aliases: ['Completeness'],
    category: 'data_quality',
    formula: '(Sıfırdan farklı beyan edilen kalem sayısı / 27) × 100',
    unit: '%',
    direction: 'higher_better',
    sources: [
      { table: 'declaration_quality', column: 'completeness_sc', label: 'Doluluk skoru' },
      { table: 'v_expense_groups', column: 'doluluk_orani', label: 'Aynı hesabın SQL karşılığı' },
    ],
    example: 'Sadece maaş, SGK ve yemek girilmiş → 3/27 = %11.',
    notes: 'NEDEN "SIFIRDAN FARKLI": Gider tablosunun ilk 12 kalemi eski şemadan gelen bir alışkanlıkla boş bırakıldığında 0 olarak kaydediliyor. "Boş değil" diye saymak, hiçbir şey doldurmamış bir atölyeye %44 doluluk verirdi. Yan etki: doğalgazı gerçekten olmayan atölye o kalemden puan alamaz — şema bu iki durumu ayırt edemediği için kabul edilen bir ödünleşme.',
  },

  tutarlilik_skoru: {
    key: 'tutarlilik_skoru',
    label: 'Tutarlılık',
    aliases: ['Consistency'],
    category: 'data_quality',
    formula: '100 − (kural ihlali cezaları)',
    unit: '0-100',
    direction: 'higher_better',
    sources: [
      { table: 'declaration_quality', column: 'consistency_sc', label: 'Tutarlılık skoru' },
      { table: 'validation_param', label: 'Kural bantları (dönem bazlı)' },
    ],
    example: 'SGK/personel oranı %0,002 çıktı → alan doldurulmamış demektir, −35 puan ve kritik hata.',
    notes: 'NE BAKAR: Kalemlerin kendi içinde çelişip çelişmediği. Negatif gider, imkânsız çalışma günü, SGK\'nın maaşa oranının bandın dışına çıkması, teşvikin toplam giderden büyük olması. Dış veriye bakmaz — sadece formun kendi iç mantığına.',
  },

  makullük_skoru: {
    key: 'makullük_skoru',
    label: 'Makullük',
    aliases: ['Plausibility'],
    category: 'data_quality',
    formula: '100 − (bant dışı değer cezaları)',
    unit: '0-100',
    direction: 'higher_better',
    sources: [
      { table: 'declaration_quality', column: 'plausibility_sc', label: 'Makullük skoru' },
      { table: 'workshop', column: 'total_staff', label: 'Kişi başı hesaplar için kadro' },
    ],
    example: 'Personel gideri / kadro = 1.136 TL/kişi → asgari ücretin çok altında, kritik hata.',
    notes: 'NE BAKAR: Değerler gerçek dünyada makul mü. Kişi başı maaş ve yemek gideri bantlara göre kontrol edilir. Kadro bilinmiyorsa bu kontroller yapılamaz ve skor 75\'te sabitlenir — tam puan verilmez, çünkü bilgi eksikliği de bir belirsizliktir.',
  },

  capraz_kontrol_skoru: {
    key: 'capraz_kontrol_skoru',
    label: 'Çapraz Kontrol',
    aliases: ['Cross-check'],
    category: 'data_quality',
    formula: '100 − (PES kayıtlarıyla çelişki cezaları)',
    unit: '0-100',
    direction: 'higher_better',
    sources: [
      { table: 'declaration_quality', column: 'crosscheck_sc', label: 'Çapraz kontrol skoru' },
      { table: 'workshop', column: 'total_staff', label: 'Kayıtlı kadro' },
      { table: 'monthly_production', label: 'Dönemde üretim var mı' },
    ],
    example: 'Beyandan türetilen kadro ~5 kişi ama kayıtlı kadro 167 → %97 sapma, uyarı.',
    notes: 'NE BAKAR: Beyanın, sistemdeki DİĞER kayıtlarla uyuşup uyuşmadığı. Beyan edilen personel giderinden kadro tahmin edilir ve atölye kartındaki sayıyla karşılaştırılır; gider var ama üretim kaydı yoksa işaretlenir. Hiçbir çapraz kontrol yapılamıyorsa skor 60\'ta kalır.',
  },

  beyan_durumu: {
    key: 'beyan_durumu',
    label: 'Beyan Durumu',
    category: 'data_quality',
    formula: 'Kritik hata varsa → düzeltme bekliyor; yoksa skora göre eşik',
    unit: 'durum',
    sources: [
      { table: 'declaration_quality', column: 'status', label: 'Durum' },
      { table: 'validation_param', column: 'accept_threshold', label: 'Kabul eşiği (varsayılan 70)' },
    ],
    notes: 'DURUMLAR: "Kabul edildi" karşılaştırma havuzuna girer. "Kırpıldı" aykırı değeri budanarak girer. "Düzeltme bekliyor" atölyeden düzeltme istenir. "Reddedildi" havuza hiç girmez. Kritik hata (error) varsa toplam puan eşiği geçse bile kabul edilmez — tek bir imkânsız değer tüm beyanı şüpheli kılar.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  GİDER GRUPLARI (migration 021)
  // ═══════════════════════════════════════════════════════════════
  gider_gruplari: {
    key: 'gider_gruplari',
    label: 'Kanonik Gider Grupları (G1–G8)',
    category: 'expense_group',
    formula: 'G1 İşçilik · G2 Personel Yan · G3 Enerji · G4 Mekân · G5 Makine · G6 Sarf · G7 Dış Hizmet · G8 Diğer',
    unit: 'TL',
    sources: [
      { table: 'v_expense_groups', label: 'Grup toplamları' },
      { table: 'monthly_expense', label: '27 ham gider kalemi' },
    ],
    example: 'G1 = personel + SGK + fazla mesai + prim + kıdem karşılığı.',
    notes: 'NEDEN GRUPLAMA: Ham kalem listesi zamanla değişir (yeni gider türü eklenir, form güncellenir) ama oran analizi sabit bir çerçeve ister. Gruplar bir VIEW olarak tanımlı; kalem şeması değişse de rasyo katmanı bozulmaz. DİKKAT: Grup içerikleri şu an geçici — kaynak doküman (ATOLYE-BENCHMARK-SISTEMI.md) ile doğrulanmalı.',
  },

  toplam_brut: {
    key: 'toplam_brut',
    label: 'Toplam Brüt Gider',
    category: 'expense_group',
    formula: 'G1 + G2 + G3 + G4 + G5 + G6 + G7 + G8',
    unit: 'TL',
    direction: 'lower_better',
    sources: [{ table: 'v_expense_groups', column: 'toplam_brut', label: 'Brüt toplam' }],
    notes: 'Teşvik düşülmeden önceki toplam. Atölyenin fiilen katlandığı maliyet budur.',
  },

  toplam_net: {
    key: 'toplam_net',
    label: 'Toplam Net Gider',
    category: 'expense_group',
    formula: 'Toplam Brüt − Teşvik',
    unit: 'TL',
    direction: 'lower_better',
    sources: [
      { table: 'v_expense_groups', column: 'toplam_net', label: 'Net toplam' },
      { table: 'monthly_expense', column: 'incentive_amount', label: 'Teşvik' },
    ],
    notes: 'ÇİFT DEFTER: Brüt ve net ayrı tutulur. Brüt gerçek kaynak tüketimini, net atölyenin cebinden çıkanı gösterir. Teşvik bir gider kalemi DEĞİL, mahsuptur — grup toplamlarına girmez, yalnız nette düşülür. Karşılaştırmalarda hangisinin kullanıldığı açıkça belirtilmelidir.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  ENFLASYON DÜZELTMESİ (migration 022d)
  // ═══════════════════════════════════════════════════════════════
  reel_deger: {
    key: 'reel_deger',
    label: 'Reel Değer',
    aliases: ['Real Terms', 'Enflasyondan Arındırılmış Değer', 'Deflated Value'],
    category: 'inflation',
    formula: 'Nominal Değer × Deflatör',
    unit: 'TL (baz dönem parasıyla)',
    sources: [
      { table: 'v_expense_groups_real', label: 'Reel grup değerleri' },
      { table: 'price_index', label: 'Endeks serileri' },
    ],
    example: 'Enerji 2025-11\'de 129.502 TL, 2026-01\'de 155.499 TL. Nominal artış %20. Kur 40 → 48 olduğu için deflatör 1,2; reel değer 155.402 → 155.499, yani gerçek artış %0,06. Artışın tamamı kurdan.',
    notes: 'NEDEN GEREKLİ: Enflasyonda nominal karşılaştırma yanıltır — her şey artmış görünür. Reel değer, geçmiş tutarları bugünün parasına çevirerek "gerçekten pahalılaştı mı" sorusunu cevaplar. ENDEKS YOKSA: Değer hesaplanmaz, NULL döner. Sistem bilerek tahmin üretmez; eksik endeksi 1 saymak "enflasyon yokmuş" demek olurdu.',
  },

  deflator: {
    key: 'deflator',
    label: 'Deflatör',
    aliases: ['Deflator', 'Düzeltme Katsayısı'],
    category: 'inflation',
    formula: 'Baz Dönem Endeksi / İlgili Dönem Endeksi',
    unit: 'katsayı',
    sources: [
      { table: 'price_index', column: 'value', label: 'Endeks değerleri' },
      { table: 'expense_group_index_map', label: 'Hangi grup hangi seriyle' },
    ],
    example: 'USD/TRY 2025-11\'de 40, baz dönem 2026-01\'de 48 → deflatör = 48/40 = 1,2.',
    notes: 'HER GRUP KENDİ SERİSİYLE: İşçilik asgari ücretle, enerji ve makine kurla, sarf ÜFE ile, gerisi TÜFE ile düzeltilir. Doğalgazı TÜFE ile düzeltmek kur sıçramasını "gerçek maliyet artışı" gibi gösterirdi — bu ayrım sistemin en kritik tasarım kararı. Eşleştirme değiştirilebilir.',
  },

  fiyat_endeksi: {
    key: 'fiyat_endeksi',
    label: 'Fiyat Endeksi',
    category: 'inflation',
    formula: 'Seri × Dönem → değer',
    unit: 'endeks / TL',
    sources: [
      { table: 'price_index', label: 'Girilen endeks değerleri' },
      { table: 'index_series', label: 'Seri kataloğu' },
    ],
    notes: 'SERİLER: TÜFE (genel enflasyon), ÜFE (girdi maliyeti), USD/TRY (dövize bağlı kalemler), Asgari Ücret (işçilik). ELLE GİRİLİR: Sistem TÜİK/TCMB verisini kendiliğinden çekmez. Girilmemiş dönem için reel hesap yapılmaz.',
  },

  baz_donem: {
    key: 'baz_donem',
    label: 'Baz Dönem',
    aliases: ['Base Period'],
    category: 'inflation',
    formula: 'İlgili serinin endeks girilmiş en güncel dönemi',
    unit: 'YYYY-MM',
    sources: [{ table: 'price_index', column: 'donem', label: 'Endeks dönemleri' }],
    notes: 'Reel değerler bu dönemin parasıyla ifade edilir, yani "bugünün parasıyla". Baz dönemin kendi deflatörü 1,0\'dır. Yeni endeks girildikçe baz ileri kayar ve tüm reel değerler otomatik güncellenir.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BEYAN SÜRÜMLERİ (migration 022c)
  // ═══════════════════════════════════════════════════════════════
  beyan_surumu: {
    key: 'beyan_surumu',
    label: 'Beyan Sürümü (Revizyon)',
    category: 'revision',
    formula: 'Aynı atölye + dönem için kaçıncı gönderim',
    unit: 'sürüm no',
    sources: [
      { table: 'expense_declaration_staging', column: 'revision_no', label: 'Sürüm numarası' },
      { table: 'monthly_expense', column: 'revision_no', label: 'Geçerli sürüm' },
    ],
    example: 'Şubat için doğalgaz 45.000 beyan edildi; Nisan\'da fatura revize olunca 78.000 olarak yeniden gönderildi. Sürüm 1 saklanır, sürüm 2 geçerli olur.',
    notes: 'NEDEN SAKLANIYOR: Enflasyonda re-beyan istisna değil kural. Eski beyan silinseydi "gider mi arttı, yoksa beyan mı düzeltildi" sorusu cevaplanamazdı. Ham gönderim hiç değiştirilmeden saklanır; düzeltme yalnız geçerli değeri değiştirir.',
  },

  gecerli_surum: {
    key: 'gecerli_surum',
    label: 'Geçerli Sürüm',
    category: 'revision',
    formula: 'superseded_at IS NULL olan sürüm',
    unit: 'durum',
    sources: [
      { table: 'expense_declaration_staging', column: 'superseded_at', label: 'Geçersiz kılınma zamanı' },
      { table: 'monthly_expense', column: 'current_staging_id', label: 'Geçerli sürüm bağlantısı' },
    ],
    notes: 'AYRIM: Sürüm defteri (staging) tarihtir — hiç değişmez. Gider tablosu bugünkü gerçektir — her revizyonda güncellenir. Hesaplamalar daima geçerli sürümü kullanır; geçmiş sürümler yalnız denetim ve karşılaştırma içindir.',
  },

  ham_beyan: {
    key: 'ham_beyan',
    label: 'Ham Beyan (Staging)',
    aliases: ['Raw Declaration', 'Staging'],
    category: 'revision',
    formula: 'Yüklenen dosya satırının değiştirilmemiş hâli',
    unit: 'JSON',
    sources: [
      { table: 'expense_declaration_staging', column: 'raw', label: 'Ham satır' },
    ],
    example: 'Kullanıcı "5.200.000,50" yazdı; sistem 5.200.001 olarak kaydetti ama ham metin olduğu gibi duruyor.',
    notes: 'İZLENEBİLİRLİK İLKESİ: Yüklenen her satır, yorumlanmadan önce olduğu gibi saklanır. Böylece bir sayı tartışmalı hâle geldiğinde "sistem mi yanlış okudu, kullanıcı mı yanlış girdi" sorusu kesin olarak cevaplanabilir. Ham veri hiçbir zaman güncellenmez veya silinmez.',
  },
}

export function getMetric(key: string): MetricDefinition | null {
  return METRICS[key] ?? null
}

export function listMetrics(category?: MetricDefinition['category']): MetricDefinition[] {
  const all = Object.values(METRICS)
  return category ? all.filter(m => m.category === category) : all
}

export const METRIC_CATEGORIES: Record<MetricDefinition['category'], string> = {
  production: 'Üretim',
  effectiveness: 'Etkililik (Hedef)',
  efficiency: 'Verimlilik (Kaynak)',
  productivity: 'Üretkenlik',
  cost: 'Maliyet',
  quality: 'Kalite',
  oee: 'OEE',
  vsm: 'VSM',
  downtime: 'Duruş',
  workforce: 'İşgücü',
  score: 'Skorlama',
  eder: 'Eder Maliyet',
  delivery: 'Teslimat',
  data_quality: 'Veri Kalitesi',
  expense_group: 'Gider Grupları',
  inflation: 'Enflasyon Düzeltmesi',
  revision: 'Beyan Sürümleri',
}

/**
 * Balon (tooltip) için kısa tanım.
 * notes alanının ilk cümlesi ya da "NEDEN VAR:" gibi bir etiketten
 * sonraki ilk cümle döner — tam metin açılır pencerede gösterilir.
 */
export function getShortDefinition(key: string): string | null {
  const m = getMetric(key)
  if (!m) return null
  if (!m.notes) return `${m.formula}${m.unit ? ` (${m.unit})` : ''}`

  // "ETİKET: açıklama" kalıbındaki etiketi at
  const withoutLabel = m.notes.replace(/^[A-ZÇĞİÖŞÜ\s"']{3,40}:\s*/, '')
  const firstSentence = withoutLabel.split(/(?<=[.!?])\s/)[0]
  return firstSentence.length > 200 ? firstSentence.slice(0, 197) + '…' : firstSentence
}
