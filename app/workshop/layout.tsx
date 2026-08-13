import WorkshopSidebar from '@/components/pes/WorkshopSidebar'
import { requireSession } from '@/lib/auth/panel-guard'
import { kimlikBilgisi } from '@/lib/auth/kimlik'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { AktifAtolyeSaglayici } from '@/components/pes/AktifAtolye'

/* Kullanıcı (atölye) paneli. Oturum kontrolü burada — altındaki tüm
   /workshop/* rotaları kapsanır. Rol ayrımı YOK: yöneticinin de atölye
   ekranlarını görebilmesi gerekir (destek/kontrol).

   033 sonrası: kullanıcı bir atölyeye bağlıysa "aktif atölye" oturumdan
   gelir; seçici gösterilmez ve ekranlar `?wid=` beklemez. */
export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireSession()
  const { eposta, tenantAdi } = await kimlikBilgisi(tenant)

  const sabitAtolye = tenant.workshopId
    ? await withServerTenant(async (sql) => {
        const [w] = await sql`
          SELECT id, code, name FROM workshop WHERE id = ${tenant.workshopId}`
        return (w as unknown as { id: number; code: string; name: string }) ?? null
      })
    : null

  return (
    <AktifAtolyeSaglayici sabitAtolyeId={sabitAtolye?.id ?? null}>
      <div className="min-h-screen flex bg-canvas">
        <WorkshopSidebar eposta={eposta} tenantAdi={tenantAdi} sabitAtolye={sabitAtolye ?? null} />
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </AktifAtolyeSaglayici>
  )
}
