import { describe, it, expect } from 'vitest';
import { dimsOf, nodeCenter, rectEdgePoint, handlePoints, bezierPath, nextStepPos, edgeAnchors, edgeAnchorsForDims, orthoPath, offsetAlongSide, isBackwardEdge, orthoBackwardLaneY } from './processMapGeometry.js';

const stepNode = (x, y) => ({ type: 'step', x, y });

describe('handlePoints', () => {
  it('4 kenar ortası (üst/sağ/alt/sol) döner', () => {
    const h = handlePoints(stepNode(100, 100));   // step 148x64
    expect(h.top).toEqual({ x: 100 + 74, y: 100 });
    expect(h.right).toEqual({ x: 100 + 148, y: 100 + 32 });
    expect(h.bottom).toEqual({ x: 100 + 74, y: 100 + 64 });
    expect(h.left).toEqual({ x: 100, y: 100 + 32 });
  });
});

describe('edgeAnchors — kutu kenar-ortasından çıkar/girer (merkez hizalı)', () => {
  it('yatay baskın: kaynak SAĞ-orta → hedef SOL-orta (yükseklikler farklı olsa da orta-hizalı)', () => {
    const src = stepNode(0, 0);        // sağ-orta: (148, 32)
    const tgt = stepNode(400, 200);    // sol-orta: (400, 232)
    const { p1, p2 } = edgeAnchors(src, tgt);
    expect(p1).toEqual({ x: 148, y: 32 });    // kaynağın sağ kenar ORTASI (köşe/açı değil)
    expect(p2).toEqual({ x: 400, y: 232 });   // hedefin sol kenar ORTASI
  });
  it('sola akış: kaynak SOL-orta → hedef SAĞ-orta', () => {
    const { p1, p2 } = edgeAnchors(stepNode(400, 0), stepNode(0, 0));
    expect(p1).toEqual({ x: 400, y: 32 });    // sol-orta
    expect(p2).toEqual({ x: 148, y: 32 });    // hedef sağ-orta
  });
  it('dikey baskın: kaynak ALT-orta → hedef ÜST-orta', () => {
    const { p1, p2 } = edgeAnchors(stepNode(0, 0), stepNode(20, 400));
    expect(p1).toEqual({ x: 74, y: 64 });     // alt-orta
    expect(p2).toEqual({ x: 94, y: 400 });    // hedef üst-orta
  });
});

describe('nextStepPos', () => {
  const src = stepNode(100, 100);   // step 148×64, yeni step 148×64, gap=64

  it('sağ yönde: kaynağın sağına gap boşlukla, dikeyde ortalı', () => {
    expect(nextStepPos(src, 'right')).toEqual({ x: 100 + 148 + 64, y: 100 });   // {312,100}
  });
  it('sol yönde: kaynağın soluna (x negatif olabilir — clamp burada YOK)', () => {
    const p = nextStepPos(src, 'left');
    expect(p).toEqual({ x: 100 - 148 - 64, y: 100 });   // {-112,100}
    expect(p.x).toBeLessThan(0);                          // ham geometri: clamp uygulanmaz
  });
  it('alt yönde: kaynağın altına, yatayda ortalı', () => {
    expect(nextStepPos(src, 'bottom')).toEqual({ x: 100, y: 100 + 64 + 64 });   // {100,228}
  });
  it('üst yönde: kaynağın üstüne (y negatif olabilir — clamp yok)', () => {
    const p = nextStepPos(src, 'top');
    expect(p).toEqual({ x: 100, y: 100 - 64 - 64 });    // {100,-28}
    expect(p.y).toBeLessThan(0);
  });
  it('çapraz eksende ortalar: decision(96×96)→step(148×64) sağ', () => {
    // Farklı boyutlu kaynak/hedef → (h - nd.h)/2 = (96-64)/2 = 16 gerçekten doğrulanır
    // (step→step tüm vakalarda bu terim 0 olduğundan ortalama aritmetiği ancak burada kilitlenir).
    const p = nextStepPos({ type: 'decision', x: 0, y: 0 }, 'right');
    expect(p).toEqual({ x: 0 + 96 + 64, y: (96 - 64) / 2 });   // {160,16}
  });
});

