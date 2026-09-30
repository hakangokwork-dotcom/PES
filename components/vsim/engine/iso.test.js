import { describe, it, expect } from 'vitest';
import { project, unproject, rotPoint, rotRect, rotatedFloor, boxFaces, itemDrawables, sceneBounds } from './iso.js';
import { createItem } from './layout.js';

const floor = { w: 20, h: 10 };

describe('izdüşüm ve döndürme', () => {
  it('orijin sıfıra, yükseklik yukarı düşer', () => {
    expect(project(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(project(0, 0, 1).y).toBe(-1);
    expect(project(1, 1, 0).x).toBeCloseTo(0);
  });
  it('dört döndürme sonrası nokta yerine döner', () => {
    let p = { x: 3, y: 2 }, f = floor;
    for (let k = 0; k < 4; k++) { p = rotPoint(p, f, 1); f = rotatedFloor(f, 1); }
    expect(p).toEqual({ x: 3, y: 2 });
  });
  it('dikdörtgen döndürülünce boyutları yer değiştirir ve zeminde kalır', () => {
    const r = rotRect({ x: 1, y: 2, w: 4, h: 1 }, floor, 1);
    expect(r.w).toBe(1);
    expect(r.h).toBe(4);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(floor.h);
  });
});

describe('çizilebilirler', () => {
  it('kutunun üç görünür yüzü dörder köşe', () => {
    const f = boxFaces({ x: 0, y: 0, w: 1, h: 1 }, 0, 1);
    expect(f.top).toHaveLength(4);
    expect(f.south).toHaveLength(4);
    expect(f.east).toHaveLength(4);
  });
  it('bağlı makine gövde + kafa + operatör üretir; yedek operatörsüz', () => {
    const m = itemDrawables(createItem('ov', 2, 2, { subOpId: 's' }), floor, 0);
    expect(m.parts.filter(p => p.type === 'box').length).toBeGreaterThanOrEqual(2);
    expect(m.parts.some(p => p.type === 'person')).toBe(true);
    const spare = itemDrawables(createItem('duz', 2, 2, { isSpare: true }), floor, 0);
    expect(spare.parts.some(p => p.type === 'person')).toBe(false);
  });
  it('operatör gövdenin operatör tarafında durur', () => {
    const m = itemDrawables(createItem('duz', 2, 2, { subOpId: 's' }), floor, 0);   // rot 0 → operatör altta (+y)
    const person = m.parts.find(p => p.type === 'person');
    expect(person.p.y).toBeGreaterThan(m.body.y + m.body.h);
  });
  it('ara stok doluluğu kutu olarak eklenir, koridor en arkada', () => {
    const empty = itemDrawables(createItem('raf', 1, 1), floor, 0);
    const full = itemDrawables(createItem('raf', 1, 1), floor, 0, { fill: 0.5 });
    expect(full.parts.length).toBe(empty.parts.length + 1);
    const aisle = itemDrawables(createItem('koridor', 1, 1), floor, 0);
    expect(aisle.depth).toBeLessThan(empty.depth);
  });
  it('sahne sınırları zemin köşelerini kapsar', () => {
    const b = sceneBounds(floor, 0);
    const c = project(20, 10, 0);
    expect(c.x).toBeLessThanOrEqual(b.x + b.w);
    expect(c.y).toBeLessThanOrEqual(b.y + b.h);
  });
});

describe('ters izdüşüm', () => {
  it('her döndürmede zemindeki nokta geri bulunur', () => {
    for (let k = 0; k < 4; k++) {
      const w = { x: 7.25, y: 3.5 };
      const r = rotPoint(w, floor, k);
      const s = project(r.x, r.y, 0);
      const back = unproject(s.x, s.y, floor, k);
      expect(back.x).toBeCloseTo(w.x);
      expect(back.y).toBeCloseTo(w.y);
    }
  });
  it('el işi masası makinesiz, oturan operatörlü; serbest çalışan figür', () => {
    const m = itemDrawables(createItem('masa', 1, 1, { subOpId: 's' }), floor, 0);
    expect(m.parts.find(p => p.type === 'person').standing).toBe(false);
    const w = itemDrawables(createItem('calisan', 1, 1), floor, 0);
    expect(w.parts.filter(p => p.type === 'person')).toHaveLength(1);
  });
});
