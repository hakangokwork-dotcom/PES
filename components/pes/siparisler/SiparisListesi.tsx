'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge, Button, EmptyState, Input, useToast } from '@/components/ui'
import SiparisFormu from './SiparisFormu'
import { BOYUT_LISTESI, type Gorunum, type Secenekler, type Siparis } from './tipler'

/* Havuz listesi (spec K4, K7, K8).

   URL'den havuz=1 (görünüm), atolye / bant / tarih (takvim hücre menüsünden
   gelen önseçim) okunur; "Atölyeye ata" bunları sihirbaza taşır. Sihirbaz
   URL parametresi okumadığı için köprü bu ekrandır. */

const nf = (n: number) => n.toLocaleString('tr-TR')
const tr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—')

export default function SiparisListesi() {
  const router = useRouter()
  const sp = useSearchParams()
  const toast = useToast()
  const onsecim = { atolye: sp.get('atolye') ?? '', bant: sp.get('bant') ?? '', tarih: sp.get('tarih') ?? '' }

  const [gorunum, setGorunum] = useState<Gorunum>(sp.get('havuz') === '1' ? 'havuz' : (sp.get('gorunum') as Gorunum) || 'havuz')
  const [q, setQ] = useState('')
  const [siparisler, setSiparisler] = useState<Siparis[]>([])
  const [secenekler, setSecenekler] = useState<Secenekler>({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState<Siparis | undefined>()

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const r = await fetch(`/api/pes/siparisler?gorunum=${gorunum}&q=${encodeURIComponent(q)}`)
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Liste yüklenemedi'); return }
      setSiparisler(d.siparisler ?? [])
    } catch { toast.error('Bağlantı hatası') } finally { setYukleniyor(false) }
  }, [gorunum, q, toast])

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => {
    fetch(`/api/pes/katalog?boyut=${BOYUT_LISTESI}`)
      .then(r => r.json()).then(d => setSecenekler(d.secenekler ?? {})).catch(() => {})
  }, [])

  function ata(s: Siparis) {
    const p = new URLSearchParams({ po: String(s.id) })
    if (onsecim.atolye) p.set('atolye', onsecim.atolye)
    if (onsecim.bant) p.set('bant', onsecim.bant)
    if (onsecim.tarih) p.set('tarih', onsecim.tarih)
    router.push(`/pes/siparis-yerlestir?${p}`)
  }

  async function sil(s: Siparis) {
    if (!confirm(`${s.is_emri_no} havuzdan silinsin mi?`)) return
    const r = await fetch(`/api/pes/siparisler/${s.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error(d.error ?? 'Silinemedi'); return }
    toast.success('Silindi'); yukle()
  }

  const kalanTonu = (g: number | null) =>
    g == null ? '' : g < 0 ? 'bg-danger-soft/50' : g <= 7 ? 'bg-warn-soft/60' : ''

  return (
    <div className="space-y-3">
      {onsecim.bant && (
        <p className="rounded-lg border border-accent-soft bg-accent-soft/60 px-3 py-2 text-[12.5px] text-accent-ink">
          Takvimden geldiniz: seçtiğiniz bant ve tarih, "Atölyeye ata" ile sihirbaza önseçili gider.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface p-2.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Görünüm">
          {([['havuz', 'Havuzda'], ['atanmis', 'Atanmış'], ['hepsi', 'Hepsi']] as const).map(([k, et]) => (
            <button key={k} type="button" onClick={() => setGorunum(k)} aria-pressed={gorunum === k}
              className={`px-3 py-1.5 text-sm ${gorunum === k ? 'bg-accent text-white' : 'text-muted hover:bg-canvas hover:text-ink'}`}>{et}</button>
          ))}
        </div>
        <Input id="sp-ara" value={q} onChange={e => setQ(e.target.value)} placeholder="Sipariş no, müşteri, model…" className="w-64" />
        <span className="text-xs text-faint">{siparisler.length} kayıt</span>
        <Button className="ml-auto" size="sm" onClick={() => { setDuzenlenen(undefined); setFormAcik(true) }}>+ Havuza ekle</Button>
      </div>

      {formAcik && (
        <SiparisFormu mevcut={duzenlenen} secenekler={secenekler}
          onKapat={() => setFormAcik(false)}
          onKaydedildi={() => { setFormAcik(false); yukle() }} />
      )}

      {yukleniyor ? <p className="p-6 text-center text-[13px] text-faint">Yükleniyor…</p>
        : siparisler.length === 0 ? (
          <EmptyState title={gorunum === 'havuz' ? 'Havuz boş' : 'Kayıt yok'}
            description={gorunum === 'havuz' ? 'Gelen PO\'yu "+ Havuza ekle" ile yazın; künyesini girip atölyeye atayın.' : 'Bu görünümde sipariş bulunmuyor.'} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-soft bg-surface">
            <table className="w-full text-xs">
              <thead className="bg-canvas text-[10.5px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-3 py-2 text-left">Sipariş</th>
                  <th className="px-3 py-2 text-left">Müşteri</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Klasman</th>
                  <th className="px-3 py-2 text-left">Kumaş türü</th>
                  <th className="px-3 py-2 text-right">Adet</th>
                  <th className="px-3 py-2 text-left">Teslim</th>
                  <th className="px-3 py-2 text-right">Kalan</th>
                  <th className="px-3 py-2 text-left">Atölye</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {siparisler.map(s => (
                  <tr key={s.id} className={`border-t border-line-soft hover:bg-canvas/60 ${kalanTonu(s.kalan_gun)}`}>
                    <td className="px-3 py-1.5"><span className="font-mono font-medium text-ink">{s.is_emri_no}</span>
                      {s.oncelik && s.oncelik !== 'Normal' && <Badge tone={s.oncelik === 'Kritik' ? 'bad' : 'warn'}>{s.oncelik}</Badge>}</td>
                    <td className="px-3 py-1.5 text-body">{s.musteri ?? '—'}</td>
                    <td className="px-3 py-1.5 text-body">{s.model_adi}{s.stil_kodu && <span className="ml-1 text-faint">· {s.stil_kodu}</span>}</td>
                    <td className="px-3 py-1.5 text-body">{s.klasman ?? <span className="text-faint">—</span>}</td>
                    <td className="px-3 py-1.5 text-body">{s.kumas_turu ?? <span className="text-faint">—</span>}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{nf(s.siparis_miktari)}</td>
                    <td className="px-3 py-1.5 font-mono">{tr(s.teslim_tarihi)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${s.kalan_gun != null && s.kalan_gun < 0 ? 'font-semibold text-danger' : ''}`}>
                      {s.kalan_gun == null ? '—' : `${s.kalan_gun} g`}</td>
                    <td className="px-3 py-1.5 text-body">{s.atolye_adi ?? <span className="rounded bg-canvas px-1.5 py-px text-[10.5px] text-faint">havuzda</span>}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {s.workshop_id === null && (
                        <>
                          <Button size="sm" onClick={() => ata(s)}>Atölyeye ata</Button>
                          <Button size="sm" variant="ghost" className="ml-1" onClick={() => { setDuzenlenen(s); setFormAcik(true) }}>Düzenle</Button>
                          <button type="button" onClick={() => sil(s)} className="ml-1 px-1.5 text-danger" title="Havuzdan sil">×</button>
                        </>
                      )}
                      {s.workshop_id !== null && (
                        <Button size="sm" variant="ghost" onClick={() => { setDuzenlenen(s); setFormAcik(true) }}>Künye</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
