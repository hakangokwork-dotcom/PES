import WorkshopSidebar from '@/components/pes/WorkshopSidebar'
import { requireSession } from '@/lib/auth/panel-guard'

/* Kullanıcı (atölye) paneli. Oturum kontrolü burada — altındaki tüm
   /workshop/* rotaları kapsanır. Rol ayrımı YOK: yöneticinin de atölye
   ekranlarını görebilmesi gerekir (destek/kontrol). */
export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  await requireSession()

  return (
    <div className="min-h-screen flex bg-gray-50">
      <WorkshopSidebar />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
