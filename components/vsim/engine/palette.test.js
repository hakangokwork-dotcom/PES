import { describe, it, expect } from 'vitest';
import { NODE_PALETTE, STATUS_HEXES } from './palette.js';

describe('kimlik paleti durum renkleriyle çakışmaz (D1)', () => {
  it('hiçbir palet rengi warn/danger/ok ile eşleşmez', () => {
    const status = Object.values(STATUS_HEXES).map(h => h.toLowerCase());
    for (const c of NODE_PALETTE) expect(status).not.toContain(c.toLowerCase());
  });
  it('8 benzersiz renk', () => {
    expect(NODE_PALETTE).toHaveLength(8);
    expect(new Set(NODE_PALETTE.map(c => c.toLowerCase())).size).toBe(8);
  });
});
