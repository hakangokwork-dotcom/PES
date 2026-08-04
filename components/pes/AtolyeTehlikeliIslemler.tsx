'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Arşivleme ve kalıcı silme.
 *
 * Kalıcı silme yalnız burada; listede yok. 114 satırlık tabloda yanlış satıra
 * tıklama riski, geri dönüşü olmayan bir işlem için kabul edilemez.
 *
 * Kod yazdırma gibi ek onay yok: sunucu zaten yalnız hiçbir bağlı kaydı
 * olmayan atölyeyi siliyor, kaybedilecek veri tanım gereği sıfır. */
export default function AtolyeTehlikeliIslemler({
  id,
  kod,
  aktif,
}: {
  id: number
  kod: string
  aktif: boolean
}) {
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [onayIstendi, setOnayIstendi] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function arsivDegistir() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !aktif }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setHata(d.error ?? 'İşlem başarısız')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setHata('Bağlantı hatası')
    } finally {
      setBekliyor(false)
    }
  }

  async function sil() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, { method: 'DELETE' })
      if (r.ok) {
        router.push('/pes/workshops')
        return
      }
      const d = await r.json().catch(() => ({}))
      setHata(d.error ?? 'Silme başarısız')
      setOnayIstendi(false)
    } catch {
      setHata('Bağlantı hatası')
      setOnayIstendi(false)
    } finally {
      setBekliyor(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Atölye durumu</h2>
        <p className="text-xs text-gray-500 mt-1">
          Pasife alınan atölye listelerden, dashboard sayacından ve atölye
          seçicilerden düşer — raporlar yalnız aktifleri sayar. Verisi
          silinmez, istediğin zaman geri açarsın.
        </p>
      </div>

      {hata && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {hata}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={arsivDegistir}
          disabled={bekliyor}
          className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {bekliyor ? '…' : aktif ? 'Pasife al' : 'Aktife al'}
        </button>

        {!onayIstendi ? (
          <button
            onClick={() => { setHata(''); setOnayIstendi(true) }}
            disabled={bekliyor}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            Kalıcı Sil
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">
              {kod} kalıcı olarak silinecek. Emin misin?
            </span>
            <button
              onClick={sil}
              disabled={bekliyor}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              {bekliyor ? '…' : 'Evet, sil'}
            </button>
            <button
              onClick={() => setOnayIstendi(false)}
              disabled={bekliyor}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Vazgeç
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
