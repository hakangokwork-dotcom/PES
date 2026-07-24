import { describe, it, expect } from 'vitest';
import { initialSimState, cloneSimState, advanceSimStep, fastForward, buildGroupBridges } from './simulation.js';

describe('initialSimState', () => {
  it('temiz başlangıç durumu döner', () => {
    const s = initialSimState();
    expect(s).toEqual({
      running: false, speed: 10, elapsed: 0,
      pending: {}, inProgress: {}, completed: {}, exited: 0,
      history: [{ t: 0, exited: 0 }], peakQueue: {},
    });
  });
});

describe('advanceSimStep — tek istasyon', () => {
  const d = {
    subOps: [{ id: 's1', mainOpId: 'a', cycleTime: 10, nextIds: [] }],
    settings: { netMinutes: 540 },
  };

  it('parça başlatır, ilerletir, tamamlar ve yeniden başlatır', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 5);                       // boşta → başla
    expect(st.inProgress.s1).toEqual({ remainingSec: 10, totalSec: 10 });
    advanceSimStep(st, d, 5);                       // 5 sn kaldı
    expect(st.inProgress.s1.remainingSec).toBe(5);
    advanceSimStep(st, d, 5);                       // biter + yenisi başlar
    expect(st.exited).toBe(1);
    expect(st.completed.s1).toBe(1);
    expect(st.inProgress.s1.remainingSec).toBe(10);
    expect(st.elapsed).toBe(15);
  });
});

describe('advanceSimStep — AND birleşme', () => {
  const d = {
    subOps: [
      { id: 's1', mainOpId: 'a', cycleTime: 10, nextIds: ['s3'] },
      { id: 's2', mainOpId: 'a', cycleTime: 10, nextIds: ['s3'] },
      { id: 's3', mainOpId: 'a', cycleTime: 10, nextIds: [] },
    ],
    settings: { netMinutes: 540 },
  };

  it('s3 iki öncülden de parça gelmeden başlamaz', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 10);                      // s1, s2 başlar
    expect(st.inProgress.s3).toBeUndefined();
    advanceSimStep(st, d, 10);                      // s1, s2 biter → s3 başlar
    expect(st.inProgress.s3).toEqual({ remainingSec: 10, totalSec: 10 });
    advanceSimStep(st, d, 10);                      // s3 biter → çıkış
    expect(st.exited).toBe(1);
  });
});

describe('cloneSimState', () => {
  it('iç nesneleri kopyalar (referans paylaşmaz)', () => {
    const st = initialSimState();
    st.inProgress.x = { remainingSec: 3, totalSec: 5 };
    st.pending.y = { x: 2 };
    const c = cloneSimState(st);
    c.inProgress.x.remainingSec = 99;
    c.pending.y.x = 99;
    expect(st.inProgress.x.remainingSec).toBe(3);
    expect(st.pending.y.x).toBe(2);
  });
});

describe('fastForward', () => {
  it('vardiya sonuna koşar ve durur', () => {
    // 60 sn vardiya, 5 sn çevrim, DT=5 → 12 iterasyon, 11 çıkış
    const d = {
      subOps: [{ id: 's1', mainOpId: 'a', cycleTime: 5, nextIds: [] }],
      settings: { netMinutes: 1 },
    };
    const st = fastForward(initialSimState(), d);
    expect(st.elapsed).toBe(60);
    expect(st.running).toBe(false);
    expect(st.exited).toBe(11);
    expect(st.history[st.history.length - 1].exited).toBe(11);
  });

  it('girdi state\'ini değiştirmez (prev mutasyona uğramaz)', () => {
    const d = {
      subOps: [{ id: 's1', mainOpId: 'a', cycleTime: 5, nextIds: [] }],
      settings: { netMinutes: 1 },
    };
    const prev = initialSimState();
    fastForward(prev, d);
    expect(prev).toEqual(initialSimState());
  });

  it('vardiya ortasından devam eder', () => {
    const d = {
      subOps: [{ id: 's1', mainOpId: 'a', cycleTime: 5, nextIds: [] }],
      settings: { netMinutes: 1 },
    };
    // Manuel olarak vardiyanın ortasına (elapsed=30) kadar ilerlet.
    const mid = initialSimState();
    for (let i = 0; i < 6; i++) advanceSimStep(mid, d, 5);
    expect(mid.elapsed).toBe(30);
    expect(mid.exited).toBe(5);

    const end = fastForward(mid, d);
    expect(end.elapsed).toBe(60);
    expect(end.running).toBe(false);
    expect(end.exited).toBe(11);
  });
});