describe('bezierPath', () => {
  it('geçerli cubic path string üretir (M ... C ...)', () => {
    const s = { x: 0, y: 0 }, t = { x: 200, y: 0 };
    const d = bezierPath(s, t);
    expect(d).toMatch(/^M0,0 C/);
    expect(d).toContain('200,0');
  });

  it('yatay baskın segmentte kontrol noktaları yatay teğetli', () => {
    // s→t yatay: kontrol noktaları x ekseninde açılır (dy≈0)
    const d = bezierPath({ x: 0, y: 0 }, { x: 100, y: 0 });
    // ilk kontrol noktası kaynaktan sağa doğru (x>0, y=0)
    const nums = d.match(/[-\d.]+/g).map(Number);
    // M x0 y0 C c1x c1y c2x c2y x1 y1
    const [, , c1x, c1y] = nums;
    expect(c1x).toBeGreaterThan(0);
    expect(Math.abs(c1y)).toBeLessThan(1);
  });

  it('dikey baskın segmentte kontrol noktaları dikey teğetli', () => {
    const d = bezierPath({ x: 0, y: 0 }, { x: 0, y: 100 });
    const nums = d.match(/[-\d.]+/g).map(Number);
    const [, , c1x, c1y] = nums;
    expect(Math.abs(c1x)).toBeLessThan(1);
    expect(c1y).toBeGreaterThan(0);
  });
});

describe('edgeAnchorsForDims — açık boyutla ankraj (Akış tuvali)', () => {
  const D = { w: 200, h: 64 };

  it('hedef sağda → sağ-orta çık, sol-orta gir', () => {
    const a = edgeAnchorsForDims({ x: 0, y: 0 }, { x: 400, y: 0 }, D, D);
    expect(a.p1).toEqual({ x: 200, y: 32 });
    expect(a.p2).toEqual({ x: 400, y: 32 });
  });

  it('hedef SOLDA (kart geride) → SOL-orta çık, SAĞ-orta gir', () => {
    const a = edgeAnchorsForDims({ x: 400, y: 0 }, { x: 0, y: 0 }, D, D);
    expect(a.p1).toEqual({ x: 400, y: 32 });
    expect(a.p2).toEqual({ x: 200, y: 32 });
  });

  it('dikey baskın → alt-orta çık, üst-orta gir', () => {
    const a = edgeAnchorsForDims({ x: 0, y: 0 }, { x: 40, y: 300 }, D, D);
    expect(a.p1).toEqual({ x: 100, y: 64 });
    expect(a.p2).toEqual({ x: 140, y: 300 });
  });

  it('regresyon: eski edgeAnchors imzası birebir aynı sonucu verir', () => {
    const s = { type: 'step', x: 10, y: 20 };
    const t = { type: 'decision', x: 300, y: 40 };
    expect(edgeAnchors(s, t)).toEqual(
      edgeAnchorsForDims(s, t, dimsOf('step'), dimsOf('decision'))
    );
  });

  it('|dx| === |dy| eşitliğinde yatay kazanır (>= tie-break)', () => {
    const a = edgeAnchorsForDims({ x: 0, y: 0 }, { x: 200, y: 200 }, D, D);
    expect(a.p1).toEqual({ x: 200, y: 32 });   // sağ-orta (yatay seçildi)
    expect(a.p2).toEqual({ x: 200, y: 232 });  // hedef sol-orta
  });

  it('hangi kenar seçildiğini de bildirir (s1/s2)', () => {
    const D2 = { w: 200, h: 64 };
    expect(edgeAnchorsForDims({ x: 0, y: 0 }, { x: 400, y: 0 }, D2, D2))
      .toMatchObject({ s1: 'right', s2: 'left' });
    expect(edgeAnchorsForDims({ x: 400, y: 0 }, { x: 0, y: 0 }, D2, D2))
      .toMatchObject({ s1: 'left', s2: 'right' });
    expect(edgeAnchorsForDims({ x: 0, y: 0 }, { x: 40, y: 300 }, D2, D2))
      .toMatchObject({ s1: 'bottom', s2: 'top' });
    expect(edgeAnchorsForDims({ x: 0, y: 300 }, { x: 40, y: 0 }, D2, D2))
      .toMatchObject({ s1: 'top', s2: 'bottom' });
  });
});

