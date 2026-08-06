import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import YetenekEditoru from '@/components/pes/YetenekEditoru'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ wid?: string; bant?: string }> }

/* Bant yetenek profili. Yetenekler bant bazında tutulur (line_capability);
   atölye özeti bunlardan türetilir (v_workshop_capability, migration 023). */
export default async function YetenekPage({ searchParams }: Props) {
  const { wid, bant } = await searchParams

  const data = await withServerTenant(async (sql) => {
    if (!wid) return { mode: 'atolyesiz' as const }

    const workshopId = Number(wid)
    const [w] = await sql`SELECT id, code, name FROM workshop WHERE id = ${workshopId}`
    if (!w) return { mode: 'yok' as const }

    const bantlar = await sql`
      SELECT pl.id, pl.code, pl.name,
             (SELECT COUNT(*)::int FROM line_capability lc
              WHERE lc.line_id = pl.id AND lc.attribute_type = 'PROFILE') AS yetenek
      FROM production_line pl
      WHERE pl.workshop_id = ${workshopId} AND pl.is_active
      ORDER BY pl.code`

    return { mode: 'ok' as const, w, bantlar }
  })

  if (!data) redirect('/login')

  if (data.mode === 'atolyesiz') {
    return (
      <div className="max-w-2xl mx-auto pt-12 text-center space-y-3">
        <h1 className="text-xl font-semibold text-ink">Yetenek Profili</h1>
        <p className="text-faint">Önce bir atölye seçin.</p>
        <Link href="/workshop" className="inline-block text-accent text-sm font-medium hover:underline">
          Atölye listesine git →
        </Link>
      </div>
    )
  }
  if (data.mode === 'yok') return <p className="text-faint">Atölye bulunamadı.</p>

  const { w, bantlar } = data
  const secili = bantlar.find((b) => String(b.id) === bant) ?? bantlar[0]

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">{w.name as string}</h1>
        <p className="text-faint">{w.code as string} · Bant yetenek profili</p>
      </div>

      {bantlar.length === 0 ? (
        <p className="text-faint bg-white border border-line-soft rounded-xl p-6">
          Bu atölyede tanımlı bant yok. Yetenek girmek için önce bant eklenmeli.
        </p>
      ) : (
        <>
          {/* Bant sekmeleri — tek bant varsa da gösteriliyor, kaç yetenek
              işaretli olduğu buradan görünsün diye. */}
          <div className="flex flex-wrap gap-2">
            {bantlar.map((b) => {
              const aktif = b.id === secili.id
              return (
                <Link
                  key={String(b.id)}
                  href={`/workshop/yetenek?wid=${w.id}&bant=${b.id}`}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    aktif
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-gray-700 border-line-soft hover:border-accent'
                  }`}
                >
                  {b.name as string}
                  <span className={`ml-2 text-xs ${aktif ? 'text-emerald-100' : 'text-faint'}`}>
                    {b.yetenek as number}
                  </span>
                </Link>
              )
            })}
          </div>

          <YetenekEditoru lineId={Number(secili.id)} lineAdi={String(secili.name)} />
        </>
      )}
    </div>
  )
}
