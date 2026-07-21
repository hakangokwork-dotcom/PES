/* Akış tuvali topolojik kolon yerleşimi — saf, UI'sız.
   Kahn katmanlama: sıfır-giriş düğümleri kuyruğa alınır, işlenen düğüm ardıllarının
   giriş derecesini düşürür; 0'a inen bir sonraki dalgaya girer. Dalga indeksi = kolon =
   kaynaktan EN UZUN yol derinliği (düğüm TÜM öncüllerinden sonra çizilir).
   Döngüde kalanlar (giriş derecesi hiç 0'a inmeyenler) max+1 kolonuna gider ve NORMAL
   satır indeksi alır — eski üçlü-kopya BFS'in indexOf→-1 → y=-80 hatası burada düzeltildi (spec §2). */

export const LANE_X_GAP = 250;
export const LANE_Y_GAP = 150;
export const LAYOUT_X0 = 60;
export const LAYOUT_Y0 = 50;

export function levelLayout(nodes) {
  if (!nodes.length) return {};
  const idset = new Set(nodes.map(n => n.id));
  const inDeg = Object.fromEntries(nodes.map(n => [n.id, 0]));
  nodes.forEach(n => (n.nextIds || []).forEach(x => { if (idset.has(x)) inDeg[x]++; }));

  const levels = {};
  let q = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
  let lvl = 0;
  while (q.length) {
    const nx = [];
    q.forEach(id => {
      levels[id] = lvl;
      const n = nodes.find(o => o.id === id);
      (n.nextIds || []).forEach(m => { if (idset.has(m)) { inDeg[m]--; if (inDeg[m] === 0) nx.push(m); } });
    });
    q = [...new Set(nx)];
    lvl++;
  }

  // Döngü üyeleri ve döngüden beslenenler (derecesi 0'a inmeyenler) → son kolonun bir sağı
  const maxLvl = Math.max(-1, ...Object.values(levels));
  nodes.forEach(n => { if (levels[n.id] === undefined) levels[n.id] = maxLvl + 1; });

  // byLevel TAM seviye haritasından kurulur — her düğüm geçerli satır indeksi alır
  const byLevel = {};
  nodes.forEach(n => { const l = levels[n.id]; (byLevel[l] = byLevel[l] || []).push(n.id); });

  const pos = {};
  nodes.forEach(n => {
    const l = levels[n.id];
    const idx = byLevel[l].indexOf(n.id);
    pos[n.id] = { x: LAYOUT_X0 + l * LANE_X_GAP, y: LAYOUT_Y0 + idx * LANE_Y_GAP };
  });
  return pos;
}
