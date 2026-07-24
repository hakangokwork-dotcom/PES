'use client';
import { nodeHealth } from '../engine/nodeHealth.js';
import { subParent } from '../engine/flow.js';

const STATUS = {
  gecirgen: { label: 'Geçirgen', color: '#64748b' },
  bos: { label: 'Boş', color: '#94a3b8' },
  darbogaz: { label: 'Darboğaz', color: '#dc2626' },
  ac: { label: 'Aç (kapasite fazla)', color: '#d97706' },
  normal: { label: 'Normal', color: '#0F6B5C' },
};
const fmt = (v) => (v == null ? '—' : v === Infinity ? '∞' : Number(v).toFixed(0));

export default function NodeInspector({ node, data, calc, containerId, onChange, onClose }) {
  if (!node) return null;
  const kind = node.kind || 'op';
  const h = nodeHealth(node, calc, containerId);
  const st = STATUS[h.status] || STATUS.normal;
  const kids = (data.subOps || []).filter(s => subParent(s) === containerId);
  const feeders = kids.filter(s => (s.nextIds || []).includes(node.id));
  const label = kind === 'input' ? 'Tetikleyici / Girdi' : kind === 'output' ? 'Çıktı (birleşme)' : node.name || node.id;

  const patch = (p) => onChange({ ...data, subOps: (data.subOps || []).map(s => s.id === node.id ? { ...s, ...p } : s) });

  return (
    <div style={{ position: 'absolute', top: 8, right: 8, width: 260, background: '#fff',
      border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      padding: 12, fontSize: 12, zIndex: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b>{label}</b>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      {/* GİRDİ */}
      <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 6 }}>Girdi</div>
      {kind === 'input'
        ? <div>Talep / üst süreç (sınırsız kaynak)</div>
        : feeders.length
          ? feeders.map(f => <div key={f.id} style={{ fontFamily: 'monospace' }}>{f.name || f.id}: {fmt(calc.thru?.[f.id])} ad/v</div>)
          : <div>— (bağlı besleyen yok)</div>}

      {/* NODE */}
      {kind === 'op' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}>Node</div>
          <div>Çevrim: {node.cycleTime ?? 0} sn · Kapasite: {fmt(h.cap)} ad/v</div>
        </div>
      )}

      {/* ÇIKTI + sağlık */}
      <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 8 }}>Çıktı</div>
      <div style={{ fontFamily: 'monospace' }}>{fmt(h.out)} ad/v{h.utilPct != null ? ` · %${h.utilPct.toFixed(0)} kullanım` : ''}</div>
      <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 999,
        background: st.color + '22', color: st.color, fontWeight: 600 }}>{st.label}</div>

      {/* BÖL/BİRLEŞ toggle */}
      <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}>Dağıtım (çıkış)</div>
        <select value={node.splitType || 'DUP'} onChange={e => patch({ splitType: e.target.value })} style={{ width: '100%' }}>
          <option value="SPLIT">Böl — her parça bir dala (paralel/yedek)</option>
          <option value="DUP">Kopyala — her parça tüm dallara (ardışık)</option>
        </select>
        <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 6 }}>Birleşme (giriş)</div>
        <select value={node.joinType || 'AND'} onChange={e => patch({ joinType: e.target.value })} style={{ width: '100%' }}>
          <option value="DUP">Topla — kapasiteler toplanır (aynı iş)</option>
          <option value="AND">Senkron — en yavaşa göre (farklı iş)</option>
        </select>
      </div>
    </div>
  );
}
