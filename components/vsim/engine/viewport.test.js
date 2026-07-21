import { describe, it, expect } from 'vitest';
import { screenToCanvas, canvasToScreen, zoomAt, clampZoom, pan } from './viewport.js';

describe('screenToCanvas / canvasToScreen roundtrip', () => {
  it('pan+zoom sonrası ekran↔canvas ters dönüşüm tutarlı', () => {
    const view = { x: 120, y: -40, zoom: 1.5 };
    const c = screenToCanvas(view, 300, 200);
    const s = canvasToScreen(view, c.x, c.y);
    expect(s.x).toBeCloseTo(300); expect(s.y).toBeCloseTo(200);
  });
  it('zoom=1, pan=0 → birebir', () => {
    expect(screenToCanvas({ x: 0, y: 0, zoom: 1 }, 50, 60)).toEqual({ x: 50, y: 60 });
  });
});

describe('zoomAt — imleç altındaki nokta sabit kalır', () => {
  it('imleç konumundaki canvas noktası zoom sonrası aynı ekran konumunda', () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const sx = 400, sy = 300;
    const before = screenToCanvas(view, sx, sy);
    const next = zoomAt(view, sx, sy, 1.2, 0.25, 3);
    const after = screenToCanvas(next, sx, sy);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBeCloseTo(1.2);
  });
  it('zoom min/max clamp', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 3 }, 0, 0, 2, 0.25, 3).zoom).toBe(3);
    expect(zoomAt({ x: 0, y: 0, zoom: 0.25 }, 0, 0, 0.5, 0.25, 3).zoom).toBe(0.25);
  });
});

describe('pan / clampZoom', () => {
  it('pan ekran ofsetini ekler', () => {
    expect(pan({ x: 10, y: 20, zoom: 2 }, 5, -5)).toEqual({ x: 15, y: 15, zoom: 2 });
  });
  it('clampZoom sınırlar', () => {
    expect(clampZoom(5, 0.25, 3)).toBe(3); expect(clampZoom(0.1, 0.25, 3)).toBe(0.25); expect(clampZoom(1, 0.25, 3)).toBe(1);
  });
});