describe('offsetAlongSide', () => {
  it('kenar normali boyunca dışarı iter', () => {
    expect(offsetAlongSide({ x: 100, y: 50 }, 'right', 4)).toEqual({ x: 104, y: 50 });
    expect(offsetAlongSide({ x: 100, y: 50 }, 'left', 4)).toEqual({ x: 96, y: 50 });
    expect(offsetAlongSide({ x: 100, y: 50 }, 'top', 4)).toEqual({ x: 100, y: 46 });
    expect(offsetAlongSide({ x: 100, y: 50 }, 'bottom', 4)).toEqual({ x: 100, y: 54 });
  });
});

describe('orthoPath — dik köşeli yol', () => {
  const P = (x, y) => ({ x, y });

  it('sağ→sol: uçlardan başlar/biter ve orta X\'te dikey segment yapar', () => {
    const d = orthoPath(P(200, 100), 'right', P(500, 300), 'left');
    expect(d.startsWith('M200,100')).toBe(true);
    expect(d.endsWith('L500,300')).toBe(true);
    expect(d).toContain('350');            // midX = (200+500)/2
    expect(d).toContain('Q');              // yuvarlatılmış köşe
  });

  it('ÇIKIŞ YÖNÜNÜ izler: sağdan çıkan yol önce SAĞA gider (bezierPath hatası burada yok)', () => {
    // Ankraj farkı dikey baskın (dx=147 < |dy|=161) — bezierPath burada teğeti dikey açardı.
    const d = orthoPath(P(204, 197), 'right', P(351, 36), 'left');
    const firstL = d.match(/^M204,197 L([\d.-]+),([\d.-]+)/);
    expect(firstL).not.toBeNull();
    expect(Number(firstL[1])).toBeGreaterThan(204);   // ilk hareket SAĞA
    expect(Number(firstL[2])).toBe(197);              // ve yatay (y sabit)
  });

  it('aynı hizadaki kutular arasında düz çizgi', () => {
    expect(orthoPath(P(200, 100), 'right', P(500, 100), 'left')).toBe('M200,100 L500,100');
  });

  it('alt→üst: orta Y\'de yatay segment yapar', () => {
    const d = orthoPath(P(100, 200), 'bottom', P(300, 500), 'top');
    expect(d.startsWith('M100,200')).toBe(true);
    expect(d.endsWith('L300,500')).toBe(true);
    expect(d).toContain('350');            // midY = (200+500)/2
  });

  it('dikey hizalı sağ→sol artık İLMEK çizer (sabit port modeli), NaN üretmez', () => {
    // DAVRANIŞ DEĞİŞİKLİĞİ (2026-07-20, n8n sabit port): eskiden düz dikey çizgi
    // dönerdi. Sağ kenardan çıkıp sol kenara girerken iki nokta aynı x'teyse düz
    // çizgi portları saymamış olur — dolanmak zorunlu. Düz-çizgi yedeği aynı Y'de
    // (yukarıdaki 'aynı hizadaki kutular' testi) ve dikey kenar çiftlerinde sürüyor.
    const d = orthoPath(P(200, 100), 'right', P(200, 300), 'left');
    expect(d.startsWith('M200,100')).toBe(true);
    expect(d.endsWith('L200,300')).toBe(true);
    expect(d).not.toContain('NaN');
  });

  it('dikey kenar çiftinde (alt→üst) çakışıkken hâlâ düz çizgiye düşer', () => {
    // İlmek yalnız sağ→sol içindir; dikey portlarda eski yedek korunur.
    expect(orthoPath(P(200, 100), 'bottom', P(200, 300), 'top')).toBe('M200,100 L200,300');
  });

  it('yarıçap segmentten uzun olamaz — dar geçişte NaN/taşma yok', () => {
    const d = orthoPath(P(200, 100), 'right', P(206, 104), 'left', 14);
    expect(d).not.toContain('NaN');
    expect(d.startsWith('M200,100')).toBe(true);
    expect(d.endsWith('L206,104')).toBe(true);
  });
});

