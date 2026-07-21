import { describe, it, expect } from 'vitest';
import { CALCULATIONS } from './calculations.js';
import { GLOSSARY } from './glossary.js';
import { GUIDES } from './guides.js';
import {
  smv, taktTimeSec, processTimeSec, inventoryLeadTimeSec, leadTimeMin,
  lineEfficiencyPct, pcePct, requiredOperators, balancingEfficiencyPct,
  md1QueueWaitSec, requiredMachines, setupLossPct, dpmo, sigmaBand, rpn,
} from '../engine/metrics.js';
import { computeCapacity } from '../engine/capacity.js';

const VALID_TABS = new Set([...GUIDES.map(g => g.tab), '']);

describe('CALCULATIONS — yapı', () => {
  it('her girdide zorunlu string alanlar dolu', () => {
    for (const c of CALCULATIONS) {
      for (const f of ['id', 'term', 'formula', 'plain', 'example']) {
        expect(typeof c[f], `${c.id}.${f}`).toBe('string');
        expect(c[f].length, `${c.id}.${f} boş`).toBeGreaterThan(0);
      }
    }
  });

  it("id'ler benzersiz", () => {
    const ids = CALCULATIONS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tab geçerli değer kümesinde', () => {
    for (const c of CALCULATIONS) {
      expect(VALID_TABS.has(c.tab ?? ''), `${c.id}.tab=${c.tab}`).toBe(true);
    }
  });

  it('glossaryKey varsa GLOSSARY[key] mevcut', () => {
    for (const c of CALCULATIONS) {
      if (c.glossaryKey) {
        expect(GLOSSARY[c.glossaryKey], `${c.id}.glossaryKey=${c.glossaryKey}`).toBeTruthy();
      }
    }
  });

  it('her iki grup dahil — en az 20 kalem', () => {
    expect(CALCULATIONS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('CALCULATIONS — örnek/motor tutarlılığı (kılavuz koddan sapmaz)', () => {
  it('metrics.js çekirdek formülleri', () => {
    expect(smv(0.42, 12)).toBeCloseTo(0.47, 2);
    expect(taktTimeSec(420, 350)).toBe(72);
    expect(processTimeSec(45, 2, 1)).toBe(90);
    expect(inventoryLeadTimeSec(15, 72)).toBe(1080);
    expect(leadTimeMin({ processTimesSec: [45, 60], iltsSec: [1080, 720] })).toBeCloseTo(31.75, 2);
    expect(lineEfficiencyPct({ totalSmvMin: 15.4, producedQty: 280, workMinutes: 420, operatorCount: 12 })).toBeCloseTo(85.56, 1);
    expect(pcePct(15.4, 285)).toBeCloseTo(5.4, 1);
    expect(requiredOperators(15.4, 72).count).toBe(13);
    expect(balancingEfficiencyPct({ totalCtSec: 195, stationCount: 3, maxCtSec: 90 })).toBeCloseTo(72.22, 1);
    expect(md1QueueWaitSec(0.8, 45)).toBeCloseTo(90, 4);
    expect(requiredMachines(500, 480, 0.85)).toBe(2);
    expect(setupLossPct(45, 420)).toBeCloseTo(10.71, 1);
    expect(dpmo(5, 1000, 10)).toBe(500);
    expect(sigmaBand(500)).toBe('4σ');
    expect(rpn(8, 6, 5)).toBe(240);
  });

  it('capacity.js kapasite/darboğaz örneği (cyc30 → ~798 ad/v)', () => {
    const data = {
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [{ id: 's', mainOpId: 'a', cycleTime: 30, nextIds: [] }],
      machines: [], operators: [],
      settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
      scenarios: [], meta: {},
    };
    const c = computeCapacity(data);
    expect(c.cap['s']).toBeCloseTo(798.26, 1);
    expect(c.taktTimeSec).toBeCloseTo(67.5, 1);
  });
});
