import { describe, it, expect } from 'vitest';
import { topoOrderMainOps, buildVsmModel, compareVsmTotals } from './vsm.js';
import { computeCapacity } from './capacity.js';
import { migrateData } from './migrate.js';

/* Doğrusal zincir: a → b → c; CT'ler 60 / 90 / 45; takt 67.5 sn (540dk×0.85? hayır:
   takt = netMinutes/demand = 540/480 dk = 67.5 sn). a→b envanteri 15 adet (bekleme girilmemiş →
   Little tahmini 15 × 67.5 = 1012.5 sn). b→c envanter girilmemiş. */
const RAW = {
  schemaVersion: 4, domainId: 'textile',
  mainOps: [
    { id: 'a', name: 'Kesim',  color: '#0F6B5C', order: 0, nextIds: ['b'], x: 0, y: 0 },
    { id: 'b', name: 'Dikim',  color: '#3E6B8C', order: 1, nextIds: ['c'], x: 0, y: 0, changeoverSec: 480, uptimePct: 93, fpyPct: 97, shifts: 1 },
    { id: 'c', name: 'Paket',  color: '#B45309', order: 2, nextIds: [], x: 0, y: 0 },
  ],
  subOps: [
    { id: 's1', mainOpId: 'a', name: 'Serim',  cycleTime: 60, nextIds: [] },
    { id: 's2', mainOpId: 'b', name: 'Yaka',   cycleTime: 90, nextIds: [] },
    { id: 's3', mainOpId: 'b', name: 'Kol',    cycleTime: 30, nextIds: [] },
    { id: 's4', mainOpId: 'c', name: 'Katla',  cycleTime: 45, nextIds: [] },
  ],
  machines: [], operators: [],
  settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  scenarios: [], meta: {}, edges: [], infoNodes: [], infoEdges: [], kaizens: [],
};
const DATA = migrateData(RAW);                       // edges nextIds'ten türesin
DATA.edges.find(e => e.from === 'a').inventoryCount = 15;
const CALC = computeCapacity(DATA);

