import WorkshopSidebar from '@/components/pes/WorkshopSidebar'
import { requireSession } from '@/lib/auth/panel-guard'
import { kimlikBilgisi } from '@/lib/auth/kimlik'

/* Kullanıcı (atölye) paneli. Oturum kontrolü burada — altındaki tüm
   /workshop/* rotaları kapsanır. Rol ayrımı YOK: yöneticinin de atölye
   ekranlarını görebilmesi gerekir (destek/kontrol). */
export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireSession()
  const { eposta, tenantAdi } = await kimlikBilgisi(tenant)

  return (
    <div className="min-h-screen flex bg-canvas">
      <WorkshopSidebar eposta={eposta} tenantAdi={tenantAdi} />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
