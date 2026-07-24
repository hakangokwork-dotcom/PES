import { describe, it, expect } from 'vitest';
import {
  smv, availableMinutes, taktTimeSec, processTimeSec, inventoryLeadTimeSec,
  leadTimeMin, lineEfficiencyPct, lineEfficiencyBand,
  oee, oeeBand, pcePct, pceBand, requiredOperators,
  balancingEfficiencyPct, balanceLossPct, yamazumiStatus,
  sharedStationUtilization, requiredMachines, md1QueueWaitSec,
  setupLossPct, dpmo, sigmaBand, rpn, rpnBand,
} from './metrics.js';

/* Tüm beklenen değerler tekstil_vsm_yazilim_dokumani.md §5'teki
   işlenmiş örneklerden alınmıştır (golden master). */

describe('SMV (§5.1.5)', () => {
  it('temel süre × (1 + allowance)', () => {
    expect(smv(0.42)).toBeCloseTo(0.4704, 4);          // %12 varsayılan
    expect(smv(0.42, 12)).toBeCloseTo(0.47, 2);        // doc örneği
    expect(smv(1, 0)).toBe(1);
  });
});

describe('Takt Time (§5.1.1)', () => {
  it('kullanılabilir süre: vardiya − molalar, × vardiya sayısı', () => {
    expect(availableMinutes({ shiftMinutes: 480, breakMinutes: 60 })).toBe(420);
    expect(availableMinutes({ shiftMinutes: 480, breakMinutes: 60, shiftCount: 2 })).toBe(840);
    expect(availableMinutes({ shiftMinutes: 480, breakMinutes: 30, downtimeMinutes: 30 })).toBe(420);
  });

  it('doc örneği: 25.200 sn / 350 adet = 72 sn', () => {
    expect(taktTimeSec(420, 350)).toBeCloseTo(72, 6);
  });

  it('talep 0/negatifse Infinity döner (bölme hatası yok)', () => {
    expect(taktTimeSec(420, 0)).toBe(Infinity);
  });
});

describe('Process Time (§5.1.3)', () => {
  it('CT × (operatör / makine); 1/1 ise PT = CT', () => {
    expect(processTimeSec(45)).toBe(45);
    expect(processTimeSec(45, 2, 1)).toBe(90);
    expect(processTimeSec(45, 1, 2)).toBe(22.5);
  });

  it('operatör sayısı 0/negatifse 1 varsayılır (makine guardı ile tutarlı)', () => {
    expect(processTimeSec(45, 0, 1)).toBe(45);
  });
});

describe('Lead Time (§5.1.4)', () => {
  it('ILT = WIP × Takt (Little\'s Law): 15 × 72 = 1.080 sn', () => {
    expect(inventoryLeadTimeSec(15, 72)).toBe(1080);
  });

  it('LT = ΣPT + ΣILT (dakika)', () => {
    // PT'ler: 45+60 sn = 1,75 dk; ILT'ler: 1080+720 sn = 30 dk → 31,75 dk
    expect(leadTimeMin({ processTimesSec: [45, 60], iltsSec: [1080, 720] })).toBeCloseTo(31.75, 4);
  });
});

describe('Hat Verimliliği (§5.2.1)', () => {
  it('doc örneği: (15,4 × 280) / (420 × 12) × 100 = %85,56', () => {
    const r = lineEfficiencyPct({ totalSmvMin: 15.4, producedQty: 280, workMinutes: 420, operatorCount: 12 });
    expect(r).toBeCloseTo(85.56, 1);
  });

  it('bant sınıflandırması', () => {
    expect(lineEfficiencyBand(55)).toBe('kritik');
    expect(lineEfficiencyBand(65)).toBe('zayıf');
    expect(lineEfficiencyBand(75)).toBe('ortalama');
    expect(lineEfficiencyBand(85.56)).toBe('iyi');
    expect(lineEfficiencyBand(90)).toBe('mükemmel');
  });

  it('sıfır paydada 0 döner', () => {
    expect(lineEfficiencyPct({ totalSmvMin: 15, producedQty: 10, workMinutes: 0, operatorCount: 0 })).toBe(0);
  });
});

describe('OEE (§5.2.2)', () => {
  it('doc örneği (TAM matematik): A=%94,05 P=%99,24 Q=%95 → OEE %88,67', () => {
    const r = oee({ plannedMinutes: 420, unplannedDownMinutes: 25, actualQty: 280, idealCtMin: 1.4, defectQty: 14 });
    expect(r.availabilityPct).toBeCloseTo(94.05, 1);
    expect(r.performancePct).toBeCloseTo(99.24, 1);
    expect(r.qualityPct).toBeCloseTo(95.0, 1);
    expect(r.oeePct).toBeCloseTo(88.67, 1);   // doc %88,5 der — ara yuvarlama artefaktı
  });

  it('bant sınıflandırması', () => {
    expect(oeeBand(60)).toBe('kabul edilemez');
    expect(oeeBand(70)).toBe('kabul edilebilir');
    expect(oeeBand(80)).toBe('iyi');
    expect(oeeBand(88.7)).toBe('dünya standartları');
  });
});

