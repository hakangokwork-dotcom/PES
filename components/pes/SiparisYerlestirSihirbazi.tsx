'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from 'lucide-react'
import { Badge, Button, Field, Input, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'

export type AsamaSecenegi = { code: string; name: string; sira_no: number; zorunlu: boolean }

type Aday = {
  workshopId: number
  kod: string
  ad: string
  toplamGunlukHedef: number
  gerekenGun: number | null
  yetisiyor: boolean
  puan: number
  uyarilar: string[]
  /** Künye kodu verildiyse: bu klasman/kumaşı yapabildiği kayıtlı mı. Kod yoksa hep true. */
  yapabilir: boolean
}

/** Havuzdan gelen sipariş (spec K5) — 1. adım bundan dolar ve kilitlenir. */
export type HavuzPo = {
  id: number; is_emri_no: string; musteri: string | null; model_adi: string
  siparis_miktari: number; teslim_tarihi: string | null
  klasman_kodu: string | null; kumas_turu_kodu: string | null; kumas_grubu_kodu: string | null
}

const trTarih = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

type Bant = { id: number; code: string; name: string; daily_target: number | null }

const ADIMLAR = ['Sipariş', 'Aşamalar', 'Atölye', 'Bantlar', 'Dış atölye', 'Özet'] as const

export default function SiparisYerlestirSihirbazi({ asamalar, havuzPo, onAtolyeId, onBantId, onTarih }: {
  asamalar: AsamaSecenegi[]
  havuzPo?: HavuzPo
  /** Takvim hücresinden gelen önseçim: atölye aday listesinde otomatik seçilir,
      bant tüm adedi alır, tarih en erken başlangıç olur. */
  onAtolyeId?: number
  onBantId?: number
  onTarih?: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [adim, setAdim] = useState(0)
  const [bekliyor, setBekliyor] = useState(false)

  // 1. adım
  const [siparisNo, setSiparisNo] = useState(havuzPo?.is_emri_no ?? '')
  const [musteri, setMusteri] = useState(havuzPo?.musteri ?? '')
  const [modelAdi, setModelAdi] = useState(havuzPo?.model_adi ?? '')
  const [adet, setAdet] = useState(havuzPo ? String(havuzPo.siparis_miktari) : '')
  const [teslimTarihi, setTeslimTarihi] = useState(havuzPo?.teslim_tarihi ?? '')

  // 2. adım — varsayılan zincir: zorunlu aşamalar
  const [secilenAsamalar, setSecilenAsamalar] = useState<string[]>(
    () => asamalar.filter(a => a.zorunlu).map(a => a.code),
  )

  // 3. adım
  const [adaylar, setAdaylar] = useState<Aday[]>([])
  const [secilenAtolye, setSecilenAtolye] = useState<Aday | null>(null)

  // 4. adım — bantId -> adet
  const [bantlar, setBantlar] = useState<Bant[]>([])
  const [dagilim, setDagilim] = useState<Record<number, number>>({})
  // En erken başlangıç (boş = bugün). Sunucu teslimden geriye planlarken bu tarihin altına inmez.
  const [baslangic, setBaslangic] = useState(onTarih ?? '')

  // 5. adım — aşama kodu -> dış atölye id
  const [disariCikanlar, setDisariCikanlar] = useState<string[]>([])
  const [disAdaylar, setDisAdaylar] = useState<Record<string, Aday[]>>({})
  const [disAtolye, setDisAtolye] = useState<Record<string, number>>({})

  const adetSayi = Number(adet) || 0
  const dagilimToplam = Object.values(dagilim).reduce((t, v) => t + (Number(v) || 0), 0)
  const secilenBantSayisi = Object.values(dagilim).filter(v => Number(v) > 0).length

  const adim1Gecerli = siparisNo.trim() !== '' && modelAdi.trim() !== ''
    && adetSayi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(teslimTarihi)
  const adim2Gecerli = secilenAsamalar.includes('DIKIM')
  const adim4Gecerli = secilenBantSayisi > 0 && dagilimToplam === adetSayi

  async function adaylariGetir(): Promise<Aday[] | null> {
    setBekliyor(true)
    try {
      const q = new URLSearchParams({ adet: String(adetSayi), teslim: teslimTarihi })
      if (havuzPo?.klasman_kodu) q.set('klasman', havuzPo.klasman_kodu)
      if (havuzPo?.kumas_turu_kodu) q.set('kumas', havuzPo.kumas_turu_kodu)
      const r = await fetch(`/api/pes/work-orders/yerlestir?${q}`)
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Aday listesi alınamadı'); return null }
      const liste: Aday[] = d.adaylar ?? []
      setAdaylar(liste)
      return liste
    } catch { toast.error('Bağlantı hatası'); return null } finally { setBekliyor(false) }
  }

  async function bantlariGetir(aday: Aday) {
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/lines?workshop_id=${aday.workshopId}`)
      const d = await r.json()
      const gelen: Bant[] = d.lines ?? []
      setBantlar(gelen)

      /* Varsayılan dağılım KAPASİTEYE ORANTILI (tasarım K9) — kullanıcı
         sonra adetleri elle değiştirebilir. Sunucu da aynı kuralı
         uyguluyor; buradaki yalnız önizleme. */
      const toplamHedef = gelen.reduce((t, b) => t + (Number(b.daily_target) || 0), 0)
      const yeni: Record<number, number> = {}
      if (onBantId && gelen.some(b => b.id === onBantId)) {
        // Takvimde tıklanan bant tüm adedi alır — kullanıcı zaten o bandı seçti.
        gelen.forEach(b => { yeni[b.id] = b.id === onBantId ? adetSayi : 0 })
      } else if (toplamHedef > 0) {
        let dagitilan = 0
        gelen.forEach((b, i) => {
          const pay = i === gelen.length - 1
            ? adetSayi - dagitilan
            : Math.floor((adetSayi * (Number(b.daily_target) || 0)) / toplamHedef)
          yeni[b.id] = Math.max(0, pay)
          dagitilan += yeni[b.id]
        })
      }
      setDagilim(yeni)
      return true
    } catch { toast.error('Bant listesi alınamadı'); return false } finally { setBekliyor(false) }
  }

  /* Seçilen atölye zincirdeki hangi aşamaları yapamıyor? Yapamadığı
     her aşama için o aşamayı yapabilen atölyeler ayrıca çekilir. */
  async function disAtolyeKontrolu() {
    if (!secilenAtolye) return true
    setBekliyor(true)
    try {
      const r = await fetch(
        `/api/pes/workshops/${secilenAtolye.workshopId}/yetenek?asamalar=${secilenAsamalar.join(',')}`)
      const d = await r.json()
      const cikanlar: string[] = d.disariCikanlar ?? []
      setDisariCikanlar(cikanlar)

      const harita: Record<string, Aday[]> = {}
      for (const kod of cikanlar) {
        const ar = await fetch(
          `/api/pes/work-orders/yerlestir?adet=${adetSayi}&teslim=${teslimTarihi}&asama=${kod}`)
        const ad = await ar.json()
        harita[kod] = ad.adaylar ?? []
      }
      setDisAdaylar(harita)
      return true
    } catch { toast.error('Yetenek kontrolü yapılamadı'); return false } finally { setBekliyor(false) }
  }

  async function ileri() {
    if (adim === 1) {
      const liste = await adaylariGetir()
      if (!liste) return
      /* Takvimden gelen atölye listedeyse atölye adımı atlanır. Listede
         yoksa (teslime yetişmiyor olsa bile listede kalır; yalnız yetkisiz
         atölye düşer) kullanıcı kendisi seçer. */
      const onSecili = onAtolyeId ? liste.find(a => a.workshopId === onAtolyeId) : undefined
      if (onSecili) { await atolyeSec(onSecili); return }
      setAdim(2); return
    }
    if (adim === 3) { if (await disAtolyeKontrolu()) setAdim(4); return }
    setAdim(a => Math.min(a + 1, ADIMLAR.length - 1))
  }

  async function atolyeSec(a: Aday) {
    setSecilenAtolye(a)
    if (await bantlariGetir(a)) setAdim(3)
  }

  async function yerlestir() {
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/work-orders/yerlestir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: havuzPo?.id,
          siparisNo, musteri, modelAdi,
          adet: adetSayi,
          teslimTarihi,
          baslangic: baslangic || undefined,
          workshopId: secilenAtolye!.workshopId,
          lineIds: Object.entries(dagilim).filter(([, v]) => Number(v) > 0).map(([k]) => Number(k)),
          asamaKodlari: secilenAsamalar,
          disAtolye,
        }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Yerleştirme başarısız'); return }

      const notlar: string[] = []
      if (!d.yetisiyor) notlar.push('teslime yetişmiyor')
      if (d.kaydirilanGun > 0) notlar.push(`bant doluluğu nedeniyle ${d.kaydirilanGun} gün geriye kaydı`)
      toast.success(`Sipariş yerleştirildi${notlar.length ? ' — ' + notlar.join(', ') : ''}`)

      /* Kapasitesi tanımlı olmayan aşamalar tarihsiz kaldı. Bunu sessizce
         geçmek, kullanıcının "zincir kuruldu" sanıp yarım plana güvenmesi
         demek — ayrı ve daha uzun süren bir uyarı olarak veriyoruz. */
      if (Array.isArray(d.elleTarihGereken) && d.elleTarihGereken.length > 0) {
        toast.error(
          `${d.elleTarihGereken.join(', ')} aşamaları tarihsiz kaldı: bu atölyede o aşamanın `
          + 'günlük kapasitesi tanımlı değil. Atölye sayfasından kapasiteyi girin veya tarihleri elle yazın.',
        )
      }
      router.push('/pes/takvim')
    } catch { toast.error('Bağlantı hatası') } finally { setBekliyor(false) }
  }

  const secilenAsamaAdlari = useMemo(
    () => asamalar.filter(a => secilenAsamalar.includes(a.code)).map(a => a.name),
    [asamalar, secilenAsamalar],
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Adım göstergesi */}
      <ol className="flex flex-wrap items-center gap-2 text-[13px]">
        {ADIMLAR.map((ad, i) => (
          <li key={ad} className="flex items-center gap-2">
            <span className={cn(
              'flex size-6 items-center justify-center rounded-full text-[11px] font-medium',
              i < adim ? 'bg-accent text-white'
                : i === adim ? 'bg-accent-soft text-accent-ink ring-1 ring-accent'
                : 'bg-canvas text-faint',
            )}>
              {i < adim ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={i === adim ? 'font-medium text-ink' : 'text-faint'}>{ad}</span>
            {i < ADIMLAR.length - 1 && <span className="mx-1 text-line">›</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-line-soft bg-surface p-5">
        {adim === 0 && (
          <div className="flex flex-col gap-4">
            {havuzPo && (
              <p className="rounded-lg border border-line-soft bg-canvas px-3 py-2 text-xs text-muted">
                Havuzdan: <b className="text-ink">{havuzPo.is_emri_no}</b>
                {havuzPo.klasman_kodu && <> · {havuzPo.klasman_kodu}</>}
                {havuzPo.kumas_turu_kodu && <> · {havuzPo.kumas_turu_kodu}</>}
                {havuzPo.kumas_grubu_kodu && <> · {havuzPo.kumas_grubu_kodu}</>}
                {' '}— künye <a href="/pes/siparisler" className="underline">havuz ekranında</a> düzenlenir.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sipariş no">
                <Input value={siparisNo} onChange={e => setSiparisNo(e.target.value)} placeholder="SIP-2026-001" disabled={!!havuzPo} />
              </Field>
              <Field label="Müşteri">
                <Input value={musteri} onChange={e => setMusteri(e.target.value)} disabled={!!havuzPo} />
              </Field>
              <Field label="Model / stil">
                <Input value={modelAdi} onChange={e => setModelAdi(e.target.value)} placeholder="Basic tişört" disabled={!!havuzPo} />
              </Field>
              <Field label="Adet">
                <Input value={adet} onChange={e => setAdet(e.target.value)} inputMode="numeric" placeholder="10000" align="right" disabled={!!havuzPo} />
              </Field>
              <Field label="Teslim tarihi">
                <Input type="date" value={teslimTarihi} onChange={e => setTeslimTarihi(e.target.value)} disabled={!!havuzPo} />
              </Field>
            </div>
          </div>
        )}

        {adim === 1 && (
          <div>
            <p className="mb-3 text-[13px] text-muted">
              Bu siparişte hangi aşamalar var? Zincir seçtiğiniz aşamalardan kurulur.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {asamalar.map(a => {
                const secili = secilenAsamalar.includes(a.code)
                return (
                  <label key={a.code} className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                    secili ? 'border-accent bg-accent-soft/40 text-ink' : 'border-line-soft text-muted hover:bg-canvas',
                  )}>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={secili}
                      onChange={() => setSecilenAsamalar(s =>
                        s.includes(a.code) ? s.filter(x => x !== a.code) : [...s, a.code])}
                    />
                    <span className="flex-1">{a.name}</span>
                    {/* Burada `sira_no` çıplak basılıyordu (3, 10, 15, 20…) ve
                        kullanıcı bunu SÜRE sandı. O sayı üretim sırasının iç
                        numarası; aradaki boşluklar araya aşama eklenebilsin
                        diye var. Liste zaten o sıraya göre dizili olduğu için
                        ekranda hiçbir şey anlatmıyordu, yanlış anlatıyordu.
                        Yerine gerçekten işe yarayan tek bilgi: hangi aşama
                        kaldırılamaz. */}
                    {a.code === 'DIKIM' && (
                      <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn">
                        zorunlu
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            {!adim2Gecerli && (
              <p className="mt-3 text-[13px] text-warn">
                Dikim aşaması zorunlu — bant dağılımı ona göre yapılıyor.
              </p>
            )}
          </div>
        )}

        {adim === 2 && (
          <div>
            <p className="mb-3 text-[13px] text-muted">
              {adaylar.length} atölye · bant boşluğu, yetenek, denetim ve tedarik müdürlüğüne göre sıralı.
              Yetişmeyenler listeden çıkarılmadı, işaretlendi.
            </p>
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-line-soft">
              {([
                ['Bu ürünü yapabilenler', adaylar.filter(a => a.yapabilir)],
                ['Diğerleri', adaylar.filter(a => !a.yapabilir)],
              ] as [string, Aday[]][]).map(([baslik, grup]) => grup.length > 0 && (
              <div key={baslik}>
              {havuzPo && (
                <p className="border-b border-line-soft bg-canvas px-4 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{baslik}</p>
              )}
              {grup.map(a => (
                <button
                  key={a.workshopId}
                  onClick={() => atolyeSec(a)}
                  disabled={bekliyor}
                  className="flex w-full items-center gap-3 border-b border-line-soft px-4 py-2.5 text-left last:border-0 hover:bg-canvas disabled:opacity-50"
                >
                  <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">{a.puan}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{a.kod} · {a.ad}</span>
                    <span className="block text-[11px] text-faint">
                      {a.toplamGunlukHedef} adet/gün
                      {a.gerekenGun !== null && ` · ${a.gerekenGun} gün sürer`}
                    </span>
                  </span>
                  {a.yetisiyor
                    ? <Badge tone="good">Yetişiyor</Badge>
                    : <Badge tone="bad">Yetişmiyor</Badge>}
                  {a.uyarilar.length > 0 && (
                    <TriangleAlert className="size-4 shrink-0 text-warn" strokeWidth={1.8} />
                  )}
                </button>
              ))}
              </div>
              ))}
              {adaylar.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-faint">Aday atölye bulunamadı.</p>
              )}
            </div>
          </div>
        )}

        {adim === 3 && secilenAtolye && (
          <div>
            <p className="mb-3 text-[13px] text-muted">
              <strong className="text-ink">{secilenAtolye.kod} · {secilenAtolye.ad}</strong> —
              adetler kapasiteye orantılı dağıtıldı, değiştirebilirsiniz.
            </p>
            <div className="flex flex-col gap-2">
              {bantlar.map(b => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{b.code} · {b.name}</span>
                    <span className="block text-[11px] text-faint">{b.daily_target ?? 0} adet/gün</span>
                  </span>
                  {/* Genişliği SARMALAYICI veriyor: Input'un kendi w-full'ü
                      className ile ezilmiyor (ikisi de width kuralı, kazananı
                      sınıf sırası değil stylesheet sırası belirliyor). */}
                  <span className="w-28 shrink-0">
                    <Input
                      value={String(dagilim[b.id] ?? 0)}
                      onChange={e => setDagilim(d => ({ ...d, [b.id]: Number(e.target.value) || 0 }))}
                      inputMode="numeric"
                      align="right"
                    />
                  </span>
                </div>
              ))}
              {bantlar.length === 0 && (
                <p className="py-4 text-center text-[13px] text-faint">Bu atölyenin aktif bandı yok.</p>
              )}
            </div>
            <p className={cn('mt-3 text-[13px]', dagilimToplam === adetSayi ? 'text-muted' : 'text-danger')}>
              Dağıtılan: {dagilimToplam.toLocaleString('tr-TR')} / {adetSayi.toLocaleString('tr-TR')}
              {dagilimToplam !== adetSayi && ' — toplam sipariş adediyle eşit olmalı'}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="En erken başlangıç" hint="Boş bırakılırsa bugün. Plan teslimden geriye kurulur, bu tarihin altına inmez.">
                <Input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
              </Field>
              {onTarih && baslangic === onTarih && (
                <span className="pb-2 text-[11.5px] text-faint">Takvimde tıklanan gün: {trTarih(onTarih)}</span>
              )}
            </div>
          </div>
        )}

        {adim === 4 && secilenAtolye && (
          <div>
            {disariCikanlar.length === 0 ? (
              <p className="text-[13px] text-muted">
                <strong className="text-ink">{secilenAtolye.kod}</strong> seçilen zincirin
                tamamını yapabiliyor — dışarı çıkacak aşama yok.
                {' '}Atölyenin üretim tipi bilinmiyorsa da burası boş görünür; sistem emin
                olmadan dış atölye seçmeye zorlamaz.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] text-muted">
                  <strong className="text-ink">{secilenAtolye.kod}</strong> şu aşamaları
                  yapamıyor. Her biri için yapabilen bir atölye seçin.
                </p>
                {disariCikanlar.map(kod => {
                  const ad = asamalar.find(a => a.code === kod)?.name ?? kod
                  const secili = disAtolye[kod]
                  return (
                    <div key={kod} className="rounded-lg border border-line-soft p-3">
                      <p className="mb-2 text-[13px] font-medium text-ink">{ad}</p>
                      <div className="max-h-48 overflow-y-auto rounded-md border border-line-soft">
                        {(disAdaylar[kod] ?? []).slice(0, 25).map(a => (
                          <button
                            key={a.workshopId}
                            onClick={() => setDisAtolye(d => ({ ...d, [kod]: a.workshopId }))}
                            className={cn(
                              'flex w-full items-center gap-3 border-b border-line-soft px-3 py-2 text-left text-[13px] last:border-0',
                              secili === a.workshopId ? 'bg-accent-soft text-ink' : 'hover:bg-canvas',
                            )}
                          >
                            <span className="w-8 shrink-0 text-right tabular-nums text-faint">{a.puan}</span>
                            <span className="min-w-0 flex-1 truncate">{a.kod} · {a.ad}</span>
                            {secili === a.workshopId && <Check className="size-4 shrink-0 text-accent" strokeWidth={2.5} />}
                          </button>
                        ))}
                        {(disAdaylar[kod] ?? []).length === 0 && (
                          <p className="px-3 py-4 text-center text-[13px] text-faint">
                            Bu aşamayı yapabilen atölye bulunamadı.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {adim === 5 && secilenAtolye && (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {[
              ['Sipariş', `${siparisNo}${musteri ? ` · ${musteri}` : ''}`],
              ['Model', modelAdi],
              ['Adet', adetSayi.toLocaleString('tr-TR')],
              ['Teslim', teslimTarihi],
              ['Atölye', `${secilenAtolye.kod} · ${secilenAtolye.ad}`],
              ['Bant', `${secilenBantSayisi} bant`],
              ['Zincir', secilenAsamaAdlari.join(' → ')],
              ...(disariCikanlar.length > 0
                ? [['Dış atölye', disariCikanlar.map(k =>
                    `${k}: ${disAdaylar[k]?.find(a => a.workshopId === disAtolye[k])?.kod ?? 'seçilmedi'}`
                  ).join(' · ')] as [string, string]]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line-soft py-1.5 text-[13px]">
                <dt className="text-faint">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
            {!secilenAtolye.yetisiyor && (
              <p className="sm:col-span-2 mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
                Bu atölye teslim tarihine yetişmiyor. Yerleştirme yine yapılır ve sipariş işaretlenir.
              </p>
            )}
          </dl>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setAdim(a => Math.max(0, a - 1))} disabled={adim === 0 || bekliyor}>
          <ArrowLeft className="size-4" strokeWidth={1.8} /> Geri
        </Button>

        {adim < 5 ? (
          <Button
            variant="primary"
            onClick={ileri}
            loading={bekliyor}
            disabled={
              (adim === 0 && !adim1Gecerli) ||
              (adim === 1 && !adim2Gecerli) ||
              (adim === 2) ||               /* atölye satıra tıklanarak seçilir */
              (adim === 3 && !adim4Gecerli) ||
              (adim === 4 && disariCikanlar.some(k => !disAtolye[k]))
            }
          >
            İleri <ArrowRight className="size-4" strokeWidth={1.8} />
          </Button>
        ) : (
          <Button variant="primary" onClick={yerlestir} loading={bekliyor}>
            Yerleştir
          </Button>
        )}
      </div>
    </div>
  )
}
