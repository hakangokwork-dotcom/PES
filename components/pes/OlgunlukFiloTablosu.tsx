'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Select, Badge, Card, CardBody, useToast } from '@/components/ui'
import { seviyeRengi, type FiloSatiri } from '@/lib/pes/olgunluk-denetim'

/* ISI HARİTASI, TABLO DEĞİL: 130 atölyeyi tek tek okumak yerine hangi
   kategorinin filo genelinde çöktüğü kolon boyunca görünsün diye.
   Sıralama en acilden başlar: hiç denetlenmemişler, sonra düşük skorlar. */

const SINIF_TON = { A: 'good', B: 'warn', C: 'bad', D: 'bad', YOK: 'neutral' } as const

export default function OlgunlukFiloTablosu({
  satirlar, kategoriKodlari, atolyeler, yayindaSurumVar,
}: {
  satirlar: FiloSatiri[]
  kategoriKodlari: { kod: string; ad: string }[]
  atolyeler: { id: number; code: string; name: string }[]
  yayindaSurumVar: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [workshopId, setWorkshopId] = useState<number | ''>('')
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10))
  const [denetci, setDenetci] = useState('')
  const [bekliyor, setBekliyor] = useState(false)

  async function baslat() {
    if (!workshopId) { toast.error('Atölye seçin'); return }
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/denetim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, tarih, denetci }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Denetim açılamadı'); return }
      if (j.mevcut) toast.success('Bu tarihte açık denetim vardı, ona devam ediliyor')
      router.push(`/pes/olgunluk/denetim/${j.id}`)
    } finally {
      setBekliyor(false)
    }
  }

  const denetimli = satirlar.filter((s) => s.son_denetim).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="num text-[13px] text-muted">
          {satirlar.length} atölye · {denetimli} tanesinde tamamlanmış denetim
        </span>
        <div className="ml-auto">
          {yayindaSurumVar ? (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAcik((v) => !v)}>
              Yeni denetim
            </Button>
          ) : (
            <Link href="/pes/olgunluk/katalog"
                  className="text-[13px] text-danger underline underline-offset-2">
              Yayında sürüm yok — katalogdan bir sürüm yayınlayın
            </Link>
          )}
        </div>
      </div>

      {acik && yayindaSurumVar && (
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-[1fr_160px_1fr_auto] sm:items-end">
            <Field label="Atölye">
              <Select value={workshopId}
                      onChange={(e) => setWorkshopId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Seçin…</option>
                {atolyeler.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tarih">
              <Input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
            </Field>
            <Field label="Denetçi" hint="isteğe bağlı">
              <Input value={denetci} onChange={(e) => setDenetci(e.target.value)} />
            </Field>
            <Button onClick={baslat} loading={bekliyor}>Başlat</Button>
          </CardBody>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border border-line-soft">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-soft bg-canvas text-left">
              <th className="sticky left-0 z-10 bg-canvas px-3 py-2 font-medium text-faint">Atölye</th>
              <th className="px-3 py-2 font-medium text-faint">Son denetim</th>
              <th className="px-3 py-2 text-right font-medium text-faint">%</th>
              <th className="px-2 py-2 font-medium text-faint">Sınıf</th>
              {kategoriKodlari.map((k) => (
                <th key={k.kod} title={k.ad}
                    className="px-2 py-2 text-center font-medium text-faint">
                  {k.kod}
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-faint">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr key={s.workshop_id} className="border-b border-line-soft last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-3 py-1.5">
                  <Link href={`/pes/workshops/${s.workshop_id}`} className="hover:text-accent-ink">
                    <span className="num text-faint">{s.atolye_kodu}</span>{' '}
                    <span className="text-ink">{s.atolye_adi}</span>
                  </Link>
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-muted">
                  {s.son_denetim ? tarihTR(s.son_denetim) : '—'}
                </td>
                <td className="num px-3 py-1.5 text-right text-ink">
                  {s.yuzde ? `${s.yuzde}` : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={SINIF_TON[s.sinif as keyof typeof SINIF_TON] ?? 'neutral'}>
                    {s.sinif === 'YOK' ? '—' : s.sinif}
                  </Badge>
                </td>
                {kategoriKodlari.map((k) => {
                  const v = s.kategoriler[k.kod]
                  return (
                    <td key={k.kod} className="px-1 py-1.5 text-center">
                      <span className={
                        'num inline-block min-w-[30px] rounded px-1 py-0.5 text-[12px] ' +
                        seviyeRengi(v)
                      }>
                        {v === null || v === undefined ? '·' : v.toFixed(1)}
                      </span>
                    </td>
                  )
                })}
                <td className="whitespace-nowrap px-3 py-1.5">
                  {s.taslak_id ? (
                    <Link href={`/pes/olgunluk/denetim/${s.taslak_id}`}
                          className="text-accent-ink underline underline-offset-2">
                      Taslağa devam
                    </Link>
                  ) : s.denetim_id ? (
                    <Link href={`/pes/olgunluk/denetim/${s.denetim_id}`}
                          className="text-muted underline underline-offset-2 hover:text-ink">
                      Görüntüle
                    </Link>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-faint">
        Hücreler kategorinin ağırlıklı ortalama seviyesi (0-3). Nokta, o kategoride
        değerlendirilmiş süreç olmadığını gösterir. Kolon başlıkları yayındaki sürümün
        kategorileridir; eski sürümle yapılmış denetimlerin hücresi boş kalır.
      </p>
    </div>
  )
}

function tarihTR(s: string) {
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}