describe('grup köprüleri (A2 — sim ↔ ana-op DAG tutarlılığı)', () => {
  /* UX bulgusunun yeniden üretimi: Hazırlık → (Ön 80sn, Arka 10sn) → Montaj (VE).
     Eski motor Montaj'ı serbest kaynak sayıp sınırsız üretiyordu (%977 anomalisi).
     Yeni motor: Montaj yalnız İKİ daldan da parça gelince başlayabilmeli. */
  const d = {
    mainOps: [
      { id: 'H', nextIds: ['ON', 'AR'] },
      { id: 'ON', nextIds: ['M'] },
      { id: 'AR', nextIds: ['M'] },
      { id: 'M',  nextIds: [], joinType: 'AND' },
    ],
    subOps: [
      { id: 'h1', mainOpId: 'H',  cycleTime: 10, nextIds: [] },
      { id: 'o1', mainOpId: 'ON', cycleTime: 80, nextIds: [] },
      { id: 'a1', mainOpId: 'AR', cycleTime: 10, nextIds: [] },
      { id: 'm1', mainOpId: 'M',  cycleTime: 10, nextIds: [] },
    ],
    settings: { netMinutes: 540 },
  };

  it('buildGroupBridges giriş/terminal düğümleri ve grup öncüllerini çıkarır', () => {
    const b = buildGroupBridges(d);
    expect(b.entrySubs['M']).toEqual(['m1']);
    expect(b.terminalSubs['ON']).toEqual(['o1']);
    expect(b.groupPreds['M'].sort()).toEqual(['AR', 'ON']);
    expect(b.groupPreds['H']).toEqual([]);            // kaynak grup
    expect(b.groupOf['o1']).toBe('ON');
  });

  it('AND birleşme: giriş alt-opu her öncül gruptan parça gelmeden BAŞLAMAZ', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 10);
    // h1, a1 serbest DEĞİL artık: ON ve AR'ın öncülü H var → onlar da inbox bekler.
    // Yalnız h1 (kaynak grup H'nin girişi) başlar.
    expect(st.inProgress.h1).toBeDefined();
    expect(st.inProgress.o1).toBeUndefined();
    expect(st.inProgress.a1).toBeUndefined();
    expect(st.inProgress.m1).toBeUndefined();
    advanceSimStep(st, d, 10);   // h1 biter → H terminal → ON ve AR inbox'larına 1'er
    expect(st.inProgress.o1).toBeDefined();            // o1 başlar (80sn)
    expect(st.inProgress.a1).toBeDefined();            // a1 başlar (10sn)
    advanceSimStep(st, d, 10);   // a1 biter → M inbox'ında yalnız AR var → m1 BAŞLAMAZ
    expect(st.inProgress.m1).toBeUndefined();
    // o1 elapsed=20'de tam süreyle başladı → 80sn'i elapsed=100'de dolar:
    // yukarıdaki 3. adımdan sonra 7 adım daha gerekir (7×10=70; 30+70=100).
    for (let i = 0; i < 7; i++) advanceSimStep(st, d, 10);   // o1'in 80sn'i dolsun
    expect(st.completed.o1).toBe(1);
    expect(st.inProgress.m1).toBeDefined();            // iki dal da geldi → m1 başladı
  });

  it('vardiya sonunda çıkış YAVAŞ dalla sınırlı (anomali kapandı)', () => {
    const end = fastForward(initialSimState(), d);
    // 540dk=32400sn; o1 80sn/adet → ~405 üst sınır; m1 çıkışı bunu aşamaz
    expect(end.exited).toBeLessThanOrEqual(405);
    expect(end.exited).toBeGreaterThan(300);           // makul bant
    // eski hata: m1 serbest olsaydı ~3240 üretirdi
  });

  it('DUP birleşme: tek öncülden gelen parça yeter', () => {
    const dd = structuredClone(d);
    dd.mainOps.find(m => m.id === 'M').joinType = 'DUP';
    const st = initialSimState();
    advanceSimStep(st, dd, 10);   // h1
    advanceSimStep(st, dd, 10);   // h1 biter; o1+a1 başlar
    advanceSimStep(st, dd, 10);   // a1 biter → DUP: m1 tek daldan başlayabilir
    expect(st.inProgress.m1).toBeDefined();
  });

  it('alt-opu olmayan ara grup üretimi keser (kapasite=0 ile tutarlı)', () => {
    const de = structuredClone(d);
    de.subOps = de.subOps.filter(s => s.id !== 'o1');   // ON grubu boş
    const end = fastForward(initialSimState(), de);
    expect(end.exited).toBe(0);                         // AND: ON'dan asla parça gelmez
  });

  it('çapraz-grup doğrudan bağlantı + grup kenarı birlikte: iki kapı da tüketilir, parça kaybı yok', () => {
    const dx = {
      mainOps: [
        { id: 'A', nextIds: [] },          // A'dan B'ye GRUP kenarı yok — yalnız doğrudan alt-op bağı
        { id: 'C', nextIds: ['B'] },
        { id: 'B', nextIds: [], joinType: 'AND' },
      ],
      subOps: [
        { id: 'xA', mainOpId: 'A', cycleTime: 10, nextIds: ['yB'] },   // çapraz doğrudan bağ
        { id: 'cC', mainOpId: 'C', cycleTime: 10, nextIds: [] },
        { id: 'yB', mainOpId: 'B', cycleTime: 10, nextIds: [] },
      ],
      settings: { netMinutes: 540 },
    };
    const st = initialSimState();
    advanceSimStep(st, dx, 10);            // xA, cC başlar (yB: iki kapı da boş)
    expect(st.inProgress.yB).toBeUndefined();
    advanceSimStep(st, dx, 10);            // ikisi biter: pending.yB.xA=1, inbox.B.C=1 → yB başlar, İKİSİ de düşer
    expect(st.inProgress.yB).toBeDefined();
    expect(st.pending.yB.xA).toBe(0);
    expect(st.groupInbox.B.C).toBe(0);
    // uzun vadede birikme yok:
    for (let i = 0; i < 10; i++) advanceSimStep(st, dx, 10);
    expect(st.pending.yB.xA).toBeLessThanOrEqual(1);
    expect(st.groupInbox.B.C).toBeLessThanOrEqual(1);
    expect(st.completed.yB).toBeGreaterThanOrEqual(4);
  });

  it('grup köprüsü grup İÇİ alt-op zincirini bozmaz (mevcut davranış)', () => {
    // tek grupta s1→s2 zinciri: eski testlerle aynı davranış sürmeli
    const single = {
      mainOps: [{ id: 'A', nextIds: [] }],
      subOps: [
        { id: 's1', mainOpId: 'A', cycleTime: 10, nextIds: ['s2'] },
        { id: 's2', mainOpId: 'A', cycleTime: 10, nextIds: [] },
      ],
      settings: { netMinutes: 540 },
    };
    const st = initialSimState();
    advanceSimStep(st, single, 10);
    advanceSimStep(st, single, 10);
    expect(st.inProgress.s2).toBeDefined();
  });
});

