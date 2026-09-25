'use client'

import { useMemo, useState } from 'react'
import { aylikDoluluk, type AylikDoluluk } from '@/lib/pes/bant-doluluk'
import type { TakvimVerisi } from './tipler'
import { TR_AY, type AtolyePaketi } from './hesap'

/* Kompakt görünüm (K14, spec §5.6): atölye × ay doluluk matrisi.

   Ayrı ekran değil, aynı hesap modülünü okuyan bir görünüm kipi. Yeni
   veri, yeni kural yok. Hücre = o ayın plan+rezerve toplamı ÷ efektif
   kapasite toplamı. Payda sıfırsa null → gri "—": %0 ile "veri yok"
   aynı görünmemeli. Tıklamak o atölyenin o ayına, gün kırılımına iner. */

const RAMP = ['#DCEDE4', '#B6DCC9', '#86C4A6', '#4FA57F', '#197A56']
const adim = (o: number) => (o <= 0 ? 0 : o <= .25 ? 1 : o <= .5 ? 2 : o <= .75 ? 3 : o <= .95 ? 4 : 5)
const nf = (n: number) => Math.round(n).toLocaleString('tr-TR')
const iki = (n: number) => String(n).padStart(2, '0')

type Satir = {
  id: number; ad: string; kod: string; tedarik: string
  aylar: (AylikDoluluk | null)[]
  kapasite: number; yerlesen: number; bos: number
}

type Props = {
  veri: TakvimVerisi
  paketler: Map<number, AtolyePaketi>
  yil: number
  onAySec: (m0: number) => void
}

export default function DolulukMatrisi({ veri, paketler, yil, onAySec }: Props) {
  const [sirala, setSirala] = useState<'ad' | 'bos' | 'doluluk'>('ad')

  const satirlar = useMemo<Satir[]>(() => veri.atolyeler.map(w => {
    const p = paketler.get(w.id)
    const aylar = Array.from({ length: 12 }, (_, m) =>
      p ? aylikDoluluk(`${yil}-${iki(m + 1)}`, p.atamalar, p.ctx, p.gercekler, p.teklifler) : null)
    const kapasite = aylar.reduce((s, a) => s + (a?.kapasite ?? 0), 0)
    const yerlesen = aylar.reduce((s, a) => s + (a?.plan ?? 0), 0)
    return {
      id: w.id, ad: w.name, kod: w.code, tedarik: w.tedarik_mudurlugu ?? '',
      aylar, kapasite, yerlesen, bos: Math.max(0, kapasite - yerlesen),
    }
  }), [veri, paketler, yil])

  const sirali = useMemo(() => {
    const s = [...satirlar]
    if (sirala === 'bos') s.sort((a, b) => b.bos - a.bos)
    else if (sirala === 'doluluk') s.sort((a, b) => (b.kapasite ? b.yerlesen / b.kapasite : 0) - (a.kapasite ? a.yerlesen / a.kapasite : 0))
    else s.sort((a, b) => a.tedarik.localeCompare(b.tedarik, 'tr') || a.ad.localeCompare(b.ad, 'tr'))
    return s
  }, [satirlar, sirala])

  const gruplu = sirala === 'ad'

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr className="border-b border-line text-[10.5px] uppercase tracking-wide text-faint">
            <th className="sticky left-0 z-20 bg-canvas px-3 py-2 text-left font-semibold">
              <span className="inline-flex items-center gap-1.5">Atölye
                <select value={sirala} onChange={e => setSirala(e.target.value as typeof sirala)}
                  className="rounded border border-line bg-surface px-1 py-0.5 text-[10.5px] normal-case tracking-normal text-body">
                  <option value="ad">ad · tedarik</option>
                  <option value="bos">en çok boş</option>
                  <option value="doluluk">en dolu</option>
                </select>
              </span>
            </th>
            {TR_AY.map(a => <th key={a} className="px-1 py-2 text-center font-semibold">{a.slice(0, 3)}</th>)}
            <th className="px-2 py-2 text-right font-semibold">Kapasite</th>
            <th className="px-2 py-2 text-right font-semibold">Yerleşen</th>
            <th className="px-2 py-2 text-right font-semibold">Boş</th>
          </tr>
        </thead>
        <tbody>
          {sirali.map((r, i) => {
            const grupBasi = gruplu && (i === 0 || sirali[i - 1].tedarik !== r.tedarik)
            return (
              <Grup key={r.id} baslik={grupBasi ? (r.tedarik || 'Tedarik müdürlüğü girilmemiş') : null}>
                <tr className="border-b border-line-soft hover:bg-canvas/60">
                  <td className="sticky left-0 z-[5] bg-surface px-3 py-1">
                    <div className="truncate text-[12px] font-medium text-ink">{r.ad}</div>
                    <div className="text-[10px] text-faint">{r.kod}</div>
                  </td>
                  {r.aylar.map((a, m) => {
                    if (!a) return (
                      <td key={m} className="px-1 py-1 text-center">
                        <div className="mx-auto h-6 w-full max-w-[52px] rounded bg-canvas text-[10px] leading-6 text-faint" title="Veri yok — o ay çalışılan gün yok">—</div>
                      </td>
                    )
                    const st = adim(a.oran), asim = a.oran > 1
                    /* Yumuşak rezervasyon (044): cevap bekleyen teklif.
                       Onaylı yükten AYRI gösterilir — amber çerçeve ve *.
                       Renge KATILMAZ: teklif reddedilirse yer kendiliğinden
                       açılır, dolu göstermek boş atölye aramasını yanıltır. */
                    const teklifli = a.teklif > 0
                    return (
                      <td key={m} className="px-1 py-1 text-center">
                        <button type="button" onClick={() => onAySec(m)}
                          className="mx-auto block h-6 w-full max-w-[52px] rounded font-mono text-[10.5px] font-semibold tabular-nums hover:ring-2 hover:ring-accent"
                          style={{
                            background: st ? RAMP[st - 1] : 'var(--color-line-soft)',
                            color: st >= 4 ? '#fff' : 'var(--color-ink)',
                            boxShadow: asim
                              ? 'inset 0 0 0 2px var(--color-danger)'
                              : teklifli ? 'inset 0 0 0 2px var(--color-warn)' : undefined,
                          }}
                          title={`${TR_AY[m]} ${yil} · plan ${nf(a.plan)} / kapasite ${nf(a.kapasite)}${a.gercek ? ` · gerçekleşen ${nf(a.gercek)}` : ''}${teklifli ? `\n⏳ Teklif (cevap bekliyor): ${nf(a.teklif)} → %${Math.round(a.oranTeklifli * 100)}` : ''}${asim ? '\n⚠ Kapasite aşımı' : ''}`}>
                          %{Math.round(a.oran * 100)}
                          {teklifli && <span className="ml-0.5 opacity-70">*</span>}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-body">{nf(r.kapasite)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-body">{nf(r.yerlesen)}</td>
                  <td className={`px-2 py-1 text-right font-mono tabular-nums ${r.bos > 0 ? 'font-semibold text-accent-ink' : 'text-faint'}`}>{nf(r.bos)}</td>
                </tr>
              </Grup>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Sıralama tedarik'e göreyken grup başlığı satırı ekler. */
function Grup({ baslik, children }: { baslik: string | null; children: React.ReactNode }) {
  return (
    <>
      {baslik !== null && (
        <tr className="border-b border-line bg-canvas">
          <td colSpan={16} className="sticky left-0 px-3 py-1.5 text-[11px] font-semibold text-ink">{baslik}</td>
        </tr>
      )}
      {children}
    </>
  )
}
