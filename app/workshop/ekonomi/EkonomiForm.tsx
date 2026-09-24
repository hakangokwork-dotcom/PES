'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Atölyenin aylık verisini girdiği form.
 *
 * BOŞ İLE SIFIR AYRI. Alan boş bırakılırsa null gider ("bilmiyorum"),
 * 0 yazılırsa 0 gider ("sıfır kişi"). İkisini birleştirmek — boşu 0
 * saymak — rasyoları sessizce yanlış hesaplatır; E0'ın null/0 ayrımı
 * bu formda başlıyor.
 */

type Alan = { ad: string; etiket: string; ipucu?: string; adim?: string }

const GRUPLAR: Array<{ baslik: string; alanlar: Alan[] }> = [
  {
    baslik: 'Ciro ve üretim',
    alanlar: [
      { ad: 'revenue_declared', etiket: 'Aylık ciro (TL)', ipucu: 'Fatura toplamı, KDV hariç' },
      { ad: 'qty_declared', etiket: 'Aylık adet', ipucu: 'Çıkan toplam parça' },
      { ad: 'idle_days', etiket: 'Boş gün', ipucu: 'İş olmayan / dışarı çalışılan gün', adim: '0.5' },
    ],
  },
  {
    baslik: 'Çalışma günleri',
    alanlar: [
      { ad: 'nominal_days', etiket: 'Nominal gün', ipucu: 'Ayda çalışılması gereken gün', adim: '0.5' },
      { ad: 'actual_days', etiket: 'Fiili gün', ipucu: 'Gerçekte çalışılan gün', adim: '0.5' },
      { ad: 'hours_per_day', etiket: 'Günlük saat', ipucu: 'Molalar hariç', adim: '0.5' },
    ],
  },
  {
    baslik: 'Kadro (o aya ait)',
    alanlar: [
      { ad: 'cutting_staff', etiket: 'Kesim kişi' },
      { ad: 'sewing_staff', etiket: 'Dikim kişi' },
      { ad: 'ukp_staff', etiket: 'UKP kişi', ipucu: 'Ütü, kontrol, paket' },
      { ad: 'office_staff', etiket: 'Ofis kişi' },
    ],
  },
  {
    baslik: 'Tesis',
    alanlar: [{ ad: 'area_m2', etiket: 'Kapalı alan (m²)' }],
  },
]

export default function EkonomiForm({
  donem, kayit,
}: {
  donem: string
  kayit: Record<string, unknown> | null
}) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [tamam, setTamam] = useState(false)

  const ilk = (ad: string) => {
    const v = kayit?.[ad]
    return v === null || v === undefined ? '' : String(v)
  }

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setHata(null); setTamam(false)
    const fd = new FormData(e.currentTarget)
    const govde: Record<string, unknown> = { donem }
    for (const g of GRUPLAR) {
      for (const a of g.alanlar) {
        const ham = String(fd.get(a.ad) ?? '').trim()
        /* Boş string null olarak gider; '0' sayı olarak gider. */
        govde[a.ad] = ham === '' ? null : ham
      }
    }

    const cevap = await fetch('/api/workshop/ekonomi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    })
    if (!cevap.ok) {
      const g = await cevap.json().catch(() => ({}))
      setHata(g.error ?? `Kaydedilemedi (${cevap.status})`)
      return
    }
    setTamam(true)
    basla(() => router.refresh())
  }

  return (
    <form onSubmit={gonder} className="space-y-5">
      {GRUPLAR.map((g) => (
        <fieldset key={g.baslik} className="rounded border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">{g.baslik}</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-1">
            {g.alanlar.map((a) => (
              <label key={a.ad} className="block text-sm">
                <span className="block text-slate-700">{a.etiket}</span>
                <input
                  name={a.ad}
                  type="number"
                  step={a.adim ?? '1'}
                  min="0"
                  defaultValue={ilk(a.ad)}
                  placeholder="boş = bilmiyorum"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
                />
                {a.ipucu && <span className="block text-xs text-slate-400 mt-0.5">{a.ipucu}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <p className="text-xs text-slate-500">
        Boş bıraktığınız alan &ldquo;bilmiyorum&rdquo; olarak kaydedilir, sıfır olarak değil.
        Gerçekten sıfırsa 0 yazın.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={bekliyor}
          className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-50"
        >
          {bekliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        {tamam && <span className="text-sm text-emerald-700">Kaydedildi.</span>}
        {hata && <span className="text-sm text-red-600">{hata}</span>}
      </div>
    </form>
  )
}
