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
}

type Bant = { id: number; code: string; name: string; daily_target: number | null }

const ADIMLAR = ['Sipariş', 'Aşamalar', 'Atölye', 'Bantlar', 'Özet'] as const

export default function SiparisYerlestirSihirbazi({ asamalar }: { asamalar: AsamaSecenegi[] }) {
  const router = useRouter()
  const toast = useToast()

  const [adim, setAdim] = useState(0)
  const [bekliyor, setBekliyor] = useState(false)

  // 1. adım
  const [siparisNo, setSiparisNo] = useState('')
  const [musteri, setMusteri] = useState('')
  const [modelAdi, setModelAdi] = useState('')
  const [adet, setAdet] = useState('')
  const [teslimTarihi, setTeslimTarihi] = useState('')

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

  const adetSayi = Number(adet) || 0
  const dagilimToplam = Object.values(dagilim).reduce((t, v) => t + (Number(v) || 0), 0)
  const secilenBantSayisi = Object.values(dagilim).filter(v => Number(v) > 0).length

  const adim1Gecerli = siparisNo.trim() !== '' && modelAdi.trim() !== ''
    && adetSayi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(teslimTarihi)
  const adim2Gecerli = secilenAsamalar.includes('DIKIM')
  const adim4Gecerli = secilenBantSayisi > 0 && dagilimToplam === adetSayi

  async function adaylariGetir() {
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/work-orders/yerlestir?adet=${adetSayi}&teslim=${teslimTarihi}`)
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Aday listesi alınamadı'); return false }
      setAdaylar(d.adaylar ?? [])
      return true
    } catch { toast.error('Bağlantı hatası'); return false } finally { setBekliyor(false) }
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
      if (toplamHedef > 0) {
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

  async function ileri() {
    if (adim === 1) { if (await adaylariGetir()) setAdim(2); return }
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
          siparisNo, musteri, modelAdi,
          adet: adetSayi,
          teslimTarihi,
          workshopId: secilenAtolye!.workshopId,
          lineIds: Object.entries(dagilim).filter(([, v]) => Number(v) > 0).map(([k]) => Number(k)),
          asamaKodlari: secilenAsamalar,
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sipariş no">
              <Input value={siparisNo} onChange={e => setSiparisNo(e.target.value)} placeholder="SIP-2026-001" />
            </Field>
            <Field label="Müşteri">
              <Input value={musteri} onChange={e => setMusteri(e.target.value)} />
            </Field>
            <Field label="Model / stil">
              <Input value={modelAdi} onChange={e => setModelAdi(e.target.value)} placeholder="Basic tişört" />
            </Field>
            <Field label="Adet">
              <Input value={adet} onChange={e => setAdet(e.target.value)} inputMode="numeric" placeholder="10000" align="right" />
            </Field>
            <Field label="Teslim tarihi">
              <Input type="date" value={teslimTarihi} onChange={e => setTeslimTarihi(e.target.value)} />
            </Field>
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
                    <span className="text-[11px] text-faint">{a.sira_no}</span>
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
              {adaylar.map(a => (
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
          </div>
        )}

        {adim === 4 && secilenAtolye && (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {[
              ['Sipariş', `${siparisNo}${musteri ? ` · ${musteri}` : ''}`],
              ['Model', modelAdi],
              ['Adet', adetSayi.toLocaleString('tr-TR')],
              ['Teslim', teslimTarihi],
              ['Atölye', `${secilenAtolye.kod} · ${secilenAtolye.ad}`],
              ['Bant', `${secilenBantSayisi} bant`],
              ['Zincir', secilenAsamaAdlari.join(' → ')],
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

        {adim < 4 ? (
          <Button
            variant="primary"
            onClick={ileri}
            loading={bekliyor}
            disabled={
              (adim === 0 && !adim1Gecerli) ||
              (adim === 1 && !adim2Gecerli) ||
              (adim === 2) ||               /* atölye satıra tıklanarak seçilir */
              (adim === 3 && !adim4Gecerli)
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
