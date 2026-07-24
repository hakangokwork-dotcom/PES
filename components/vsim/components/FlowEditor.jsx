'use client';
import { useMemo, useCallback, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { subParent, childNodes } from '../engine/flow.js';
import { ensureFlowNodes } from '../engine/flowNodes.js';
import NodeInspector from './NodeInspector.jsx';

// Custom node: input/op/output — n8n benzeri kutu + sol/sağ handle
function FlowNode({ data }) {
  const { label, kind, sub, rate } = data;
  const tone = kind === 'input' ? '#0F6B5C' : kind === 'output' ? '#B45309' : '#3E6B8C';
  const kindLabel = kind === 'input' ? '⚡ Tetikleyici' : kind === 'output' ? 'Çıktı' : label;
  return (
    <div style={{ border: `2px solid ${tone}`, borderRadius: 10, background: '#fff',
      padding: '8px 12px', minWidth: 120, fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
      {kind !== 'input' && <Handle type="target" position={Position.Left} />}
      <div style={{ fontWeight: 600 }}>{kindLabel}</div>
      {kind === 'op' && <div style={{ color: '#64748b' }}>{sub?.cycleTime ?? 0} sn</div>}
      {rate != null && <div style={{ color: '#64748b', fontFamily: 'monospace' }}>{rate.toFixed(0)} ad/v</div>}
      {kind !== 'output' && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
const nodeTypes = { flow: FlowNode };

/* Bir konteynerin (aktif süreç) alt-op'larını React Flow node'ları olarak gösterir.
   input sol, output sağ; op'lar ortada. Handle'larla sürükle-bağla → nextIds günceller.
   input'tan çıkan bağlantı splitType:'SPLIT' (zaten input node'unda ayarlı).
   Node sürükleyince x/y kaydeder. containerId değişince (konteyner açılışı) eksik
   input/output node'ları garanti edilir — RENDER İÇİNDE DEĞİL: render sırasında onChange
   çağırmak (controlled state) sonsuz döngüye yol açar, bu yüzden useEffect ile yalnız
   containerId değiştiğinde bir kez yazılır; efekt güncel `data`'yı okur. */
export default function FlowEditor({ data, containerId, calc, onChange, onEnter }) {
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const withNodes = ensureFlowNodes(data, containerId);
    if (withNodes !== data) onChange(withNodes);
    // Yalnız konteyner değişince (açılışta) kontrol edilir; `data` bilerek deps dışında —
    // her düzenlemede yeniden tetiklenmesin (render-loop'tan kaçınma).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  // Konteyner değişince (içine gir / geri çık) seçili node farklı düzlemde kalır — kapat.
  useEffect(() => { setSelectedId(null); }, [containerId]);

  const kids = useMemo(
    () => (data.subOps || []).filter(s => subParent(s) === containerId),
    [data, containerId]);

  const nodes = useMemo(() => kids.map(s => ({
    id: s.id, type: 'flow',
    position: { x: s.x ?? 0, y: s.y ?? 0 },
    data: { label: s.name || s.id, kind: s.kind || 'op', sub: s, rate: calc?.thru?.[s.id] },
  })), [kids, calc]);

  const edges = useMemo(() => {
    const idset = new Set(kids.map(k => k.id));
    return kids.flatMap(s => (s.nextIds || [])
      .filter(n => idset.has(n))
      .map(n => ({ id: `${s.id}-${n}`, source: s.id, target: n })));
  }, [kids]);

  const writeKids = useCallback((updater) => {
    const next = (data.subOps || []).map(s => subParent(s) === containerId ? updater(s) : s);
    onChange({ ...data, subOps: next });
  }, [data, containerId, onChange]);

  const onConnect = useCallback((c) => {
    writeKids(s => s.id === c.source
      ? { ...s, nextIds: [...new Set([...(s.nextIds || []), c.target])] } : s);
  }, [writeKids]);

  const onNodeDragStop = useCallback((_e, node) => {
    writeKids(s => s.id === node.id ? { ...s, x: node.position.x, y: node.position.y } : s);
  }, [writeKids]);

  // Yalnız zaten alt-op'u olan düğümlere (gerçek konteynerler) çift tıkla → içine gir.
  const onNodeDoubleClick = useCallback((_e, node) => {
    if (!onEnter) return;
    if (childNodes(data, node.id).length > 0) onEnter(node.id);
  }, [data, onEnter]);

  return (
    <div style={{ height: 520, position: 'relative' }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onConnect={onConnect} onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={(_e, n) => setSelectedId(n.id)}
        onPaneClick={() => setSelectedId(null)} fitView>
        <Background /><Controls /><MiniMap />
      </ReactFlow>
      {selectedId && (
        <NodeInspector
          node={(data.subOps || []).find(s => s.id === selectedId)}
          data={data} calc={calc} containerId={containerId}
          onChange={onChange} onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
