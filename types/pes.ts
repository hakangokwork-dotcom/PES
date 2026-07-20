// ============================================================
// PES (Production Efficiency System) — TypeScript Tipleri
// ============================================================

// --- Enum / Union Types ---

export type WorkshopType = 'CMT' | 'CM' | 'MT' | 'M'
export type LineType = 'Normal' | 'Küçük'
export type GroupType = 'Alt' | 'Üst' | 'Her ikisi'
export type SamSource = 'Pratik' | 'MTM'
export type DowntimeType = 'Planlı' | 'Plansız' | 'Organizasyonel' | 'Tedarik'
export type ScoreTier = 'Stratejik' | 'Gelişen' | 'İzlemede' | 'Risk' | 'Kritik'
export type TrendDirection = 'Artış' | 'Sabit' | 'Düşüş'
export type PesRole = 'pes_admin' | 'yonetim' | 'analist' | 'operator' | 'izleyici'

// --- PES User Role ---

export interface PesUserRole {
  id: number
  user_id: string
  role: PesRole
  workshop_id: number | null
  created_at: string
}

// --- Workshop ---

export interface Workshop {
  id: number
  code: string
  name: string
  city: string | null
  district: string | null
  type: WorkshopType
  total_staff: number
  sewing_staff: number
  ukp_staff: number
  cutting_staff: number
  management: number
  indirect: number
  line_count: number
  daily_target: number
  net_hours_day: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// --- Production Line ---

export interface ProductionLine {
  id: number
  code: string
  workshop_id: number
  name: string
  line_type: LineType
  operator_count: number
  daily_target: number
  max_cycle_sec: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// --- Master Process ---

export interface MasterProcess {
  id: number
  code: string
  name: string
  group_type: GroupType
  description: string | null
  sort_order: number
}

// --- Product Category ---

export interface ProductCategory {
  id: number
  code: string
  name: string
  group_type: 'Alt' | 'Üst'
  notes: string | null
}

// --- Process Template ---

export interface ProcessTemplate {
  id: number
  code: string
  name: string
  category_id: number
  process_id: number
  sort_order: number
  is_mandatory: boolean
}

// --- Workshop Product ---

export interface WorkshopProduct {
  id: number
  workshop_id: number
  category_id: number
  template_code: string
  line_id: number | null
  start_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

// --- Model Library ---

export interface ModelLibrary {
  id: number
  code: string
  name: string
  category_id: number
  template_code: string
  process_id: number
  sam_minutes: number
  source: SamSource
  valid_from: string
  created_at: string
}

// --- Monthly Expense ---

export interface MonthlyExpense {
  id: number
  workshop_id: number
  year: number
  month: number
  work_days: number
  personnel: number
  sgk: number
  food: number
  electricity: number
  water: number
  gas: number
  transport: number
  vehicle: number
  cargo: number
  machine_maint: number
  thread: number
  other: number
  target_revenue: number
  created_at: string
  updated_at: string
}

// --- Monthly Production ---

export interface MonthlyProduction {
  id: number
  line_id: number
  workshop_id: number
  year: number
  month: number
  model_id: number | null
  model_code: string | null
  group_type: 'Alt' | 'Üst' | null
  total_sam: number | null
  target_qty: number
  actual_qty: number
  work_days: number
  created_at: string
  updated_at: string
}

// --- Line Process Capacity ---

export interface LineProcessCapacity {
  id: number
  line_id: number
  workshop_id: number
  process_id: number
  year: number
  month: number
  model_id: number | null
  bottleneck_op: string | null
  bottleneck_sec: number | null
  actual_daily: number | null
  created_at: string
}

// --- Quality Record ---

export interface QualityRecord {
  id: number
  workshop_id: number
  line_id: number | null
  year: number
  month: number
  inspected_qty: number
  first_pass_qty: number
  rejected_qty: number
  rework_qty: number
  top_defect_cat: string | null
  customer_return: number
  created_at: string
  updated_at: string
}

// --- Downtime Record ---

export interface DowntimeRecord {
  id: number
  line_id: number
  occurred_at: string
  duration_min: number
  downtime_type: DowntimeType
  reason: string | null
  affected_ops: number
  created_at: string
}

// --- Changeover Record ---

export interface ChangeoverRecord {
  id: number
  line_id: number
  occurred_date: string
  from_model_id: number | null
  to_model_id: number | null
  total_min: number
  machine_adj_min: number
  balancing_min: number
  first_batch_min: number
  warmup_min: number
  created_at: string
}

// --- Workforce Turnover ---

export interface WorkforceTurnover {
  id: number
  workshop_id: number
  year: number
  month: number
  total_staff: number
  left_count: number
  joined_count: number
  in_warmup: number
  avg_tenure_mon: number | null
  created_at: string
}

// --- Supplier Score ---

export interface SupplierScore {
  id: number
  workshop_id: number
  year: number
  month: number
  efficiency_sc: number | null
  quality_sc: number | null
  delivery_sc: number | null
  cost_sc: number | null
  compliance_sc: number | null
  composite_sc: number | null
  tier: ScoreTier | null
  prev_sc: number | null
  trend: TrendDirection | null
  created_at: string
}

// --- Audit Log ---

export interface PesAuditLog {
  id: number
  user_id: string | null
  action: string
  table_name: string
  record_id: number | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

// --- View: Monthly Summary ---

export interface PesMonthlySummary {
  workshop_id: number
  workshop_code: string
  workshop_name: string
  workshop_type: WorkshopType
  year: number
  month: number
  total_actual: number
  total_target: number
  efficiency_pct: number | null
  total_expense: number | null
  target_revenue: number | null
}

// --- Hesaplanan Metrikler ---

export interface CalculatedMetrics {
  total_capacity_min: number
  cost_per_minute: number
  cost_per_piece: number
  efficiency_pct: number
  target_production: number
  net_margin: number
  margin_pct: number
}

// --- Skor Bileşenleri ---

export interface ScoreComponents {
  efficiency: number
  quality: number
  delivery: number
  cost: number
  compliance: number
}

// --- VSM / WIP ---

export interface WipRecord {
  id: number
  workshop_id: number
  line_id: number | null
  model_code: string | null
  operation_name: string | null
  recorded_date: string
  wip_qty: number
  notes: string | null
  created_at: string
}

export interface OperationMeasurement {
  id: number
  workshop_id: number
  line_id: number | null
  model_code: string | null
  operation_name: string
  cycle_time_sn: number
  operator_count: number
  measured_date: string
  observer_name: string | null
  notes: string | null
  created_at: string
}

// --- Eder Maliyet ---

export interface EderModel {
  id: number
  workshop_id: number | null
  model_adi: string
  plm_id: string | null
  siparis_adedi: number
  bolge: number
  donem: string
  gunluk_calisma_sn: number
  hedef_sure_sn: number
  created_at: string
  updated_at: string
}

export interface EderOperasyonGrubu {
  id: number
  model_id: number
  grup_adi: string
  sira_no: number
  created_at: string
  alt_operasyonlar?: EderAltOperasyon[]
}

export interface EderAltOperasyon {
  id: number
  grup_id: number
  operasyon_adi: string
  sure_sn: number
  kisi_sayisi: number
  sira_no: number
  makine_tipi: string | null
  notlar: string | null
  created_at: string
}

export interface DkMaliyet {
  id: number
  donem: string
  bolge: number
  dk_maliyet_tl: number
  created_at: string
}

export interface EderAtolyeTeklif {
  id: number
  model_id: number
  atolye_adi: string
  teklif_fiyat_tl: number
  notlar: string | null
  created_at: string
}

export interface EderModelOzet {
  model_id: number
  workshop_id: number | null
  model_adi: string
  plm_id: string | null
  siparis_adedi: number
  bolge: number
  donem: string
  gunluk_calisma_sn: number
  hedef_sure_sn: number
  toplam_sure_sn: number
  toplam_sure_dk: number
  toplam_kisi: number
  bottleneck_sn: number
  dk_maliyet_tl: number
  eder_maliyet_tl: number
  gunluk_kapasite_bottleneck: number
  gunluk_kapasite_hedef: number
  bant_verimlilik_pct: number
}

// --- Dashboard KPI ---

export interface DashboardKPI {
  total_workshops: number
  active_workshops: number
  avg_efficiency: number | null
  avg_composite_score: number | null
  at_risk_count: number
  total_production: number
}
