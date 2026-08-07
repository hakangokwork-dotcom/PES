import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { PageHeader } from '@/components/ui'
import SiparisYerlestirSihirbazi, {
  type AsamaSecenegi,
} from '@/components/pes/SiparisYerlestirSihirbazi'

export const dynamic = 'force-dynamic'

/* Aşama listesi SUNUCUDAN geliyor: sihirbazın 2. adımında gösterilecek
   zincir seçenekleri production_stage'in kendisi. İstemciye sabit liste
   gömmek, tabloya aşama eklendiğinde sessizce eskiyen bir kopya yaratırdı. */
export default async function SiparisYerlestirPage() {
  let dbError = false

  const data = await withServerTenant(async (sql) => {
    const asamalar = await sql`
      SELECT code, name, sira_no, zorunlu
      FROM production_stage
      ORDER BY sira_no`
    return { asamalar: asamalar as unknown as AsamaSecenegi[] }
  }).catch((err: unknown) => {
    console.error('[siparis-yerlestir] aşama listesi', err)
    dbError = true
    return { asamalar: [] as AsamaSecenegi[] }
  })

  if (data === null) redirect('/login')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Sipariş yerleştir' }]}
        title="Sipariş yerleştir"
        context="Siparişi atölyeye ve bantlarına dağıtır, aşama zincirini kurar"
      />

      {dbError ? (
        <p className="rounded-lg border border-danger-line bg-danger-soft/40 px-4 py-2.5 text-[13px] text-danger">
          Aşama listesi yüklenemedi. Sayfayı yenileyin; sorun sürerse yöneticinize bildirin.
        </p>
      ) : (
        <SiparisYerlestirSihirbazi asamalar={data.asamalar} />
      )}
    </div>
  )
}
