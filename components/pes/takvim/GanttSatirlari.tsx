'use client'

import { useState, type CSSProperties } from 'react'
import { gunlukDoluluk, gunlukPlan, pazarMi } from '@/lib/pes/bant-doluluk'
import type { TakvimVerisi, Kip, Vurgu, Atolye, Bant, Atama, Blok } from './tipler'
import { TR_GUN, yerelTarih, trTarih, type AtolyePaketi, type Uyarilar } from './hesap'
import PoSatiri from './PoZinciri'
import HucreMenusu, { type HucreHedefi } from './HucreMenusu'

/* Üç seviyeli katlanır gantt: tedarik müdürlüğü → atölye → bant (K7).
   PO satırı (aşama zinciri) Task 10'da bu dosyaya eklenir.

   Yerleşim: her satır CSS grid, ilk sütun yapışkan etiket, kalanı günler.
   Bant satırında hücreler MUTLAK konumlu arka katman, bloklar akışta —
   böylece aynı bantta üst üste binen siparişler satırı büyütür, üst
   üste çizilmez. */

const ETIKET_GEN = 216
const RAMP = ['#DCEDE4', '#B6DCC9', '#86C4A6', '#4FA57F', '#197A56']
const adim = (o: number) => (o <= 0 ? 0 : o <= .25 ? 1 : o <= .5 ? 2 : o <= .75 ? 3 : o <= .95 ? 4 : 5)
const nf = (n: number) => Math.round(n).toLocaleString('tr-TR')

type Props = {
  veri: TakvimVerisi
  paketler: Map<number, AtolyePaketi>
  gunler: string[]
  bugun: string
  kip: Kip
  vurgu: Vurgu
  uyarilar: Uyarilar
  onAtamaSec?: (atama: Atama) => void
  onYenile?: () => void
}

