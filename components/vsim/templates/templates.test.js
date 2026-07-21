import { describe, it, expect, beforeEach } from 'vitest';
import { BUILTIN_TEMPLATES, COMING_SOON, findTemplate } from './index.js';
import { buildDataFromTemplate, templateFromData } from './apply.js';
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './userStore.js';

/* Node ortamında localStorage yok — basit stub */
beforeEach(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
});

describe('şablon registry', () => {
  it('yerleşik şablonlar: blank + textile-basic', () => {
    expect(BUILTIN_TEMPLATES.map(t => t.templateId)).toEqual(['blank', 'textile-basic']);
  });

  it('yakında kartları seçilemez işaretli', () => {
    // Asıl değişmez: bu listedeki HER kart comingSoon olmalı (galeri onları soluk/
    // seçilemez render eder). Kart SAYISI ürün kararıdır, testte sabitlenmez —
    // 2026-07-21'de Hastane ve Banka kaldırıldı, eski `>= 3` beklentisi bu yüzden düştü.
    expect(COMING_SOON.every(t => t.comingSoon)).toBe(true);
    expect(COMING_SOON.every(t => t.templateId && t.name)).toBe(true);
    // Kaldırılanlar geri sızmasın (yanlışlıkla yeniden eklenirse yakalanır)
    const ids = COMING_SOON.map(t => t.templateId);
    expect(ids).not.toContain('hospital');
    expect(ids).not.toContain('banking');
  });

  it('findTemplate id ile bulur, bilinmeyen için null', () => {
    expect(findTemplate('blank').templateId).toBe('blank');
    expect(findTemplate('yok')).toBeNull();
  });
});

describe('buildDataFromTemplate', () => {
  it('textile-basic geçerli v4 verisi üretir', () => {
    const d = buildDataFromTemplate(findTemplate('textile-basic'));
    expect(d.schemaVersion).toBe(4);
    expect(d.domainId).toBe('textile');
    expect(d.mainOps.length).toBe(6);
    expect(d.mainOps[0].name).toBe('Hazırlık');
    expect(d.settings).toEqual({ netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 });
    expect(d.edges.length).toBeGreaterThan(0);        // nextIds'ten türetilmiş
    expect(d.scenarios).toEqual([]);
    expect(d.infoNodes).toEqual([]);
    expect(d.processMaps).toEqual([]);
  });

  it('blank şablonu boş kanvas üretir', () => {
    const d = buildDataFromTemplate(findTemplate('blank'));
    expect(d.domainId).toBe('blank');
    expect(d.mainOps).toEqual([]);
    expect(d.subOps).toEqual([]);
    expect(d.settings.netMinutes).toBe(480);          // blank domain varsayılanı
  });

  it('seed settings domain varsayılanını ezer', () => {
    const tpl = { templateId: 't', domainId: 'blank', name: 'T', seed: { settings: { demand: 250 } } };
    const d = buildDataFromTemplate(tpl);
    expect(d.settings.demand).toBe(250);
    expect(d.settings.netMinutes).toBe(480);
  });
});

describe('kullanıcı şablonları', () => {
  const DATA = {
    schemaVersion: 4, domainId: 'textile',
    mainOps: [{ id: 'a', name: 'X', nextIds: [] }], subOps: [], machines: [], operators: [],
    settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
    scenarios: [{ id: 'sc', name: 's' }], meta: { modelAdi: 'M' }, edges: [],
    infoNodes: [], infoEdges: [], kaizens: [],
  };

  it('templateFromData senaryoları dahil etmez, akışı alır', () => {
    const tpl = templateFromData('Benim Şablonum', DATA);
    expect(tpl.custom).toBe(true);
    expect(tpl.name).toBe('Benim Şablonum');
    expect(tpl.domainId).toBe('textile');
    expect(tpl.seed.mainOps).toEqual(DATA.mainOps);
    expect(tpl.seed.scenarios).toBeUndefined();
    // kaydet → geri yükle döngüsü çalışır:
    const d = buildDataFromTemplate(tpl);
    expect(d.mainOps[0].name).toBe('X');
    expect(d.scenarios).toEqual([]);
  });

  it('save/list/delete döngüsü', () => {
    expect(listUserTemplates()).toEqual([]);
    const tpl = templateFromData('A', DATA);
    expect(saveUserTemplate(tpl)).toBe(true);
    expect(listUserTemplates()).toHaveLength(1);
    saveUserTemplate({ ...tpl, name: 'A2' });          // aynı id → günceller
    expect(listUserTemplates()).toHaveLength(1);
    expect(listUserTemplates()[0].name).toBe('A2');
    deleteUserTemplate(tpl.templateId);
    expect(listUserTemplates()).toEqual([]);
  });

  it('setItem patlarsa saveUserTemplate false döner', () => {
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(saveUserTemplate(templateFromData('X', DATA))).toBe(false);
  });

  it('bozuk localStorage çökertmez', () => {
    globalThis.localStorage.setItem('vsim_user_templates', '{bozuk');
    expect(listUserTemplates()).toEqual([]);
  });
});
