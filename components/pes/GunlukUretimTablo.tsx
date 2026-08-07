'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button, EmptyState, Input, useToast } from '@/components/ui'
import type { GunlukSatir } from '@/lib/pes/gunluk-uretim'

/* Günlük üretim girişi (tasarım K6, §6.3).

   TASARIM KARARI — hız her şeyden önce: bu ekran her gün, üretim
   bitiminde, muhtemelen aceleyle doldurulacak. Bu yüzden:
     · gün seçimi tek tık (◀ bugün ▶), varsayılan bugün
     · satır = bant; atölyenin gördüğü birim bu
     · alandan çıkınca kaydeder, "Kaydet" düğmesi yok
     · boş bırakmak kaydı SİLER, 0 yazmak "hiç çıkmadı" demektir

   Sipariş/aşama bağı arka planda: kullanıcı "hangi iş emri" diye
   düşünmek zorunda kalmadan bandına yazar. */

function bugunISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number)
  const d = new Date(Date.UTC(y, a - 1, g))
  d.setUTCDate(d.getUTCDate() + gun)
  return d.toISOString().slice(0, 10)
}

const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function gunAdi(tarih: string): string {
  const [y, a, g] = tarih.split('-').map(Number)
  const d = new Date(Date.UTC(y, a - 1, g))
  return `${g} ${AYLAR[a - 1]} ${y}, ${GUNLER[d.getUTCDay()]}`
}

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function kisaTarih(iso: string): string {
  const [, a, g] = iso.split('-')
  return `${Number(g)} ${AY_KISA[Number(a) - 1]}`
}

type Taslak = { adet: string; hatali: string }

