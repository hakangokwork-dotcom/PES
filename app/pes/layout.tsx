import PesDevSidebar from '@/components/pes/PesDevSidebar'
import { requirePanel } from '@/lib/auth/panel-guard'

/* Yönetim paneli. Oturum ve rol kontrolü burada — altındaki tüm /pes/*
   rotaları kapsanır (bkz. lib/auth/panel-guard.ts). Atölye rolüyle girilirse
   kullanıcı kendi paneline yönlendirilir. */
export default async function PesLayout({ children }: { children: React.ReactNode }) {
  await requirePanel('yonetim')

  return (
    <div className="min-h-screen flex bg-canvas">
      <PesDevSidebar />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
