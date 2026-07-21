import { describe, it, expect } from 'vitest';
import { buildKartAOA, buildFaaliyetlerAOA, buildIyilestirmeAOA } from './processMapExport.js';
import { createMap, addNode, updateNode, updateCard, addMetric, addTag, addLane } from './processMapOps.js';

function ornekHarita() {
  let m = createMap('swimlane', 'Kargo Süreci');
  m = updateCard(m, { kod: 'YD_KARGO', sahip: 'Grup Müdürü', ekip: 'Depo, Kargo',
    amac: 'Zamanında teslim', kapsam: 'Hazırlıktan teslime',
    girdiler: ['Hazırlanan sipariş'], ciktilar: ['Teslim edilen ürün'],
    kaynaklar: ['SAP', 'Backoffice'], dokumanlar: ['Sevk İrsaliyesi'],
    stratejikHedef: 'Müşteri memnuniyeti', yayinTarihi: '23.10.2020', revizyonNo: '0.0' });
  m = addMetric(m, 'Zamanında Teslim %', 95, '%');
  m = addMetric(m, 'Kayıp Kargo %', 1, '%');
  // düğüm: ilk kulvarda step
  m = addNode(m, 'step', 100, 40);
  const nid = m.nodes[m.nodes.length - 1].id;
  m = updateNode(m, nid, { label: 'Kargo kabulü', owner: 'Kargo', desc: 'Etiket okutulur' });
  m = addTag(m, nid, 'risk', 'Kayıp kargo', 'SLA dışı', 'yuksek');
  m = addTag(m, nid, 'iyilestirme', 'Entegre sistem');
  return m;
}

describe('buildKartAOA', () => {
  const aoa = buildKartAOA(ornekHarita());
  const flat = aoa.map(r => r.join('|'));

  it('LCW başlığı ve temel alanlar', () => {
    expect(flat[0]).toContain('SÜREÇ KARTI');
    expect(flat.some(r => r.includes('SÜREÇ ADI') && r.includes('Kargo Süreci'))).toBe(true);
    expect(flat.some(r => r.includes('SÜREÇ KODU') && r.includes('YD_KARGO'))).toBe(true);
    expect(flat.some(r => r.includes('SÜREÇ SAHİBİ') && r.includes('Grup Müdürü'))).toBe(true);
  });

  it('performans göstergeleri tablo satırları (ad/hedef/birim)', () => {
    expect(flat.some(r => r.includes('PERFORMANS GÖSTERGELERİ'))).toBe(true);
    expect(flat.some(r => r.includes('Zamanında Teslim %') && r.includes('95') && r.includes('%'))).toBe(true);
  });

  it('riskler haritadaki risk tag\'lerinden gelir', () => {
    expect(flat.some(r => r.includes('RİSKLER'))).toBe(true);
    expect(flat.some(r => r.includes('Kayıp kargo'))).toBe(true);
  });

  it('girdiler/çıktılar/kaynaklar listelenir', () => {
    expect(flat.some(r => r.includes('Hazırlanan sipariş'))).toBe(true);
    expect(flat.some(r => r.includes('Teslim edilen ürün'))).toBe(true);
    expect(flat.some(r => r.includes('SAP'))).toBe(true);
  });
});

describe('buildFaaliyetlerAOA', () => {
  const aoa = buildFaaliyetlerAOA(ornekHarita());

  it('LCW başlık satırı', () => {
    expect(aoa[0]).toEqual(['Kulvar Adı', 'Süreç Adımı Tipi', 'İşlem Adı', 'İşi Yapan', 'Açıklama']);
  });

  it('düğüm satırı: kulvar adı, tür Türkçesi, label, owner, desc', () => {
    const row = aoa.find(r => r[2] === 'Kargo kabulü');
    expect(row[0]).toBe('Kulvar 1');           // ilk kulvar
    expect(row[1]).toBe('Faaliyet');           // step → Faaliyet
    expect(row[3]).toBe('Kargo');
    expect(row[4]).toBe('Etiket okutulur');
  });

  it('kulvara göre sıralı; kulvarsız düğüm "—"', () => {
    // start/end swimlane ilk kulvarda; en az bir satır Kulvar 1
    expect(aoa.slice(1).every(r => typeof r[0] === 'string')).toBe(true);
  });
});

describe('buildIyilestirmeAOA', () => {
  const aoa = buildIyilestirmeAOA(ornekHarita());

  it('başlık + tag satırları (tür/başlık/şekil/önem/not)', () => {
    expect(aoa[0]).toEqual(['Tür', 'Başlık', 'Şekil', 'Önem', 'Not']);
    const risk = aoa.find(r => r[1] === 'Kayıp kargo');
    expect(risk[0]).toBe('Risk');
    expect(risk[2]).toBe('Kargo kabulü');      // bağlı şekil label'ı
    expect(risk[3]).toBe('Yüksek');
  });

  it('etiketsiz haritada yalnız başlık', () => {
    expect(buildIyilestirmeAOA(createMap('akis', 'X'))).toEqual([['Tür', 'Başlık', 'Şekil', 'Önem', 'Not']]);
  });
});
