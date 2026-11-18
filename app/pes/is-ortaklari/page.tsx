// app/pes/is-ortaklari/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader, Card, CardBody, Badge, Button, Field, Input, Select, EmptyState } from '@/components/ui'
import { ORTAK_TIPLERI } from '@/lib/pes/is-emri-adim'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'

type Ortak = GirenAlanlari & {
  id: number; tip: string; unvan: string; kisa_ad: string | null; il: string | null
  telefon: string | null; eposta: string | null; aktif: boolean; workshop_id: number | null
}
type Duzen = { unvan: string; il: string; telefon: string; eposta: string; aktif: boolean }

const YENI_TIPLER = ORTAK_TIPLERI.filter(t => t !== 'Atölye')
const BOS_YENI = { tip: YENI_TIPLER[0] as string, unvan: '', il: '', telefon: '', eposta: '' }

export default function IsOrtaklari() {
  const [liste, setListe] = useState<Ortak[]>([])
  const [tip, setTip] = useState('')
  const [q, setQ] = useState('')
  const [yeni, setYeni] = useState(BOS_YENI)
  const [duzenlenen, setDuzenlenen] = useState<{ id: number; v: Duzen } | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(() => {
    const p = new URLSearchParams()
    if (tip) p.set('tip', tip)
    if (q.trim()) p.set('q', q.trim())
    fetch(`/api/pes/is-ortaklari?${p}`).then(r => r.json()).then(d => setListe(d.ortaklar ?? []))
  }, [tip, q])
  useEffect(() => { yukle() }, [yukle])

  async function olustur() {
    setHata(null)
    const r = await fetch('/api/pes/is-ortaklari', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Eklenemedi'); return }
    setYeni(BOS_YENI); yukle()
  }

  async function kaydet(o: Ortak, v: Duzen) {
    setHata(null)
    const govde: Record<string, unknown> = { il: v.il, telefon: v.telefon, eposta: v.eposta, aktif: v.aktif }
    if (o.tip !== 'Atölye') govde.unvan = v.unvan
    const r = await fetch(`/api/pes/is-ortaklari/${o.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...surumBasligi(o) }, body: JSON.stringify(govde),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return }
    setDuzenlenen(null); yukle()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="İş Ortakları" context="Kumaşçı, aksesuarcı, kesimhane, yıkamacı, UKP, baskı, nakış ve atölyeler. İş emri adımlarının firması buradan seçilir." />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-6 items-end">
          <Field label="Firma tipi" hint="Atölyeler atölye kaydından gelir">
            <Select value={yeni.tip} onChange={e => setYeni({ ...yeni, tip: e.target.value })}>
              {YENI_TIPLER.map(t => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Unvan" className="md:col-span-2">
            <Input value={yeni.unvan} onChange={e => setYeni({ ...yeni, unvan: e.target.value })} />
          </Field>
          <Field label="İl"><Input value={yeni.il} onChange={e => setYeni({ ...yeni, il: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={yeni.telefon} onChange={e => setYeni({ ...yeni, telefon: e.target.value })} /></Field>
          <Button onClick={olustur} disabled={!yeni.unvan.trim()}>Yeni iş ortağı</Button>
          {hata && <p className="md:col-span-6 text-sm text-danger">{hata}</p>}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Tip">
            <Select value={tip} onChange={e => setTip(e.target.value)}>
              <option value="">Tümü</option>
              {ORTAK_TIPLERI.map(t => <option key={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        <div className="w-64">
          <Field label="Ara"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Unvan ya da kısa ad" /></Field>
        </div>
        <span className="pb-2 text-xs text-faint">{liste.length} firma</span>
      </div>

      {liste.length === 0 ? (
        <EmptyState title="İş ortağı yok" description="Filtreyi değiştirin ya da yukarıdan yeni firma ekleyin." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr><th className="p-3">Unvan</th><th>Tip</th><th>İl</th><th>Telefon</th><th>E-posta</th><th>Durum</th><th></th></tr>
            </thead>
            <tbody>
              {liste.map(o => {
                const d = duzenlenen?.id === o.id ? duzenlenen.v : null
                const set = (k: keyof Duzen, val: string | boolean) => setDuzenlenen({ id: o.id, v: { ...d!, [k]: val } })
                return (
                  <tr key={o.id} className="border-t border-line-soft align-middle">
                    <td className="p-3">
                      {d && o.tip !== 'Atölye'
                        ? <Input value={d.unvan} onChange={e => set('unvan', e.target.value)} />
                        : <span title={girenMetni(o)}>{o.unvan}</span>}
                    </td>
                    <td><Badge>{o.tip}</Badge></td>
                    <td>{d ? <div className="w-28"><Input value={d.il} onChange={e => set('il', e.target.value)} /></div> : o.il ?? '—'}</td>
                    <td>{d ? <div className="w-36"><Input value={d.telefon} onChange={e => set('telefon', e.target.value)} /></div> : o.telefon ?? '—'}</td>
                    <td>{d ? <div className="w-48"><Input value={d.eposta} onChange={e => set('eposta', e.target.value)} /></div> : o.eposta ?? '—'}</td>
                    <td>
                      {d
                        ? <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={d.aktif} onChange={e => set('aktif', e.target.checked)} />Aktif</label>
                        : <Badge tone={o.aktif ? 'good' : 'neutral'}>{o.aktif ? 'Aktif' : 'Pasif'}</Badge>}
                    </td>
                    <td className="pr-3 text-right whitespace-nowrap">
                      {d ? (
                        <>
                          <Button size="sm" onClick={() => kaydet(o, d)}>Kaydet</Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => setDuzenlenen(null)}>Vazgeç</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDuzenlenen({ id: o.id, v: {
                          unvan: o.unvan, il: o.il ?? '', telefon: o.telefon ?? '', eposta: o.eposta ?? '', aktif: o.aktif,
                        } })}>Düzenle</Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
