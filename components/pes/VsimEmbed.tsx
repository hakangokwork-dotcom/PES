'use client'

/* VSIM (Değer Akışı Simülasyonu) gömme sarmalayıcısı — hem atölye panelinde
   (/workshop/vsm) hem merkez panelinde (/pes/uretim-simulasyon) kullanılır.
   Modülün kaynağı VSIM standalone reposudur; components/vsim TÜRETİLMİŞTİR,
   `npm run sync:vsim` ile güncellenir. Bu dosya senkrondan etkilenmez. */

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/vsim/components/ErrorBoundary'

/* ssr:false — modül localStorage'dan yüklenen akışla render eder; sunucuda
   üretilen boş şablon ile istemcideki kayıtlı akış uyuşmaz (hydration hatası).

   Prop tipi burada AÇIKÇA veriliyor: modül JSX olduğu için TypeScript imzayı
   varsayılan `= {}` üzerinden boş obje diye çıkarıyor ve `storageKey`i reddediyor.
   Tipi components/vsim içine bir .d.ts ile koyamayız — o dizin türetilmiştir,
   `npm run sync:vsim` her çalıştığında silinip yeniden yazılır. */
const AtolyePlatform = dynamic<{ storageKey?: string }>(() => import('@/components/vsim/UretimSimulasyon'), {
  ssr: false,
  loading: () => <div className="p-6 text-ink-faint">Simülasyon yükleniyor…</div>,
})

export default function VsimEmbed({ storageKey }: { storageKey: string }) {
  return (
    /* Negatif kenar boşluğu, panel layout'larının p-6/lg:p-8 dolgusunu iptal eder —
       VSIM kendi üst bandı ve tam genişlikli tuvaliyle gelen bir uygulamadır. */
    <div className="vsim-root -m-6 lg:-m-8 min-h-screen bg-paper text-ink">
      <ErrorBoundary>
        {/* `key`: anahtar değişince REMOUNT şart — yükleme effect'i yalnız mount'ta
            çalışır, prop güncellemek yeni anahtarı okutmaz. */}
        <AtolyePlatform key={storageKey} storageKey={storageKey} />
      </ErrorBoundary>
    </div>
  )
}
