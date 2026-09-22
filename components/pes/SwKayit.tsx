'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/* Service worker kaydı — yalnız /workshop layout'unda bağlanır; yönetim
   paneli (/pes) SW almaz. Sürüm damgası build'de üretilir (next.config.ts).

   Yeni sürüm akışı: sw.js skipWaiting + clients.claim yaptığı için yeni
   worker hemen denetimi alır (controllerchange). Sayfa hâlâ eski JS'i
   çalıştırır; kullanıcıya "Yenile" düğmesi gösteririz, otomatik reload
   YAPMAYIZ — yarım kalmış form kaybolmasın. */
export default function SwKayit() {
  const [yeniSurum, setYeniSurum] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const surum = process.env.NEXT_PUBLIC_SW_SURUM ?? 'dev'
    let ilkDenetim = !!navigator.serviceWorker.controller

    const onDegisim = () => {
      /* İlk kurulumda controller null'dan dolu hale gelir; o "yeni sürüm" değildir. */
      if (ilkDenetim) setYeniSurum(true)
      ilkDenetim = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', onDegisim)
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(surum)}`).catch((err) => {
      console.error('SW kaydı başarısız', err)
    })
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onDegisim)
  }, [])

  if (!yeniSurum) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_4px_14px_rgba(15,23,32,0.12)] md:inset-x-auto md:right-5"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-[13px] text-ink">Uygulamanın yeni sürümü hazır.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-auto inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white"
      >
        <RefreshCw className="size-4" /> Yenile
      </button>
    </div>
  )
}
