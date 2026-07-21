import { describe, it, expect } from 'vitest';
import { GLOSSARY, glossaryTip } from './glossary.js';

describe('glossary', () => {
  it('kilit terimler tanımlı (term + short)', () => {
    for (const k of ['pce','takt','darbogaz','dengeleme','mdq1','co','fpy','uptime','va','nva','leadTime','wip','yamazumi','cevrim','pfd','hatVerimliligi']) {
      expect(GLOSSARY[k], k).toBeTruthy();
      expect(GLOSSARY[k].term && GLOSSARY[k].short).toBeTruthy();
    }
  });
  it('glossaryTip bilinmeyen anahtarda undefined döner', () => {
    expect(glossaryTip('yokboyle')).toBeUndefined();
    expect(glossaryTip('pce').short).toMatch(/./);
  });
});
