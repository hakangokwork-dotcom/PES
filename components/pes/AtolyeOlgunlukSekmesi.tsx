'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Badge, Card, CardBody, useToast } from '@/components/ui'
import { tierTone } from '@/lib/ui/tone'
import { olgunlukSinifi, type AtolyeOlgunluk } from '@/lib/pes/olgunluk-denetim'
import OlgunlukRadar from '@/components/pes/OlgunlukRadar'

/* ATÖLYE DETAYINDA OLGUNLUK.

   Filo görünümü "hangi atölye ne durumda" sorusunu topluca cevaplıyordu;
   tek bir atölyenin sayfasında ise olgunluk hiç görünmüyordu — atölyeyle
   ilgili her şeyin toplandığı yer orası olduğu halde.

   Burada üç soru cevaplanıyor:
     - şu an ne durumda (son tamamlanmış denetimin yüzdesi, sınıfı, profili)
     - yarım kalmış bir denetim var mı (taslaklar listede, "devam et" ile)
     - geçmişte nasıldı (denetim listesi, tarih sırasıyla) */

export default function AtolyeOlgunlukSekmesi({
  workshopId, veri,
}: {
  workshopId: number
  veri: AtolyeOlgunluk
}) {
  const router = useRouter()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10))
  const [denetci, setDenetci] = useState('')
  const [bekliyor, setBekliyor] = useState(false)

  const son = veri.sonDenetim
  const sinif = olgunlukSinifi(son?.yuzde ?? null)
  const taslak = veri.denetimler.find((d) => d.durum === 'taslak')

  async function baslat() {
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

  return (
    <div className="space-y-5">
      {/* Durum şeridi */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Olgunluk</div>
          <div className="num text-[26px] font-medium leading-tight tracking-tight text-ink">
            {son?.yuzde ? `%${son.yuzde}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Sınıf</div>
          <div className="mt-1">
            <Badge tone={tierTone(sinif === 'YOK' ? null : sinif)}>
              {sinif === 'YOK' ? 'Denetim yok' : sinif}
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Son denetim</div>
          <div className="num text-[15px] leading-snug text-ink">
            {son ? tarihTR(son.tarih) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">Değerlendirilen süreç</div>
          <div className="num text-[15px] leading-snug text-ink">
            {son ? `${son.degerlendirilen} / ${son.degerlendirilen + son.degerlendirilmeyen}` : '—'}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {taslak && (
            <Link href={`/pes/olgunluk/denetim/${taslak.denetim_id}`}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas">
              Taslağa devam
            </Link>
          )}
          {veri.yayindaSurum ? (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAcik((v) => !v)}>
              Yeni denetim
            </Button>
          ) : (
            <Link href="/pes/olgunluk/katalog"
                  className="text-xs text-danger underline underline-offset-2">
              Yayında sürüm yok
            </Link>
          )}
        </div>
      </div>

      {acik && veri.yayindaSurum && (
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Field label="Tarih">
              <Input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
            </Field>
            <Field label="Denetçi" hint={`Sürüm: ${veri.yayindaSurum.kod}`}>
              <Input value={denetci} onChange={(e) => setDenetci(e.target.value)} />
            </Field>
            <Button onClick={baslat} loading={bekliyor}>Başlat</Button>
          </CardBody>
        </Card>
      )}

      {/* Kategori profili — yalnız tamamlanmış denetim varsa anlamlı */}
      {son && (
        <Card>
          <div className="border-b border-line-soft px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Kategori profili</span>
            <span className="num ml-2 text-[11px] text-faint">
              {tarihTR(son.tarih)} · {son.sablon_kod}
            </span>
          </div>
          <CardBody>
            <OlgunlukRadar kategoriler={veri.sonKategoriler} />
          </CardBody>
        </Card>
      )}

      {/* Denetim geçmişi */}
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Denetimler</h3>
        {veri.denetimler.length === 0 ? (
          <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
            Bu atölyede henüz olgunluk denetimi yok.
            {veri.yayindaSurum
              ? ' Yukarıdaki "Yeni denetim" ile başlatabilirsiniz.'
              : ' Önce katalogdan bir sürüm yayınlamanız gerekiyor.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line-soft">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-soft bg-canvas text-left">
                  <th className="px-3 py-2 font-medium text-faint">Tarih</th>
                  <th className="px-3 py-2 font-medium text-faint">Durum</th>
                  <th className="px-3 py-2 text-right font-medium text-faint">%</th>
                  <th className="px-3 py-2 text-right font-medium text-faint">Puan</th>
                  <th className="px-3 py-2 font-medium text-faint">Sürüm</th>
                  <th className="px-3 py-2 font-medium text-faint">Denetçi</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {veri.denetimler.map((d) => (
                  <tr key={d.denetim_id} className="border-b border-line-soft last:border-0">
                    <td className="num whitespace-nowrap px-3 py-1.5 text-ink">{tarihTR(d.tarih)}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={d.durum === 'tamamlandi' ? 'good' : 'neutral'}>
                        {d.durum === 'tamamlandi' ? 'Tamamlandı' : 'Taslak'}
                      </Badge>
                    </td>
                    <td className="num px-3 py-1.5 text-right text-ink">{d.yuzde ?? '—'}</td>
                    <td className="num px-3 py-1.5 text-right text-muted">
                      {d.puan ?? '—'} / {d.max_puan ?? '—'}
                    </td>
                    <td className="num px-3 py-1.5 text-muted">{d.sablon_kod}</td>
                    <td className="px-3 py-1.5 text-muted">{d.denetci ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link href={`/pes/olgunluk/denetim/${d.denetim_id}`}
                            className="text-accent-ink underline underline-offset-2">
                        {d.durum === 'taslak' ? 'Devam et' : 'Aç'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-faint">
        Olgunluk, WKYS ve sosyal uyumluluk denetimlerinden ayrı bir ölçüdür: puan tek bir
        sınavdan değil, süreç bazında işaretlenen maddelerden türetilir.
        Filo karşılaştırması için <Link href="/pes/olgunluk" className="underline underline-offset-2">Olgunluk Durumu</Link> ekranına bakın.
      </p>
    </div>
  )
}

function tarihTR(s: string) {
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}
