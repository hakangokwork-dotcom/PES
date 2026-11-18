// app/pes/rotalar/[id]/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { PageHeader, Card, CardBody, Button, Field, Input, Select, EmptyState } from '@/components/ui'
import { ORTAK_TIPLERI } from '@/lib/pes/is-emri-adim'

type Op = { stage_id: number | ''; ortak_tipi: string; zorunlu_formlar: string[]; varsayilan_ortak_id: number | null }
type Asama = { id: number; code: string; name: string }
type Form = { kod: string; ad: string }
type Ortak = { id: number; tip: string; unvan: string }

export default function RotaDetay() {
  const id = Number(useParams<{ id: string }>().id)
  const [rota, setRota] = useState({ ad: '', aciklama: '', aktif: true })
  const [ops, setOps] = useState<Op[]>([])
  const [asamalar, setAsamalar] = useState<Asama[]>([])
  const [formlar, setFormlar] = useState<Form[]>([])
  const [ortaklar, setOrtaklar] = useState<Ortak[]>([])
  const [mesaj, setMesaj] = useState<{ iyi: boolean; metin: string } | null>(null)

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/rotalar/${id}`).then(r => r.json())
    if (!d.rota) { setMesaj({ iyi: false, metin: d.error ?? 'Şablon bulunamadı' }); return }
    setRota({ ad: d.rota.ad, aciklama: d.rota.aciklama ?? '', aktif: d.rota.aktif })
    setOps(d.operasyonlar.map((o: Op) => ({
      stage_id: o.stage_id, ortak_tipi: o.ortak_tipi, zorunlu_formlar: o.zorunlu_formlar ?? [], varsayilan_ortak_id: o.varsayilan_ortak_id,
    })))
    setAsamalar(d.asamalar); setFormlar(d.formlar)
  }, [id])
  useEffect(() => { yukle() }, [yukle])
  useEffect(() => {
    fetch('/api/pes/is-ortaklari?aktif=1').then(r => r.json()).then(d => setOrtaklar(d.ortaklar ?? []))
  }, [])

  const degistir = (i: number, p: Partial<Op>) => setOps(ops.map((o, j) => j === i ? { ...o, ...p } : o))
  const tasi = (i: number, yon: -1 | 1) => {
    const j = i + yon
    if (j < 0 || j >= ops.length) return
    const yeni = [...ops];[yeni[i], yeni[j]] = [yeni[j], yeni[i]]; setOps(yeni)
  }

  async function kaydet() {
    setMesaj(null)
    const r = await fetch(`/api/pes/rotalar/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rota, operasyonlar: ops }),
    })
    const d = await r.json()
    if (!r.ok) { setMesaj({ iyi: false, metin: d.error ?? 'Kaydedilemedi' }); return }
    setMesaj({ iyi: true, metin: 'Kaydedildi' }); yukle()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Rota Şablonları', href: '/pes/rotalar' }]}
        title={rota.ad || 'Rota şablonu'}
        context="Sıra yukarıdan aşağıya. Şablon iş emrine kopyalanır; sonradan yapılan değişiklik eski iş emirlerini değiştirmez."
        actions={<Button onClick={kaydet}>Kaydet</Button>}
      />
      {mesaj && <p className={`text-sm ${mesaj.iyi ? 'text-ok' : 'text-danger'}`}>{mesaj.metin}</p>}

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Şablon adı"><Input value={rota.ad} onChange={e => setRota({ ...rota, ad: e.target.value })} /></Field>
          <Field label="Açıklama" className="md:col-span-2">
            <Input value={rota.aciklama} onChange={e => setRota({ ...rota, aciklama: e.target.value })} />
          </Field>
          <label className="flex h-9 items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={rota.aktif} onChange={e => setRota({ ...rota, aktif: e.target.checked })} />
            Aktif
          </label>
        </CardBody>
      </Card>

      {ops.length === 0 ? (
        <EmptyState title="Operasyon yok" description="Satır ekleyip aşamayı ve firma tipini seçin." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr><th className="p-3">Sıra</th><th>Aşama</th><th>Firma tipi</th><th>Varsayılan firma</th><th>Zorunlu formlar</th><th></th></tr>
            </thead>
            <tbody>
              {ops.map((o, i) => (
                <tr key={i} className="border-t border-line-soft align-top">
                  <td className="p-3 whitespace-nowrap">
                    <span className="num mr-1 text-faint">{(i + 1) * 10}</span>
                    <button aria-label="Yukarı taşı" className="text-faint hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => tasi(i, -1)}><ArrowUp className="inline size-3.5" /></button>
                    <button aria-label="Aşağı taşı" className="text-faint hover:text-ink disabled:opacity-30" disabled={i === ops.length - 1} onClick={() => tasi(i, 1)}><ArrowDown className="inline size-3.5" /></button>
                  </td>
                  <td className="py-2 pr-2"><div className="w-44">
                    <Select aria-label="Aşama" value={o.stage_id} onChange={e => degistir(i, { stage_id: e.target.value ? Number(e.target.value) : '' })}>
                      <option value="">Seçin</option>
                      {asamalar.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </div></td>
                  <td className="py-2 pr-2"><div className="w-36">
                    <Select aria-label="Firma tipi" value={o.ortak_tipi} onChange={e => degistir(i, { ortak_tipi: e.target.value, varsayilan_ortak_id: null })}>
                      {ORTAK_TIPLERI.map(t => <option key={t}>{t}</option>)}
                    </Select>
                  </div></td>
                  <td className="py-2 pr-2"><div className="w-52">
                    <Select aria-label="Varsayılan firma" value={o.varsayilan_ortak_id ?? ''}
                      onChange={e => degistir(i, { varsayilan_ortak_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">{o.ortak_tipi === 'Atölye' ? 'İş emrinin atölyesi' : 'Yok'}</option>
                      {ortaklar.filter(x => x.tip === o.ortak_tipi).map(x => <option key={x.id} value={x.id}>{x.unvan}</option>)}
                    </Select>
                  </div></td>
                  <td className="py-2 pr-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-muted">
                        {o.zorunlu_formlar.length ? `${o.zorunlu_formlar.length} form` : 'Form yok'}
                      </summary>
                      <div className="mt-1 grid max-h-56 gap-1 overflow-y-auto">
                        {formlar.map(f => (
                          <label key={f.kod} className="flex items-center gap-1.5 text-xs text-ink">
                            <input type="checkbox" checked={o.zorunlu_formlar.includes(f.kod)} onChange={e => degistir(i, {
                              zorunlu_formlar: e.target.checked ? [...o.zorunlu_formlar, f.kod] : o.zorunlu_formlar.filter(k => k !== f.kod),
                            })} />
                            {f.ad}
                          </label>
                        ))}
                      </div>
                    </details>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button aria-label="Satırı sil" className="text-faint hover:text-danger" onClick={() => setOps(ops.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOps([...ops, { stage_id: '', ortak_tipi: 'Atölye', zorunlu_formlar: [], varsayilan_ortak_id: null }])}>
          Satır ekle
        </Button>
        <Link href="/pes/rotalar" className="self-center text-sm text-muted hover:underline">Listeye dön</Link>
      </div>
    </div>
  )
}
