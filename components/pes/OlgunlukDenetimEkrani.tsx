'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Lock, Unlock } from 'lucide-react'
import { Button, Badge, Card, CardHeader, CardBody, useToast } from '@/components/ui'
import { SEVIYE_ETIKET } from '@/lib/pes/olgunluk'
import type { DenetimDetay, DenetimOzet, Sonuc } from '@/lib/pes/olgunluk-denetim'

/* SAHA EKRANI. İki tasarım kararı:

   1) Puan burada HESAPLANMAZ. Her işaretleme sunucuya gider, sunucu
      v_olgunluk_surec_seviye'den dönen seviyeleri geri verir. Aynı kuralı
      tarayıcıda ikinci kez yazmak, ekranla raporun ayrışması demekti.

   2) İşaretlemeler 700 ms biriktirilip tek istekte gönderilir. Tuş başına
      istek, atölyedeki zayıf bağlantıda yarım kalmış denetim üretirdi. */

const BEKLEME_MS = 700

const SECENEKLER: { deger: Sonuc; etiket: string; sinif: string }[] = [
  { deger: 'EVET', etiket: 'Var', sinif: 'bg-accent-soft text-accent-ink border-accent/40' },
  { deger: 'HAYIR', etiket: 'Yok', sinif: 'bg-danger-soft text-danger border-danger-line' },
  { deger: 'KAPSAM_DISI', etiket: 'Kapsam dışı', sinif: 'bg-canvas text-muted border-line' },
]

function seviyeTonu(seviye: number | null): 'good' | 'warn' | 'bad' | 'neutral' {
  if (seviye === null) return 'neutral'
  if (seviye >= 3) return 'good'
  if (seviye === 2) return 'neutral'
  if (seviye === 1) return 'warn'
  return 'bad'
}

