import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SKETCH, SKETCH_COLORS, addStroke, eraseStrokesAt, clearSketch,
  addTextNote, moveTextNote, updateTextNote, removeTextNote, addShape,
  addSticky, moveSticky, updateSticky, removeSticky,
  addStamp, moveStamp, removeStamp,
  addComment, updateComment, moveComment, toggleCommentDone, removeComment,
  bellCurvePath,
} from './sketchOps.js';

const base = () => ({ id: 'pm', sketch: structuredClone(DEFAULT_SKETCH) });

describe('SKETCH_COLORS / DEFAULT_SKETCH', () => {
  it('renk seti + boş sketch', () => {
    expect(SKETCH_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_SKETCH).toEqual({ strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] });
  });
});

describe('addShape', () => {
  it('şekil ekler (immutable), sh_ id + tür + koordinatlar', () => {
    const m = base();
    const m2 = addShape(m, { type: 'rect', x1: 10, y1: 20, x2: 60, y2: 80, color: '#B3402A', width: 2 });
    expect(m2).not.toBe(m);
    expect(m2.sketch.shapes).toHaveLength(1);
    const sh = m2.sketch.shapes[0];
    expect(sh.id).toMatch(/^sh_/);
    expect(sh.type).toBe('rect');
    expect({ x1: sh.x1, y1: sh.y1, x2: sh.x2, y2: sh.y2 }).toEqual({ x1: 10, y1: 20, x2: 60, y2: 80 });
    expect(m.sketch.shapes).toHaveLength(0);
  });

  it('<3px şekil eklenmez (yanlışlıkla tık)', () => {
    const m = addShape(base(), { type: 'rect', x1: 10, y1: 10, x2: 12, y2: 11 });
    expect(m.sketch.shapes).toHaveLength(0);
  });

  it('eski {strokes,texts} sketch\'e (shapes alanı yok) eklenir, stroke\'lar korunur', () => {
    const eski = { id: 'pm', sketch: { strokes: [{ id: 'st_1', points: [[0, 0], [1, 1]] }], texts: [] } };
    const m2 = addShape(eski, { type: 'ellipse', x1: 0, y1: 0, x2: 40, y2: 40 });
    expect(m2.sketch.shapes).toHaveLength(1);
    expect(m2.sketch.strokes).toHaveLength(1);
  });

  it('uzun ince çizgi (bir kenar <3px) eklenir — AND koşulu (OR regresyon guard\'ı)', () => {
    const m = addShape(base(), { type: 'line', x1: 0, y1: 0, x2: 80, y2: 1 });
    expect(m.sketch.shapes).toHaveLength(1);
  });
});

describe('addStroke', () => {
  it('stroke ekler (immutable), id atar', () => {
    const m = base();
    const m2 = addStroke(m, { color: '#000', width: 3, opacity: 1, points: [[0, 0], [5, 5]] });
    expect(m2).not.toBe(m);
    expect(m2.sketch.strokes).toHaveLength(1);
    expect(m2.sketch.strokes[0].id).toMatch(/^st_/);
    expect(m2.sketch.strokes[0].points).toEqual([[0, 0], [5, 5]]);
    expect(m.sketch.strokes).toHaveLength(0);
  });

  it('2 noktadan az stroke eklenmez (nokta değil çizgi)', () => {
    const m = addStroke(base(), { points: [[1, 1]], color: '#000', width: 3 });
    expect(m.sketch.strokes).toHaveLength(0);
  });

  it('sketch yoksa (eski harita) güvenli oluşturur', () => {
    const m2 = addStroke({ id: 'x' }, { points: [[0, 0], [1, 1]], color: '#000', width: 3 });
    expect(m2.sketch.strokes).toHaveLength(1);
  });
});

