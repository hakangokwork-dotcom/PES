import React, { useEffect, useMemo, useState } from 'react';
import { Triangle, Clock, Timer, Percent, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { buildVsmModel, compareVsmTotals } from '../engine/vsm.js';
import { computeCapacity } from '../engine/capacity.js';
import { deriveEdges } from '../engine/migrate.js';
import { fmtSecShared } from '../engine/format.js';
import { useLabels, lower } from '../domains/DomainContext.jsx';
import InfoTip from './InfoTip.jsx';
import { confirmDialog, promptDialog } from './dialogs/dialogService.js';

const fmtSec = (s) => {
  if (s == null) return '—';
  if (s >= 3600) return `${(s / 3600).toFixed(1)} sa`;
  if (s >= 60) return `${(s / 60).toFixed(1)} dk`;
  return `${s % 1 === 0 ? s : s.toFixed(1)} sn`;
};

function DataRow({ k, v, note, term }) {
  return (
    <div className="flex justify-between gap-2 text-[11px] leading-5" title={note}>
      <span className="text-ink-faint">{k}{term && <> <InfoTip term={term} /></>}</span>
      <span className="text-ink-soft tabular-nums text-right">{v}</span>
    </div>
  );
}

const INFO_ONLY_NOTE = 'Bilgi amaçlı — hesaplara dahil değildir';

function ProcessBox({ p, isBottleneck, onEdit, onAddKaizen, kaizenCount, L }) {
  const ring = p.taktStatus === 'darbogaz' ? 'ring-2 ring-danger'
    : p.taktStatus === 'risk' ? 'ring-1 ring-warn' : '';
  return (
    <div className={`w-52 shrink-0 bg-surface border border-line rounded-[10px] shadow-card ${ring}`}>
      <div className="h-1 rounded-t-[10px]" style={{ background: p.color }} />
      <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="font-display font-semibold text-sm truncate" style={{ color: p.color }}>{p.name}</div>
          {p.isShared && <span title="Ortak istasyon — birden fazla akış besler" className="shrink-0 text-sm leading-none">🔗</span>}
          {kaizenCount > 0 && (
            <span title={`${kaizenCount} kaizen noktası`}
              className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold tabular-nums bg-info-tint text-info">
              {kaizenCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onAddKaizen} className="p-1 rounded hover:bg-surface-2 text-ink-faint text-sm leading-none" title="Kaizen noktası ekle">
            💥
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-surface-2 text-ink-faint" title="VSM alanlarını düzenle">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {isBottleneck && (
        <div className="mx-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-danger flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Darboğaz
        </div>
      )}
      <div className="px-3 pb-2 border-t border-line pt-1.5">
        <DataRow k="CT (en yavaş)" term="cevrim" v={fmtSec(p.ctSec || null)} />
        <DataRow k="C/O" term="co" v={fmtSec(p.changeoverSec)} note={INFO_ONLY_NOTE} />
        <DataRow k="Uptime" term="uptime" v={p.uptimePct != null ? `%${p.uptimePct}` : '—'} note={INFO_ONLY_NOTE} />
        <DataRow k="FPY" term="fpy" v={p.fpyPct != null ? `%${p.fpyPct}` : '—'} note={INFO_ONLY_NOTE} />
        <DataRow k="Vardiya" v={p.shifts ?? '—'} />
        <DataRow k={`${L.station} / ${L.person}`} v={`${p.subOpCount} / ${p.operatorCount || '—'}`} />
      </div>
    </div>
  );
}

// Bekleme etiketi eki: girilmiş → boş; tahmini → "(tahmini)"; darboğaz-hızıyla tahmini → "(tahmini · darboğaz hızıyla)"
const waitSuffix = (entry) => !entry?.estimated ? '' : (entry.bottleneckLimited ? ' (tahmini · darboğaz hızıyla)' : ' (tahmini)');

function InventoryTriangle({ inv, onClick, L }) {
  return (
    <button onClick={onClick}
      className="shrink-0 flex flex-col items-center justify-center px-2 group"
      title="Envanteri düzenle (adet / bekleme)">
      <Triangle className={`w-7 h-7 ${inv?.count != null ? 'text-warn fill-warn/20' : 'text-ink-faint'} group-hover:scale-110 transition`} />
      <div className="text-[11px] tabular-nums text-ink-soft mt-0.5">
        {inv?.count != null ? `${inv.count} ${lower(L.item)}` : '+ envanter'}
      </div>
      {inv?.waitSec != null && (
        <div className="text-[10px] text-ink-faint tabular-nums">
          {fmtSec(inv.waitSec)}{waitSuffix(inv)}
        </div>
      )}
    </button>
  );
}

function TotalCard({ icon: Icon, label, value, sub, tone = 'ink', term }) {
  const tones = { ink: 'text-ink', accent: 'text-accent-ink', warn: 'text-warn', danger: 'text-danger', ok: 'text-ok' };
  return (
    <div className="bg-surface border border-line rounded-[10px] shadow-card px-4 py-3 min-w-40">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}{term && <InfoTip term={term} />}
      </div>
      <div className={`font-mono text-xl font-semibold tabular-nums mt-1 ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function EdgeArrow() {
  return <div className="shrink-0 w-8 h-px bg-ink-soft relative self-center
    after:content-[''] after:absolute after:-right-0.5 after:-top-1 after:border-y-4 after:border-y-transparent after:border-l-[6px] after:border-l-ink-soft" />;
}

function CompareCell({ label, a, b, d, fmt, lowerIsBetter }) {
  const good = d != null && d !== 0 && (lowerIsBetter ? d < 0 : d > 0);
  const bad = d != null && d !== 0 && !good;
  return (
    <div className="border border-line rounded-lg p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{label}</div>
      <div className="font-mono tabular-nums text-sm mt-1 text-ink">{fmt(a)} → {fmt(b)}</div>
      <div className={`text-[11px] font-semibold tabular-nums mt-0.5
        ${good ? 'text-ok' : bad ? 'text-danger' : 'text-ink-faint'}`}>
        {d == null ? '—' : d === 0 ? '±0' : d < 0 ? `−${fmt(Math.abs(d))}` : `+${fmt(d)}`}
      </div>
    </div>
  );
}

// '__first__' hedefi bilinçli çözümsüz — Faz 3 ok çizimi bunu kullanacak (ölü kod değil).
const DEFAULT_INFO = (firstProcessName) => ({
  infoNodes: [
    { id: 'inf_sup', kind: 'supplier', name: 'Tedarikçi' },
    { id: 'inf_ctl', kind: 'control',  name: 'Üretim Kontrol' },
    { id: 'inf_cus', kind: 'customer', name: 'Müşteri' },
  ],
  infoEdges: [
    { from: 'inf_cus', to: 'inf_ctl', mode: 'electronic', label: 'Sipariş' },
    { from: 'inf_ctl', to: 'inf_sup', mode: 'manual', label: 'Sipariş' },
    { from: 'inf_ctl', to: '__first__', mode: 'manual', label: `Üretim Planı${firstProcessName ? ` → ${firstProcessName}` : ''}` },
  ],
});

function InfoBand({ data, firstProcessName, onPatch }) {
  const nodes = data.infoNodes || [];
  const edgesI = data.infoEdges || [];
  if (nodes.length === 0) {
    return (
      <div className="flex justify-center py-2">
        <button onClick={() => onPatch(() => DEFAULT_INFO(firstProcessName))}
          className="text-xs px-3 py-1.5 bg-surface border border-line rounded-lg hover:border-accent/50 text-ink-soft">
          + Bilgi akışı ekle (Tedarikçi · Üretim Kontrol · Müşteri)
        </button>
      </div>
    );
  }
  const byKind = (k) => nodes.find(n => n.kind === k);
  const rename = async (node) => {
    const name = await promptDialog({ message: 'Ad:', defaultValue: node.name });
    if (!name) return;
    onPatch(d => ({ infoNodes: (d.infoNodes || []).map(n => n.id === node.id ? { ...n, name } : n) }));
  };
  const toggleMode = (idx) => onPatch(d => ({
    infoEdges: (d.infoEdges || []).map((e, i) => i === idx ? { ...e, mode: e.mode === 'manual' ? 'electronic' : 'manual' } : e),
  }));
  const removeAll = async () => {
    if (!(await confirmDialog({ message: 'Bilgi akışı bandı kaldırılsın mı?', danger: true }))) return;
    onPatch(() => ({ infoNodes: [], infoEdges: [] }));
  };
  const NodeBox = ({ node }) => node ? (
    <button onClick={() => rename(node)} title="Adı düzenle"
      className="px-3 py-2 bg-surface border border-line rounded-lg shadow-card text-sm font-display font-semibold text-ink hover:border-accent/50">
      {node.kind === 'supplier' ? '📦 ' : node.kind === 'customer' ? '🏬 ' : '🗓 '}{node.name}
    </button>
  ) : null;
  return (
    <div className="bg-surface-2/50 border border-line rounded-[10px] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Bilgi Akışı</span>
        <button onClick={removeAll} className="text-[11px] text-ink-faint hover:text-danger">kaldır</button>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <NodeBox node={byKind('supplier')} />
        <div className="flex-1 flex flex-col items-center gap-1 min-w-40">
          {edgesI.map((e, i) => (
            <button key={i} onClick={() => toggleMode(i)}
              title="Moda tıkla: manuel ✉ / elektronik ⚡"
              className="text-[11px] text-ink-soft hover:text-accent-ink flex items-center gap-1">
              <span>{e.mode === 'electronic' ? '⚡' : '✉'}</span>
              <span className={e.mode === 'electronic' ? '' : 'underline decoration-dotted'}>{e.label}</span>
            </button>
          ))}
        </div>
        <NodeBox node={byKind('control')} />
        <div className="flex-1" />
        <NodeBox node={byKind('customer')} />
      </div>
    </div>
  );
}

export default function VsmView({ data, calc, scenarios, onEditMainOp, onUpdateEdge, onPatch }) {
  const L = useLabels();
  const model = useMemo(() => buildVsmModel(data, calc), [data, calc]);
  const [editInv, setEditInv] = useState(null);   // { from, to, count, waitSec, waitOverride }
  const [compareId, setCompareId] = useState(null);
  const cmp = useMemo(() => {
    if (!compareId) return null;
    const sc = (scenarios || []).find(s => s.id === compareId);
    if (!sc) return null;
    const snapData = {
      ...data,
      mainOps: sc.snapshot.mainOps, subOps: sc.snapshot.subOps,
      machines: sc.snapshot.machines || [], operators: sc.snapshot.operators || [],
      settings: sc.snapshot.settings ?? data.settings,
      // Eski kayıtlarda snapshot.edges yok — loadScenario ile tutarlı: mevcut edges'e düş
      // (aksi halde hedef bekleme 0 olur ve sahte yeşil delta üretir).
      edges: deriveEdges({ mainOps: sc.snapshot.mainOps, edges: sc.snapshot.edges ?? data.edges }),
    };
    const target = buildVsmModel(snapData, computeCapacity(snapData)).totals;
    return compareVsmTotals(model.totals, target);
  }, [compareId, scenarios, data, model]);

  const { processes, inventories, totals } = model;
  const hasBranch = (data.mainOps || []).some(m => (m.nextIds || []).length > 1);

  // Envanter modalını bir kenar (from/to) için açar — hem kritik-yol üçgenleri hem de
  // otherLinks (kritik-yol dışı) satırları aynı modalı paylaşır (düzenlenebilirlik kaybolmaz).
  const openInvModal = (inv) => {
    const entered = data.edges.find(e => e.from === inv.from && e.to === inv.to)?.inventoryWaitSec ?? null;
    setEditInv({ ...inv, waitOverride: entered });
  };

  // Kaizen patlamaları — süreç kutusuna bağlı (targetId = mainOp id)
  const [kaizenModal, setKaizenModal] = useState(null);  // { targetId, id?, title, note }
  const kaizens = data.kaizens || [];
  const saveKaizen = () => {
    const k = kaizenModal;
    if (!k.title?.trim()) return;
    onPatch(d => ({
      kaizens: k.id
        ? (d.kaizens || []).map(x => x.id === k.id ? { ...x, title: k.title.trim(), note: k.note } : x)
        : [...(d.kaizens || []), { id: 'kz_' + Math.random().toString(36).slice(2, 10), targetId: k.targetId, title: k.title.trim(), note: k.note || '' }],
    }));
    setKaizenModal(null);
  };
  const deleteKaizen = (id) => onPatch(d => ({ kaizens: (d.kaizens || []).filter(x => x.id !== id) }));

  // ESC ile açık modalı kapat (envanter veya kaizen)
  useEffect(() => {
    if (!editInv && !kaizenModal) return;
    const onKey = (e) => {
      if (e.isComposing) return;   // IME koruması: kompozisyon iptali modalı kapatmasın
      if (e.key === 'Escape') {
        setEditInv(null);
        setKaizenModal(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editInv, kaizenModal]);

  // Merdiven segmentleri (Task 2 entegrasyonu): model.ladder KRİTİK YOL sırasındaki
  // process/wait dizisidir — artık processes/inventories (topo sırası) yerine bundan çizilir.
  // Sıfır/veri-yok bekleme segmentleri (ve sıfır süreli işlem segmentleri) atlanır.
  const segments = (model.ladder || [])
    .filter(s => (s.sec || 0) > 0)
    .map(s => s.type === 'process'
      ? { type: 'process', sec: s.sec, label: fmtSec(s.sec), name: s.label }
      : { type: 'wait', sec: s.sec, label: fmtSec(s.sec) });
  const segTotal = segments.reduce((a, s) => a + s.sec, 0) || 1;

  // Süreç bandı çiftleri: üçgen yalnız KRİTİK-YOL ARDIŞIK çiftleri için (Task 2:
  // inventories artık topo-komşu değil, criticalPath[i]→criticalPath[i+1] kenarlarıdır).
  // NOT: processes topo sırasında dururken criticalPath bir ALT-KÜME olduğundan, bir
  // çatal/birleşmede kritik yolun iki ardışık düğümü arasına başka bir dal düğümü
  // render sırasında girebilir (örn. H→(Ön,Arka)→M: kritik yol H-Ön-M ama render sırası
  // H,Ön,Arka,M — Ön→M render-komşusu DEĞİL). Böyle "render-komşusu olmayan ama kritik
  // yolda olan" kenarlar hiç görünmez hale gelmesin diye aşağıda ek-bağlantı satırına eklenir.
  const bandPairs = processes.map((p, i) => {
    const prevP = i > 0 ? processes[i - 1] : null;
    const inv = prevP ? inventories.find(v => v && v.from === prevP.id && v.to === p.id) : null;
    return { p, prevP, inv };
  });
  const renderedInvKeys = new Set(bandPairs.filter(x => x.inv).map(x => `${x.inv.from}->${x.inv.to}`));
  const unrenderedPathLinks = inventories
    .filter(Boolean)
    .filter(inv => !renderedInvKeys.has(`${inv.from}->${inv.to}`))
    .map(l => ({ ...l, onCriticalPath: true }));
  const extraLinks = [...unrenderedPathLinks, ...(model.otherLinks || [])];

  if (processes.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-[10px] shadow-card p-10 text-center text-ink-faint">
        Haritalanacak süreç yok — önce Akış sekmesinde süreç adımlarını tanımlayın.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bilgi akışı bandı — tedarikçi/üretim kontrol/müşteri */}
      <InfoBand data={data} firstProcessName={processes[0]?.name} onPatch={onPatch} />

      {/* Süreç bandı */}
      <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
        <div className="overflow-x-auto">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-3">
            Mevcut Durum Haritası
            {hasBranch && <span className="normal-case font-normal text-ink-faint"> · dallı akış — toplamlar kritik (en uzun) yola göredir</span>}
          </div>
          <div className="flex items-stretch">
            {bandPairs.map(({ p, prevP, inv }) => (
              <React.Fragment key={p.id}>
                {prevP && (inv
                  ? <InventoryTriangle inv={inv} L={L} onClick={() => openInvModal(inv)} />
                  : <EdgeArrow />)}
                <ProcessBox p={p} isBottleneck={p.id === totals.bottleneckId} L={L}
                  onEdit={() => onEditMainOp(p.id)}
                  onAddKaizen={() => setKaizenModal({ targetId: p.id, title: '', note: '' })}
                  kaizenCount={kaizens.filter(k => k.targetId === p.id).length} />
              </React.Fragment>
            ))}
          </div>
        </div>
        {extraLinks.length > 0 && (
          <div className="mt-2 text-[11px] text-ink-faint flex flex-wrap gap-x-4 gap-y-1">
            {extraLinks.map((l, i) => {
              const f = processes.find(p => p.id === l.from)?.name || l.from;
              const t = processes.find(p => p.id === l.to)?.name || l.to;
              return (
                <button key={i} type="button" onClick={() => openInvModal(l)}
                  className="hover:text-accent-ink hover:underline underline-offset-2 text-left"
                  title={l.onCriticalPath
                    ? 'Kritik yolda — dallanma nedeniyle bantta gösterilemiyor; envanteri düzenle (adet / bekleme)'
                    : 'Kritik yol dışı bağlantı — envanteri düzenle (adet / bekleme)'}>
                  ↷ {f} → {t}{l.onCriticalPath ? ' · kritik yol' : ''}{l.count != null ? ` · ${l.count} ${lower(L.item)}${l.waitSec != null ? ` · ${fmtSec(l.waitSec)}${waitSuffix(l)}` : ''}` : ''}
                </button>
              );
            })}
          </div>
        )}
        {totals.offPathWaitSec > 0 && (
          <div className="mt-1 text-[11px] text-ink-faint">
            yol dışı bekleme: {fmtSec(totals.offPathWaitSec)} — toplama dahil değildir (paralel dal)
          </div>
        )}
      </div>

      {/* Zaman merdiveni */}
      <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-3">
          Zaman Merdiveni <span className="normal-case font-normal text-ink-faint">· üst = bekleme (NVA) · alt = işlem (VA)</span>
        </div>
        <div className="flex h-16 items-stretch rounded overflow-hidden border border-line">
          {segments.length === 0 && <div className="flex-1 flex items-center justify-center text-[11px] text-ink-faint">Çevrim süresi girilmemiş</div>}
          {segments.map((s, i) => (
            <div key={i} style={{ width: `${Math.max((s.sec / segTotal) * 100, 4)}%` }}
              className={`flex flex-col ${s.type === 'wait' ? '' : ''}`} title={s.name ? `${s.name}: ${s.label}` : s.label}>
              <div aria-hidden={s.type !== 'wait' || undefined}
                className={`flex-1 flex items-center justify-center text-[10px] tabular-nums truncate px-0.5
                ${s.type === 'wait' ? 'bg-warn-tint text-warn' : 'bg-transparent text-transparent'}`}>
                {s.type === 'wait' ? s.label : '.'}
              </div>
              <div aria-hidden={s.type !== 'process' || undefined}
                className={`flex-1 flex items-center justify-center text-[10px] tabular-nums truncate px-0.5
                ${s.type === 'process' ? 'bg-accent-tint text-accent-ink' : 'bg-transparent text-transparent'}`}>
                {s.type === 'process' ? s.label : '.'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Özet */}
      <div className="flex flex-wrap gap-3">
        <TotalCard icon={Clock} label="Takt Time" term="takt"
          value={totals.taktSec === Infinity ? '—' : totals.taktSec < 120
            ? `${totals.taktSec % 1 === 0 ? totals.taktSec : totals.taktSec.toFixed(1)} sn`
            : fmtSec(totals.taktSec)}
          tone="accent" />
        <TotalCard icon={Timer} label="Toplam İşlem (VA)" term="va" value={fmtSec(totals.processSec)} />
        <TotalCard icon={Timer} label="Toplam Bekleme (NVA)" term="nva" value={totals.waitSec > 0 ? fmtSec(totals.waitSec) : '—'} tone="warn" />
        <TotalCard icon={Clock} label="Lead Time" term="leadTime" value={totals.waitSec > 0 ? fmtSec(totals.leadSec) : '—'} />
        <TotalCard icon={Percent} label="PCE (Değer Katma)" term="pce"
          value={totals.pcePct != null ? `%${totals.pcePct.toFixed(1)}` : '—'}
          sub={totals.pceBand ?? 'envanter girilmedi'}
          tone={totals.pceBand === 'kritik' ? 'danger' : totals.pceBand === 'ortalama' ? 'warn' : totals.pcePct != null ? 'ok' : 'ink'} />
      </div>

      {/* Kaizen Noktaları */}
      {kaizens.length > 0 && (
        <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-2">💥 Kaizen Noktaları ({kaizens.length})</div>
          <ul className="divide-y divide-line">
            {kaizens.map(k => {
              const target = processes.find(p => p.id === k.targetId);
              return (
                <li key={k.id} className="py-2 flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-semibold text-ink">{k.title}</span>
                    {target && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-soft">{target.name}</span>}
                    {k.note && <div className="text-[12px] text-ink-soft mt-0.5">{k.note}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setKaizenModal({ ...k })} className="p-1 rounded hover:bg-surface-2 text-ink-faint" title="Düzenle"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteKaizen(k.id)} className="p-1 rounded hover:bg-danger-tint text-danger" title="Sil"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Karşılaştırma — kayıtlı harita versiyonuyla */}
      {(scenarios?.length ?? 0) > 0 && (
        <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Karşılaştır — kayıtlı modelle (mevcut → hedef)
            </div>
            <select className="bg-surface border border-line rounded-lg px-2 py-1 text-sm"
              value={compareId ?? ''} onChange={e => setCompareId(e.target.value || null)}>
              <option value="">— model seç —</option>
              {scenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
          </div>
          {cmp && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* D4: her süre satırı a/b/delta'yı ORTAK birimde gösterir (fmtSecShared) — karışık "1.5 sa → 45.0 dk" olmaz */}
              <CompareCell label="İşlem (VA)" a={cmp.current.processSec} b={cmp.target.processSec} d={cmp.deltas.processSec} fmt={fmtSecShared([cmp.current.processSec, cmp.target.processSec, cmp.deltas.processSec])} lowerIsBetter={false} />
              <CompareCell label="Bekleme (NVA)" a={cmp.current.waitSec} b={cmp.target.waitSec} d={cmp.deltas.waitSec} fmt={fmtSecShared([cmp.current.waitSec, cmp.target.waitSec, cmp.deltas.waitSec])} lowerIsBetter />
              <CompareCell label="Lead Time" a={cmp.current.leadSec} b={cmp.target.leadSec} d={cmp.deltas.leadSec} fmt={fmtSecShared([cmp.current.leadSec, cmp.target.leadSec, cmp.deltas.leadSec])} lowerIsBetter />
              <CompareCell label="PCE" a={cmp.current.pcePct} b={cmp.target.pcePct} d={cmp.deltas.pcePct}
                fmt={(v) => v != null ? `%${v.toFixed(1)}` : '—'} lowerIsBetter={false} />
            </div>
          )}
        </div>
      )}

      {/* Envanter düzenleme modalı */}
      {editInv && (
        <div role="dialog" aria-modal="true" aria-label="Envanter — süreçler arası"
          className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setEditInv(null)}>
          <div className="bg-surface rounded-[14px] shadow-card p-5 w-80 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-ink mb-3">Envanter — süreçler arası</h3>
            <label className="block text-[12px] font-semibold text-ink-soft mb-1">Adet ({lower(L.itemPlural)})</label>
            <input type="number" min="0" autoFocus
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              value={editInv.count ?? ''}
              onChange={e => setEditInv(v => ({ ...v, count: e.target.value === '' ? null : Number(e.target.value) }))} />
            <label className="block text-[12px] font-semibold text-ink-soft mb-1">Bekleme (sn) <span className="font-normal text-ink-faint">— boş bırak: Little's Law tahmini</span></label>
            <input type="number" min="0"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              value={editInv.waitOverride ?? ''}
              onChange={e => setEditInv(v => ({ ...v, waitOverride: e.target.value === '' ? null : Number(e.target.value) }))} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditInv(null)} className="px-3 py-1.5 text-sm rounded-lg text-ink-soft hover:bg-surface-2">Vazgeç</button>
              <button onClick={() => {
                onUpdateEdge(editInv.from, editInv.to, {
                  // Negatif adet/bekleme kaydetme (lead time'ı düşürür)
                  inventoryCount: editInv.count != null ? Math.max(0, editInv.count) : null,
                  inventoryWaitSec: editInv.waitOverride != null ? Math.max(0, editInv.waitOverride) : null,
                });
                setEditInv(null);
              }} className="px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-strong text-white">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Kaizen düzenleme modalı */}
      {kaizenModal && (
        <div role="dialog" aria-modal="true" aria-label="Kaizen noktası"
          className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setKaizenModal(null)}>
          <div className="bg-surface rounded-[14px] shadow-card p-5 w-80 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-ink mb-3">💥 Kaizen noktası</h3>
            <label className="block text-[12px] font-semibold text-ink-soft mb-1">Başlık</label>
            <input type="text" autoFocus
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              value={kaizenModal.title}
              onChange={e => setKaizenModal(v => ({ ...v, title: e.target.value }))} />
            <label className="block text-[12px] font-semibold text-ink-soft mb-1">Not <span className="font-normal text-ink-faint">(opsiyonel)</span></label>
            <textarea rows={3}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              value={kaizenModal.note ?? ''}
              onChange={e => setKaizenModal(v => ({ ...v, note: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setKaizenModal(null)} className="px-3 py-1.5 text-sm rounded-lg text-ink-soft hover:bg-surface-2">Vazgeç</button>
              <button onClick={saveKaizen} className="px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-strong text-white">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
