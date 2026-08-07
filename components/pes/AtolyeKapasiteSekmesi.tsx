'use client'

import { useEffect, useState } from 'react'
import { Input, useToast } from '@/components/ui'

export type KapasiteSatiri = {
  stage_id: number
  code: string
  name: string
  sira_no: number
  gunluk_kapasite: number | null
  notlar: string | null
}

/* Atölyenin aşama bazlı günlük kapasitesi (tasarım K2).

   NEDEN ÖNEMLİ: kaydı olmayan aşamada yerleştirme sihirbazı tarih
   ÜRETEMEZ ve o aşama zincirde tarihsiz kalır. Tablo boş başladığı için
   ilk kullanımda her siparişte kesim/yıkama/UKP tarihsiz çıkar — bu
   ekran onu kapatır.

   DİKİM burada yok: kapasitesi bantların daily_target toplamı. Ayrıca
   girilmesi iki doğruluk kaynağı yaratırdı. */
export default function AtolyeKapasiteSekmesi({ workshopId }: { workshopId: number }) {
  const toast = useToast()
  const [satirlar, setSatirlar] = useState<KapasiteSatiri[]>([])
  const [taslak, setTaslak] = useState<Record<number, string>>({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydedilen, setKaydedilen] = useState<number | null>(null)

  useEffect(() => {
    let iptal = false
    fetch(`/api/pes/workshops/${workshopId}/kapasite`)
      .then(r => r.json())
      .then(d => {
        if (iptal) return
        const gelen: KapasiteSatiri[] = d.kapasiteler ?? []
        setSatirlar(gelen)
        setTaslak(Object.fromEntries(gelen.map(s => [
          s.stage_id, s.gunluk_kapasite === null ? '' : String(s.gunluk_kapasite),
        ])))
      })
      .catch(() => { if (!iptal) toast.error('Kapasiteler yüklenemedi') })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [workshopId, toast])

  async function kaydet(stageId: number) {
    const deger = taslak[stageId] ?? ''
    setKaydedilen(stageId)
    try {
      const r = await fetch(`/api/pes/workshops/${workshopId}/kapasite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, gunlukKapasite: deger === '' ? null : deger }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? 'Kaydedilemedi'); return }
      setSatirlar(s => s.map(x =>
        x.stage_id === stageId ? { ...x, gunluk_kapasite: d.gunlukKapasite } : x))
      toast.success(d.gunlukKapasite === null ? 'Kapasite kaldırıldı' : 'Kapasite kaydedildi')
    } catch { toast.error('Bağlantı hatası') } finally { setKaydedilen(null) }
  }

  const tanimliSayisi = satirlar.filter(s => s.gunluk_kapasite !== null).length

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line-soft bg-surface p-4">
        <h4 className="font-medium text-ink">Aşama kapasiteleri</h4>
        <p className="mt-1 text-[13px] text-muted">
          Bu atölye her aşamada günde kaç adet yapabiliyor? Sipariş yerleştirme
          süreleri buradan hesaplanıyor. <strong className="text-ink">Boş bırakılan aşamada
          sistem tarih üretmez</strong>, o aşamanın tarihini elle yazmanız gerekir.
        </p>
        <p className="mt-1 text-[11px] text-faint">
          Dikim burada yok — kapasitesi bantların günlük hedef toplamıdır.
        </p>
      </div>

      {yukleniyor ? (
        <p className="text-[13px] text-faint">Yükleniyor…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {satirlar.map(s => (
              <div key={s.stage_id} className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{s.name}</span>
                  <span className="block text-[11px] text-faint">
                    {s.gunluk_kapasite === null
                      ? 'tanımlı değil — tarih elle girilecek'
                      : `${s.gunluk_kapasite} adet/gün`}
                  </span>
                </span>
                <span className="w-28 shrink-0">
                  <Input
                    value={taslak[s.stage_id] ?? ''}
                    onChange={e => setTaslak(t => ({ ...t, [s.stage_id]: e.target.value }))}
                    onBlur={() => {
                      const mevcut = s.gunluk_kapasite === null ? '' : String(s.gunluk_kapasite)
                      if ((taslak[s.stage_id] ?? '') !== mevcut) kaydet(s.stage_id)
                    }}
                    inputMode="numeric"
                    align="right"
                    placeholder="—"
                    disabled={kaydedilen === s.stage_id}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] text-faint">
                  {kaydedilen === s.stage_id ? 'kaydediliyor…' : 'adet/gün'}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[13px] text-faint">
            {tanimliSayisi} / {satirlar.length} aşamanın kapasitesi tanımlı.
            {tanimliSayisi < satirlar.length && ' Tanımsız olanlar yerleştirmede tarihsiz kalır.'}
          </p>
        </>
      )}
    </div>
  )
}