describe('eraseStrokesAt', () => {
  it('yarıçap içindeki stroke\'ları siler, diğerini korur', () => {
    let m = base();
    m = addStroke(m, { points: [[0, 0], [10, 0]], color: '#000', width: 3 });     // yatay
    m = addStroke(m, { points: [[100, 100], [110, 100]], color: '#000', width: 3 }); // uzak
    const m2 = eraseStrokesAt(m, 5, 0, 8);       // ilk stroke'a yakın
    expect(m2.sketch.strokes).toHaveLength(1);
    expect(m2.sketch.strokes[0].points[0]).toEqual([100, 100]);
  });

  it('hiçbir stroke yakında değilse değişmez', () => {
    let m = addStroke(base(), { points: [[0, 0], [10, 0]], color: '#000', width: 3 });
    expect(eraseStrokesAt(m, 500, 500, 8).sketch.strokes).toHaveLength(1);
  });

  it('sketch yoksa (eski harita) çökmez, aynı map döner', () => {
    const m = { id: 'x' };
    const out = eraseStrokesAt(m, 5, 5, 10);
    expect(out).toBe(m);   // hit yok → değiştirilmeden döner (UI DEFAULT_SKETCH ile guard'lar)
  });

  it('şekilleri de siler: yakındaki şekil gider, uzaktaki kalır', () => {
    let m = base();
    m = addShape(m, { type: 'rect', x1: 0, y1: 0, x2: 20, y2: 20 });         // (5,5) yakın
    m = addShape(m, { type: 'rect', x1: 300, y1: 300, x2: 340, y2: 340 });   // uzak
    const m2 = eraseStrokesAt(m, 5, 5, 8);
    expect(m2.sketch.shapes).toHaveLength(1);
    expect(m2.sketch.shapes[0].x1).toBe(300);
  });

  it('ters yönde çizilmiş şekli (x2<x1, y2<y1) de siler (min/max normalize + clamp)', () => {
    let m = base();
    m = addShape(m, { type: 'rect', x1: 40, y1: 40, x2: 0, y2: 0 });   // sağ-alttan sol-üste sürükleme
    const m2 = eraseStrokesAt(m, 20, 20, 8);
    expect(m2.sketch.shapes).toHaveLength(0);
  });
});

describe('metin notu', () => {
  it('ekle/taşı/güncelle/sil', () => {
    let m = base();
    m = addTextNote(m, 20, 30, 'İncele');
    expect(m.sketch.texts).toHaveLength(1);
    expect(m.sketch.texts[0]).toMatchObject({ x: 20, y: 30, text: 'İncele' });
    const id = m.sketch.texts[0].id;
    m = moveTextNote(m, id, 40, 50);
    expect(m.sketch.texts[0]).toMatchObject({ x: 40, y: 50 });
    m = updateTextNote(m, id, 'Düzelt');
    expect(m.sketch.texts[0].text).toBe('Düzelt');
    m = removeTextNote(m, id);
    expect(m.sketch.texts).toEqual([]);
  });

  it('boş metin eklenmez', () => {
    expect(addTextNote(base(), 0, 0, '  ').sketch.texts).toHaveLength(0);
  });
});

