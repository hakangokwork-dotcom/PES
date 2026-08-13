'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Badge, Card, CardBody, useToast } from '@/components/ui'
import { TUR_ETIKET, type AtolyeOlgunluk } from '@/lib/pes/olgunluk-denetim'
import OlgunlukRadar from '@/components/pes/OlgunlukRadar'

/* ATÖLYENİN KENDİ EKRANI.

   Merkezin atölye sekmesiyle aynı veriyi gösterir ama iki şeyi bilerek
   yapmaz: A/B/C/D sınıfı YAZMAZ ve filo karşılaştırmasına bağlantı
   vermez. Öz değerlendirme sınıf belirlemiyor; burada sınıf göstermek
   atölyeye "kendime A verdim" dedirtirdi.

   Denetçinin en son resmi denetimi varsa o da gösterilir — atölye kendi
   beyanı ile denetim sonucunu yan yana görsün diye. */

export default function AtolyeOzDegerlendirme({
  workshopId, veri,
}: {
  workshopId: number
  veri: AtolyeOlgunluk
}) {
  const router = useRouter()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10))
  const [bekliyor, setBekliyor] = useState(false)

  const ozler = veri.denetimler.filter((d) => d.tur === 'OZ_DEGERLENDIRME')
  const denetimler = veri.denetimler.filter((d) => d.tur === 'DENETIM')
  const acikTaslak = ozler.find((d) => d.durum === 'taslak')
  const sonOz = ozler.find((d) => d.durum === 'tamamlandi')
  const sonDenetim = denetimler.find((d) => d.durum === 'tamamlandi')

  async function baslat() {
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/denetim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, tarih }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Başlatılamadı'); return }
      router.push(`/pes/olgunluk/denetim/${j.id}`)
    } finally {
      setBekliyor(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Kendi değerlendirmeniz</div>
          <div className="num text-[26px] font-medium leading-tight tracking-tight text-ink">
            {sonOz?.yuzde ? `%${sonOz.yuzde}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Son denetim sonucu</div>
          <div className="num text-[26px] font-medium leading-tight tracking-tight text-muted">
            {sonDenetim?.yuzde ? `%${sonDenetim.yuzde}` : '—'}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {acikTaslak ? (
            <Link href={`/pes/olgunluk/denetim/${acikTaslak.denetim_id}`}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas">
              Yarım kalana devam et
            </Link>
          ) : null}
          {veri.yayindaSurum ? (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAcik((v) => !v)}>
              Yeni öz değerlendirme
            </Button>
          ) : (
            <span className="text-xs text-faint">Henüz yayında bir soru seti yok</span>
          )}
        </div>
      </div>

      {sonOz && sonDenetim && sonOz.yuzde && sonDenetim.yuzde && (
        <p className="rounded-lg border border-line-soft bg-canvas px-4 py-2.5 text-[13px] text-muted">
          Kendi değerlendirmenizle denetim sonucu arasında{' '}
          <strong className="num">
            {Math.abs(Number(sonOz.yuzde) - Number(sonDenetim.yuzde)).toFixed(1)} puan
          </strong>{' '}
          fark var. Fark büyükse hangi maddelerde ayrıştığınıza bakmak, denetim öncesi
          en hızlı kazanç sağlayan iştir.
        </p>
      )}

      {acik && veri.yayindaSurum && (
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-[180px_auto] sm:items-end">
            <Field label="Tarih" hint={`Soru seti: ${veri.yayindaSurum.kod}`}>
              <Input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
            </Field>
            <Button onClick={baslat} loading={bekliyor}>Başlat</Button>
          </CardBody>
        </Card>
      )}

      {sonOz && (
        <Card>
          <div className="border-b border-line-soft px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Kategori profiliniz</span>
            <span className="num ml-2 text-[11px] text-faint">{tarihTR(sonOz.tarih)}</span>
          </div>
          <CardBody>
            {/* Radar en son RESMİ denetimden geliyorsa yanıltıcı olurdu;
                atölyenin kendi ekranında kendi beyanı gösterilir. */}
            <OlgunlukRadar kategoriler={veri.sonKategoriler} />
          </CardBody>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Geçmiş</h2>
        {veri.denetimler.length === 0 ? (
          <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
            Henüz kayıt yok.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line-soft">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-soft bg-canvas text-left">
                  <th className="px-3 py-2 font-medium text-faint">Tarih</th>
                  <th className="px-3 py-2 font-medium text-faint">Tür</th>
                  <th className="px-3 py-2 font-medium text-faint">Durum</th>
                  <th className="px-3 py-2 text-right font-medium text-faint">%</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {veri.denetimler.map((d) => (
                  <tr key={d.denetim_id} className="border-b border-line-soft last:border-0">
                    <td className="num whitespace-nowrap px-3 py-1.5 text-ink">{tarihTR(d.tarih)}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={d.tur === 'DENETIM' ? 'good' : 'neutral'}>
                        {TUR_ETIKET[d.tur]}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-muted">
                      {d.durum === 'tamamlandi' ? 'Tamamlandı' : 'Taslak'}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-ink">{d.yuzde ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {/* Resmi denetim atölye tarafından değiştirilemez; RLS
                          yazmayı zaten reddeder, burada da açmıyoruz. */}
                      {d.tur === 'OZ_DEGERLENDIRME' ? (
                        <Link href={`/pes/olgunluk/denetim/${d.denetim_id}`}
                              className="text-accent-ink underline underline-offset-2">
                          {d.durum === 'taslak' ? 'Devam et' : 'Görüntüle'}
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
        )}
      </div>
    </div>
  )
}

function tarihTR(s: string) {
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}
