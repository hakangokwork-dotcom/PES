import WorkshopSidebar from '@/components/pes/WorkshopSidebar'
import { requireSession } from '@/lib/auth/panel-guard'
import { kimlikBilgisi } from '@/lib/auth/kimlik'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { AktifAtolyeSaglayici } from '@/components/pes/AktifAtolye'
import WorkshopKabuk from '@/components/pes/WorkshopKabuk'
import SwKayit from '@/components/pes/SwKayit'
import { secilenAtolyeId } from '@/lib/auth/aktif-atolye'

/* Kullanıcı (atölye) paneli. Oturum kontrolü burada — altındaki tüm
   /workshop/* rotaları kapsanır. Rol ayrımı YOK: yöneticinin de atölye
   ekranlarını görebilmesi gerekir (destek/kontrol).

   033 sonrası: kullanıcı bir atölyeye bağlıysa "aktif atölye" oturumdan
   gelir; seçici gösterilmez ve ekranlar `?wid=` beklemez.

   Merkez kullanıcısı bir atölyeye "girdiyse" (/workshop/gir → çerez) panel
   o atölyeye kilitlenir: kenar çubuğu, istemci ekranları ve sunucu
   ekranları aynı atölyeyi görür. `merkezGorunumu` bunu bağlı kullanıcıdan
   ayırır — çıkış bağlantısı ve salt-okunur uyarıları ona bakar. */
export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireSession()
  const { eposta, tenantAdi } = await kimlikBilgisi(tenant)

  const merkezGorunumu = !tenant.workshopId
  const aktifId = tenant.workshopId ?? (await secilenAtolyeId())

  const sabitAtolye = aktifId
    ? await withServerTenant(async (sql) => {
        const [w] = await sql`
          SELECT id, code, name FROM workshop WHERE id = ${aktifId}`
        return (w as unknown as { id: number; code: string; name: string }) ?? null
      })
    : null

  const baslik = sabitAtolye ? `${sabitAtolye.code} ${sabitAtolye.name}` : 'Atölye Paneli'

  return (
    <AktifAtolyeSaglayici sabitAtolyeId={sabitAtolye?.id ?? null}>
      <WorkshopKabuk
        baslik={baslik}
        kenar={
          <WorkshopSidebar
            eposta={eposta} tenantAdi={tenantAdi}
            sabitAtolye={sabitAtolye ?? null} merkezGorunumu={merkezGorunumu}
          />
        }
      >
        {/* SW yalnız atölye panelinde: /pes kabuk önbelleği almaz. */}
        <SwKayit />
        {children}
      </WorkshopKabuk>
    </AktifAtolyeSaglayici>
  )
}
