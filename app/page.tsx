import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { panelFor, PANEL_YOLU } from '@/lib/auth/panel-guard'

/* Giriş sonrası buraya dönülür.
   · Yalnız bir panele erişimi olan → doğrudan oraya (soru sormaya gerek yok).
   · Her ikisine de erişebilen → seçim. Ekip şu an tam yetkili: atölye
     verisini girip sonra merkez panelinden değerlendirmeye bakacak, yani
     iki panel arasında gidip geliyor. Otomatik yönlendirme bu akışta
     yanlış yere düşürürdü.
   Oturumsuz ziyaretçi tanıtım ekranını görür. */
export default async function HomePage() {
  const tenant = await getTenantContext()

  if (tenant && panelFor(tenant) !== 'yonetim') {
    redirect(PANEL_YOLU[panelFor(tenant)])
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-white font-bold text-xl">PES</span>
        </div>
        <h1 className="text-3xl font-bold text-ink">Atölye Verimlilik Sistemi</h1>

        {tenant ? (
          <>
            <p className="text-faint">Hangi panelle çalışacaksın?</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/workshop"
                className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium text-sm"
              >
                Atölye Paneli
              </Link>
              <Link
                href="/pes"
                className="px-6 py-2.5 border border-line text-body rounded-lg hover:bg-line-soft transition-colors font-medium text-sm"
              >
                Merkez Paneli
              </Link>
            </div>
            <p className="text-xs text-faint">
              Panel arasında sol menünün altındaki bağlantıdan da geçebilirsin.
            </p>
          </>
        ) : (
          <>
            <p className="text-faint">
              200 fason atölye için verimlilik değerlendirme, maliyet analizi ve
              tedarikçi skorlama sistemi.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium text-sm"
            >
              Giriş Yap
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
