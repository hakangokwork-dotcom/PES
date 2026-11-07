'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, TabloSarmal, useToast } from '@/components/ui'

interface Line { id: number; code: string; name: string }
interface DowntimeRow { id: number; line_code: string; occurred_at: string; duration_min: number; downtime_type: string; reason: string | null; affected_ops: number }

const TYPES = ['Planlı','Plansız','Organizasyonel','Tedarik']

const yeniForm = () => ({ line_id: '', occurred_at: new Date().toISOString().slice(0, 16), duration_min: 0, downtime_type: 'Plansız', reason: '', affected_ops: 0 })

export default function DowntimeWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor…</div>}><WorkshopDowntimePage /></Suspense>
}

function WorkshopDowntimePage() {
  const wid = useAktifAtolyeId()
  const toast = useToast()
  const [workshopName, setWorkshopName] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [records, setRecords] = useState<DowntimeRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [denendi, setDenendi] = useState(false)
  const [form, setForm] = useState(yeniForm)

  const kayitlariYukle = useCallback(() => {
    if (!wid) return
    fetch(`/api/pes/downtime?workshop_id=${wid}`).then(r => r.json()).then(d => setRecords(d.records ?? []))
  }, [wid])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
    fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? []))
    kayitlariYukle()
  }, [wid, kayitlariYukle])

  const hatalar = {
    line_id: !form.line_id ? 'Bant seçin' : undefined,
    duration_min: form.duration_min <= 0 ? 'Süre girin' : undefined,
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setDenendi(true)
    if (hatalar.line_id || hatalar.duration_min) return
    setLoading(true)
    const res = await fetch('/api/pes/downtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, line_id: parseInt(form.line_id), occurred_at: new Date(form.occurred_at).toISOString() }) })
    setLoading(false)
    if (res.ok) {
      toast.success('Duruş kaydedildi')
      setShowForm(false); setDenendi(false); setForm(yeniForm())
      kayitlariYukle()
    } else toast.error((await res.json().catch(() => ({}))).error ?? 'Kaydedilemedi')
  }

  const totalMin = records.reduce((s, r) => s + r.duration_min, 0)
  if (!wid) return <AtolyeSecilmedi />

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        crumbs={[{ label: 'Panel', href: '/workshop' }, { label: 'Duruş' }]}
        title="Duruş kayıtları"
        context={workshopName}
        actions={!showForm && <Button icon={<Plus className="size-4" />} onClick={() => setShowForm(true)}>Duruş ekle</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader title="Yeni duruş" />
          <form onSubmit={handleAdd} noValidate>
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Bant" error={denendi ? hatalar.line_id : undefined}>
                <Select value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))}>
                  <option value="">Seçin…</option>{lines.map(l => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
                </Select>
              </Field>
              <Field label="Başladığı an">
                <Input type="datetime-local" value={form.occurred_at} onChange={e => setForm(p => ({ ...p, occurred_at: e.target.value }))} />
              </Field>
              <Field label="Süre" error={denendi ? hatalar.duration_min : undefined}>
                <Input type="number" min={1} suffix="dk" value={form.duration_min} onChange={e => setForm(p => ({ ...p, duration_min: parseInt(e.target.value) || 0 }))} />
              </Field>
              <Field label="Tür">
                <Select value={form.downtime_type} onChange={e => setForm(p => ({ ...p, downtime_type: e.target.value }))}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select>
              </Field>
              <Field label="Etkilenen operatör" hint="Duruş süresince boş bekleyen kişi">
                <Input type="number" min={0} suffix="kişi" value={form.affected_ops} onChange={e => setForm(p => ({ ...p, affected_ops: parseInt(e.target.value) || 0 }))} />
              </Field>
              <Field label="Neden">
                <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Örn. makine arızası" />
              </Field>
            </CardBody>
            <div className="flex gap-2 border-t border-line-soft px-4 py-3">
              <Button type="submit" size="lg" loading={loading}>Kaydet</Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => { setShowForm(false); setDenendi(false) }}>Vazgeç</Button>
            </div>
          </form>
        </Card>
      )}

      {records.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card><CardBody><p className="text-xs text-faint">Toplam duruş</p><p className="num text-xl font-semibold text-ink">{totalMin.toLocaleString('tr-TR')} dk</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-faint">Kayıt</p><p className="num text-xl font-semibold text-ink">{records.length}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-faint">Ortalama</p><p className="num text-xl font-semibold text-ink">{Math.round(totalMin / records.length).toLocaleString('tr-TR')} dk</p></CardBody></Card>
        </div>
      )}

      {records.length === 0 && !showForm && (
        <EmptyState title="Henüz duruş kaydı yok" description="Bir bant durduğunda süresini ve nedenini girin; aylık kayıp burada toplanır."
          action={<Button size="sm" onClick={() => setShowForm(true)}>Duruş ekle</Button>} />
      )}

      {records.length > 0 && (
        <Card className="overflow-hidden">
          {/* yukseklik: sarmal dikey de kaysın ki thead'in yapışkanlığı gerçekten işlesin. */}
          <TabloSarmal yukseklik="70vh">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-line-soft bg-canvas text-left"><th className="px-4 py-3 font-medium text-faint">Tarih</th><th className="px-4 py-3 font-medium text-faint">Bant</th><th className="px-4 py-3 text-right font-medium text-faint">Süre</th><th className="px-4 py-3 text-center font-medium text-faint">Tür</th><th className="px-4 py-3 font-medium text-faint">Neden</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className="num px-4 py-3 text-muted">{new Date(r.occurred_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-4 py-3">{r.line_code}</td>
                    <td className="num px-4 py-3 text-right font-medium text-ink">{r.duration_min} dk</td>
                    <td className="px-4 py-3 text-center"><Badge tone={r.downtime_type === 'Plansız' ? 'bad' : r.downtime_type === 'Tedarik' ? 'warn' : 'neutral'}>{r.downtime_type}</Badge></td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-muted" title={r.reason ?? undefined}>{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabloSarmal>
        </Card>
      )}
    </div>
  )
}
