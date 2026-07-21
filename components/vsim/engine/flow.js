/* İç içe (recursive) akış — paylaşılan traversal yardımcıları.
   Ana op'lar sanal kök (ROOT_ID) altında; alt op'lar parentId ile
   bir ana op'a VEYA başka bir alt op'a bağlanır (sınırsız derinlik).
   Eski veri: alt op'ta parentId yoksa mainOpId kullanılır. */

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ROOT_ID = '__root__';

export const subParent = (s) => s.parentId ?? s.mainOpId;

export const childNodes = (data, cid) =>
  cid === ROOT_ID ? (data.mainOps || []) : (data.subOps || []).filter(s => subParent(s) === cid);

export const isMainNode = (data, id) => (data.mainOps || []).some(m => m.id === id);

export const findNode = (data, id) =>
  (data.mainOps || []).find(m => m.id === id) || (data.subOps || []).find(s => s.id === id) || null;

// Bir konteynerin (alt op olabilir) ait olduğu kök ana op id'si
export const rootMainId = (data, cid) => {
  let c = cid, guard = 0;
  while (c && c !== ROOT_ID && guard++ < 100) {
    if (isMainNode(data, c)) return c;
    const s = (data.subOps || []).find(x => x.id === c);
    c = s ? subParent(s) : ROOT_ID;
  }
  return null;
};

// id'nin tüm alt-ağaç torunları (kendisi hariç)
export const descendantIds = (data, id) => {
  const out = [];
  const walk = (cid) => childNodes(data, cid).forEach(k => { out.push(k.id); walk(k.id); });
  walk(id);
  return out;
};

/* from→to kenarı eklenirse döngü oluşur mu? to'dan nextIds izlenerek from'a
   ulaşılabiliyorsa evet. nodes: aynı düzlemdeki düğüm listesi ({id, nextIds});
   liste dışına işaret eden nextIds yok sayılır. Saf — UI'sız. */
export const wouldCreateCycle = (nodes, fromId, toId) => {
  if (fromId === toId) return true;
  const byId = new Map((nodes || []).map(n => [n.id, n]));
  const stack = [toId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === fromId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    ((byId.get(id) || {}).nextIds || []).forEach(n => { if (byId.has(n)) stack.push(n); });
  }
  return false;
};
