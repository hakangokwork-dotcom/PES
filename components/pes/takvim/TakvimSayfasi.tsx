'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { BOS_VERI, type TakvimVerisi, type Kip, type Vurgu, type Atama } from './tipler'
import {
  TR_AY, bugunIso, ayAraligi, haftaAraligi, gunListesi, trTarih,
  atolyePaketleri, uyarilariHesapla,
} from './hesap'
import GanttSatirlari from './GanttSatirlari'
import PoPaneli from './PoPaneli'

/* Sayfanın üç sorumluluğu: dönem/kip durumu, filtreler, veri çekme.
   Çizim GanttSatirlari'nda, hesap lib/pes/bant-doluluk'ta. */

type Secenekler = { tedarik: string[]; bolge: string[] }

export default function TakvimSayfasi() {
  const bugun = useMemo(bugunIso, [])
  const [ay, setAy] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [gunSecili, setGunSecili] = useState(bugun)
  const [kip, setKip] = useState<Kip>('ay')
  const [filtre, setFiltre] = useState({ tedarik: '', bolge: '', yetkinlik: '' })
  const [vurgu, setVurgu] = useState<Vurgu>('')
  const [veri, setVeri] = useState<TakvimVerisi>(BOS_VERI)
  const [secenekler, setSecenekler] = useState<Secenekler>({ tedarik: [], bolge: [] })
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [secili, setSecili] = useState<Atama | null>(null)

  const aralik = useMemo(
    () => (kip === 'hafta' ? haftaAraligi(gunSecili) : ayAraligi(ay.y, ay.m)),
    [kip, gunSecili, ay],
  )
  const gunler = useMemo(() => gunListesi(aralik.baslangic, aralik.bitis), [aralik])

  const filtreliMi = !!(filtre.tedarik || filtre.bolge || filtre.yetkinlik)

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null)
    try {
      const q = new URLSearchParams({ baslangic: aralik.baslangic, bitis: aralik.bitis })
      if (filtre.tedarik) q.set('tedarik', filtre.tedarik)
      if (filtre.bolge) q.set('bolge', filtre.bolge)
      if (filtre.yetkinlik.trim()) q.set('yetkinlik', filtre.yetkinlik.trim())
      const r = await fetch(`/api/pes/takvim/doluluk?${q}`)
      if (!r.ok) throw new Error(`Takvim yüklenemedi (${r.status})`)
      const gelen = (await r.json()) as TakvimVerisi
      setVeri(gelen)
      /* Seçenek listesi filtresiz yüklemeden kurulur; filtreli yanıttan
         kurulsaydı bir seçim yapınca öteki seçenekler kaybolurdu. */
      if (!filtreliMi) {
        const tekil = (xs: (string | null)[]) =>
          [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'tr'))
        setSecenekler({
          tedarik: tekil(gelen.atolyeler.map(a => a.tedarik_mudurlugu)),
          bolge: tekil(gelen.atolyeler.map(a => a.bolge)),
        })
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Takvim yüklenemedi')
      setVeri(BOS_VERI)
    } finally {
      setYukleniyor(false)
    }
  }, [aralik, filtre, filtreliMi])

  useEffect(() => { yukle() }, [yukle])

  const paketler = useMemo(() => atolyePaketleri(veri), [veri])
  const uyarilar = useMemo(
    () => uyarilariHesapla(veri, paketler, gunler, bugun), [veri, paketler, gunler, bugun])

  function kaydir(yon: -1 | 1) {
    if (kip === 'hafta') {
      const d = new Date(gunSecili); d.setDate(d.getDate() + 7 * yon)
      setGunSecili(d.toISOString().slice(0, 10))
    } else {
      const m = ay.m + yon
      setAy({ y: ay.y + (m < 0 ? -1 : m > 11 ? 1 : 0), m: (m + 12) % 12 })
    }
  }
  function bugune() {
    const d = new Date()
    setAy({ y: d.getFullYear(), m: d.getMonth() }); setGunSecili(bugun)
  }

  const donemEtiketi = kip === 'hafta'
    ? `${trTarih(aralik.baslangic)} – ${trTarih(aralik.bitis)} ${aralik.bitis.slice(0, 4)}`
    : `${TR_AY[ay.m]} ${ay.y}`

  const asimSayisi = new Set([...uyarilar.asim].map(k => k.split('|')[0])).size

  const seciliBant = secili ? veri.bantlar.find(b => b.id === secili.line_id) : undefined
  const seciliAtolye = seciliBant ? veri.atolyeler.find(w => w.id === seciliBant.workshop_id) : undefined
  const seciliPaket = seciliAtolye ? paketler.get(seciliAtolye.id) : undefined

  return (
    <div className="space-y-3">
      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface p-2.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          <button type="button" onClick={() => kaydir(-1)} className="px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink" title="Önceki">‹</button>
          <button type="button" onClick={bugune} className="border-x border-line-soft px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink">Bugün</button>
          <button type="button" onClick={() => kaydir(1)} className="px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink" title="Sonraki">›</button>
        </div>
        <span className="px-1 text-sm font-semibold text-ink">{donemEtiketi}</span>

        <span className="mx-1 h-6 w-px bg-line-soft" />

        <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Görünüm">
          {(['ay', 'hafta'] as const).map(k => (
            <button key={k} type="button" onClick={() => setKip(k)} aria-pressed={kip === k}
              className={`px-3 py-1.5 text-sm ${kip === k ? 'bg-accent text-white' : 'text-muted hover:bg-canvas hover:text-ink'}`}>
              {k === 'ay' ? 'Ay' : 'Hafta'}
            </button>
          ))}
        </div>

        <span className="mx-1 h-6 w-px bg-line-soft" />

        <label className="inline-flex items-center gap-1.5 text-xs text-faint">Tedarik
          <select id="f-tedarik" value={filtre.tedarik} onChange={e => setFiltre({ ...filtre, tedarik: e.target.value })}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink">
            <option value="">Tümü</option>
            {secenekler.tedarik.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-faint">Bölge
          <select id="f-bolge" value={filtre.bolge} onChange={e => setFiltre({ ...filtre, bolge: e.target.value })}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink">
            <option value="">Tümü</option>
            {secenekler.bolge.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-faint">Yetkinlik
          <input id="f-yetkinlik" value={filtre.yetkinlik}
            onChange={e => setFiltre({ ...filtre, yetkinlik: e.target.value })}
            placeholder="kod ya da ad" className="w-32 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
        </label>

        {/* Uyarı sayaçları — sıfırken alarm rengi taşımaz, tıklanınca filtreye dönüşür */}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Sayac n={asimSayisi} etiket="kapasite aşımı" ton="danger" aktif={vurgu === 'asim'}
            onClick={() => setVurgu(vurgu === 'asim' ? '' : 'asim')} />
          <Sayac n={uyarilar.eskimisRezerve.length} etiket="süresi geçmiş rezerve" ton="warn" aktif={vurgu === 'rezerve'}
            onClick={() => setVurgu(vurgu === 'rezerve' ? '' : 'rezerve')} />
          <Sayac n={uyarilar.teslimRiski.length} etiket="teslim riski" ton="accent" aktif={vurgu === 'teslim'}
            onClick={() => setVurgu(vurgu === 'teslim' ? '' : 'teslim')} />
        </div>
      </div>

      {/* Lejant */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1.5">Atölye doluluğu
          <span className="inline-flex gap-px">
            {['#DCEDE4', '#B6DCC9', '#86C4A6', '#4FA57F', '#197A56'].map(c =>
              <i key={c} className="block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />)}
          </span></span>
        <Lejant renk="#B6DCC9" kenar="#4FA57F">Sipariş · koyu kısım gerçekleşen</Lejant>
        <Lejant renk="#DDE2F4" kenar="#7280C4" kesik>Rezerve</Lejant>
        <Lejant renk="repeating-linear-gradient(135deg,#EFF2F4 0 5px,#C3CBD2 5px 6px)" kenar="#D6DCE1">Bakım / izin</Lejant>
      </div>

      {hata && (
        <p className="rounded-lg border border-danger-line bg-danger-soft/40 px-4 py-2.5 text-[13px] text-danger">
          {hata} Sayfayı yenileyin; sorun sürerse yöneticinize bildirin.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line-soft bg-surface">
        {yukleniyor
          ? <div className="p-10 text-center text-faint">Yükleniyor…</div>
          : <GanttSatirlari veri={veri} paketler={paketler} gunler={gunler} bugun={bugun}
              kip={kip} vurgu={vurgu} uyarilar={uyarilar} onAtamaSec={setSecili} />}
      </div>

      {secili && seciliPaket && seciliAtolye && seciliBant && (
        <PoPaneli atama={secili} paket={seciliPaket} atolyeId={seciliAtolye.id}
          atolyeAdi={seciliAtolye.name} bantAdi={seciliBant.name} bugun={bugun}
          asamalar={veri.asamalar.filter(a => a.work_order_id === secili.work_order_id)}
          malzemeler={veri.malzemeler.filter(m => m.work_order_id === secili.work_order_id)}
          test={veri.testler.find(t => t.work_order_id === secili.work_order_id) ?? null}
          onKapat={() => setSecili(null)} />
      )}

      <p className="px-1 text-[11.5px] leading-relaxed text-faint">
        Atölye satırındaki çubuk o günün doluluğu; içindeki koyu kısım gerçekleşen. Bant satırı
        yalnız siparişin nerede durduğunu gösterir — bant başına ayrı kapasite yok, kapasite
        aktif bantların günlük hedef toplamıdır. Pazar kapalı sayılır.
      </p>
    </div>
  )
}

function Sayac({ n, etiket, ton, aktif, onClick }: {
  n: number; etiket: string; ton: 'danger' | 'warn' | 'accent'; aktif: boolean; onClick: () => void
}) {
  const renk = n === 0
    ? 'border-line-soft bg-canvas text-faint cursor-default'
    : ton === 'danger' ? 'border-danger-line bg-danger-soft text-danger'
    : ton === 'warn' ? 'border-warn-line bg-warn-soft text-warn'
    : 'border-transparent bg-accent-soft text-accent-ink'
  return (
    <button type="button" disabled={n === 0} onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium ${renk} ${aktif ? 'ring-2 ring-accent ring-offset-1' : ''}`}>
      <b className="font-mono text-[12.5px] tabular-nums">{n}</b> {etiket}
    </button>
  )
}

function Lejant({ renk, kenar, kesik, children }: {
  renk: string; kenar: string; kesik?: boolean; children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-6 rounded-sm"
        style={{ background: renk, border: `1px ${kesik ? 'dashed' : 'solid'} ${kenar}` }} />
      {children}
    </span>
  )
}
