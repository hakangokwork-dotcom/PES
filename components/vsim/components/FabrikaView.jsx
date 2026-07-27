import React, { useMemo } from 'react';
import { factoryZones, serpentineRows, stationQueue, zoneInbox } from '../engine/factoryLayout.js';
import { useLabels, lower } from '../domains/DomainContext.jsx';

/* Fabrika kuş bakışı — şematik serpantin hat (bkz. spec 2026-07-27).
   Saf çizim: tüm türetmeler engine/factoryLayout.js'te. SimView'ın tick'iyle
   yeniden render olur; kendi state'i yok. */

const SATIR_HEDEF = 14;   // satır başına hedef istasyon sayısı (deterministik bölme)

/* △ WIP üçgeni — sayı içeride; miktara göre koyulaşır, darboğazda kırmızı */
function WipTri({ count, danger, title }) {
  if (!count || count <= 0) return null;
  const cls = danger ? 'text-danger' : count < 3 ? 'text-warn/60' : count < 8 ? 'text-warn' : 'text-danger/80';
  return (
    <div className={`relative flex-shrink-0 ${cls}`} style={{ width: 30, height: 27 }} title={title}>
      <svg width="30" height="27" viewBox="0 0 30 27">
        <path d="M15 2 L28 25 L2 25 Z" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      <span className="absolute inset-x-0 top-[10px] text-center text-[9px] font-mono font-bold text-ink tabular-nums">
        {count > 99 ? '99+' : count}
      </span>
    </div>
  );
}

/* Bölgeler arası düz ok — akış yönüne bakar */
function FlowArrow({ left }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" className="flex-shrink-0 text-ink-faint" style={left ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M1 6 H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 1.5 L24 6 L17 10.5 Z" fill="currentColor" />
    </svg>
  );
}

/* Satır sonu kıvrımlı ok — hat alt satıra iner (U-borusu değil, tek zarif ok) */
function TurnArrow({ mirrored }) {
  return (
    <svg width="52" height="40" viewBox="0 0 52 40" className="text-ink-faint" style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 8 H30 Q42 8 42 20 V26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M36.5 25 L42 36 L47.5 25 Z" fill="currentColor" />
    </svg>
  );
}

/* Tek istasyon kutusu — ikonsuz, sayı odaklı (kısaltılmış ad, tam ad tooltip) */
function StationBox({ s, simState, isWorst, itemLower, personName }) {
  const ip = simState.inProgress[s.id];
  const completed = simState.completed[s.id] || 0;
  const frame = isWorst
    ? 'border-danger bg-danger-tint/40'
    : ip ? 'border-ok bg-ok-tint/40' : 'border-line bg-surface';
  const tip = [
    s.name,
    `çevrim ${s.cycleTime} sn`,
    personName ? `operatör: ${personName}` : 'operatör atanmamış',
    `çıkan ${completed} ${itemLower}`,
    ip ? `işleniyor (${ip.remainingSec.toFixed(0)} sn kaldı)` : 'boşta',
    isWorst ? '⚠ darboğaz (en yüksek zirve kuyruk)' : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className={`w-[76px] flex-shrink-0 border-[1.5px] rounded-lg px-1 py-1 text-center transition-colors ${frame}`} title={tip}>
      <div className="text-[9px] font-medium text-ink-soft truncate leading-tight">{s.name}</div>
      <div className={`text-[15px] font-mono font-bold leading-tight tabular-nums ${isWorst ? 'text-danger' : 'text-ink'}`}>
        {completed}
      </div>
      <div className="text-[8px] text-ink-faint font-mono truncate leading-tight">
        {personName ? '👤' : ''}{personName ? ' ' : ''}{s.cycleTime} sn
        {ip && <span className="text-ok"> ●</span>}
      </div>
    </div>
  );
}