export default function GunlukUretimTablo({ workshopId }: { workshopId: number }) {
  const toast = useToast()
  const [tarih, setTarih] = useState(bugunISO)
  const [satirlar, setSatirlar] = useState<GunlukSatir[]>([])
  const [taslak, setTaslak] = useState<Record<number, Taslak>>({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydedilen, setKaydedilen] = useState<number | null>(null)

  const doldur = useCallback((gelen: GunlukSatir[]) => {
    setSatirlar(gelen)
    setTaslak(Object.fromEntries(gelen.map(s => [s.atamaId, {
      adet: s.kayitVar ? String(s.girilenAdet) : '',
      hatali: s.kayitVar && s.girilenHatali > 0 ? String(s.girilenHatali) : '',
    }])))
  }, [])

  useEffect(() => {
    let iptal = false
    setYukleniyor(true)
    fetch(`/api/pes/workshops/${workshopId}/gunluk-uretim?tarih=${tarih}`)
      .then(r => r.json())
      .then(d => { if (!iptal) doldur(d.satirlar ?? []) })
      .catch(() => { if (!iptal) toast.error('Günlük üretim yüklenemedi') })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [workshopId, tarih, doldur, toast])

  async function kaydet(satir: GunlukSatir) {
    const t = taslak[satir.atamaId] ?? { adet: '', hatali: '' }
    setKaydedilen(satir.atamaId)
    try {
      const r = await fetch(`/api/pes/workshops/${workshopId}/gunluk-uretim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          atamaId: satir.atamaId,
          tarih,
          adet: t.adet.trim() === '' ? null : t.adet,
          hataliAdet: t.hatali.trim() === '' ? 0 : t.hatali,
        }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Kaydedilemedi'); return }

      /* Kümülatif ve kalan sunucudan geri gelir; istemcide yeniden
         hesaplamak iki doğruluk kaynağı yaratırdı. */
      if (d.satir) {
        setSatirlar(s => s.map(x => (x.atamaId === satir.atamaId ? d.satir : x)))
      } else {
        setSatirlar(s => s.filter(x => x.atamaId !== satir.atamaId))
      }
    } catch { toast.error('Bağlantı hatası') } finally { setKaydedilen(null) }
  }

  function degistiMi(satir: GunlukSatir): boolean {
    const t = taslak[satir.atamaId] ?? { adet: '', hatali: '' }
    const mevcutAdet = satir.kayitVar ? String(satir.girilenAdet) : ''
    const mevcutHatali = satir.kayitVar && satir.girilenHatali > 0 ? String(satir.girilenHatali) : ''
    return t.adet.trim() !== mevcutAdet || t.hatali.trim() !== mevcutHatali
  }

  const girilenSatir = satirlar.filter(s => s.kayitVar).length
  const toplamAdet = satirlar.reduce((t, s) => t + s.girilenAdet, 0)
  const toplamHedef = satirlar.reduce((t, s) => t + s.gunlukHedef, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Gün seçimi */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-surface p-3">
        <Button variant="ghost" size="sm" onClick={() => setTarih(t => gunEkle(t, -1))}>
          <ChevronLeft className="size-4" /> Önceki
        </Button>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-ink">{gunAdi(tarih)}</span>
          {tarih === bugunISO() && <span className="block text-[11px] text-faint">bugün</span>}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setTarih(t => gunEkle(t, 1))}>
          Sonraki <ChevronRight className="size-4" />
        </Button>
        <span className="w-40">
          <Input type="date" value={tarih} onChange={e => e.target.value && setTarih(e.target.value)} />
        </span>
        {tarih !== bugunISO() && (
          <Button variant="ghost" size="sm" onClick={() => setTarih(bugunISO())}>Bugüne dön</Button>
        )}
        <span className="ml-auto text-[13px] text-muted">
          <strong className="text-ink num">{toplamAdet.toLocaleString('tr-TR')}</strong> adet girildi
          {toplamHedef > 0 && <span className="text-faint"> · günlük hedef {toplamHedef.toLocaleString('tr-TR')}</span>}
        </span>
      </div>

      {yukleniyor ? (
        <p className="text-[13px] text-faint">Yükleniyor…</p>
      ) : satirlar.length === 0 ? (
        <EmptyState
          title="Bu gün için üretimde bant yok"
          description="Bu tarihte bu atölyeye planlanmış bir sipariş bulunmuyor. Sipariş yerleştirildiğinde bantlar burada listelenir."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {satirlar.map(s => {
            const tamamlanan = s.oncekiToplam + s.girilenAdet
            const yuzde = s.tahsisAdet > 0 ? Math.min(100, Math.round((tamamlanan / s.tahsisAdet) * 100)) : 0
            const asim = tamamlanan > s.tahsisAdet
            const t = taslak[s.atamaId] ?? { adet: '', hatali: '' }

            return (
              <div key={s.atamaId} className="rounded-xl border border-line-soft bg-surface p-3">
                <div className="flex flex-wrap items-start gap-3">
                  {/* Bant + sipariş */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink">{s.lineKodu}</span>
                      <span className="truncate text-[13px] text-muted">{s.lineAdi}</span>
                      {s.gecikmis && <Badge tone="warn">plan tarihi geçti</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-faint">
                      <Link href={`/workshop/is-emri/${s.workOrderId}?wid=${workshopId}`}
                        className="text-accent hover:underline">{s.isEmriNo}</Link>
                      {' · '}{s.modelAdi}
                      {s.musteri && ` · ${s.musteri}`}
                    </div>
                  </div>

                  {/* Giriş */}
                  <div className="flex items-end gap-2">
                    <span className="w-24">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-faint">Üretilen</span>
                      <Input
                        value={t.adet}
                        onChange={e => setTaslak(x => ({ ...x, [s.atamaId]: { ...t, adet: e.target.value } }))}
                        onBlur={() => { if (degistiMi(s)) kaydet(s) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        inputMode="numeric"
                        align="right"
                        /* Hedefi placeholder yapmıyoruz: girilmiş bir değer
                           sanılırdı. Hedef satırın altında zaten yazıyor. */
                        placeholder="—"
                        disabled={kaydedilen === s.atamaId}
                      />
                    </span>
                    <span className="w-20">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-faint">Hatalı</span>
                      <Input
                        value={t.hatali}
                        onChange={e => setTaslak(x => ({ ...x, [s.atamaId]: { ...t, hatali: e.target.value } }))}
                        onBlur={() => { if (degistiMi(s)) kaydet(s) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        inputMode="numeric"
                        align="right"
                        placeholder="—"
                        disabled={kaydedilen === s.atamaId}
                      />
                    </span>
                  </div>
                </div>

                {/* İlerleme */}
                <div className="mt-2.5">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-faint">
                      {kisaTarih(s.planBaslangic)} → {kisaTarih(s.planBitis)} · günlük hedef{' '}
                      <span className="num text-muted">{s.gunlukHedef.toLocaleString('tr-TR')}</span>
                    </span>
                    <span className={asim ? 'text-warn' : 'text-muted'}>
                      <span className="num">{tamamlanan.toLocaleString('tr-TR')}</span>
                      {' / '}
                      <span className="num">{s.tahsisAdet.toLocaleString('tr-TR')}</span>
                      {asim ? ' · tahsisi aştı' : ` · ${Math.max(0, s.kalanAdet).toLocaleString('tr-TR')} kaldı`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className={`h-full ${asim ? 'bg-warn' : 'bg-accent'}`}
                      style={{ width: `${yuzde}%` }} />
                  </div>
                </div>

                {kaydedilen === s.atamaId && (
                  <p className="mt-1 text-[11px] text-faint">kaydediliyor…</p>
                )}
              </div>
            )
          })}

          <p className="text-[13px] text-faint">
            {girilenSatir} / {satirlar.length} bandın girişi yapıldı.
            {' '}Boş bırakılan bant “henüz girilmedi” sayılır; hiç üretim olmadıysa <strong className="text-muted">0</strong> yazın.
          </p>
        </div>
      )}
    </div>
  )
}
