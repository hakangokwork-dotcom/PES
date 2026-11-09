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
   gelir; seçici gösterilmez ve ekranlar `?wid=` beklemez.

   Merkez yöneticisi bir atölye seçtiyse (/workshop/gir) oturum onu o
   atölyenin hesabı gibi taşır — workshopId oradan gelir, RLS dahil
   (lib/auth/atolye-kapsam.ts). `atolyeSecimi` yalnız "atölye değiştir"
   bağlantısını göstermek için. */
export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireSession()
  const { eposta, tenantAdi } = await kimlikBilgisi(tenant)

  const aktifId = tenant.workshopId

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
            sabitAtolye={sabitAtolye ?? null} atolyeSecimi={tenant.atolyeSecimi}
          />
        }
      >
        {/* SW yalnız atölye panelinde: /pes kabuk önbelleği almaz. */}
        <SwKayit />
        {/* Merkez yöneticisi atölye adına girmiş: her sayfada, telefonda da
            görünsün; kaydedilen her şey bu atölyenin kaydı olur. */}
        {tenant.atolyeSecimi && sabitAtolye && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line-soft bg-warn-soft px-4 py-2 text-[13px] text-body">
            <span className="flex-1">
              <strong className="font-semibold text-ink">{sabitAtolye.code} {sabitAtolye.name}</strong> adına çalışıyorsunuz.
            </span>
            <a href="/workshop/gir" className="font-medium text-accent-ink underline underline-offset-2">Atölye değiştir</a>
            <a href="/pes" className="font-medium text-accent-ink underline underline-offset-2">Merkeze dön</a>
          </div>
        )}
        {children}
      </WorkshopKabuk>
    </AktifAtolyeSaglayici>
  )
}
