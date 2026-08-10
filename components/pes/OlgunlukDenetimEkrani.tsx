'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Lock, Unlock } from 'lucide-react'
import { Button, Badge, Card, CardBody, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { SEVIYE_ETIKET } from '@/lib/pes/olgunluk'
import { SONUC_ETIKET } from '@/lib/pes/olgunluk-denetim'
import type { DenetimDetay, DenetimOzet, Sonuc } from '@/lib/pes/olgunluk-denetim'

/* SAHA EKRANI.

   TASARIM: ekran üç bilgiyi aynı anda taşımak zorunda — nerede kaldım,
   bu süreç kaç seviyede, tek tek maddeler ne. Önceki hali üçünü de aynı
   görsel ağırlıkta veriyordu (üst şeritte yan yana dizilmiş beş ayrı sayı,
   her seviye için ayrı kart) ve hiçbiri öne çıkmıyordu. Şimdi:
     - üstte kimlik + tek bir ölçüm şeridi + ilerleme çubuğu,
     - solda süreç listesi, satır başına TEK gösterge (türetilmiş seviye),
     - sağda TEK kart, seviyeler onun içinde bölüm.

   MANTIK: puan burada hesaplanmaz. Her işaretleme sunucuya gider, sunucu
   v_olgunluk_surec_seviye'den dönen seviyeleri geri verir. Aynı kuralı
   tarayıcıda ikinci kez yazmak, ekranla raporun ayrışması demekti.

   İşaretlemeler 700 ms biriktirilip tek istekte gönderilir: tuş başına
   istek, atölyedeki zayıf bağlantıda yarım kalmış denetim üretirdi. */

const BEKLEME_MS = 700

const SECENEKLER: { deger: Sonuc; sinif: string }[] = [
  { deger: 'EVET', sinif: 'bg-accent-soft text-accent-ink' },
  { deger: 'HAYIR', sinif: 'bg-danger-soft text-danger' },
  { deger: 'KAPSAM_DISI', sinif: 'bg-canvas text-muted' },
]

function seviyeTonu(seviye: number | null): 'good' | 'warn' | 'bad' | 'neutral' {
  if (seviye === null) return 'neutral'
  if (seviye >= 3) return 'good'
  if (seviye === 2) return 'neutral'
  if (seviye === 1) return 'warn'
  return 'bad'
}

/** Ölçüm: etiket üstte küçük, değer altta iri. Şeritteki her sayı aynı kalıpta. */
function Olcum({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-faint">{etiket}</div>
      <div className={cn(
        'num tracking-tight text-ink',
        vurgu ? 'text-[26px] font-medium leading-tight' : 'text-[15px] leading-snug',
      )}>
        {deger}
      </div>
    </div>
  )
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

  const seciliSurec = surecler.find((s) => s.id === secili) ?? null
  const seciliKriterler = useMemo(
    () => detay.kriterler.filter((k) => k.surec_id === secili),
    [detay.kriterler, secili])

  const cevapliAdet = useCallback(
    (surecId: number) => detay.kriterler.filter((k) => k.surec_id === surecId && cevaplar[k.id]).length,
    [detay.kriterler, cevaplar])

  const toplamMadde = detay.kriterler.length
  const isaretliMadde = detay.kriterler.filter((k) => cevaplar[k.id]).length
  const ilerleme = toplamMadde ? Math.round((isaretliMadde / toplamMadde) * 100) : 0

  return (
    <div className="space-y-4">
      {/* ---- Başlık + ölçümler ---- */}
      <div className="rounded-lg border border-line-soft bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-ink">
                <span className="num text-faint">{detay.baslik.atolye_kodu}</span>{' '}
                {detay.baslik.atolye_adi}
              </h2>
              <Badge tone={kilitli ? 'good' : 'neutral'}>
                {kilitli ? 'Tamamlandı' : 'Taslak'}
              </Badge>
            </div>
            <p className="num mt-0.5 text-xs text-faint">
              {tarihTR(detay.baslik.tarih)} · {detay.baslik.sablon_kod}
              {detay.baslik.denetci && ` · ${detay.baslik.denetci}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {kaydediliyor && (
              <span className="text-xs text-faint">kaydediliyor…</span>
            )}
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

        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-line-soft px-4 py-3">
          <Olcum etiket="Olgunluk" deger={ozet?.yuzde ? `%${ozet.yuzde}` : '—'} vurgu />
          <Olcum etiket="Puan" deger={`${ozet?.puan ?? 0} / ${ozet?.max_puan ?? 0}`} />
          <Olcum etiket="Değerlendirilen süreç"
                 deger={`${ozet?.degerlendirilen ?? 0} / ${surecler.length}`} />

          <div className="ml-auto w-full max-w-xs">
            <div className="flex items-baseline justify-between text-[11px] text-faint">
              <span className="uppercase tracking-[0.06em]">İşaretlenen madde</span>
              <span className="num">{isaretliMadde} / {toplamMadde}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300"
                   style={{ width: `${ilerleme}%` }} />
            </div>
          </div>
        </div>
      </div>

      {kilitli && (
        <p className="rounded-lg border border-line-soft bg-canvas px-4 py-2.5 text-[13px] text-muted">
          Denetim tamamlandı; işaretlemeler kilitli ve rapora giriyor.
          Düzeltmek için <strong>Taslağa al</strong> deyin.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* ---- Süreçler ---- */}
        <Card className="overflow-hidden">
          <div className="border-b border-line-soft px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Süreçler</span>
            <span className="num ml-2 text-[11px] text-faint">{surecler.length}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {detay.kategoriler.map((kat) => {
              const ici = surecler.filter((s) => s.kategori_id === kat.id)
              if (ici.length === 0) return null
              return (
                <div key={kat.id}>
                  <div className="sticky top-0 z-10 bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                    {kat.kod} · {kat.ad}
                  </div>
                  {ici.map((s) => {
                    const sv = seviyeler[s.id] ?? null
                    const cevapli = cevapliAdet(s.id)
                    const tam = s.kriter_adedi > 0 && cevapli === s.kriter_adedi
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSecili(s.id)}
                        className={cn(
                          'flex w-full items-center gap-2 border-l-2 px-3.5 py-2 text-left text-[13px] transition-colors',
                          s.id === secili
                            ? 'border-l-accent bg-canvas font-medium text-ink'
                            : 'border-l-transparent text-body hover:bg-canvas',
                        )}
                      >
                        <span className="num w-8 shrink-0 text-faint">{s.kod}</span>
                        <span className="min-w-0 flex-1 truncate">{s.ad}</span>
                        <span className={cn(
                          'num shrink-0 text-[11px]',
                          tam ? 'text-accent-ink' : 'text-faint',
                        )}>
                          {cevapli}/{s.kriter_adedi}
                        </span>
                        <Badge tone={seviyeTonu(sv)}>{sv === null ? '—' : sv}</Badge>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Card>

        {/* ---- Maddeler ---- */}
        {seciliSurec ? (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-ink">
                  <span className="num text-faint">{seciliSurec.kod}</span> {seciliSurec.ad}
                </h3>
                <p className="mt-0.5 text-[11px] text-faint">
                  Seviye, işaretlemelerden otomatik hesaplanır — bir seviyeye ulaşmak için
                  o seviyenin ve altındakilerin tüm zorunlu maddeleri &quot;Sağlanıyor&quot; olmalı.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.06em] text-faint">Seviye</span>
                <Badge tone={seviyeTonu(seviyeler[seciliSurec.id] ?? null)}>
                  {seviyeler[seciliSurec.id] ?? '—'}
                </Badge>
              </div>
            </div>

            {[1, 2, 3].map((seviye) => {
              const liste = seciliKriterler
                .filter((k) => k.seviye === seviye)
                .sort((a, b) => a.sira - b.sira)
              const cevapli = liste.filter((k) => cevaplar[k.id]).length
              return (
                <section key={seviye}>
                  <div className="flex items-center justify-between border-b border-line-soft bg-canvas px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                      Seviye {seviye} — {SEVIYE_ETIKET[seviye]}
                    </span>
                    <span className="num text-[11px] text-faint">
                      {liste.length ? `${cevapli}/${liste.length}` : 'madde yok'}
                    </span>
                  </div>

                  {liste.length === 0 ? (
                    <p className="border-b border-line-soft px-4 py-2.5 text-[13px] text-faint">
                      Şartsız geçer; bir üst seviye belirleyici olur.
                    </p>
                  ) : liste.map((k) => (
                    <div key={k.id}
                         className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line-soft px-4 py-2.5 last:border-b-0">
                      <p className="min-w-[220px] flex-1 text-[13px] leading-snug text-ink">
                        {k.metin}
                        {k.taraf === 'MARKA' && (
                          <span className="ml-1.5 align-middle"><Badge>MARKA</Badge></span>
                        )}
                        {!k.zorunlu && (
                          <span className="ml-1.5 align-middle"><Badge>BİLGİ</Badge></span>
                        )}
                      </p>

                      {/* Tek çerçeveli segment: üç ayrı kutu yerine bir kontrol. */}
                      <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-line">
                        {SECENEKLER.map((o, i) => {
                          const aktif = cevaplar[k.id] === o.deger
                          return (
                            <button
                              key={o.deger}
                              disabled={kilitli}
                              onClick={() => isaretle(k.id, o.deger)}
                              className={cn(
                                'inline-flex h-7 items-center gap-1 px-2.5 text-xs font-medium transition-colors',
                                i > 0 && 'border-l border-line',
                                aktif ? o.sinif : 'bg-surface text-faint hover:bg-canvas hover:text-body',
                                kilitli && 'pointer-events-none opacity-60',
                              )}
                            >
                              {aktif && <Check className="size-3" strokeWidth={3} />}
                              {SONUC_ETIKET[o.deger]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              )
            })}
          </Card>
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
