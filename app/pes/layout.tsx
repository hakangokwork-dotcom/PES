import { Suspense } from 'react'
import PesDevSidebar from '@/components/pes/PesDevSidebar'
import DonemBar from '@/components/pes/DonemBar'
import { requirePanel } from '@/lib/auth/panel-guard'
import { kimlikBilgisi } from '@/lib/auth/kimlik'
import { withTenant } from '@/lib/supabase/tenant-db'
import { mevcutDonemler, type Donem } from '@/lib/pes/donem'

/* Yönetim paneli. Oturum ve rol kontrolü burada — altındaki tüm /pes/*
   rotaları kapsanır (bkz. lib/auth/panel-guard.ts). Atölye rolüyle girilirse
   kullanıcı kendi paneline yönlendirilir. */
export default async function PesLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requirePanel('yonetim')
  const { eposta, tenantAdi } = await kimlikBilgisi(tenant)

  /* Dönem listesi verinin kendisinden; sabit yıl listesi yoktu artık.
     Hata durumunda bar gizlenir — dönem seçici bir kolaylıktır, sayfayı
     düşürmemeli. */
  let donemler: Donem[] = []
  try {
    donemler = await withTenant(tenant.tenantId, (sql) => mevcutDonemler(sql))
  } catch (err) {
    console.error('[pes/layout] dönem listesi alınamadı', err)
  }

  return (
    <div className="min-h-screen flex bg-canvas">
      <PesDevSidebar eposta={eposta} tenantAdi={tenantAdi} />
      <div className="flex-1 min-w-0 flex flex-col">
        {donemler.length > 0 && (
          /* useSearchParams istemci tarafında; Suspense sınırı zorunlu. */
          <Suspense fallback={<div className="h-[37px] border-b border-line-soft bg-surface" />}>
            <DonemBar mevcut={donemler} />
          </Suspense>
        )}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