describe('advanceSimStep — alt-op DUP birleşme (§3b)', () => {
  // s3 joinType DUP: HERHANGİ bir öncülden 1 parça yeter (kit değil, havuzlama).
  const d = {
    subOps: [
      { id: 's1', mainOpId: 'a', cycleTime: 10, nextIds: ['s3'] },
      { id: 's2', mainOpId: 'a', cycleTime: 20, nextIds: ['s3'] },
      { id: 's3', mainOpId: 'a', cycleTime: 10, nextIds: [], joinType: 'DUP' },
    ],
    settings: { netMinutes: 540 },
  };

  it('DUP alt-op TEK öncülden parça gelince başlar (AND gibi ikisini beklemez)', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 10);   // s1, s2 başlar
    advanceSimStep(st, d, 10);   // s1(10) biter → s3 pending'e 1; s2(20) devam ediyor
    // DUP: s1'den gelen 1 parça yeter → s3 başlamalı
    expect(st.inProgress.s3).toEqual({ remainingSec: 10, totalSec: 10 });
  });

  it('DUP başlarken yalnız 1 öncülden tüketir (diğeri pending\'de kalır)', () => {
    const d2 = {
      subOps: [
        { id: 's1', mainOpId: 'a', cycleTime: 10, nextIds: ['s3'] },
        { id: 's2', mainOpId: 'a', cycleTime: 10, nextIds: ['s3'] },
        { id: 's3', mainOpId: 'a', cycleTime: 100, nextIds: [], joinType: 'DUP' },
      ],
      settings: { netMinutes: 540 },
    };
    const st = initialSimState();
    advanceSimStep(st, d2, 10);   // s1, s2 başlar
    advanceSimStep(st, d2, 10);   // s1, s2 biter → s3 pending {s1:1, s2:1}; s3 DUP başlar, yalnız s1 tüketilir
    expect(st.inProgress.s3).toBeTruthy();      // DUP başladı
    const pend = st.pending['s3'] || {};
    expect(pend.s1 ?? 0).toBe(0);               // ilk öncül tüketildi
    expect(pend.s2 ?? 0).toBe(1);               // ikinci öncül DOKUNULMADI (AND olsa ikisi de düşerdi)
  });
});