describe('sticky ops', () => {
  it('addSticky ekler (sr_ id, varsayılan boyut+renk)', () => {
    const m = addSticky(base(), 40, 50);
    expect(m.sketch.stickies).toHaveLength(1);
    expect(m.sketch.stickies[0]).toMatchObject({ x: 40, y: 50, w: 168, h: 168, text: '' });
    expect(m.sketch.stickies[0].id).toMatch(/^sr_/);
    expect(m.sketch.stickies[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);   // varsayılan renk atanır
  });
  it('addSticky özel renk parametresini kullanır', () => {
    expect(addSticky(base(), 0, 0, '#BBF7D0').sketch.stickies[0].color).toBe('#BBF7D0');
  });
  it('updateSticky metni değiştirir, moveSticky konum, removeSticky siler', () => {
    let m = addSticky(base(), 0, 0); const id = m.sketch.stickies[0].id;
    m = updateSticky(m, id, 'merhaba'); expect(m.sketch.stickies[0].text).toBe('merhaba');
    m = moveSticky(m, id, 10, 20); expect(m.sketch.stickies[0]).toMatchObject({ x: 10, y: 20 });
    m = removeSticky(m, id); expect(m.sketch.stickies).toHaveLength(0);
  });
  it('eski {strokes,texts} sketch\'e sticky güvenli eklenir', () => {
    const m = addSticky({ id: 'x', sketch: { strokes: [], texts: [] } }, 0, 0);
    expect(m.sketch.stickies).toHaveLength(1); expect(m.sketch.strokes).toEqual([]);
  });
});
describe('stamp ops', () => {
  it('addStamp ekler (sp_ id, emoji, size)', () => {
    const m = addStamp(base(), 5, 6, '👍');
    expect(m.sketch.stamps[0]).toMatchObject({ x: 5, y: 6, emoji: '👍', size: 40 });
    expect(m.sketch.stamps[0].id).toMatch(/^sp_/);
  });
  it('boş emoji eklenmez', () => { expect(addStamp(base(), 0, 0, '').sketch.stamps).toHaveLength(0); });
  it('moveStamp + removeStamp', () => {
    let m = addStamp(base(), 0, 0, '⭐'); const id = m.sketch.stamps[0].id;
    m = moveStamp(m, id, 9, 9); expect(m.sketch.stamps[0]).toMatchObject({ x: 9, y: 9 });
    m = removeStamp(m, id); expect(m.sketch.stamps).toHaveLength(0);
  });
});

describe('comment ops', () => {
  it('addComment ekler (cm_ id, done=false, text)', () => {
    const m = addComment(base(), 30, 40, 'not');
    expect(m.sketch.comments).toHaveLength(1);
    expect(m.sketch.comments[0]).toMatchObject({ x: 30, y: 40, text: 'not', done: false });
    expect(m.sketch.comments[0].id).toMatch(/^cm_/);
  });
  it('updateComment/moveComment/toggleCommentDone/removeComment', () => {
    let m = addComment(base(), 0, 0); const id = m.sketch.comments[0].id;
    m = updateComment(m, id, 'güncel'); expect(m.sketch.comments[0].text).toBe('güncel');
    m = moveComment(m, id, 7, 8); expect(m.sketch.comments[0]).toMatchObject({ x: 7, y: 8 });
    m = toggleCommentDone(m, id); expect(m.sketch.comments[0].done).toBe(true);
    m = toggleCommentDone(m, id); expect(m.sketch.comments[0].done).toBe(false);
    m = removeComment(m, id); expect(m.sketch.comments).toHaveLength(0);
  });
  it('eski {strokes,texts} sketch\'e comment güvenli eklenir', () => {
    const m = addComment({ id: 'x', sketch: { strokes: [], texts: [] } }, 0, 0, 'a');
    expect(m.sketch.comments).toHaveLength(1); expect(m.sketch.strokes).toEqual([]);
  });
});

describe('clearSketch', () => {
  it('tüm stroke ve metinleri temizler', () => {
    let m = base();
    m = addStroke(m, { points: [[0, 0], [1, 1]], color: '#000', width: 3 });
    m = addTextNote(m, 0, 0, 'x');
    m = addShape(m, { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 40 });
    m = addSticky(m, 0, 0);
    m = addStamp(m, 0, 0, '👍');
    expect(clearSketch(m).sketch).toEqual({ strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] });
  });
});

describe('bellCurvePath — normal dağılım eğrisi', () => {
  // Kutu: x=0..200, y=0..100. Eğri taban çizgisinde başlar/biter, ortada tepe yapar.
  const G = { x: 0, y: 0, w: 200, h: 100, cx: 100, cy: 50 };

  it('taban sol-altta başlar, sağ-altta biter (kutuya oturur)', () => {
    const d = bellCurvePath(G);
    expect(d.startsWith('M0,100')).toBe(true);      // sol alt köşe (taban)
    expect(d.trimEnd().endsWith('200,100')).toBe(true); // sağ alt köşe
  });

  it('tepe noktası kutunun ÜST kenarında ve tam ortada', () => {
    const d = bellCurvePath(G);
    expect(d).toContain('100,0');                    // cx=100, y=0 → tepe
  });

  it('NaN/Infinity üretmez, sayısal olarak sağlam', () => {
    expect(bellCurvePath(G)).not.toMatch(/NaN|Infinity/);
    expect(bellCurvePath({ x: 5, y: 5, w: 1, h: 1, cx: 5.5, cy: 5.5 })).not.toMatch(/NaN|Infinity/);
  });

  it('sıfır genişlik/yükseklikte çökmez', () => {
    const flat = bellCurvePath({ x: 10, y: 10, w: 0, h: 0, cx: 10, cy: 10 });
    expect(flat).not.toMatch(/NaN|Infinity/);
    expect(flat.startsWith('M10,10')).toBe(true);
  });

  it('kutu içinde kalır — hiçbir koordinat sınırları aşmaz', () => {
    const d = bellCurvePath(G);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(0);     // x ∈ [0,200]
      expect(nums[i]).toBeLessThanOrEqual(200);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0); // y ∈ [0,100]
      expect(nums[i + 1]).toBeLessThanOrEqual(100);
    }
  });

  it('simetrik — tepe etrafında sol ve sağ ayna görüntüsü', () => {
    const d = bellCurvePath(G);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    // İlk x (0) ve son x (200) merkeze (100) eşit uzaklıkta
    expect(xs[0] + xs[xs.length - 1]).toBeCloseTo(2 * G.cx, 5);
  });
});
