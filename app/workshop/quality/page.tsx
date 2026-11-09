'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense, useState, useEffect } from 'react'
import GirenBilgisi from '@/components/pes/GirenBilgisi'
import DonemSecici from '@/components/pes/DonemSecici'
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, useToast } from '@/components/ui'
import type { GirenAlanlari } from '@/lib/pes/giren'
import { useDonem } from '@/lib/pes/useDonem'
import { fpqTone, FPQ_GOOD, TONE_TEXT } from '@/lib/ui/tone'

const DEFECTS = ['Dikiş hatası','Montaj hatası','Kemer/fermuar hatası','Temizlik hatası','Ütü hatası','Etiket/paket hatası','Ölçü hatası']

const BOS_FORM = { inspected_qty: 0, first_pass_qty: 0, rejected_qty: 0, rework_qty: 0, top_defect_cat: '', customer_return: 0, line_id: '' }

const SAYILAR: { key: 'inspected_qty' | 'first_pass_qty' | 'rejected_qty' | 'rework_qty' | 'customer_return'; label: string; hint?: string }[] = [
  { key: 'inspected_qty', label: 'Kontrol edilen', hint: 'Kontrolden geçen toplam adet' },
  { key: 'first_pass_qty', label: 'İlk geçişte sağlam', hint: 'Tamir görmeden geçen adet' },
  { key: 'rejected_qty', label: 'Red edilen' },
  { key: 'rework_qty', label: 'Yeniden işlem' },
  { key: 'customer_return', label: 'Müşteri iadesi' },
]

export default function QualityWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor…</div>}><WorkshopQualityPage /></Suspense>
}

interface LineItem { id: number; code: string; name: string }

function WorkshopQualityPage() {
  const wid = useAktifAtolyeId()
  const { yil: year, ay: month } = useDonem()
  const toast = useToast()
  const [workshopName, setWorkshopName] = useState('')
  const [form, setForm] = useState(BOS_FORM)
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<LineItem[]>([])
  const [mevcut, setMevcut] = useState<GirenAlanlari | null>(null)
  const [yenile, setYenile] = useState(0)

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
    fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? [])).catch(() => {})
  }, [wid])

  /* Kalite kaydı ekleme mantığında (üzerine yazmaz); bu dönemde kayıt
     varsa kim girdiği gösterilir, ikinci kez girilmesin. */
  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/quality?workshop_id=${wid}`).then(r => r.json()).then(d => setMevcut(
      (d.records ?? []).find((r: Record<string, unknown>) => r.year === year && r.month === month) ?? null))
  }, [wid, year, month, yenile])

  const fpq = form.inspected_qty > 0 ? (form.first_pass_qty / form.inspected_qty) * 100 : null
  const redRate = form.inspected_qty > 0 ? (form.rejected_qty / form.inspected_qty) * 100 : null
  const yuzde = (v: number | null) => v == null ? '—' : `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
  const fazla = form.first_pass_qty > form.inspected_qty ? 'Kontrol edilenden fazla olamaz' : undefined

  async function handleSave() {
    if (!wid) return
    setLoading(true)
    const res = await fetch('/api/pes/quality', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: parseInt(wid), year, month, inspected_qty: form.inspected_qty, first_pass_qty: form.first_pass_qty, rejected_qty: form.rejected_qty, rework_qty: form.rework_qty, top_defect_cat: form.top_defect_cat || null, customer_return: form.customer_return, line_id: form.line_id ? parseInt(form.line_id) : null }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Kalite verisi kaydedildi'); setForm(BOS_FORM); setYenile(n => n + 1) }
    else toast.error((await res.json().catch(() => ({}))).error ?? 'Kaydedilemedi')
  }

  if (!wid) return <AtolyeSecilmedi />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader crumbs={[{ label: 'Panel', href: '/workshop' }, { label: 'Kalite' }]} title="Kalite girişi" context={workshopName} />

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <DonemSecici />
          <Field label="Bant" className="w-56">
            <Select value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))}>
              <option value="">Tüm bantlar</option>
              {lines.map(l => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kontrol sonuçları" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {SAYILAR.map(a => (
            <Field key={a.key} label={a.label} hint={a.hint} error={a.key === 'first_pass_qty' ? fazla : undefined}>
              <Input type="number" min={0} suffix="adet" value={form[a.key]}
                onChange={e => setForm(p => ({ ...p, [a.key]: parseInt(e.target.value) || 0 }))} />
            </Field>
          ))}
          <Field label="En sık hata">
            <Select value={form.top_defect_cat} onChange={e => setForm(p => ({ ...p, top_defect_cat: e.target.value }))}>
              <option value="">Seçin…</option>{DEFECTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
        </CardBody>
        <CardBody className="grid grid-cols-1 gap-4 border-t border-line-soft md:grid-cols-3">
          <div className="rounded-md bg-canvas p-3 text-center">
            <p className="text-xs text-faint">İlk geçiş oranı (FPQ)</p>
            <p className={`num text-2xl font-semibold ${TONE_TEXT[fpqTone(fpq)]}`}>{yuzde(fpq)}</p>
          </div>
          <div className="rounded-md bg-canvas p-3 text-center">
            <p className="text-xs text-faint">Red oranı</p>
            <p className="num text-2xl font-semibold text-ink">{yuzde(redRate)}</p>
          </div>
          <div className="rounded-md bg-canvas p-3 text-center">
            <p className="text-xs text-faint">Hedef FPQ</p>
            <p className="num text-2xl font-semibold text-muted">≥%{FPQ_GOOD}</p>
          </div>
        </CardBody>
      </Card>

      <GirenBilgisi kayit={mevcut} ben="atolye" uzerineYazar={false} />
      <Button size="lg" loading={loading} disabled={!!fazla || form.inspected_qty === 0} onClick={handleSave}>Kaydet</Button>
    </div>
  )
}