export default function OlgunlukDenetimEkrani({ detay }: { detay: DenetimDetay }) {
  const router = useRouter()
  const toast = useToast()

  const kilitli = detay.baslik.durum === 'tamamlandi'

  const [cevaplar, setCevaplar] = useState<Record<number, Sonuc | null>>(() => {
    const m: Record<number, Sonuc | null> = {}
    for (const c of detay.cevaplar) m[c.kriter_id] = c.sonuc
    return m
  })
  const [seviyeler, setSeviyeler] = useState<Record<number, number | null>>(() => {
    const m: Record<number, number | null> = {}
    for (const s of detay.seviyeler) m[s.surec_id] = s.seviye
    return m
  })
  const [ozet, setOzet] = useState<DenetimOzet | null>(detay.ozet)
  const [secili, setSecili] = useState<number | null>(detay.surecler[0]?.id ?? null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [bekliyor, setBekliyor] = useState(false)

  const kuyruk = useRef<Map<number, Sonuc | null>>(new Map())
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gonder = useCallback(async () => {
    if (kuyruk.current.size === 0) return
    const paket = [...kuyruk.current.entries()].map(([kriter_id, sonuc]) => ({ kriter_id, sonuc }))
    kuyruk.current.clear()
    setKaydediliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/denetim/cevap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denetim_id: detay.baslik.id, cevaplar: paket }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Kaydedilemedi'); return }
      const yeni: Record<number, number | null> = {}
      for (const s of j.seviyeler as { surec_id: number; seviye: number | null }[]) {
        yeni[s.surec_id] = s.seviye
      }
      setSeviyeler(yeni)
      setOzet(j.ozet)
    } catch {
      toast.error('Bağlantı hatası — işaretleme kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }, [detay.baslik.id, toast])

  /* Sekme kapanırken bekleyen işaretlemeler kaybolmasın. */
  useEffect(() => () => { if (zamanlayici.current) clearTimeout(zamanlayici.current) }, [])

  function isaretle(kriterId: number, deger: Sonuc) {
    if (kilitli) return
    const yeni = cevaplar[kriterId] === deger ? null : deger
    setCevaplar((p) => ({ ...p, [kriterId]: yeni }))
    kuyruk.current.set(kriterId, yeni)
    if (zamanlayici.current) clearTimeout(zamanlayici.current)
    zamanlayici.current = setTimeout(gonder, BEKLEME_MS)
  }

  async function durumDegistir(durum: 'taslak' | 'tamamlandi') {
    if (zamanlayici.current) clearTimeout(zamanlayici.current)
    await gonder()
    if (durum === 'tamamlandi'
        && !window.confirm('Denetim tamamlanacak ve cevaplar kilitlenecek. Devam?')) return
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/denetim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detay.baslik.id, durum }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Durum değiştirilemedi'); return }
      toast.success(durum === 'tamamlandi' ? 'Denetim tamamlandı' : 'Taslağa alındı')
      router.refresh()
    } finally {
      setBekliyor(false)
    }
  }

  const surecler = useMemo(
    () => [...detay.surecler].sort((a, b) => a.sira - b.sira), [detay.surecler])
  const kategoriAdi = useMemo(() => {
    const m = new Map<number, string>()
    for (const k of detay.kategoriler) m.set(k.id, `${k.kod} · ${k.ad}`)
    return m
  }, [detay.kategoriler])

  const seciliSurec = surecler.find((s) => s.id === secili) ?? null
  const seciliKriterler = useMemo(
    () => detay.kriterler.filter((k) => k.surec_id === secili),
    [detay.kriterler, secili])

  const cevapliAdet = (surecId: number) =>
    detay.kriterler.filter((k) => k.surec_id === surecId && cevaplar[k.id]).length

  return (
    <div className="space-y-4">
      {/* Üst şerit */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">
            <span className="num text-faint">{detay.baslik.atolye_kodu}</span>{' '}
            {detay.baslik.atolye_adi}
          </div>
          <div className="num text-xs text-faint">
            {tarihTR(detay.baslik.tarih)} · {detay.baslik.sablon_kod}
            {detay.baslik.denetci && ` · ${detay.baslik.denetci}`}
          </div>
        </div>

        <Badge tone={kilitli ? 'good' : 'neutral'}>
          {kilitli ? 'Tamamlandı' : 'Taslak'}
        </Badge>

        <div className="flex items-baseline gap-2">
          <span className="num text-[26px] font-medium tracking-tight text-ink">
            {ozet?.yuzde ?? '—'}
          </span>
          <span className="text-xs text-faint">
            % · {ozet?.puan ?? 0}/{ozet?.max_puan ?? 0} puan
          </span>
        </div>

        <span className="text-xs text-faint">
          {ozet?.degerlendirilen ?? 0} süreç değerlendirildi
          {(ozet?.degerlendirilmeyen ?? 0) > 0 && `, ${ozet?.degerlendirilmeyen} bekliyor`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {kaydediliyor && <span className="text-xs text-faint">kaydediliyor…</span>}
          <Link href="/pes/olgunluk"
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas">
            Filo görünümü
          </Link>
          {kilitli ? (
            <Button size="sm" variant="secondary" loading={bekliyor}
                    icon={<Unlock className="size-3.5" />}
                    onClick={() => durumDegistir('taslak')}>
              Taslağa al
            </Button>
          ) : (
            <Button size="sm" loading={bekliyor} icon={<Lock className="size-3.5" />}
                    onClick={() => durumDegistir('tamamlandi')}>
              Tamamla
            </Button>
          )}
        </div>
      </div>

      {kilitli && (
        <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
          Denetim tamamlandı; işaretlemeler kilitli ve rapora giriyor.
          Düzeltmek için <strong>Taslağa al</strong> deyin.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr] items-start">
        {/* Sol: süreçler ve türetilmiş seviyeleri */}
        <Card>
          <CardHeader title="Süreçler" aside={`${surecler.length}`} />
          <CardBody className="space-y-3 p-3">
            {detay.kategoriler.map((kat) => {
              const ici = surecler.filter((s) => s.kategori_id === kat.id)
              if (ici.length === 0) return null
              return (
                <div key={kat.id}>
                  <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                    {kategoriAdi.get(kat.id)}
                  </div>
                  <ul className="space-y-px">
                    {ici.map((s) => {
                      const sv = seviyeler[s.id] ?? null
                      const cevapli = cevapliAdet(s.id)
                      return (
                        <li key={s.id}>
                          <button
                            onClick={() => setSecili(s.id)}
                            className={
                              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors ' +
                              (s.id === secili ? 'bg-canvas font-medium text-ink' : 'text-body hover:bg-canvas')
                            }
                          >
                            <span className="num shrink-0 text-faint">{s.kod}</span>
                            <span className="min-w-0 flex-1 truncate">{s.ad}</span>
                            <span className="num shrink-0 text-[11px] text-faint">
                              {cevapli}/{s.kriter_adedi}
                            </span>
                            <Badge tone={seviyeTonu(sv)}>{sv === null ? '—' : sv}</Badge>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </CardBody>
        </Card>

        {/* Sağ: seçili sürecin maddeleri */}
        {seciliSurec ? (
          <div className="space-y-4">
            {[1, 2, 3].map((seviye) => {
              const liste = seciliKriterler
                .filter((k) => k.seviye === seviye)
                .sort((a, b) => a.sira - b.sira)
              return (
                <Card key={seviye}>
                  <CardHeader
                    title={`Seviye ${seviye} — ${SEVIYE_ETIKET[seviye]}`}
                    aside={`${liste.filter((k) => cevaplar[k.id]).length}/${liste.length}`}
                  />
                  <CardBody className="space-y-1.5 p-3">
                    {liste.length === 0 && (
                      <p className="px-1 text-[13px] text-faint">
                        Bu seviyenin maddesi yok — şartsız geçer, bir üst seviye belirleyici olur.
                      </p>
                    )}
                    {liste.map((k) => (
                      <div key={k.id}
                           className="flex flex-wrap items-start gap-2 rounded border border-line-soft px-2.5 py-2">
                        <p className="min-w-[220px] flex-1 text-[13px] leading-snug text-ink">
                          {k.metin}
                          {k.taraf === 'MARKA' && (
                            <span className="ml-1.5 align-middle">
                              <Badge tone="neutral">MARKA</Badge>
                            </span>
                          )}
                          {!k.zorunlu && (
                            <span className="ml-1.5 align-middle">
                              <Badge tone="neutral">BİLGİ</Badge>
                            </span>
                          )}
                        </p>
                        <div className="flex shrink-0 gap-1">
                          {SECENEKLER.map((o) => {
                            const aktif = cevaplar[k.id] === o.deger
                            return (
                              <button
                                key={o.deger}
                                disabled={kilitli}
                                onClick={() => isaretle(k.id, o.deger)}
                                className={
                                  'inline-flex h-7 items-center gap-1 rounded-[5px] border px-2 text-xs font-medium transition-colors ' +
                                  (aktif ? o.sinif : 'border-line-soft text-faint hover:bg-canvas') +
                                  (kilitli ? ' pointer-events-none opacity-60' : '')
                                }
                              >
                                {aktif && <Check className="size-3" strokeWidth={3} />}
                                {o.etiket}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )
            })}

            <p className="text-xs text-faint">
              Seviye {seciliSurec.kod} için otomatik hesaplanır: bir seviyeye ulaşmak için o
              seviyenin ve altındakilerin tüm zorunlu atölye maddeleri &quot;Var&quot; olmalı.
              Cevapsız madde seviyeyi düşürür; &quot;Kapsam dışı&quot; maddeler hesaba katılmaz.
            </p>
          </div>
        ) : (
          <Card><CardBody><p className="text-[13px] text-faint">Soldan bir süreç seçin.</p></CardBody></Card>
        )}
      </div>
    </div>
  )
}

function tarihTR(s: string) {
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}