describe('yedek-paralel istasyonlar (usta + acami aynı işi) — kapasite ile tutarlı', () => {
  // Op1(src 5sn) → Op2{usta 15sn, acami 30sn}. usta/acami bağlantısız kardeş,
  // ikisi de Op2 girişi VE terminali → Op1'in inbox'ından yük paylaşır, ikisi de çıkışa sayar.
  // Sim ham çevrim kullanır (pfd/eff yok): 28800sn'de usta 1920 + acami 960 ≈ 2880 üst sınır.
  const d = {
    mainOps: [
      { id: 'op1', nextIds: ['op2'] },
      { id: 'op2', nextIds: [], joinType: 'AND' },
    ],
    subOps: [
      { id: 'src',   mainOpId: 'op1', cycleTime: 5,  nextIds: [] },
      { id: 'usta',  mainOpId: 'op2', cycleTime: 15, nextIds: [], redundant: true },
      { id: 'acami', mainOpId: 'op2', cycleTime: 30, nextIds: [], redundant: true },
    ],
    settings: { netMinutes: 480 },
  };

  it('İKİ işçi de üretir: çıkış ~usta+acami (senkron-min 960 DEĞİL)', () => {
    const end = fastForward(initialSimState(), d);
    expect(end.completed.usta).toBeGreaterThan(0);
    expect(end.completed.acami).toBeGreaterThan(0);
    // İkisi de tam yüklü → toplam çıkış tek (yavaş) işçinin çok üstünde
    expect(end.exited).toBeGreaterThan(2000);
    expect(end.exited).toBeLessThanOrEqual(2900);
    // usta acami'nin ~2 katı üretir (15sn vs 30sn)
    expect(end.completed.usta).toBeGreaterThan(end.completed.acami);
  });
});

