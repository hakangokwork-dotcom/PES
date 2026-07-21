/* VSM hesaplama motoru — tekstil_vsm_yazilim_dokumani.md §5 formülleri.
   UI'sız saf fonksiyonlar; tüm örnek değerler dokümandaki işlenmiş
   örneklerle golden-master test altındadır (metrics.test.js).
   Birim kuralı: parametre adında birim yazar (Min=dakika, Sec=saniye, Pct=yüzde). */

/* §5.1.5 — SMV = temel süre × (1 + allowance%) */
export function smv(baseMinutes, allowancePct = 12) {
  return baseMinutes * (1 + allowancePct / 100);
}

/* §5.1.1 — Kullanılabilir süre (dk) */
export function availableMinutes({ shiftMinutes, breakMinutes = 0, downtimeMinutes = 0, shiftCount = 1 }) {
  return (shiftMinutes - breakMinutes - downtimeMinutes) * shiftCount;
}

/* §5.1.1 — Takt Time (sn/adet). Talep yoksa Infinity (darboğaz kıyasları güvenli kalır). */
export function taktTimeSec(availableMin, demandQty) {
  if (!demandQty || demandQty <= 0) return Infinity;
  return (availableMin * 60) / demandQty;
}

/* §5.1.3 — Process Time = CT × (operatör / makine) */
export function processTimeSec(cycleTimeSec, operatorCount = 1, machineCount = 1) {
  const ops = operatorCount > 0 ? operatorCount : 1;
  return cycleTimeSec * (ops / (machineCount || 1));
}

/* §5.1.4 — Little's Law: ILT = WIP × Takt (sn) */
export function inventoryLeadTimeSec(wipQty, taktSec) {
  return wipQty * taktSec;
}

/* §5.1.4 — Lead Time (dk) = ΣPT + ΣILT */
export function leadTimeMin({ processTimesSec = [], iltsSec = [] }) {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  return (sum(processTimesSec) + sum(iltsSec)) / 60;
}

/* §5.2.1 — Hat Verimliliği % */
export function lineEfficiencyPct({ totalSmvMin, producedQty, workMinutes, operatorCount }) {
  const denom = workMinutes * operatorCount;
  if (!denom) return 0;
  return (totalSmvMin * producedQty) / denom * 100;
}

/* §5.2.1 benchmark bantları */
export function lineEfficiencyBand(pct) {
  if (pct < 60) return 'kritik';
  if (pct < 70) return 'zayıf';
  if (pct < 80) return 'ortalama';
  if (pct <= 88) return 'iyi';
  return 'mükemmel';
}

/* §5.2.2 — OEE = A × P × Q (tam matematik; doc örneği ara yuvarlama yapar) */
export function oee({ plannedMinutes, unplannedDownMinutes = 0, actualQty, idealCtMin, defectQty = 0 }) {
  const runMinutes = plannedMinutes - unplannedDownMinutes;
  const a = plannedMinutes > 0 ? runMinutes / plannedMinutes : 0;
  const p = runMinutes > 0 ? (actualQty * idealCtMin) / runMinutes : 0;
  const q = actualQty > 0 ? (actualQty - defectQty) / actualQty : 0;
  return {
    availabilityPct: a * 100,
    performancePct: p * 100,
    qualityPct: q * 100,
    oeePct: a * p * q * 100,
  };
}

/* §5.2.2 OEE dünya standartları */
export function oeeBand(pct) {
  if (pct < 65) return 'kabul edilemez';
  if (pct < 75) return 'kabul edilebilir';
  if (pct <= 85) return 'iyi';
  return 'dünya standartları';
}

/* §5.2.3 — PCE = VA / LT × 100 */
export function pcePct(vaMin, leadTimeMinVal) {
  if (!leadTimeMinVal) return 0;
  return (vaMin / leadTimeMinVal) * 100;
}