export default function FabrikaView({ data, simState, worstStationId, projectedEOD }) {
  const L = useLabels();
  const itemLower = lower(L.item);
  const zones = useMemo(() => factoryZones(data), [data]);
  const rows = useMemo(() => serpentineRows(zones, SATIR_HEDEF), [zones]);
  const opName = (id) => (data.operators || []).find(o => o.id === id)?.name || null;

  if (zones.length === 0) {
    return (
      <div className="text-sm text-ink-faint italic text-center py-10">
        Gösterilecek istasyon yok — Operasyonlar sekmesinden çevrim süreli 2.Seviye süreç ekleyin.
      </div>
    );
  }

  const lastRow = rows[rows.length - 1];

  return (
    <div className="space-y-1 select-none">
      {rows.map((row, ri) => (
        <React.Fragment key={ri}>
          <div className={`flex items-stretch gap-2 ${row.reverse ? 'flex-row-reverse' : ''}`}>
            {row.zones.map((z, zi) => {
              const inbox = zoneInbox(simState, z.id);
              const zoneQueues = z.stations.reduce((a, s) => a + stationQueue(simState, s.id), 0);
              return (
                <React.Fragment key={z.id}>
                  {/* Bölge girişi: önceki bölgeden gelen ok + bölge-arası △ (satır başı hariç) */}
                  {(zi > 0 || ri > 0) && (
                    <div className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0">
                      <FlowArrow left={row.reverse} />
                      <WipTri count={inbox} title={`${z.name} önünde bekleyen ${inbox} ${itemLower} (bölgeler arası)`} />
                    </div>
                  )}
                  <div className="border-[1.5px] border-dashed border-line rounded-[10px] bg-surface px-2 pt-1.5 pb-2 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#94a3b8' }} />
                      <span className="font-display font-semibold text-ink uppercase tracking-wide truncate">{z.name}</span>
                      <span className="ml-auto font-mono tabular-nums text-ink-soft flex-shrink-0"
                        title={`${z.personCount} operatör · bölge içinde bekleyen ${zoneQueues + inbox} ${itemLower}`}>
                        {z.personCount > 0 && <>👤{z.personCount}</>}
                        {(zoneQueues + inbox) > 0 && <span className="text-warn ml-1">△{zoneQueues + inbox}</span>}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1 flex-wrap ${row.reverse ? 'flex-row-reverse' : ''}`}>
                      {z.stations.map((s, si) => {
                        const q = stationQueue(simState, s.id);
                        const isWorst = worstStationId === s.id && (simState.peakQueue[s.id] || 0) > 3;
                        return (
                          <React.Fragment key={s.id}>
                            {si > 0 && q > 0 && (
                              <WipTri count={q} danger={isWorst}
                                title={`${s.name} önünde bekleyen ${q} ${itemLower}`} />
                            )}
                            <StationBox s={s} simState={simState} isWorst={isWorst}
                              itemLower={itemLower} personName={opName(s.operatorId)} />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {/* Hat sonu: bitmiş ürün kutusu son satırın akış-sonunda */}
            {ri === rows.length - 1 && (
              <div className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center justify-center mr-2 ml-1" style={row.reverse ? { transform: 'scaleX(-1)' } : undefined}>
                  <FlowArrow />
                </div>
                <div className="bg-ok text-white rounded-[10px] px-3 py-2 text-center shadow-card"
                  title={`Hattan çıkan bitmiş ${lower(L.itemPlural)}${projectedEOD != null ? ` · gün sonu tahmini ${projectedEOD}` : ''}`}>
                  <div className="text-[9px] font-medium opacity-90">✅ bitmiş {itemLower}</div>
                  <div className="text-xl font-mono font-bold tabular-nums leading-tight">{simState.exited}</div>
                  {projectedEOD != null && (
                    <div className="text-[8px] opacity-80 font-mono">tahmin {projectedEOD}</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Satır geçişi: kıvrımlı ok — LTR satır sağdan iner, RTL satır soldan */}
          {ri < rows.length - 1 && (
            <div className={`flex ${row.reverse ? 'justify-start pl-6' : 'justify-end pr-6'}`}>
              <TurnArrow mirrored={row.reverse} />
            </div>
          )}
        </React.Fragment>
      ))}
      {/* Lejant */}
      <div className="flex items-center gap-3 flex-wrap pt-2 text-[10px] text-ink-faint">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 border-[1.5px] border-ok bg-ok-tint/40 rounded-sm inline-block" /> çalışıyor</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 border-[1.5px] border-line bg-surface rounded-sm inline-block" /> boşta</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 border-[1.5px] border-danger bg-danger-tint/40 rounded-sm inline-block" /> darboğaz</span>
        <span className="inline-flex items-center gap-1 text-warn">△ bekleyen {itemLower}</span>
        <span>kutudaki sayı = istasyondan geçen {itemLower}</span>
      </div>
    </div>
  );
}
