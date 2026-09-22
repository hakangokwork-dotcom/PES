import WorkshopSidebar from '@/components/pes/WorkshopSidebar'
import { requireSession } from '@/lib/auth/panel-guard'
import { kimlikBilgisi } from '@/lib/auth/kimlik'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { AktifAtolyeSaglayici } from '@/components/pes/AktifAtolye'
import WorkshopKabuk from '@/components/pes/WorkshopKabuk'
import SwKayit from '@/components/pes/SwKayit'

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

  const baslik = sabitAtolye ? `${sabitAtolye.code} ${sabitAtolye.name}` : 'Atölye Paneli'

  return (
    <AktifAtolyeSaglayici sabitAtolyeId={sabitAtolye?.id ?? null}>
      <WorkshopKabuk
        baslik={baslik}
        kenar={<WorkshopSidebar eposta={eposta} tenantAdi={tenantAdi} sabitAtolye={sabitAtolye ?? null} />}
      >
        {/* SW yalnız atölye panelinde: /pes kabuk önbelleği almaz. */}
        <SwKayit />
        {children}
      </WorkshopKabuk>
    </AktifAtolyeSaglayici>
  )
}
