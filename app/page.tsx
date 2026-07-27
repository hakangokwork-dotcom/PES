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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-16 h-16 bg-[#197A56] rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-white font-bold text-xl">PES</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Atölye Verimlilik Sistemi</h1>

        {tenant ? (
          <>
            <p className="text-gray-500">Hangi panelle çalışacaksın?</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/workshop"
                className="px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors font-medium text-sm"
              >
                Atölye Paneli
              </Link>
              <Link
                href="/pes"
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
              >
                Merkez Paneli
              </Link>
            </div>
            <p className="text-xs text-gray-400">
              Panel arasında sol menünün altındaki bağlantıdan da geçebilirsin.
            </p>
          </>
        ) : (
          <>
            <p className="text-gray-500">
              200 fason atölye için verimlilik değerlendirme, maliyet analizi ve
              tedarikçi skorlama sistemi.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors font-medium text-sm"
            >
              Giriş Yap
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
