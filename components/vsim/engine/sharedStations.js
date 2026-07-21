import { sharedStationUtilization, md1QueueWaitSec, requiredMachines } from './metrics.js';

/* Ortak istasyon analizi (doc §5.5). Bant = istasyonu besleyen her öncül ana op;
   talep = o bandın hat geçirgenliği (calc.thru). v1: istasyon CT'si tüm bantlar
   için aynıdır (grubun en yavaş yaprak CT'si — VSM kutusuyla tutarlı). */
export function analyzeSharedStations(data, calc) {
  const mainOps = data.mainOps || [];
  const availableMin = data.settings?.netMinutes ?? 540;

  return mainOps.filter(m => m.isShared).map(st => {
    const pm = (calc.perMain || []).find(p => p.mainOp.id === st.id);
    const ctSec = pm?.slowest?.cycleTime || 0;
    // Elle düzenlenmiş/bozuk import verisine karşı: tam sayı, en az 1
    const machineCount = Math.max(1, Math.round(st.machineCount || 1));

    const bands = mainOps
      .filter(m => m.id !== st.id && (m.nextIds || []).includes(st.id))
      .map(m => ({ id: m.id, name: m.name, qty: calc.thru?.[m.id] ?? 0 }));

    const demands = ctSec > 0 ? bands.map(b => ({ qty: b.qty, ctSec })) : [];
    const { totalUseMin, utilizationPct, isBottleneck } = sharedStationUtilization({
      demands, machineCount, availableMin,
    });

    const rho = utilizationPct / 100;
    // Not: M/D/1 tek-sunucu formülüdür; machineCount>1'de havuzlanmış ρ ile
    // yaklaşıklıktır (beklemeyi olduğundan az gösterebilir) — doc §5.5.2 v1 kapsamı.
    const queueWaitSec = demands.length === 0 || ctSec === 0 ? 0 : md1QueueWaitSec(rho, ctSec);
    const neededMachines = totalUseMin > 0 ? requiredMachines(totalUseMin, availableMin) : machineCount;

    return {
      id: st.id, name: st.name, color: st.color,
      ctSec, machineCount, bands,
      totalUseMin, utilizationPct, isBottleneck,
      queueWaitSec,
      neededMachines,
      extraMachines: Math.max(0, neededMachines - machineCount),
    };
  });
}
