import type { MonthlyExpense } from '@/types/pes'

// Toplam gider hesabı
export function calcTotalExpense(e: MonthlyExpense): number {
  return e.personnel + e.sgk + e.food + e.electricity + e.water + e.gas
    + e.transport + e.vehicle + e.cargo + e.machine_maint + e.thread + e.other
}

// Toplam kapasite (dk/ay)
export function calcTotalCapacity(sewingStaff: number, workDays: number, netHours: number = 9): number {
  return sewingStaff * workDays * netHours * 60
}

// Dakika başı maliyet (TL/dk)
export function calcCostPerMinute(totalExpense: number, sewingStaff: number, workDays: number, netHours: number = 9): number {
  const capacity = calcTotalCapacity(sewingStaff, workDays, netHours)
  if (capacity === 0) return 0
  return totalExpense / capacity
}

// Verimlilik (%)
export function calcEfficiency(actual: number, target: number): number {
  if (target === 0) return 0
  return (actual / target) * 100
}

// Hedef üretim (adet/ay)
export function calcTargetProduction(capacityMin: number, totalSam: number): number {
  if (totalSam === 0) return 0
  return Math.floor(capacityMin / totalSam)
}

// Adet başı maliyet (TL)
export function calcCostPerPiece(totalSam: number, costPerMin: number, efficiencyPct: number): number {
  if (efficiencyPct === 0) return 0
  return (totalSam * costPerMin) / (efficiencyPct / 100)
}

// Net marj
export function calcNetMargin(targetRevenue: number, totalExpense: number): number {
  return targetRevenue - totalExpense
}

// Marj oranı (%)
export function calcMarginPct(targetRevenue: number, totalExpense: number): number {
  if (targetRevenue === 0) return 0
  return ((targetRevenue - totalExpense) / targetRevenue) * 100
}

// Darboğaz teorik kapasitesi (adet/gün)
export function calcBottleneckCapacity(bottleneckSec: number, netHours: number = 9): number {
  if (bottleneckSec === 0) return 0
  return Math.floor((netHours * 3600) / bottleneckSec)
}

// OEE hesabı
export function calcOEE(availability: number, performance: number, quality: number): number {
  return (availability / 100) * (performance / 100) * (quality / 100) * 100
}

// ─── VSM Hesaplamaları ───

// Takt Time (sn/adet) = Net Kullanılabilir Süre / Müşteri Talebi
export function calcTaktTime(netAvailableSec: number, demandQty: number): number {
  if (demandQty === 0) return 0
  return netAvailableSec / demandQty
}

// Net Kullanılabilir Süre (sn) = (Vardiya dk - Mola dk) × 60
export function calcNetAvailableSec(shiftMin: number, breakMin: number, shifts: number = 1): number {
  return (shiftMin - breakMin) * 60 * shifts
}

// PCE — Process Cycle Efficiency (%) = VA Time / Lead Time × 100
export function calcPCE(valueAddedSec: number, leadTimeSec: number): number {
  if (leadTimeSec === 0) return 0
  return (valueAddedSec / leadTimeSec) * 100
}

// Hat Dengeleme Verimliliği (%) = Toplam CT / (Operatör × Max CT) × 100
export function calcBalancingEfficiency(totalCycleSec: number, operatorCount: number, maxCycleSec: number): number {
  if (operatorCount === 0 || maxCycleSec === 0) return 0
  return (totalCycleSec / (operatorCount * maxCycleSec)) * 100
}

// Dengeleme Kaybı (%) = 100 - Dengeleme Verimliliği
export function calcBalancingLoss(balancingEfficiency: number): number {
  return 100 - balancingEfficiency
}

// Gerekli Operatör Sayısı = Toplam SMV (sn) / Takt Time (sn)
export function calcRequiredOperators(totalSmvSec: number, taktTimeSec: number): number {
  if (taktTimeSec === 0) return 0
  return Math.ceil(totalSmvSec / taktTimeSec)
}

// WIP Lead Time (sn) = WIP Miktarı × Takt Time (Little's Law)
export function calcWipLeadTime(wipQty: number, taktTimeSec: number): number {
  return wipQty * taktTimeSec
}

// Lead Time = Toplam İşlem Süresi + Toplam WIP Bekleme Süresi
export function calcLeadTime(totalProcessSec: number, totalWipWaitSec: number): number {
  return totalProcessSec + totalWipWaitSec
}

// Hat Verimliliği (%) = (Toplam SMV × Üretim) / (Çalışma Dk × Operatör) × 100
export function calcLineEfficiency(totalSmvMin: number, actualQty: number, workingMin: number, operatorCount: number): number {
  const denom = workingMin * operatorCount
  if (denom === 0) return 0
  return (totalSmvMin * actualQty) / denom * 100
}

// Yamazumi operasyon durumu
export function calcYamazumiStatus(cycleTimeSec: number, taktTimeSec: number): 'danger' | 'warning' | 'normal' {
  if (taktTimeSec === 0) return 'normal'
  if (cycleTimeSec > taktTimeSec) return 'danger'
  if (cycleTimeSec >= taktTimeSec * 0.8) return 'warning'
  return 'normal'
}
