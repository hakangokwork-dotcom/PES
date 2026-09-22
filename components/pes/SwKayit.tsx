'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/* Service worker kaydı — yalnız /workshop layout'unda bağlanır ve kapsamı
   (scope) /workshop'tur: SW sadece /workshop/* istemcilerini denetler,
   /pes ve /login istekleri hiçbir zaman araya girilmeden gider.
   (Manifest kapsamı ayrı bir konu; /login yönlendirmesi için '/' kalır —
   gerekçesi app/manifest.ts'te.) Sürüm damgası build'de üretilir
   (next.config.ts).

   Yeni sürüm akışı: sw.js skipWaiting + clients.claim yaptığı için yeni
   worker hemen denetimi alır (controllerchange). Sayfa hâlâ eski JS'i
   çalıştırır; kullanıcıya "Yenile" düğmesi gösteririz, otomatik reload
   YAPMAYIZ — yarım kalmış form kaybolmasın. */
export default function SwKayit() {
  const [yeniSurum, setYeniSurum] = useState(false)

  useEffect(() => {
    /* Güvensiz bağlamda (örn. tablete LAN'dan http://192.168.x.x ile girmek)
       navigator.serviceWorker hiç tanımlı değildir; bileşen sessizce hiçbir şey
       yapmaz. localhost ve https sorunsuz. */
    if (!('serviceWorker' in navigator)) return
    const surum = process.env.NEXT_PUBLIC_SW_SURUM ?? 'dev'
    /* Geliştirmede SW'ye gelistirme=1 geçiyoruz: Turbopack dev chunk adresleri
       ident-hash'li olduğu için statik önbellek-önce bayat kod servis eder. */
    const url = `/sw.js?v=${encodeURIComponent(surum)}` +
      (process.env.NODE_ENV !== 'production' ? '&gelistirme=1' : '')
    let ilkDenetim = !!navigator.serviceWorker.controller

    const onDegisim = () => {
      const c = navigator.serviceWorker.controller
      const kontrolSurum = c ? new URL(c.scriptURL).searchParams.get('v') : null
      /* İlk kurulumda controller null'dan dolu hale gelir; o "yeni sürüm" değildir.
         Ayrıca deploy sonrası ilk açılışta sayfa zaten yeni kodu çalıştırır ama
         hâlâ eski worker'ın denetimindedir; yeni damgayı kaydetmek
         controllerchange tetikler. Sayfa zaten yeni sürümse (kendi damgası
         worker'ınkiyle aynı) şerit gösterme; şerit yalnız eski
         sekmeler/pencereler içindir. */
      if (ilkDenetim && kontrolSurum !== surum) setYeniSurum(true)
      ilkDenetim = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', onDegisim)
    navigator.serviceWorker.register(url, { scope: '/workshop' }).catch((err) => {
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