describe('advanceSimStep — SPLIT fan-out (§3a)', () => {
  // A böler → B, C. Her tamamlanan parça yalnız BİRİNE gider (en kısa kuyruğa), ikisine değil.
  const d = {
    subOps: [
      { id: 'A', mainOpId: 'a', cycleTime: 10, nextIds: ['B', 'C'], splitType: 'SPLIT' },
      { id: 'B', mainOpId: 'a', cycleTime: 1000, nextIds: [] },   // yavaş → kuyruğu birikir
      { id: 'C', mainOpId: 'a', cycleTime: 1000, nextIds: [] },
    ],
    settings: { netMinutes: 540 },
  };

  it('bir parça yalnız TEK ardıla gider (çoğaltmaz)', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 10);   // A başlar
    advanceSimStep(st, d, 10);   // A biter → SPLIT: B ve C'den biri seçilir
    advanceSimStep(st, d, 10);   // Seçilen başlar
    // SPLIT: sadece biri başladı, ikisi değil
    const startedB = !!st.inProgress['B'] || (st.completed['B'] || 0) > 0;
    const startedC = !!st.inProgress['C'] || (st.completed['C'] || 0) > 0;
    expect((startedB ? 1 : 0) + (startedC ? 1 : 0)).toBe(1);
  });

  it('eşitlikte ilk ardıl (B) seçilir — deterministik', () => {
    const st = initialSimState();
    advanceSimStep(st, d, 10);   // A başlar
    advanceSimStep(st, d, 10);   // A biter: B ve C kuyruğu 0 eşit → B seçilir
    advanceSimStep(st, d, 10);   // B başlar ilerler
    // B seçildi (ilk sıra), B'nin inProgress veya completed görülmeli
    const hasB = !!st.inProgress['B'] || (st.completed['B'] || 0) > 0;
    expect(hasB).toBe(true);
  });

  it('splitType yoksa (DUP) her iki ardıla da gider — geriye uyum', () => {
    const dupD = { ...d, subOps: d.subOps.map(s => s.id === 'A' ? { ...s, splitType: undefined } : s) };
    const st = initialSimState();
    advanceSimStep(st, dupD, 10);  // A başlar
    advanceSimStep(st, dupD, 10);  // A biter → DUP: her iki B ve C'ye gider
    advanceSimStep(st, dupD, 10);  // İkisi de başlar
    // DUP: hem B hem C seçildi
    const hasB = !!st.inProgress['B'] || (st.completed['B'] || 0) > 0;
    const hasC = !!st.inProgress['C'] || (st.completed['C'] || 0) > 0;
    expect(hasB).toBe(true);
    expect(hasC).toBe(true);
  });
});

describe('SPLIT — iki motor yakınsaması (±%15)', () => {
  // NOT: Kapasite (statik-orantılı) ve simülasyon (en-kısa-kuyruk) YALNIZ doygunlukta ve
  // dal-başına uyuşur; birleşme/çıkışta her rejimde uyuşur. Bu test tam doygunluk noktasında
  // kurulu (A rate 1/30 = cap_B 1/45 + cap_C 1/90). Doygunluk-altı rejimde dal-başına sayılar
  // ıraksar — bu ±%15 sonucu evrensel eşitlik değildir (kalite incelemesi §3a kapsam notu).
  it('uzun koşuda B/C dağılımı kapasite oranına yakınsar', () => {
    // A böler → B(cyc45, hızlı), C(cyc90, yavaş). Kapasite oranı ~2:1 → B, C'nin 2 katı çeker.
    const d = {
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'A', mainOpId: 'a', cycleTime: 30, nextIds: ['B', 'C'], splitType: 'SPLIT' },
        { id: 'B', mainOpId: 'a', cycleTime: 45, nextIds: [] },
        { id: 'C', mainOpId: 'a', cycleTime: 90, nextIds: [] },
      ],
      settings: { netMinutes: 540 },
    };
    let st = initialSimState();
    // 540 dk × 60 = 32400 sn; 5sn adımlarla ~6480 adım — bol veri
    for (let i = 0; i < 6480; i++) { st = cloneSimState(st); advanceSimStep(st, d, 5); }
    const doneB = st.completed['B'] || 0;
    const doneC = st.completed['C'] || 0;
    expect(doneB + doneC).toBeGreaterThan(50);      // anlamlı hacim üretildi
    const ratio = doneB / Math.max(1, doneC);
    expect(ratio).toBeGreaterThan(2 * 0.85);        // 2:1 ± %15
    expect(ratio).toBeLessThan(2 * 1.15);
  });
});
