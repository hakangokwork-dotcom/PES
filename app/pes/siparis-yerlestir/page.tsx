import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { PageHeader } from '@/components/ui'
import SiparisYerlestirSihirbazi, {
  type AsamaSecenegi,
  type HavuzPo,
} from '@/components/pes/SiparisYerlestirSihirbazi'

export const dynamic = 'force-dynamic'

/* Aşama listesi SUNUCUDAN geliyor: sihirbazın 2. adımında gösterilecek
   zincir seçenekleri production_stage'in kendisi. İstemciye sabit liste
   gömmek, tabloya aşama eklendiğinde sessizce eskiyen bir kopya yaratırdı.

   Havuz modu (spec K5): ?po=<id> ile gelindiğinde kayıt sunucudan okunur;
   RLS tenant dışını zaten görmez. Zaten atölyesi olan kayıt için sihirbaz
   havuz modu OLMADAN açılır — aynı satırı ikinci kez yerleştirmek yok. */
type Arama = { po?: string; atolye?: string; bant?: string; tarih?: string }

export default async function SiparisYerlestirPage({ searchParams }: { searchParams: Promise<Arama> }) {
  const sp = await searchParams
  const poId = Number(sp.po) || 0
  let dbError = false

  const data = await withServerTenant(async (sql) => {
    const asamalar = await sql`
      SELECT code, name, sira_no, zorunlu
      FROM production_stage
      ORDER BY sira_no`
    let po: HavuzPo | null = null
    let poUyari: string | null = null
    if (poId) {
      const [k] = await sql`
        SELECT id, is_emri_no, musteri, model_adi, siparis_miktari, teslim_tarihi::text,
               klasman_kodu, kumas_turu_kodu, kumas_grubu_kodu, workshop_id, durum
          FROM work_order WHERE id = ${poId}`
      if (!k) poUyari = 'Havuzdaki sipariş bulunamadı — sihirbaz boş açıldı.'
      else if (k.workshop_id !== null) poUyari = `${k.is_emri_no} zaten yerleştirilmiş (${k.durum}) — sihirbaz boş açıldı.`
      else po = k as unknown as HavuzPo
    }
    return { asamalar: asamalar as unknown as AsamaSecenegi[], po, poUyari }
  }).catch((err: unknown) => {
    console.error('[siparis-yerlestir] aşama listesi', err)
    dbError = true
    return { asamalar: [] as AsamaSecenegi[], po: null, poUyari: null }
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
        <>
          {data.poUyari && (
            <p className="rounded-lg border border-warn bg-warn-soft/50 px-4 py-2.5 text-[13px] text-ink">
              {data.poUyari}
            </p>
          )}
          <SiparisYerlestirSihirbazi
            asamalar={data.asamalar}
            havuzPo={data.po ?? undefined}
            onAtolyeId={Number(sp.atolye) || undefined}
            onBantId={Number(sp.bant) || undefined}
            onTarih={/^\d{4}-\d{2}-\d{2}$/.test(sp.tarih ?? '') ? sp.tarih : undefined}
          />
        </>
      )}
    </div>
  )
}