describe('Sabit port geri-akış ilmeği (n8n modeli)', () => {
  const P = (x, y) => ({ x, y });

  it('isBackwardEdge: hedef yeterince sağda değilse geri akış', () => {
    expect(isBackwardEdge(P(200, 100), P(400, 100))).toBe(false);  // 200px sağda → ileri
    expect(isBackwardEdge(P(200, 100), P(250, 100))).toBe(false);  // 50px sağda → ileri (normal kolon aralığı)
    expect(isBackwardEdge(P(200, 100), P(210, 100))).toBe(true);   // 10px → geri
    expect(isBackwardEdge(P(200, 100), P(50, 300))).toBe(true);    // solda → geri
  });

  it('orthoBackwardLaneY: hedef aşağıdaysa alttan, yukarıdaysa üstten dolanır', () => {
    expect(orthoBackwardLaneY(P(200, 100), P(50, 300))).toBe(300 + 52);   // hedef aşağıda → alt şerit
    expect(orthoBackwardLaneY(P(200, 300), P(50, 100))).toBe(100 - 52);   // hedef yukarıda → üst şerit
  });

  it('geri akışta ilmek çizer: p1de başlar, p2de biter, şeritten geçer', () => {
    const p1 = P(200, 100), p2 = P(50, 300);
    const d = orthoPath(p1, 'right', p2, 'left');
    expect(d.startsWith('M200,100')).toBe(true);
    expect(d.endsWith('L50,300')).toBe(true);
    expect(d).toContain(String(orthoBackwardLaneY(p1, p2)));   // şerit Y'si yolda geçiyor
    expect(d).toContain('Q');                                  // yuvarlatılmış köşeler
    expect(d).not.toContain('NaN');
  });

  it('ilmek önce SAĞA çıkar (sabit port kuralı: çıkış daima sağ)', () => {
    const d = orthoPath(P(200, 100), 'right', P(50, 300), 'left');
    const first = d.match(/^M200,100 L([\d.-]+),([\d.-]+)/);
    expect(first).not.toBeNull();
    expect(Number(first[1])).toBeGreaterThan(200);   // ilk hareket sağa
    expect(Number(first[2])).toBe(100);              // ve yatay
  });

  it('dikey yığılı kutular (aynı kolon) da ilmekle bağlanır', () => {
    // p1 = üstteki kutunun sağ kenarı, p2 = alttakinin sol kenarı (aynı kolon)
    const d = orthoPath(P(260, 82), 'right', P(60, 232), 'left');
    expect(d.startsWith('M260,82')).toBe(true);
    expect(d.endsWith('L60,232')).toBe(true);
    expect(d).not.toContain('NaN');
  });

  it('ileri akış ETKİLENMEZ — normal kolon aralığı düz yol kalır (regresyon)', () => {
    const fwd = orthoPath(P(200, 100), 'right', P(250, 300), 'left');
    expect(fwd).toBe(orthoPath(P(200, 100), 'right', P(250, 300), 'left'));
    expect(fwd).toContain('225');            // midX = (200+250)/2 → ileri rota
    expect(fwd).not.toContain(String(orthoBackwardLaneY(P(200, 100), P(250, 300))));
  });

  it('çok dar geri akışta bile NaN üretmez', () => {
    const d = orthoPath(P(200, 100), 'right', P(199, 101), 'left');
    expect(d).not.toContain('NaN');
    expect(d.endsWith('L199,101')).toBe(true);
  });
});
