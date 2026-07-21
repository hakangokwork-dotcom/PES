/* Süreç haritası → profesyonel çıktı için saf veri kurucuları (AOA = array-of-arrays).
   xlsx wrapper (UI) bu AOA'ları aoa_to_sheet'e verir. LCW "Süreç Kartı" + "Faaliyetler"
   şablon yapısını izler. Riskler haritanın risk tag'lerinden otomatik toplanır. */
import { NODE_SHAPE_LABELS, DEFAULT_CARD, TAG_TYPES } from './processMapOps.js';

const SEV = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };

export function buildKartAOA(map) {
  const c = map.card || DEFAULT_CARD;
  const riskler = map.tags.filter(t => t.type === 'risk').map(t => t.title);
  const liste = (arr) => (arr || []).length ? (arr || []) : ['—'];
  const rows = [];
  rows.push(['SÜREÇ KARTI']);
  rows.push([]);
  rows.push(['SÜREÇ ADI', map.name]);
  rows.push(['SÜREÇ KODU', c.kod || '—']);
  rows.push(['ÜST SÜREÇ', c.ustSurec || '—']);
  rows.push(['SÜREÇ SAHİBİ', c.sahip || '—']);
  rows.push(['YAYIN TARİHİ', c.yayinTarihi || '—', 'REVİZYON NO', c.revizyonNo || '—']);
  rows.push(['SÜREÇ EKİBİ', c.ekip || '—']);
  rows.push([]);
  rows.push(['AMAÇ', c.amac || '—']);
  rows.push(['KAPSAM', c.kapsam || '—']);
  rows.push([]);
  rows.push(['GİRDİLER']); liste(c.girdiler).forEach(g => rows.push(['', g]));
  rows.push(['ÇIKTILAR']); liste(c.ciktilar).forEach(g => rows.push(['', g]));
  rows.push([]);
  rows.push(['PERFORMANS GÖSTERGELERİ']);
  rows.push(['', 'Gösterge', 'Hedef', 'Birim']);
  if (c.metrikler.length) c.metrikler.forEach(m => rows.push(['', m.ad, m.hedef ?? '—', m.birim || '—']));
  else rows.push(['', '—', '—', '—']);
  rows.push([]);
  rows.push(['KAYNAKLAR']); liste(c.kaynaklar).forEach(g => rows.push(['', g]));
  rows.push(['DOKÜMANLAR']); liste(c.dokumanlar).forEach(g => rows.push(['', g]));
  rows.push(['RİSKLER']); (riskler.length ? riskler : ['—']).forEach(g => rows.push(['', g]));
  rows.push([]);
  rows.push(['İLİŞKİLİ STRATEJİK HEDEF', c.stratejikHedef || '—']);
  return rows;
}

export function buildFaaliyetlerAOA(map) {
  const laneName = (id) => map.lanes.find(l => l.id === id)?.name || '—';
  const laneOrder = (id) => { const l = map.lanes.find(x => x.id === id); return l ? l.order : 999; };
  const rows = [['Kulvar Adı', 'Süreç Adımı Tipi', 'İşlem Adı', 'İşi Yapan', 'Açıklama']];
  const sorted = [...map.nodes].sort((a, b) =>
    (laneOrder(a.laneId) - laneOrder(b.laneId)) || String(a.label).localeCompare(String(b.label), 'tr'));
  sorted.forEach(n => rows.push([
    laneName(n.laneId), NODE_SHAPE_LABELS[n.type] || n.type, n.label, n.owner || '', n.desc || '',
  ]));
  return rows;
}

export function buildIyilestirmeAOA(map) {
  const nodeLabel = (id) => map.nodes.find(n => n.id === id)?.label || '—';
  const rows = [['Tür', 'Başlık', 'Şekil', 'Önem', 'Not']];
  map.tags.forEach(t => rows.push([
    TAG_TYPES[t.type]?.ad || t.type, t.title, nodeLabel(t.nodeId), SEV[t.severity] || '—', t.note || '',
  ]));
  return rows;
}
