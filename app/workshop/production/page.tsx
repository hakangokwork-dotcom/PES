'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import DonemSecici from '@/components/pes/DonemSecici'
import { Button, Card, CardBody, EmptyState, Field, Input, PageHeader, useToast } from '@/components/ui'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'
import { useDonem } from '@/lib/pes/useDonem'
import { effTone, TONE_ETIKET, TONE_TEXT } from '@/lib/ui/tone'

interface Line { id: number; code: string; name: string; daily_target: number; line_type: string }
interface ProdRow { line_id: number; line_code: string; line_name: string; model_code: string; total_sam: number; target_qty: number; actual_qty: number; work_days: number; giren?: GirenAlanlari & { model_code?: string } }

/* Model değişmediyse yüklenen satırın sürümü; değiştiyse başka bir satır
   yazılacak, o yüzden kontrol yok. */
function uretimSurumu(row: ProdRow): Record<string, string> {
  if (row.giren && row.giren.model_code !== row.model_code) return {}
  return surumBasligi(row.giren)
}

export default function ProductionWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor…</div>}><WorkshopProductionPage /></Suspense>
}

function WorkshopProductionPage() {
  const wid = useAktifAtolyeId()
  const { yil: year, ay: month } = useDonem()
  const toast = useToast()
  const [workshopName, setWorkshopName] = useState('')
  const [rows, setRows] = useState<ProdRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [yenile, setYenile] = useState(0)

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
  }, [wid])

  /* Bantlar ve dönemin kayıtları tek yüklemede; dönem hızlı değişirse
     eski yanıt yenisinin üzerine yazmasın. */
  useEffect(() => {
    if (!wid) return
    let iptal = false
    Promise.all([
      fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()),
      fetch(`/api/pes/production?workshop_id=${wid}&year=${year}&month=${month}`).then(r => r.json()),
    ]).then(([lr, pr]) => {
      if (iptal) return
      const bantlar = ((lr.lines ?? []) as Line[]).filter(l => l.line_type === 'Dikim' || l.line_type === 'Normal')
      const kayitlar = (pr.production ?? []) as Record<string, unknown>[]
      setRows(bantlar.map(l => {
        const k = kayitlar.find(p => p.line_id === l.id)
        return k
          ? { line_id: l.id, line_code: l.code, line_name: l.name, model_code: (k.model_code as string) ?? '', total_sam: Number(k.total_sam) || 0, target_qty: Number(k.target_qty), actual_qty: Number(k.actual_qty), work_days: Number(k.work_days), giren: k as ProdRow['giren'] }
          : { line_id: l.id, line_code: l.code, line_name: l.name, model_code: '', total_sam: 0, target_qty: l.daily_target * 22, actual_qty: 0, work_days: 22 }
      }))
    })
    return () => { iptal = true }
  }, [wid, year, month, yenile])

  function updateRow(idx: number, field: keyof ProdRow, value: string | number) {
    setRows(prev => prev && prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    if (!wid || !rows) return
    setLoading(true)
    let saved = 0
    let hata = ''
    let duranBant = ''
    for (const row of rows) {
      if (!row.model_code && row.actual_qty === 0) continue
      const res = await fetch('/api/pes/production', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...uretimSurumu(row) },
        body: JSON.stringify({ line_id: row.line_id, workshop_id: parseInt(wid), year, month, model_code: row.model_code || `MODEL-${row.line_code}`, total_sam: row.total_sam, target_qty: row.target_qty, actual_qty: row.actual_qty, work_days: row.work_days }),
      })
      if (res.ok) saved++
      else { hata = (await res.json().catch(() => ({}))).error ?? 'Kaydedilemedi'; duranBant = row.line_code; break }
    }
    setLoading(false)
    if (hata) toast.error(`${saved} bant kaydedildi; ${duranBant} bandında durdu: ${hata}`)
    else if (saved === 0) toast.error('Kaydedilecek bant yok: en az bir bantta model ya da gerçekleşen adet girin')
    else toast.success(`${saved} bant için üretim kaydedildi`)
    setYenile(n => n + 1)
  }

  if (!wid) return <AtolyeSecilmedi />

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader crumbs={[{ label: 'Panel', href: '/workshop' }, { label: 'Üretim' }]} title="Aylık üretim girişi" context={workshopName} />

      <Card><CardBody className="flex flex-wrap items-end gap-4"><DonemSecici /></CardBody></Card>

      {rows === null && <p className="text-sm text-faint">Yükleniyor…</p>}

      {rows?.length === 0 && (
        <EmptyState title="Henüz bant yok" description="Üretim bant bazında girilir."
          action={<Link href="/workshop/profile" className="text-sm font-medium text-accent hover:underline">Profil sayfasından bant ekleyin</Link>} />
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const eff = row.target_qty > 0 ? (row.actual_qty / row.target_qty) * 100 : null
              const ton = effTone(eff)
              return (
                <Card key={row.line_id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-4 py-2.5">
                    <div>
                      <span className="font-semibold text-ink">{row.line_code}</span>
                      <span className="ml-2 text-sm text-muted">{row.line_name}</span>
                    </div>
                    <span className="text-xs text-faint">{row.giren ? `Son kayıt: ${girenMetni(row.giren)}` : 'Bu ay kayıt yok'}</span>
                  </div>
                  <CardBody className="grid grid-cols-2 gap-4 md:grid-cols-5">
                    <Field label="Model" className="col-span-2 md:col-span-1">
                      <Input value={row.model_code} onChange={e => updateRow(idx, 'model_code', e.target.value)} placeholder="PNT-001" />
                    </Field>
                    <Field label="Model süresi (SAM)">
                      <Input type="number" min={0} step={0.1} suffix="dk" value={row.total_sam} onChange={e => updateRow(idx, 'total_sam', parseFloat(e.target.value) || 0)} />
                    </Field>
                    <Field label="Hedef">
                      <Input type="number" min={0} suffix="adet" value={row.target_qty} onChange={e => updateRow(idx, 'target_qty', parseInt(e.target.value) || 0)} />
                    </Field>
                    <Field label="Gerçekleşen">
                      <Input type="number" min={0} suffix="adet" value={row.actual_qty} onChange={e => updateRow(idx, 'actual_qty', parseInt(e.target.value) || 0)} />
                    </Field>
                    <div className="flex flex-col justify-end gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Verimlilik</span>
                      <span className={`num text-xl ${TONE_TEXT[ton]}`}>
                        {eff == null ? '—' : `%${eff.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
                        {TONE_ETIKET[ton] && <span className="ml-1.5 text-xs">{TONE_ETIKET[ton]}</span>}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
          <p className="text-xs text-faint">Modeli ve gerçekleşen adedi boş bırakılan bantlar kaydedilmez.</p>
          <Button size="lg" loading={loading} onClick={handleSave}>Kaydet</Button>
        </>
      )}
    </div>
  )
}
