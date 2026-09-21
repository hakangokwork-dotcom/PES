'use client'

import { useEffect, useRef, useState } from 'react'
import { gunEkle } from '@/lib/pes/yerlestirme'
import { trTarih } from './hesap'

/* Boş hücre menüsü (spec §5.4): Rezerve et · Sipariş yerleştir · Kapasite gir.

   Rezerve ve kapasite burada kısa formla yazılır. Sipariş yerleştirme
   sihirbaza gider — aşama zinciri, bant bölme ve dış atölye mantığı orada
   ve tek yerde kalmalı; burada kopyalamak çatallanma demekti. */

export type HucreHedefi = {
  lineId: number; bantAdi: string
  atolyeId: number; atolyeAdi: string
  tarih: string
  bosAdet: number
  x: number; y: number
}

type Kip = 'menu' | 'rezerve' | 'kapasite'
const nf = (n: number) => Math.round(n).toLocaleString('tr-TR')

export default function HucreMenusu({ hedef, onKapat, onYenile }: {
  hedef: HucreHedefi; onKapat: () => void; onYenile: () => void
}) {
  const [kip, setKip] = useState<Kip>('menu')
  const [hata, setHata] = useState<string | null>(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const kutu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dis = (e: MouseEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) onKapat() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat() }
    document.addEventListener('mousedown', dis); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', dis); document.removeEventListener('keydown', esc) }
  }, [onKapat])

  /* Ekran kenarından taşmasın. */
  const stil = {
    left: Math.min(hedef.x, (typeof window !== 'undefined' ? window.innerWidth : 1400) - 300),
    top: Math.min(hedef.y, (typeof window !== 'undefined' ? window.innerHeight : 900) - 320),
  }

  async function gonder(url: string, method: string, body: unknown) {
    setGonderiliyor(true); setHata(null)
    try {
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `İstek başarısız (${r.status})`)
      onYenile(); onKapat()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally { setGonderiliyor(false) }
  }

  return (
    <div ref={kutu} className="fixed z-[70] w-[280px] rounded-lg border border-line bg-surface p-1.5 shadow-2xl" style={stil} role="menu">
      <div className="mb-1 border-b border-line-soft px-2 py-1.5 font-mono text-[10.5px] text-faint">
        {hedef.atolyeAdi} / {hedef.bantAdi} · {trTarih(hedef.tarih)}<br />atölyede {nf(hedef.bosAdet)} adet boş
      </div>

      {kip === 'menu' && (
        <>
          <Secenek renk="#7280C4" onClick={() => setKip('rezerve')} ipucu="line_schedule">Rezerve et</Secenek>
          <a href={`/pes/siparisler?havuz=1&atolye=${hedef.atolyeId}&bant=${hedef.lineId}&tarih=${hedef.tarih}`}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: '#197A56' }} />Sipariş yerleştir
            <small className="ml-auto text-[10.5px] text-faint">havuz</small>
          </a>
          <Secenek renk="#C3CBD2" onClick={() => setKip('kapasite')} ipucu="atölye beyanı">Kapasite gir</Secenek>
        </>
      )}

      {kip === 'rezerve' && (
        <RezerveFormu hedef={hedef} hata={hata} gonderiliyor={gonderiliyor} onGeri={() => setKip('menu')}
          onGonder={v => gonder('/api/pes/rezerve', 'POST', { lineId: hedef.lineId, baslangic: hedef.tarih, ...v })} />
      )}

      {kip === 'kapasite' && (
        <KapasiteFormu hedef={hedef} hata={hata} gonderiliyor={gonderiliyor} onGeri={() => setKip('menu')}
          onGonder={v => gonder(`/api/pes/workshops/${hedef.atolyeId}/kapasite-gun`, 'PUT', { baslangic: hedef.tarih, ...v })} />
      )}
    </div>
  )
}

function Secenek({ renk, ipucu, onClick, children }: { renk: string; ipucu: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: renk }} />{children}
      <small className="ml-auto text-[10.5px] text-faint">{ipucu}</small>
    </button>
  )
}

const alan = 'w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink'
const etiket = 'block text-[10.5px] text-faint'