/* §5.2.3 benchmarkları (doc: <%5 kritik, >%15 iyi, >%25 mükemmel) */
export function pceBand(pct) {
  if (pct < 5) return 'kritik';
  if (pct < 15) return 'zayıf';
  if (pct <= 25) return 'iyi';
  return 'mükemmel';
}

/* §5.3.1 — Gerekli operatör = Toplam SMV / Takt */
export function requiredOperators(totalSmvMin, taktSec) {
  if (!taktSec || taktSec === Infinity) return { raw: 0, count: 0 };
  const raw = (totalSmvMin * 60) / taktSec;
  return { raw, count: Math.ceil(raw) };
}

/* §5.3.2 — Dengeleme Verimi = ΣCT / (N × MaxCT) × 100 */
export function balancingEfficiencyPct({ totalCtSec, stationCount, maxCtSec }) {
  const denom = stationCount * maxCtSec;
  if (!denom) return 0;
  return (totalCtSec / denom) * 100;
}

export function balanceLossPct(args) {
  const be = balancingEfficiencyPct(args);
  return be === 0 ? 0 : 100 - be;
}

/* §5.3.3 — Yamazumi çubuk durumu. doc: CT > TT darboğaz; %80-100 risk. */
export function yamazumiStatus(ctSec, taktSec) {
  if (!taktSec || taktSec === Infinity) return 'normal';
  if (ctSec > taktSec) return 'darbogaz';
  if (ctSec >= taktSec * 0.8) return 'risk';
  return 'normal';
}

/* §5.5.1 — Ortak istasyon kapasite paylaşımı */
export function sharedStationUtilization({ demands = [], machineCount = 1, availableMin, bottleneckThresholdPct = 85 }) {
  const totalUseSec = demands.reduce((a, d) => a + d.qty * d.ctSec, 0);
  const totalUseMin = totalUseSec / 60;
  const capacityMin = availableMin * (machineCount || 1);
  const utilizationPct = capacityMin > 0 ? (totalUseMin / capacityMin) * 100 : 0;
  return {
    totalUseMin,
    utilizationPct,
    isBottleneck: utilizationPct > bottleneckThresholdPct,
  };
}

/* §5.5.1 — Gereken makine = ⌈kullanım / (kapasite × 0,85)⌉ */
export function requiredMachines(totalUseMin, availablePerMachineMin, targetUtilization = 0.85) {
  if (!availablePerMachineMin) return 0;
  return Math.ceil(totalUseMin / (availablePerMachineMin * targetUtilization));
}

/* §5.5.2 — M/D/1 ortalama kuyruk beklemesi = (ρ × s) / (2 × (1 − ρ)) */
export function md1QueueWaitSec(utilization, serviceTimeSec) {
  if (utilization >= 1) return Infinity;
  return (utilization * serviceTimeSec) / (2 * (1 - utilization));
}

/* §5.5.3 — Setup kaybı % */
export function setupLossPct(totalSetupMin, totalWorkMin) {
  if (!totalWorkMin) return 0;
  return (totalSetupMin / totalWorkMin) * 100;
}

/* §5.6.1 — DPMO */
export function dpmo(defectCount, unitCount, opportunitiesPerUnit) {
  const denom = unitCount * opportunitiesPerUnit;
  if (!denom) return 0;
  return (defectCount / denom) * 1_000_000;
}

/* §5.6.1 — Sigma bandı (doc dönüşüm tablosu; eşik altı = o seviye) */
export function sigmaBand(dpmoValue) {
  if (dpmoValue <= 3.4) return '6σ';
  if (dpmoValue <= 233) return '5σ';
  if (dpmoValue <= 6210) return '4σ';
  if (dpmoValue <= 66807) return '3σ';
  return '<3σ';
}

/* §5.6.2 — RPN = Şiddet × Oluşma × Tespit (FMEA) */
export function rpn(severity, occurrence, detection) {
  return severity * occurrence * detection;
}

export function rpnBand(rpnValue) {
  if (rpnValue > 200) return 'acil aksiyon';
  if (rpnValue >= 100) return 'önleyici aksiyon';
  return 'izle';
}
