'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense, useState, useEffect } from 'react'
import GirenBilgisi from '@/components/pes/GirenBilgisi'
import DonemSecici from '@/components/pes/DonemSecici'
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader, useToast } from '@/components/ui'
import { surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'
import { useDonem } from '@/lib/pes/useDonem'
import { devirTone, TONE_BADGE } from '@/lib/ui/tone'

const BOS_FORM = { total_staff: 0, left_count: 0, joined_count: 0, in_warmup: 0, avg_tenure_mon: 0 }

const ALANLAR: { key: keyof typeof BOS_FORM; label: string; hint?: string; ondalik?: boolean }[] = [
  { key: 'total_staff', label: 'Toplam çalışan', hint: 'Ay sonundaki kişi sayısı' },
  { key: 'left_count', label: 'Ayrılan', hint: 'Bu ay işten ayrılan' },
  { key: 'joined_count', label: 'Başlayan', hint: 'Bu ay işe başlayan' },
  { key: 'in_warmup', label: 'Isınma sürecinde', hint: 'Henüz tam verimde olmayan yeni kişi' },
  { key: 'avg_tenure_mon', label: 'Ortalama kıdem (ay)', ondalik: true },
]

export default function WorkforceWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor…</div>}><WorkshopWorkforcePage /></Suspense>
}

function WorkshopWorkforcePage() {
  const wid = useAktifAtolyeId()
  const { yil: year, ay: month } = useDonem()
  const toast = useToast()
  const [workshopName, setWorkshopName] = useState('')
  const [form, setForm] = useState(BOS_FORM)
  const [loading, setLoading] = useState(false)
  const [mevcut, setMevcut] = useState<(GirenAlanlari & { devir_orani?: string | null }) | null>(null)
  const [yenile, setYenile] = useState(0)

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
  }, [wid])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workforce?workshop_id=${wid}`).then(r => r.json()).then(d => {
      const existing = (d.records ?? []).find((r: Record<string, unknown>) => r.year === year && r.month === month)
      setMevcut(existing ?? null)
      // Kayıt yoksa formu boşalt: önceki ayın değerleri yeni aya yazılmasın.
      setForm(existing ? { total_staff: existing.total_staff, left_count: existing.left_count, joined_count: existing.joined_count, in_warmup: existing.in_warmup, avg_tenure_mon: Number(existing.avg_tenure_mon ?? 0) } : BOS_FORM)
    })
  }, [wid, year, month, yenile])

  // Oran veritabanında hesaplanır (056); ekran yeniden hesaplamaz.
  const devir = mevcut?.devir_orani == null ? null : Number(mevcut.devir_orani)

  async function handleSave() {
    if (!wid) return
    setLoading(true)
    const res = await fetch('/api/pes/workforce', { method: 'POST', headers: { 'Content-Type': 'application/json', ...surumBasligi(mevcut) }, body: JSON.stringify({ workshop_id: parseInt(wid), year, month, ...form }) })
    setLoading(false)
    if (res.ok) { toast.success('İşgücü verisi kaydedildi'); setYenile(n => n + 1) }
    else toast.error((await res.json().catch(() => ({}))).error ?? 'Kaydedilemedi')
  }

  if (!wid) return <AtolyeSecilmedi />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader crumbs={[{ label: 'Panel', href: '/workshop' }, { label: 'İşgücü' }]} title="İşgücü girişi" context={workshopName} />

      <Card><CardBody className="flex flex-wrap items-end gap-4"><DonemSecici /></CardBody></Card>

      <Card>
        <CardHeader title="Bu ayın işgücü hareketi" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {ALANLAR.map(a => (
            <Field key={a.key} label={a.label} hint={a.hint}>
              <Input type="number" min={0} step={a.ondalik ? 0.1 : 1} value={form[a.key]}
                onChange={e => setForm(p => ({ ...p, [a.key]: (a.ondalik ? parseFloat(e.target.value) : parseInt(e.target.value)) || 0 }))} />
            </Field>
          ))}
          <div className={`rounded-md p-3 text-center ${TONE_BADGE[devirTone(devir)]}`}>
            <p className="text-xs">Kayıtlı devir oranı</p>
            <p className="num text-2xl font-semibold">{devir == null ? '—' : `%${devir.toLocaleString('tr-TR')}`}</p>
            <p className="text-[11px]">ayrılan / toplam · kaydedince güncellenir</p>
          </div>
        </CardBody>
      </Card>

      <GirenBilgisi kayit={mevcut} ben="atolye" />
      <Button size="lg" loading={loading} onClick={handleSave}>Kaydet</Button>
    </div>
  )
}
