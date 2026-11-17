// app/pes/olcu-sartname/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, Card, CardBody, Badge, Button, Field, Select, EmptyState } from '@/components/ui'
import { DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'

type Sartname = {
  id: number; model_adi: string; plm_id: string | null; kumas_kategorisi: string; asama: string
  revizyon: number; durum: string; onaylayan: string | null; onay_tarihi: string | null; nokta_sayisi: number
}
type Model = { id: number; model_adi: string; plm_id: string | null }

export default function OlcuSartnameListesi() {
  const router = useRouter()
  const [liste, setListe] = useState<Sartname[]>([])
  const [modeller, setModeller] = useState<Model[]>([])
  const [yeni, setYeni] = useState({ model_bulten_id: '', kumas_kategorisi: 'Esnek', asama: 'FINAL' })
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pes/olcu-sartname').then(r => r.json()).then(d => {
      setListe(d.sartnameler ?? []); setModeller(d.modeller ?? [])
    })
  }, [])

  async function olustur() {
    setHata(null)
    const r = await fetch('/api/pes/olcu-sartname', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...yeni, model_bulten_id: Number(yeni.model_bulten_id) }),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Oluşturulamadı'); return }
    router.push(`/pes/olcu-sartname/${d.id}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Ölçü Şartnamesi" context="Model × kumaş kategorisi × aşama; nominal, tolerans, ölçüm yöntemi ve revizyon. Hedef nominaldir." />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Model">
            <Select value={yeni.model_bulten_id} onChange={e => setYeni({ ...yeni, model_bulten_id: e.target.value })}>
              <option value="">Seçin</option>
              {modeller.map(m => <option key={m.id} value={m.id}>{m.model_adi}{m.plm_id ? ` · ${m.plm_id}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Kumaş kategorisi">
            <Select value={yeni.kumas_kategorisi} onChange={e => setYeni({ ...yeni, kumas_kategorisi: e.target.value })}>
              <option>Esnek</option><option>Rijit</option>
            </Select>
          </Field>
          <Field label="Aşama">
            <Select value={yeni.asama} onChange={e => setYeni({ ...yeni, asama: e.target.value })}>
              <option value="FINAL">{ASAMA_ETIKET.FINAL}</option>
              <option value="YIKAMA_ONCESI">{ASAMA_ETIKET.YIKAMA_ONCESI}</option>
            </Select>
          </Field>
          <Button onClick={olustur} disabled={!yeni.model_bulten_id}>Yeni şartname</Button>
          {hata && <p className="md:col-span-4 text-sm text-danger">{hata}</p>}
        </CardBody>
      </Card>

      {liste.length === 0 ? (
        <EmptyState title="Henüz şartname yok" description="Bir model seçip yeni şartname açın; ölçü tablosunu Excel'den yapıştırabilirsiniz." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr><th className="p-3">Model</th><th>Kategori</th><th>Aşama</th><th>Rev.</th><th>POM</th><th>Durum</th><th>Onay</th></tr>
            </thead>
            <tbody>
              {liste.map(s => (
                <tr key={s.id} className="border-t border-line-soft hover:bg-canvas">
                  <td className="p-3"><Link href={`/pes/olcu-sartname/${s.id}`} className="text-accent hover:underline">{s.model_adi}</Link></td>
                  <td>{s.kumas_kategorisi}</td>
                  <td>{ASAMA_ETIKET[s.asama]}</td>
                  <td className="num">{s.revizyon}</td>
                  <td className="num">{s.nokta_sayisi}</td>
                  <td><Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge></td>
                  <td className="text-faint text-xs">{s.onaylayan ? `${s.onaylayan} · ${s.onay_tarihi}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