function RezerveFormu({ hedef, hata, gonderiliyor, onGeri, onGonder }: {
  hedef: HucreHedefi; hata: string | null; gonderiliyor: boolean; onGeri: () => void
  onGonder: (v: { bitis: string; adet: string; sahip: string; gecerlilikBitis: string; notlar: string }) => void
}) {
  const [v, setV] = useState({
    bitis: gunEkle(hedef.tarih, 4), adet: '', sahip: '',
    gecerlilikBitis: gunEkle(hedef.tarih, 14), notlar: '',
  })
  return (
    <form className="space-y-1.5 px-1 pb-1" onSubmit={e => { e.preventDefault(); onGonder(v) }}>
      <p className="text-[11.5px] font-semibold text-ink">Rezerve et</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className={etiket}>Başlangıç<input className={alan} value={trTarih(hedef.tarih)} disabled /></label>
        <label className={etiket}>Bitiş<input id="rz-bitis" type="date" className={alan} value={v.bitis} onChange={e => setV({ ...v, bitis: e.target.value })} required /></label>
      </div>
      <label className={etiket}>Adet/gün <span className="text-faint">(boş = bandın tamamı)</span>
        <input id="rz-adet" type="number" min={1} step={50} className={alan} value={v.adet} onChange={e => setV({ ...v, adet: e.target.value })} placeholder={nf(hedef.bosAdet)} /></label>
      <label className={etiket}>Sahip <span className="text-danger">*</span>
        <input id="rz-sahip" className={alan} value={v.sahip} onChange={e => setV({ ...v, sahip: e.target.value })} required placeholder="M. Aydın" /></label>
      <label className={etiket}>Geçerlilik bitişi <span className="text-danger">*</span>
        <input id="rz-gecerlilik" type="date" className={alan} value={v.gecerlilikBitis} onChange={e => setV({ ...v, gecerlilikBitis: e.target.value })} required /></label>
      <label className={etiket}>Not<input id="rz-not" className={alan} value={v.notlar} onChange={e => setV({ ...v, notlar: e.target.value })} placeholder="Fast track sipariş için" /></label>
      {hata && <p className="text-[11px] text-danger">{hata}</p>}
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onGeri} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-canvas">Geri</button>
        <button type="submit" disabled={gonderiliyor} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">Rezerve et</button>
      </div>
    </form>
  )
}

function KapasiteFormu({ hedef, hata, gonderiliyor, onGeri, onGonder }: {
  hedef: HucreHedefi; hata: string | null; gonderiliyor: boolean; onGeri: () => void
  onGonder: (v: { bitis: string; gunlukKapasite: string; sebep: string }) => void
}) {
  const [v, setV] = useState({ bitis: hedef.tarih, gunlukKapasite: '', sebep: '' })
  return (
    <form className="space-y-1.5 px-1 pb-1" onSubmit={e => { e.preventDefault(); onGonder(v) }}>
      <p className="text-[11.5px] font-semibold text-ink">Atölye günlük kapasitesi</p>
      <p className="text-[10.5px] leading-snug text-faint">Toplam kapasitenin o günlerdeki sapması. Kayıt yoksa bantların hedef toplamı geçerli.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className={etiket}>Başlangıç<input className={alan} value={trTarih(hedef.tarih)} disabled /></label>
        <label className={etiket}>Bitiş<input id="kp-bitis" type="date" className={alan} value={v.bitis} onChange={e => setV({ ...v, bitis: e.target.value })} required /></label>
      </div>
      <label className={etiket}>Günlük kapasite <span className="text-danger">*</span>
        <input id="kp-kapasite" type="number" min={0} step={50} className={alan} value={v.gunlukKapasite} onChange={e => setV({ ...v, gunlukKapasite: e.target.value })} required placeholder="0 = kapalı" /></label>
      <label className={etiket}>Sebep<input id="kp-sebep" className={alan} value={v.sebep} onChange={e => setV({ ...v, sebep: e.target.value })} placeholder="Eleman izni — 2 operatör" /></label>
      {hata && <p className="text-[11px] text-danger">{hata}</p>}
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onGeri} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-canvas">Geri</button>
        <button type="submit" disabled={gonderiliyor} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">Kaydet</button>
      </div>
    </form>
  )
}
