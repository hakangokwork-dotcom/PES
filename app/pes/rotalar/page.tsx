// app/pes/rotalar/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, Card, CardBody, Badge, Button, Field, Input, EmptyState } from '@/components/ui'

type Rota = { id: number; ad: string; aciklama: string | null; aktif: boolean; operasyon_sayisi: number }

export default function Rotalar() {
  const router = useRouter()
  const [liste, setListe] = useState<Rota[]>([])
  const [yeni, setYeni] = useState({ ad: '', aciklama: '' })
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pes/rotalar').then(r => r.json()).then(d => setListe(d.rotalar ?? []))
  }, [])

  async function olustur() {
    setHata(null)
    const r = await fetch('/api/pes/rotalar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Oluşturulamadı'); return }
    router.push(`/pes/rotalar/${d.id}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Rota Şablonları" context="Ürün tipine göre adım sırası, her adımı yapacak firma tipi ve zorunlu formlar. İş emrine uygulanınca kopyalanır." />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Şablon adı"><Input value={yeni.ad} onChange={e => setYeni({ ...yeni, ad: e.target.value })} placeholder="Örn. Yıkamalı denim" /></Field>
          <Field label="Açıklama" className="md:col-span-2">
            <Input value={yeni.aciklama} onChange={e => setYeni({ ...yeni, aciklama: e.target.value })} />
          </Field>
          <Button onClick={olustur} disabled={!yeni.ad.trim()}>Yeni şablon</Button>
          {hata && <p className="md:col-span-4 text-sm text-danger">{hata}</p>}
        </CardBody>
      </Card>

      {liste.length === 0 ? (
        <EmptyState title="Henüz rota şablonu yok" description="Bir şablon açıp adımlarını sıralayın; iş emrinin Aşamalar sekmesinden uygulanır." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr><th className="p-3">Şablon</th><th>Açıklama</th><th>Adım</th><th>Durum</th></tr>
            </thead>
            <tbody>
              {liste.map(r => (
                <tr key={r.id} className="border-t border-line-soft hover:bg-canvas">
                  <td className="p-3"><Link href={`/pes/rotalar/${r.id}`} className="text-accent hover:underline">{r.ad}</Link></td>
                  <td className="text-muted">{r.aciklama ?? '—'}</td>
                  <td className="num">{r.operasyon_sayisi}</td>
                  <td><Badge tone={r.aktif ? 'good' : 'neutral'}>{r.aktif ? 'Aktif' : 'Pasif'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
