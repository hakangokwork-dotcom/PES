import { describe, it, expect } from 'vitest';
import { levelLayout, LANE_X_GAP, LANE_Y_GAP, LAYOUT_X0, LAYOUT_Y0 } from './flowLayout.js';

const N = (id, nextIds) => ({ id, nextIds });

describe('levelLayout', () => {
  it('doğrusal zinciri tek şeride dizer — x artar, y sabit', () => {
    const pos = levelLayout([N('a', ['b']), N('b', ['c']), N('c', [])]);
    expect(pos.a).toEqual({ x: LAYOUT_X0, y: LAYOUT_Y0 });
    expect(pos.b).toEqual({ x: LAYOUT_X0 + LANE_X_GAP, y: LAYOUT_Y0 });
    expect(pos.c).toEqual({ x: LAYOUT_X0 + 2 * LANE_X_GAP, y: LAYOUT_Y0 });
  });

  it('paralel kanalları aynı kolonda dikey yığar', () => {
    const pos = levelLayout([N('a', ['c']), N('b', ['c']), N('c', [])]);
    expect(pos.a.x).toBe(LAYOUT_X0);
    expect(pos.b.x).toBe(LAYOUT_X0);
    expect(pos.b.y).toBe(pos.a.y + LANE_Y_GAP);
    expect(pos.c.x).toBe(LAYOUT_X0 + LANE_X_GAP);
  });

  it('döngü üyeleri son kolona gider, ASLA negatif y almaz (eski -80 hatası)', () => {
    const pos = levelLayout([N('s', ['a']), N('a', ['b']), N('b', ['a'])]);
    // s tek kaynak → level 0. a, b döngüde: BFS'e giremezler → max+1 kolonuna.
    expect(pos.s).toEqual({ x: LAYOUT_X0, y: LAYOUT_Y0 });
    expect(pos.a.x).toBe(pos.b.x);
    expect(pos.a.y).toBeGreaterThanOrEqual(LAYOUT_Y0);
    expect(pos.b.y).toBeGreaterThanOrEqual(LAYOUT_Y0);
    expect(pos.a.y).not.toBe(pos.b.y);          // üst üste yığılmaz
  });

  it('grafiğin tamamı döngüyse hepsi kolon 0, ayrık satırlarda', () => {
    const pos = levelLayout([N('a', ['b']), N('b', ['a'])]);
    expect(pos.a.x).toBe(LAYOUT_X0);
    expect(pos.b.x).toBe(LAYOUT_X0);
    expect(new Set([pos.a.y, pos.b.y]).size).toBe(2);
    expect(Math.min(pos.a.y, pos.b.y)).toBe(LAYOUT_Y0);
  });

  it('boş liste boş nesne döner', () => {
    expect(levelLayout([])).toEqual({});
  });

  it('döngüden BESLENEN düğüm de son kolona düşer, geçerli y alır', () => {
    const pos = levelLayout([N('s', ['a']), N('a', ['b']), N('b', ['a', 'c']), N('c', [])]);
    expect(pos.c.y).toBeGreaterThanOrEqual(LAYOUT_Y0);
    expect(pos.c.x).toBeGreaterThan(pos.s.x);
  });
});