export default function GanttSatirlari({
  veri, paketler, gunler, bugun, kip, vurgu, uyarilar, onAtamaSec, onYenile,
}: Props) {
  const [kapaliGrup, setKapaliGrup] = useState<Set<string>>(() => new Set())
  const [acikWs, setAcikWs] = useState<Set<number>>(() => new Set())
  const [acikLn, setAcikLn] = useState<Set<number>>(() => new Set())   // bant açıkken PO zincirleri görünür
  const [menu, setMenu] = useState<HucreHedefi | null>(null)

  /* Bos hucreye tiklama: menu, o gunun bos kapasitesiyle. */
  function hucreAc(bant: Bant, tarih: string, x: number, y: number) {
    const w = veri.atolyeler.find(a => a.id === bant.workshop_id); const p = paketler.get(bant.workshop_id)
    if (!w || !p) return
    const d = gunlukDoluluk(tarih, p.atamalar, p.ctx, p.gercekler)
    setMenu({ lineId: bant.id, bantAdi: bant.name, atolyeId: w.id, atolyeAdi: w.name, tarih,
      bosAdet: Math.max(0, d.kapasite - d.plan - d.rezerve), x, y })
  }

  /* Blok tasima: kapasite kontrolu ISTEMCIDE (aninda uyari), bitis SUNUCUDA turetilir. */
  async function tasi(atamaId: number, hedefBant: Bant, tarih: string) {
    const p = paketler.get(hedefBant.workshop_id); if (!p) return
    const eski = p.atamalar.find(a => a.atamaId === atamaId)
    if (!eski) { alert('Sipariş başka atölyeye buradan taşınamaz; yerleştirme sihirbazını kullanın.'); return }
    if (eski.lineId === hedefBant.id && eski.planBaslangic === tarih) return
    const yeni = { ...eski, lineId: hedefBant.id, planBaslangic: tarih }
    const digerleri = p.atamalar.filter(a => a.atamaId !== atamaId)
    const asimGun = gunlukPlan(yeni, p.ctx)
      .map(g => g.tarih)
      .filter(t => gunlukDoluluk(t, [...digerleri, yeni], p.ctx, p.gercekler).asim)
    if (asimGun.length && !confirm(`${asimGun.length} günde kapasite aşılıyor (ilk: ${trTarih(asimGun[0])}). Yine de taşınsın mı?`)) return
    const r = await fetch(`/api/pes/atamalar/${atamaId}`, { method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineId: hedefBant.id, planBaslangic: tarih }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? `Taşınamadı (${r.status})`); return }
    onYenile?.()
  }

  const kolonPx = kip === 'hafta' ? 92 : 24
  const n = gunler.length
  const sablon = `${ETIKET_GEN}px repeat(${n}, ${kolonPx}px)`
  const icSablon = `repeat(${n}, 1fr)`

  /* Vurgu: yalnız o uyarıyı taşıyan atölyeler kalır. */
  const gorunur = veri.atolyeler.filter(w => {
    if (!vurgu) return true
    const bantlar = veri.bantlar.filter(b => b.workshop_id === w.id).map(b => b.id)
    if (vurgu === 'asim') return [...uyarilar.asim].some(k => k.startsWith(`${w.id}|`))
    if (vurgu === 'rezerve') return uyarilar.eskimisRezerve.some(b => bantlar.includes(b.line_id))
    return uyarilar.teslimRiski.some(a => bantlar.includes(a.line_id))
  })

  if (gorunur.length === 0) {
    return <div className="p-10 text-center text-sm text-faint">
      {vurgu ? 'Bu uyarıyı taşıyan atölye yok.' : 'Filtreye uyan atölye yok.'}
    </div>
  }

  const gruplar = [...new Set(gorunur.map(w => w.tedarik_mudurlugu ?? ''))]
  const grupAcikMi = (g: string) => !kapaliGrup.has(g)   // varsayılan açık
  const toggleGrup = (g: string) => setKapaliGrup(s => {
    const y = new Set(s); y.has(g) ? y.delete(g) : y.add(g); return y
  })
  const toggleWs = (id: number) => setAcikWs(s => {
    const y = new Set(s); y.has(id) ? y.delete(id) : y.add(id); return y
  })
  const toggleLn = (id: number) => setAcikLn(s => {
    const y = new Set(s); y.has(id) ? y.delete(id) : y.add(id); return y
  })

  return (
    <div className="overflow-x-auto">
      {menu && onYenile && <HucreMenusu hedef={menu} onKapat={() => setMenu(null)} onYenile={onYenile} />}
      <div style={{ minWidth: 'max-content' }}>
        {/* Başlık */}
        <div className="sticky top-0 z-30 grid border-b border-line bg-canvas" style={{ gridTemplateColumns: sablon }}>
          <div className="sticky left-0 z-40 flex items-center border-r border-line bg-canvas px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            Atölye / Bant
          </div>
          {gunler.map(t => {
            const d = yerelTarih(t)
            const kapali = pazarMi(t), bugunMu = t === bugun
            return (
              <div key={t} className={`flex flex-col items-center justify-center gap-px border-r border-line-soft py-1 ${
                bugunMu ? 'bg-accent-soft shadow-[inset_0_-2px_0_var(--color-accent)]' : kapali ? 'bg-canvas' : 'bg-surface'}`}>
                <span className={`font-mono text-[11px] tabular-nums ${bugunMu ? 'font-semibold text-accent-ink' : kapali ? 'text-faint' : 'font-semibold text-body'}`}>{d.getDate()}</span>
                <span className="text-[9.5px] text-faint">{TR_GUN[d.getDay()]}</span>
              </div>
            )
          })}
        </div>

        {gruplar.map(g => {
          const gws = gorunur.filter(w => (w.tedarik_mudurlugu ?? '') === g)
          const toplamKap = gws.reduce((t, w) =>
            t + veri.bantlar.filter(b => b.workshop_id === w.id && b.is_active).reduce((s, b) => s + b.daily_target, 0), 0)
          const acik = grupAcikMi(g)
          return (
            <div key={g || '__yok'}>
              {/* Grup satırı */}
              <div className="grid border-b border-line bg-canvas" style={{ gridTemplateColumns: sablon, minHeight: 30 }}>
                <div className="sticky left-0 z-20 flex items-center border-r border-line bg-canvas px-2.5">
                  <button type="button" onClick={() => toggleGrup(g)}
                    className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-ink">
                    <Caret acik={acik} /> {g || 'Tedarik müdürlüğü girilmemiş'}
                  </button>
                </div>
                <div className="flex items-center gap-3 px-3 text-[11px] text-faint" style={{ gridColumn: '2 / -1' }}>
                  <span>{gws.length} atölye</span>
                  <span className="font-mono">toplam {nf(toplamKap)} adet/gün</span>
                </div>
              </div>

              {acik && gws.map(w => {
                const paket = paketler.get(w.id)
                if (!paket) return null
                const bantlar = veri.bantlar.filter(b => b.workshop_id === w.id)
                const wsAcik = acikWs.has(w.id)
                return (
                  <div key={w.id}>
                    <AtolyeSatiri w={w} bantlar={bantlar} paket={paket} gunler={gunler} bugun={bugun}
                      sablon={sablon} icSablon={icSablon} genis={kolonPx >= 60}
                      acik={wsAcik} onToggle={() => toggleWs(w.id)} uyarilar={uyarilar} />
                    {wsAcik && bantlar.map(b => {
                      const poler = [...paket.atamaKaynak.values()].filter(a => a.line_id === b.id)
                      const lnAcik = acikLn.has(b.id)
                      return (
                        <div key={b.id}>
                          <BantSatiri bant={b} paket={paket} gunler={gunler} bugun={bugun}
                            sablon={sablon} icSablon={icSablon} genis={kolonPx >= 60}
                            bloklar={veri.bloklar.filter(x => x.line_id === b.id)} onAtamaSec={onAtamaSec}
                            poSayisi={poler.length} poAcik={lnAcik} onPoToggle={() => toggleLn(b.id)}
                            onHucre={onYenile ? (t, x, y) => hucreAc(b, t, x, y) : undefined}
                            onBirak={onYenile ? (id, t) => tasi(id, b, t) : undefined} />
                          {lnAcik && poler.map(a => (
                            <PoSatiri key={a.id} atama={a} atolyeId={w.id}
                              asamalar={veri.asamalar.filter(x => x.work_order_id === a.work_order_id)}
                              malzemeler={veri.malzemeler.filter(x => x.work_order_id === a.work_order_id)}
                              test={veri.testler.find(x => x.work_order_id === a.work_order_id) ?? null}
                              gunler={gunler} bugun={bugun} sablon={sablon} icSablon={icSablon}
                              genis={kolonPx >= 60} onAtamaSec={onAtamaSec} />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Atölye satırı: günlük doluluk çubukları ---------- */
function AtolyeSatiri({ w, bantlar, paket, gunler, bugun, sablon, icSablon, genis, acik, onToggle, uyarilar }: {
  w: Atolye; bantlar: Bant[]; paket: AtolyePaketi; gunler: string[]; bugun: string
  sablon: string; icSablon: string; genis: boolean; acik: boolean; onToggle: () => void; uyarilar: Uyarilar
}) {
  const kapasite = bantlar.filter(b => b.is_active).reduce((s, b) => s + b.daily_target, 0)
  const doluluklar = gunler.map(t => gunlukDoluluk(t, paket.atamalar, paket.ctx, paket.gercekler))
  const calisan = doluluklar.filter(d => d.kapasite > 0)
  const ort = calisan.length
    ? Math.round(calisan.reduce((s, d) => s + Math.min(1.4, d.oran), 0) / calisan.length * 100) : 0

  return (
    <div className="grid border-b border-line-soft bg-surface" style={{ gridTemplateColumns: sablon, minHeight: genis ? 54 : 42 }}>
      <div className="sticky left-0 z-20 flex items-center overflow-hidden border-r border-line bg-surface pl-5 pr-2.5">
        <button type="button" onClick={onToggle} className="flex w-full min-w-0 items-center gap-1.5 text-left">
          <Caret acik={acik} />
          <span className="block min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-ink">{w.name}</span>
            <span className="block truncate text-[10.5px] text-faint">
              {w.code} · {w.bolge ?? '—'} · {nf(kapasite)} adet/gün · {bantlar.length} bant · %{ort}
            </span>
          </span>
        </button>
      </div>
      <div className="relative" style={{ gridColumn: '2 / -1' }}>
        <div className="absolute inset-0 grid px-0 py-1.5" style={{ gridTemplateColumns: icSablon }}>
          {doluluklar.map(d => {
            const asim = uyarilar.asim.has(`${w.id}|${d.tarih}`)
            if (d.kapasite === 0) return (
              <div key={d.tarih} className="flex flex-col justify-end px-0.5">
                <div className="h-1 rounded-sm bg-line-soft" />
              </div>
            )
            const h = Math.max(4, Math.min(20, d.oran * 20))
            const st = adim(d.oran)
            const gr = d.plan > 0 ? Math.min(100, d.gercek / d.plan * 100) : 0
            return (
              <div key={d.tarih} className="flex flex-col justify-end px-0.5"
                title={`${trTarih(d.tarih)} · plan ${nf(d.plan)}${d.rezerve ? ` + rezerve ${nf(d.rezerve)}` : ''} / kapasite ${nf(d.kapasite)}${d.gercek ? ` · gerçekleşen ${nf(d.gercek)}` : ''}`}>
                {genis && (
                  <div className="mb-0.5 text-center font-mono text-[9.5px] leading-tight text-faint tabular-nums">
                    <b className="text-ink">{nf(d.plan)}</b>/{nf(d.kapasite)}
                    {d.gercek > 0 && <><br /><span className="text-accent-ink">{nf(d.gercek)} ✓</span></>}
                  </div>
                )}
                <div className="relative overflow-hidden rounded-sm"
                  style={{ height: h, background: RAMP[Math.max(0, st - 1)], boxShadow: asim ? '0 0 0 1.5px var(--color-danger)' : undefined }}>
                  <span className="absolute inset-y-0 left-0 opacity-85" style={{ width: `${gr}%`, background: RAMP[4] }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Bant satırı: sipariş, rezerve ve bakım blokları ---------- */
function BantSatiri({ bant, paket, gunler, bugun, sablon, icSablon, genis, bloklar, onAtamaSec, poSayisi, poAcik, onPoToggle, onHucre, onBirak }: {
  bant: Bant; paket: AtolyePaketi; gunler: string[]; bugun: string
  sablon: string; icSablon: string; genis: boolean; bloklar: Blok[]
  onAtamaSec?: (a: Atama) => void
  poSayisi: number; poAcik: boolean; onPoToggle: () => void
  onHucre?: (tarih: string, x: number, y: number) => void
  onBirak?: (atamaId: number, tarih: string) => void
}) {
  const ilk = gunler[0], son = gunler[gunler.length - 1]
  const aralik = (bas: string, bit: string) => {
    if (bit < ilk || bas > son) return null
    const s = Math.max(0, gunler.findIndex(t => t >= bas))
    const eIdx = gunler.findIndex(t => t > bit)
    const e = eIdx < 0 ? gunler.length : eIdx
    return e > s ? { s, e } : null
  }

  const atamalar = paket.atamalar.filter(a => a.lineId === bant.id)

  return (
    <div className="grid border-b border-line-soft bg-surface" style={{ gridTemplateColumns: sablon, minHeight: 36 }}>
      <div className="sticky left-0 z-20 flex items-center gap-2 overflow-hidden border-r border-line bg-surface pl-10 pr-2.5">
        {poSayisi > 0 ? (
          <button type="button" onClick={onPoToggle} className="flex min-w-0 items-center gap-1.5 text-left">
            <Caret acik={poAcik} />
            <span className="truncate text-xs text-body">{bant.name}</span>
            <span className="shrink-0 text-[10px] text-faint">{poSayisi} PO</span>
          </button>
        ) : (
          <span className="truncate pl-[18px] text-xs text-body">{bant.name}</span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{nf(bant.daily_target)}/gün</span>
      </div>
      <div className="relative grid content-start" style={{ gridColumn: '2 / -1', gridTemplateColumns: icSablon, minHeight: 36 }}>
        {/* Arka katman: gün hücreleri */}
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: icSablon }}>
          {gunler.map(t => (
            <div key={t}
              className={`border-r border-line-soft ${pazarMi(t) ? 'bg-canvas' : ''} ${t === bugun ? 'bg-accent-soft/50' : ''} ${onHucre ? 'cursor-cell hover:bg-accent-soft hover:shadow-[inset_0_0_0_1px_var(--color-accent)]' : ''}`}
              onClick={onHucre ? e => onHucre(t, e.clientX, e.clientY) : undefined}
              onDragOver={onBirak ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
              onDrop={onBirak ? e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/plain')); if (id) onBirak(id, t) } : undefined} />
          ))}
        </div>

        {/* Rezerve / bakım / izin */}
        {bloklar.map(b => {
          const sp = aralik(b.baslangic_tarihi, b.bitis_tarihi); if (!sp) return null
          const rez = b.tip === 'REZERVE'
          const eski = rez && b.gecerlilik_bitis != null && b.gecerlilik_bitis < bugun
          const stil: CSSProperties = rez
            ? { background: '#DDE2F4', border: '1px dashed #7280C4', color: '#5B6BAF' }
            : { background: 'repeating-linear-gradient(135deg,#EFF2F4 0 5px,#C3CBD2 5px 6px)', border: '1px solid var(--color-line)', color: 'var(--color-muted)' }
          return (
            <div key={`b${b.id}`} className={`relative z-[2] my-1 mx-px flex min-h-[26px] items-center overflow-hidden rounded ${eski ? 'opacity-45' : ''}`}
              style={{ ...stil, gridColumn: `${sp.s + 1} / ${sp.e + 1}` }}
              title={rez
                ? `Rezerve · ${b.notlar ?? ''}\nSahip ${b.sahip} · Geçerlilik ${b.gecerlilik_bitis ? trTarih(b.gecerlilik_bitis) : '—'}${eski ? '\n⚠ Süresi geçmiş — temizlenmeli' : ''}${b.adet ? `\n${nf(b.adet)} adet/gün` : '\nBandın tamamı'}`
                : `${b.tip} · ${b.notlar ?? ''}\n${trTarih(b.baslangic_tarihi)} → ${trTarih(b.bitis_tarihi)}`}>
              <span className="truncate px-1.5 text-[10.5px] font-semibold">
                {rez ? `Rezerve${eski ? ' · süresi geçti' : ''}` : b.tip === 'BAKIM' ? 'Bakım' : b.tip === 'İZİN' ? 'İzin' : 'Blok'}
                {rez && genis && b.adet ? <span className="ml-1.5 font-mono font-medium opacity-70">{nf(b.adet)}/gün</span> : null}
              </span>
            </div>
          )
        })}

        {/* Siparişler — bitiş TÜRETİLMİŞ (K4), API'deki plan_bitis değil */}
        {atamalar.map(a => {
          const kaynak = paket.atamaKaynak.get(a.atamaId); if (!kaynak) return null
          const bitis = paket.bitisler.get(a.atamaId) ?? kaynak.plan_bitis
          const sp = aralik(a.planBaslangic, bitis); if (!sp) return null
          const p = gunlukPlan(a, paket.ctx)
          const plan = p.reduce((s, x) => s + x.adet, 0)
          const gercek = p.reduce((s, x) => s + (paket.gercekler[a.atamaId]?.[x.tarih] ?? 0), 0)
          const ilerleme = plan ? Math.min(100, gercek / plan * 100) : 0
          const gec = !!kaynak.teslim_tarihi && bitis > kaynak.teslim_tarihi
          const genislik = sp.e - sp.s
          return (
            <button key={`a${a.atamaId}`} type="button" onClick={() => onAtamaSec?.(kaynak)}
              draggable={!!onBirak}
              onDragStart={onBirak ? e => { e.dataTransfer.setData('text/plain', String(a.atamaId)); e.dataTransfer.effectAllowed = 'move' } : undefined}
              className="relative z-[2] my-1 mx-px flex min-h-[26px] cursor-grab items-center overflow-hidden rounded text-left hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
              style={{ gridColumn: `${sp.s + 1} / ${sp.e + 1}`, background: '#B6DCC9', border: '1px solid #4FA57F' }}
              title={`${kaynak.is_emri_no} · ${kaynak.model_adi}\n${kaynak.musteri ?? ''} · ${nf(a.adet)} adet\nPlan ${trTarih(a.planBaslangic)} → ${trTarih(bitis)}${kaynak.teslim_tarihi ? ` · Teslim ${trTarih(kaynak.teslim_tarihi)}` : ''}${gercek ? `\nGerçekleşen ${nf(gercek)} (%${Math.round(ilerleme)})` : ''}${gec ? '\n⚠ Planlanan bitiş teslimi aşıyor' : ''}`}>
              <span className="absolute inset-y-0 left-0 opacity-70" style={{ width: `${ilerleme}%`, background: '#4FA57F' }} />
              <span className="relative z-[1] flex items-center gap-1.5 truncate px-1.5 text-[10.5px] font-semibold text-ink">
                <span className="font-mono">{kaynak.is_emri_no}</span>
                {genislik >= 6 && <span className="font-mono font-medium opacity-70">{nf(a.adet)}</span>}
                {genislik >= 11 && gercek > 0 && <span className="font-mono font-medium opacity-70">%{Math.round(ilerleme)}</span>}
              </span>
              {gec && <span className="absolute inset-y-0 right-0 z-[2] w-1 bg-warn" title="Teslim riski" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Caret({ acik }: { acik: boolean }) {
  return <span className={`inline-block w-3 shrink-0 text-center text-[10px] text-faint transition-transform ${acik ? 'rotate-90' : ''}`}>▶</span>
}
