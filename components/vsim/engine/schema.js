/* Hafif v4 şema doğrulayıcı — bağımlılıksız (B5).
   Amaç: bozuk/elle düzenlenmiş JSON'un render katmanına ulaşmadan yakalanması.
   Kural: zorunlu alan az, tip kontrolü sıkı; bilinmeyen alanlar serbest (ileri sürüm). */

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isOptNum = (v) => v == null || isNum(v);
const isArr = Array.isArray;

export function validateV4(data) {
  const errors = [];
  const err = (m) => errors.push(m);

  if (!data || typeof data !== 'object' || isArr(data)) {
    return { ok: false, errors: ['veri obje değil'] };
  }

  for (const k of ['mainOps', 'subOps', 'machines', 'operators', 'scenarios', 'edges', 'infoNodes', 'infoEdges', 'kaizens', 'processMaps']) {
    if (data[k] != null && !isArr(data[k])) err(`${k} dizi olmalı`);
  }

  (isArr(data.mainOps) ? data.mainOps : []).forEach((m, i) => {
    if (!m || typeof m !== 'object') return err(`mainOps[${i}] obje değil`);
    if (!isStr(m.id)) err(`mainOps[${i}].id string olmalı`);
    if (m.nextIds != null && !isArr(m.nextIds)) err(`mainOps[${i}].nextIds dizi olmalı`);
    for (const f of ['x', 'y', 'order', 'changeoverSec', 'uptimePct', 'fpyPct', 'shifts', 'machineCount']) {
      if (!isOptNum(m[f])) err(`mainOps[${i}].${f} sayı olmalı`);
    }
  });

  (isArr(data.subOps) ? data.subOps : []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return err(`subOps[${i}] obje değil`);
    if (!isStr(s.id)) err(`subOps[${i}].id string olmalı`);
    if (s.nextIds != null && !isArr(s.nextIds)) err(`subOps[${i}].nextIds dizi olmalı`);
    for (const f of ['cycleTime', 'stationCount']) {
      if (!isOptNum(s[f])) err(`subOps[${i}].${f} sayı olmalı`);
    }
  });

  const st = data.settings;
  if (st != null) {
    if (typeof st !== 'object' || isArr(st)) err('settings obje olmalı');
    else for (const f of ['netMinutes', 'efficiency', 'pfd', 'demand']) {
      if (!isOptNum(st[f])) err(`settings.${f} sayı olmalı`);
    }
  }

  (isArr(data.edges) ? data.edges : []).forEach((e, i) => {
    if (!e || typeof e !== 'object') return err(`edges[${i}] obje değil`);
    if (!isOptNum(e.inventoryCount) || !isOptNum(e.inventoryWaitSec)) err(`edges[${i}] envanter alanları sayı olmalı`);
  });

  (isArr(data.processMaps) ? data.processMaps : []).forEach((pm, i) => {
    if (!pm || typeof pm !== 'object') return err(`processMaps[${i}] obje değil`);
    if (!isStr(pm.id)) err(`processMaps[${i}].id string olmalı`);
    if (!isStr(pm.name)) err(`processMaps[${i}].name string olmalı`);
    for (const k of ['lanes', 'nodes', 'edges', 'tags']) {
      if (pm[k] != null && !isArr(pm[k])) err(`processMaps[${i}].${k} dizi olmalı`);
    }
    (isArr(pm.nodes) ? pm.nodes : []).forEach((n, j) => {
      if (!n || typeof n !== 'object') return err(`processMaps[${i}].nodes[${j}] obje değil`);
      if (!isOptNum(n.x) || !isOptNum(n.y)) err(`processMaps[${i}].nodes[${j}] x/y sayı olmalı`);
      if (n.owner != null && !isStr(n.owner)) err(`processMaps[${i}].nodes[${j}].owner string olmalı`);
      if (n.desc != null && !isStr(n.desc)) err(`processMaps[${i}].nodes[${j}].desc string olmalı`);
      // n.type forward-tolerant: bilinmeyen tür kabul edilir (yeni sürüm olabilir)
    });

    const card = pm.card;
    if (card != null) {
      if (typeof card !== 'object' || isArr(card)) err(`processMaps[${i}].card obje olmalı`);
      else if (card.metrikler != null) {
        if (!isArr(card.metrikler)) err(`processMaps[${i}].card.metrikler dizi olmalı`);
        else card.metrikler.forEach((met, k) => {
          if (!met || typeof met !== 'object') return err(`processMaps[${i}].card.metrikler[${k}] obje değil`);
          if (!isStr(met.ad)) err(`processMaps[${i}].card.metrikler[${k}].ad string olmalı`);
        });
      }
    }

    const sketch = pm.sketch;
    if (sketch != null) {
      if (typeof sketch !== 'object' || isArr(sketch)) err(`processMaps[${i}].sketch obje olmalı`);
      else {
        if (sketch.strokes != null && !isArr(sketch.strokes)) err(`processMaps[${i}].sketch.strokes dizi olmalı`);
        else (isArr(sketch.strokes) ? sketch.strokes : []).forEach((st, k) => {
          if (!st || typeof st !== 'object') return err(`processMaps[${i}].sketch.strokes[${k}] obje değil`);
          if (st.points != null && !isArr(st.points)) err(`processMaps[${i}].sketch.strokes[${k}].points dizi olmalı`);
        });
        if (sketch.texts != null && !isArr(sketch.texts)) err(`processMaps[${i}].sketch.texts dizi olmalı`);
        if (sketch.shapes != null && !isArr(sketch.shapes)) err(`processMaps[${i}].sketch.shapes dizi olmalı`);
        if (sketch.stickies != null && !isArr(sketch.stickies)) err(`processMaps[${i}].sketch.stickies dizi olmalı`);
        if (sketch.stamps != null && !isArr(sketch.stamps)) err(`processMaps[${i}].sketch.stamps dizi olmalı`);
        if (sketch.comments != null && !isArr(sketch.comments)) err(`processMaps[${i}].sketch.comments dizi olmalı`);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