describe('topoOrderMainOps', () => {
  it('zinciri kaynak→hedef sıralar', () => {
    expect(topoOrderMainOps(DATA.mainOps).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('dallanmada kararlı sıra üretir ve düğüm kaybetmez', () => {
    const branched = [
      { id: 'x', nextIds: ['y', 'z'] }, { id: 'y', nextIds: ['w'] },
      { id: 'z', nextIds: ['w'] }, { id: 'w', nextIds: [] },
    ];
    const order = topoOrderMainOps(branched).map(m => m.id);
    expect(order).toHaveLength(4);
    expect(order[0]).toBe('x');
    expect(order[3]).toBe('w');
  });

  it('döngüde takılmaz (guard)', () => {
    const cyc = [{ id: 'p', nextIds: ['q'] }, { id: 'q', nextIds: ['p'] }];
    expect(topoOrderMainOps(cyc)).toHaveLength(2);
  });
});

describe('buildVsmModel', () => {
  const m = buildVsmModel(DATA, CALC);

  it('süreç kartları: darboğaz CT + VSM alanları', () => {
    expect(m.processes.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(m.processes[1].ctSec).toBe(90);            // Dikim'in en yavaş yaprağı
    expect(m.processes[1].changeoverSec).toBe(480);
    expect(m.processes[1].uptimePct).toBe(93);
    expect(m.processes[1].fpyPct).toBe(97);
    expect(m.processes[0].changeoverSec).toBeNull();  // girilmemiş → null
    expect(m.processes[1].subOpCount).toBe(2);
    expect(m.processes[1].isShared).toBe(false);       // isShared girilmemiş → !!undefined
  });

  it('takt durumu her sürece işlenir', () => {
    expect(m.processes[1].taktStatus).toBe('darbogaz');  // 90 > 67.5
    expect(m.processes[0].taktStatus).toBe('risk');      // 60/67.5 = %89
    expect(m.processes[2].taktStatus).toBe('normal');    // 45/67.5 = %67 → risk sınırı %80
  });

  it('envanter: girilmiş adet → Little tahmini bekleme (etiketli)', () => {
    expect(m.inventories).toHaveLength(2);
    expect(m.inventories[0].count).toBe(15);
    // A4: tahmin artık takt değil ETKİN ARALIKla yapılır (max(takt, netSec/lineCapacity)).
    // Bu doğrusal fixture'da darboğaz (Dikim, CT90) takt'tan (67.5) yavaş; lineCapacity≈266.087
    // adet/vardiya → netSec/lineCapacity≈121.7647 > takt → etkin aralık bu değer olur.
    // 15 × 121.7647058823529... ≈ 1826.4706 (eski beklenti 1012.5 = 15×takt idi — bilinçli değişiklik, bkz. A4).
    expect(m.inventories[0].waitSec).toBeCloseTo(1826.4706, 3);
    expect(m.inventories[0].estimated).toBe(true);
    expect(m.inventories[0].bottleneckLimited).toBe(true);   // etkin aralık > takt
    expect(m.inventories[1].count).toBeNull();
    expect(m.inventories[1].waitSec).toBeNull();
  });

  it('girilmiş bekleme tahmini ezer', () => {
    const d2 = structuredClone(DATA);
    d2.edges.find(e => e.from === 'a').inventoryWaitSec = 600;
    const m2 = buildVsmModel(d2, computeCapacity(d2));
    expect(m2.inventories[0].waitSec).toBe(600);
    expect(m2.inventories[0].estimated).toBe(false);
  });

  it('toplamlar: işlem, bekleme, lead time, PCE', () => {
    // a→b→c tek yol = kritik yol; processSec değişmez.
    expect(m.criticalPath).toEqual(['a', 'b', 'c']);
    expect(m.totals.processSec).toBe(195);            // 60+90+45
    // A4: waitSec/leadSec/pcePct/pceBand ILT etkin-aralık düzeltmesiyle değişir (bkz. yukarıdaki
    // 'envanter' testindeki not — 15×121.7647≈1826.47, eski 1012.5=15×takt idi).
    expect(m.totals.waitSec).toBeCloseTo(1826.4706, 3);
    expect(m.totals.leadSec).toBeCloseTo(2021.4706, 3);
    expect(m.totals.pcePct).toBeCloseTo(9.6464, 3);   // 195/2021.4706×100
    expect(m.totals.pceBand).toBe('zayıf');           // %9.65 < %15 (eskiden %16.15 → 'iyi' idi)
    expect(m.totals.taktSec).toBeCloseTo(67.5, 4);
    expect(m.totals.bottleneckId).toBe(CALC.bottleneckId);
  });

  it('hiç envanter girilmemişse PCE null (yanıltıcı %100 gösterme)', () => {
    const d3 = structuredClone(DATA);
    d3.edges.forEach(e => { e.inventoryCount = null; e.inventoryWaitSec = null; });
    const m3 = buildVsmModel(d3, computeCapacity(d3));
    expect(m3.totals.waitSec).toBe(0);
    expect(m3.totals.pcePct).toBeNull();
  });

  it('boş mainOps çökmez', () => {
    const empty = migrateData({ ...RAW, mainOps: [], subOps: [] });
    const me = buildVsmModel(empty, computeCapacity(empty));
    expect(me.processes).toEqual([]);
    expect(me.totals.leadSec).toBe(0);
  });
});

describe('otherLinks — komşu-olmayan bağlantılar (Faz 2b)', () => {
  // a → b → c zincirine ek: a → c atlama bağlantısı, envanterli
  const raw2 = structuredClone(RAW);
  raw2.mainOps[0].nextIds = ['b', 'c'];
  const d = migrateData(raw2);
  d.edges.find(e => e.from === 'a' && e.to === 'b').inventoryCount = 15;   // komşu
  d.edges.find(e => e.from === 'a' && e.to === 'c').inventoryCount = 4;    // atlama
  const m = buildVsmModel(d, computeCapacity(d));

  it('atlama bağlantısı otherLinks\'te listelenir', () => {
    expect(m.otherLinks).toHaveLength(1);
    expect(m.otherLinks[0]).toMatchObject({ from: 'a', to: 'c', count: 4 });
    // A4: tahmin etkin aralıkla (≈121.7647), takt (67.5) ile değil — bkz. üstteki not.
    expect(m.otherLinks[0].waitSec).toBeCloseTo(4 * 121.7647, 2);
  });

  it('toplamlar SADECE kritik yoldan (a-b-c); atlama (a→c) yol dışı sayılır (A1)', () => {
    // Kritik yol burada da a-b-c (a→c'nin 4×etkinAralık'ı a→b→c zincirini geçemiyor).
    // ESKİ davranış (Faz 2b): totals TÜM kenarları toplardı (komşu+atlama) → 1282.5.
    // YENİ davranış (A1): totals yalnız kritik yolun kenarlarını toplar (a→b + b→c);
    // atlama (a→c) artık offPathWaitSec'e gider, toplama dahil DEĞİL.
    expect(m.criticalPath).toEqual(['a', 'b', 'c']);
    expect(m.totals.waitSec).toBeCloseTo(15 * 121.7647, 2);          // yalnız a→b (b→c veri yok→0)
    expect(m.totals.leadSec).toBeCloseTo(195 + 15 * 121.7647, 2);
    expect(m.totals.offPathWaitSec).toBeCloseTo(4 * 121.7647, 2);    // a→c yol dışı
  });

  it('merdiven envanterleri (inventories) hâlâ yalnız komşu çiftler', () => {
    // A1 sonrası adjacency tanımı değişti: artık "topolojik komşu" değil "kritik yol
    // ARDIŞIK ÇİFTLERİ" kullanılıyor (bkz. buildVsmModel). Bu fixture'da kritik yol
    // a-b-c olduğundan (yukarıdaki test) sonuç TESADÜFEN aynı: a->b ve b->c ikisi de
    // kritik yol ardışık çiftleri. b→c'nin edge'i var (veri girilmemiş, count/waitSec
    // null) — bu yüzden nesne olarak kalır (null değil); yalnızca atlama (a->c) kritik
    // yolda OLMADIĞI için otherLinks'e gider ve inventories'e HİÇ girmez.
    expect(m.inventories.filter(Boolean).map(i => `${i.from}->${i.to}`)).toEqual(['a->b', 'b->c']);
  });
});

describe('kritik yol (A1 — paralel dallar seri toplanmaz)', () => {
  /* a → (b, c) → d; ct: a10 b60 c90 d30; bekleme: a→b 100sn (girilmiş), diğerleri yok.
     Yol 1: a+100+b+d = 10+100+60+30 = 200 · Yol 2: a+c+d = 10+90+30 = 130 → kritik yol 1. */
  const raw = structuredClone(RAW);
  raw.mainOps = [
    { id: 'a', name: 'A', nextIds: ['b', 'c'] },
    { id: 'b', name: 'B', nextIds: ['d'] },
    { id: 'c', name: 'C', nextIds: ['d'] },
    { id: 'd', name: 'D', nextIds: [] },
  ];
  raw.subOps = [
    { id: 'p1', mainOpId: 'a', cycleTime: 10, nextIds: [] },
    { id: 'p2', mainOpId: 'b', cycleTime: 60, nextIds: [] },
    { id: 'p3', mainOpId: 'c', cycleTime: 90, nextIds: [] },
    { id: 'p4', mainOpId: 'd', cycleTime: 30, nextIds: [] },
  ];
  const d = migrateData(raw);
  d.edges.find(e => e.from === 'a' && e.to === 'b').inventoryWaitSec = 100;
  const m = buildVsmModel(d, computeCapacity(d));

  it('toplamlar kritik yoldan (a-b-d), paralel c eklenmez', () => {
    expect(m.totals.leadSec).toBe(200);
    expect(m.totals.processSec).toBe(100);   // 10+60+30 — c'nin 90'ı YOK
    expect(m.totals.waitSec).toBe(100);
    expect(m.criticalPath).toEqual(['a', 'b', 'd']);
  });

  it('ladder kritik yol boyunca process/wait sırasıyla dizilir', () => {
    expect(m.ladder.map(s => s.type)).toEqual(['process', 'wait', 'process', 'wait', 'process']);
    expect(m.ladder[0]).toMatchObject({ type: 'process', id: 'a', sec: 10 });
    expect(m.ladder[1]).toMatchObject({ type: 'wait', from: 'a', to: 'b', sec: 100 });
    expect(m.ladder[2]).toMatchObject({ type: 'process', id: 'b', sec: 60 });
    expect(m.ladder[3]).toMatchObject({ type: 'wait', from: 'b', to: 'd', sec: 0 });
    expect(m.ladder[4]).toMatchObject({ type: 'process', id: 'd', sec: 30 });
  });

  it('büyük yol-dışı-OLMAYAN bekleme kritik yolu ÇEVİRİR (plan yazarının DİKKAT notu)', () => {
    // a→c'ye 500sn bekleme eklenirse yol 2 = 10+500+90+30 = 630 > 200 → kritik yol c'ye kayar.
    // (Plan taslağındaki ilk yazımda leadSec 200/aynı-yol beklentisi YANLIŞTI — plan yazarının
    // kendi DİKKAT notuna göre burada DOĞRU değerler kullanılıyor: 630 / ['a','c','d'].)
    const d2 = structuredClone(d);
    d2.edges.find(e => e.from === 'a' && e.to === 'c').inventoryWaitSec = 500;
    const m2 = buildVsmModel(d2, computeCapacity(d2));
    expect(m2.totals.leadSec).toBe(630);
    expect(m2.criticalPath).toEqual(['a', 'c', 'd']);
  });

  it('yol dışı bekleme ayrı raporlanır (küçük bekleme yolu ÇEVİRMEZ)', () => {
    // a→c'ye küçük (20sn) bekleme eklenirse yol 2 = 10+20+90+30 = 150 < 200 → kritik yol
    // hâlâ a-b-d; a→c'nin 20sn'i offPathWaitSec'e gider, toplama (leadSec/waitSec) dahil değil.
    const d3 = structuredClone(d);
    d3.edges.find(e => e.from === 'a' && e.to === 'c').inventoryWaitSec = 20;
    const m3 = buildVsmModel(d3, computeCapacity(d3));
    expect(m3.criticalPath).toEqual(['a', 'b', 'd']);
    expect(m3.totals.leadSec).toBe(200);
    expect(m3.totals.offPathWaitSec).toBe(20);
  });

  it('yol dışı bekleme tek başına PCE üretmez (sahte %100 koruması)', () => {
    // Kritik yol (a-b-d) ölçümsüzken YALNIZ yol dışı kenarda (c→d) bekleme girilirse
    // eski kapı (inventories || otherLinks) PCE'yi açar, waitSec=0 → pcePct=100/'mükemmel'
    // sahteliği doğardı. Kapı artık yalnız kritik yol envanterlerine bakar → PCE null.
    const raw2 = structuredClone(RAW);
    raw2.mainOps = [
      { id: 'a', name: 'A', nextIds: ['b', 'c'] },
      { id: 'b', name: 'B', nextIds: ['d'] },
      { id: 'c', name: 'C', nextIds: ['d'] },
      { id: 'd', name: 'D', nextIds: [] },
    ];
    raw2.subOps = [
      { id: 'q1', mainOpId: 'a', cycleTime: 10, nextIds: [] },
      { id: 'q2', mainOpId: 'b', cycleTime: 100, nextIds: [] },
      { id: 'q3', mainOpId: 'c', cycleTime: 10, nextIds: [] },
      { id: 'q4', mainOpId: 'd', cycleTime: 10, nextIds: [] },
    ];
    const d4 = migrateData(raw2);
    d4.edges.find(e => e.from === 'c' && e.to === 'd').inventoryWaitSec = 5;  // yalnız yol dışı
    const m4 = buildVsmModel(d4, computeCapacity(d4));
    expect(m4.criticalPath).toEqual(['a', 'b', 'd']);
    expect(m4.totals.offPathWaitSec).toBe(5);
    expect(m4.totals.pcePct).toBeNull();          // kritik yol ölçümsüz → PCE yok
  });
});

describe('ILT etkin aralık (A4 — darboğaz hızı)', () => {
  it('darboğaz takt\'tan yavaşsa tahmin darboğaz aralığıyla yapılır', () => {
    // DOĞRUSAL fixture: lineCapacity hesapla; etkinAralık = max(takt, netSec/lineCapacity)
    const m = buildVsmModel(DATA, CALC);
    const netSec = DATA.settings.netMinutes * 60;
    const expectedInterval = Math.max(CALC.taktTimeSec, netSec / CALC.lineCapacity);
    expect(m.inventories[0].waitSec).toBeCloseTo(15 * expectedInterval, 2);
    expect(m.inventories[0].bottleneckLimited).toBe(expectedInterval > CALC.taktTimeSec);
  });
});

describe('compareVsmTotals (Faz 2b)', () => {
  it('iki toplam setinin deltalarını verir', () => {
    const a = { processSec: 195, waitSec: 1012.5, leadSec: 1207.5, pcePct: 16.15, taktSec: 67.5 };
    const b = { processSec: 180, waitSec: 500,    leadSec: 680,    pcePct: 26.47, taktSec: 67.5 };
    const c = compareVsmTotals(a, b);
    expect(c.deltas.processSec).toBe(-15);
    expect(c.deltas.waitSec).toBeCloseTo(-512.5, 4);
    expect(c.deltas.leadSec).toBeCloseTo(-527.5, 4);
    expect(c.deltas.pcePct).toBeCloseTo(10.32, 2);
  });

  it('null PCE deltayı null yapar', () => {
    const c = compareVsmTotals({ pcePct: null, leadSec: 100, processSec: 100, waitSec: 0 },
                               { pcePct: 20,   leadSec: 100, processSec: 100, waitSec: 0 });
    expect(c.deltas.pcePct).toBeNull();
  });
});

describe('buildVsmModel — döngü koruması', () => {
  it("3'lü döngüde sonlanır (a→b→c→a) ve yol sonlu kalır", () => {
    const raw = {
      schemaVersion: 4, domainId: 'textile',
      mainOps: [
        { id: 'a', name: 'A', color: '#0F6B5C', order: 0, nextIds: ['b'], x: 0, y: 0 },
        { id: 'b', name: 'B', color: '#3E6B8C', order: 1, nextIds: ['c'], x: 0, y: 0 },
        { id: 'c', name: 'C', color: '#B45309', order: 2, nextIds: ['a'], x: 0, y: 0 },
      ],
      subOps: [
        { id: 't1', mainOpId: 'a', name: 'A1', cycleTime: 10, nextIds: [] },
        { id: 't2', mainOpId: 'b', name: 'B1', cycleTime: 20, nextIds: [] },
        { id: 't3', mainOpId: 'c', name: 'C1', cycleTime: 30, nextIds: [] },
      ],
      machines: [], operators: [],
      settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
      scenarios: [], meta: {}, edges: [], infoNodes: [], infoEdges: [], kaizens: [],
    };
    const d = migrateData(raw);            // edges nextIds'ten türer — döngü kenarları dahil
    const c = computeCapacity(d);          // kendi döngü koruması var (capacity.test.js:120)
    const m = buildVsmModel(d, c);         // BUGÜN: sonsuz döngü → test timeout ile düşer
    expect(m.criticalPath.length).toBeLessThanOrEqual(3);
    expect(new Set(m.criticalPath).size).toBe(m.criticalPath.length);  // tekrar yok
  });
});