describe('PCE (§5.2.3)', () => {
  it('doc örneği: 15,4 / 285 × 100 = %5,4', () => {
    expect(pcePct(15.4, 285)).toBeCloseTo(5.4, 1);
  });

  it('bant sınıflandırması (doc benchmarkları)', () => {
    expect(pceBand(3)).toBe('kritik');       // < %5
    expect(pceBand(10)).toBe('ortalama');    // %5-15 (doküman §6.3)
    expect(pceBand(20)).toBe('iyi');         // %15-25
    expect(pceBand(30)).toBe('mükemmel');    // > %25
  });

  it('pceBand %5-15 ortalama (doküman §6.3)', () => {
    expect(pceBand(10)).toBe('ortalama');
  });
});

describe('Gerekli Operatör (§5.3.1)', () => {
  it('doc örneği: 924 sn / 72 sn = 12,83 → 13 operatör', () => {
    const r = requiredOperators(15.4, 72);   // 15,4 dk = 924 sn
    expect(r.raw).toBeCloseTo(12.83, 2);
    expect(r.count).toBe(13);
  });
});

describe('Hat Dengeleme (§5.3.2)', () => {
  it('doc örneği: 896 / (12 × 82) × 100 = %91,06', () => {
    expect(balancingEfficiencyPct({ totalCtSec: 896, stationCount: 12, maxCtSec: 82 })).toBeCloseTo(91.06, 1);
    expect(balanceLossPct({ totalCtSec: 896, stationCount: 12, maxCtSec: 82 })).toBeCloseTo(8.94, 1);
  });

  it('sıfır paydada 0', () => {
    expect(balancingEfficiencyPct({ totalCtSec: 0, stationCount: 0, maxCtSec: 0 })).toBe(0);
  });
});

describe('Yamazumi durumu (§5.3.3)', () => {
  it('CT > Takt → darboğaz; %80-100 → risk; altı → normal', () => {
    expect(yamazumiStatus(82, 72)).toBe('darbogaz');
    expect(yamazumiStatus(60, 72)).toBe('risk');       // 60/72 = %83
    expect(yamazumiStatus(72, 72)).toBe('risk');       // eşit → risk (doc: > darboğaz)
    expect(yamazumiStatus(50, 72)).toBe('normal');     // %69
  });
});

describe('Ortak istasyon (§5.5.1)', () => {
  it('doc örneği: (280×12 + 220×15) sn / 420 dk = %26,4', () => {
    const r = sharedStationUtilization({
      demands: [{ qty: 280, ctSec: 12 }, { qty: 220, ctSec: 15 }],
      machineCount: 1,
      availableMin: 420,
    });
    expect(r.totalUseMin).toBeCloseTo(111, 4);
    expect(r.utilizationPct).toBeCloseTo(26.43, 1);
    expect(r.isBottleneck).toBe(false);               // eşik %85
  });

  it('%85 üstü darboğaz işaretlenir ve gereken makine hesaplanır', () => {
    const r = sharedStationUtilization({
      demands: [{ qty: 2000, ctSec: 12 }],            // 400 dk kullanım
      machineCount: 1, availableMin: 420,
    });
    expect(r.utilizationPct).toBeCloseTo(95.24, 1);
    expect(r.isBottleneck).toBe(true);
    expect(requiredMachines(400, 420)).toBe(2);        // ⌈400 / (420×0,85)⌉ = ⌈1,12⌉
  });
});

describe('M/D/1 kuyruk beklemesi (§5.5.2)', () => {
  it('doc örneği: (0,8 × 12) / (2 × 0,2) = 24 sn', () => {
    expect(md1QueueWaitSec(0.8, 12)).toBeCloseTo(24, 6);
  });

  it('ρ ≥ 1 → Infinity (sistem taşar)', () => {
    expect(md1QueueWaitSec(1, 12)).toBe(Infinity);
    expect(md1QueueWaitSec(1.2, 12)).toBe(Infinity);
  });
});

describe('Setup kaybı (§5.5.3)', () => {
  it('doc örneği: 45 / 420 × 100 = %10,7', () => {
    expect(setupLossPct(45, 420)).toBeCloseTo(10.7, 1);
  });
});

describe('RPN — FMEA (§5.6.2)', () => {
  it('doc örneği: 7 × 4 × 3 = 84, bant: izle', () => {
    expect(rpn(7, 4, 3)).toBe(84);
    expect(rpnBand(84)).toBe('izle');           // < 100
    expect(rpnBand(150)).toBe('önleyici aksiyon');
    expect(rpnBand(250)).toBe('acil aksiyon');  // > 200
  });
});

describe('DPMO & Sigma (§5.6.1)', () => {
  it('DPMO = hata / (adet × fırsat) × 1M', () => {
    expect(dpmo(14, 280, 25)).toBe(2000);
  });

  it('sigma bantları (doc tablosu)', () => {
    expect(sigmaBand(3)).toBe('6σ');
    expect(sigmaBand(200)).toBe('5σ');
    expect(sigmaBand(6000)).toBe('4σ');
    expect(sigmaBand(50000)).toBe('3σ');
    expect(sigmaBand(100000)).toBe('<3σ');
  });
});
