import { uid, subParent } from './flow.js';

/* Bir konteyner için varsayılan akış node'ları garanti eder (idempotent).
   input: girdi (SPLIT=böl varsayılan) · output: çıktı (DUP=topla varsayılan).
   Gerçek op'lara otomatik bağlanmaz — bağlamayı kullanıcı çizer. Saf: yeni data döner. */
export function ensureFlowNodes(data, containerId) {
  const kids = (data.subOps || []).filter(s => subParent(s) === containerId);
  const has = (kind) => kids.some(s => s.kind === kind);
  const add = [];
  if (!has('input')) {
    add.push({ id: uid(), mainOpId: containerId, parentId: containerId, kind: 'input',
      name: 'Girdi', cycleTime: 0, nextIds: [], splitType: 'SPLIT', x: 40, y: 120 });
  }
  if (!has('output')) {
    add.push({ id: uid(), mainOpId: containerId, parentId: containerId, kind: 'output',
      name: 'Çıktı', cycleTime: 0, nextIds: [], joinType: 'DUP', x: 520, y: 120 });
  }
  if (add.length === 0) return data;
  return { ...data, subOps: [...(data.subOps || []), ...add] };
}
