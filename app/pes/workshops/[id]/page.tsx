import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Workshop, ProductionLine } from '@/types/pes'
import WorkshopForm from '@/components/pes/WorkshopForm'
import LineManager from '@/components/pes/LineManager'
import WorkshopTabs from '@/components/pes/WorkshopTabs'
import AtolyeTehlikeliIslemler from '@/components/pes/AtolyeTehlikeliIslemler'
import { withServerTenant } from '@/lib/supabase/tenant-server'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  CMT: 'Kesim + Dikim + UKP',
  CM: 'Kesim + Dikim',
  MT: 'Dikim + UKP',
  M: 'Sadece Dikim',
}

export default async function WorkshopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const wid = parseInt(id)

  const data = await withServerTenant(async (sql) => {
    const workshops = await sql`SELECT * FROM workshop WHERE id = ${wid}` as Workshop[]
    if (workshops.length === 0) return null

    // Atölye 360 verisi tek turda — sıralı await zinciri yerine paralel.
    const [lineList, accountRows, contacts, shares, interactions, capabilities,
           profilRows, denetimRows] = await Promise.all([
      sql`SELECT * FROM production_line WHERE workshop_id = ${wid} ORDER BY code`,
      sql`SELECT * FROM workshop_account WHERE workshop_id = ${wid}`,
      sql`SELECT * FROM workshop_contact WHERE workshop_id = ${wid} ORDER BY is_primary DESC, name`,
      sql`SELECT * FROM workshop_customer_share
          WHERE workshop_id = ${wid} AND valid_to IS NULL
          ORDER BY share_pct DESC NULLS LAST, customer_label`,
      sql`SELECT * FROM workshop_interaction
          WHERE workshop_id = ${wid}
          ORDER BY occurred_at DESC, id DESC LIMIT 50`,
      sql`SELECT lc.dimension_code, cd.label AS dimension_label,
                 lc.value_code, cv.label AS value_label,
                 count(DISTINCT lc.line_id)::int AS line_count
          FROM line_capability lc
          JOIN production_line pl ON pl.id = lc.line_id
          LEFT JOIN capability_dimension cd ON cd.code = lc.dimension_code
          LEFT JOIN capability_value cv ON cv.dimension_id = cd.id AND cv.code = lc.value_code
          WHERE pl.workshop_id = ${wid}
          GROUP BY lc.dimension_code, cd.label, lc.value_code, cv.label, cd.sort_order, cv.sort_order
          ORDER BY cd.sort_order NULLS LAST, cv.sort_order NULLS LAST`,
      sql`SELECT * FROM workshop_profil WHERE workshop_id = ${wid}`,
      /* tarih/sonraki_tarih ::text — postgres.js DATE'i Date nesnesine
         cevirir, sekme bileşeni string bekliyor (.slice/.localeCompare). */
      sql`SELECT id, tip, tarih::text, puan, sinif, sinif_hesap,
                 gecerlilik_ay, sonraki_tarih::text, kaynak
            FROM workshop_denetim WHERE workshop_id = ${wid}
           ORDER BY tip, tarih DESC`,
    ])

    return {
      w: workshops[0],
      lineList: lineList as unknown as ProductionLine[],
      account: accountRows[0] ?? null,
      contacts,
      shares,
      interactions,
      capabilities,
      profil: profilRows[0] ?? null,
      denetimler: denetimRows,
    }
  })

  if (!data) redirect('/pes/workshops')

  const { w, lineList, account, contacts, shares, interactions, capabilities,
          profil, denetimler } = data

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <Link href="/pes/workshops" className="text-sm text-faint hover:text-gray-700">
          ← Atölyeler
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-ink">{w.name}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-canvas text-muted">
            Tip {w.type} — {TYPE_LABELS[w.type]}
          </span>
          {w.is_active ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Aktif</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-faint">Pasif</span>
          )}
        </div>
        <p className="text-faint mt-1">{w.code} · {w.city ?? ''} {w.district ?? ''}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Dikim Operatörü</p>
          <p className="text-xl font-bold text-ink">{w.sewing_staff}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Toplam Çalışan</p>
          <p className="text-xl font-bold text-ink">{w.total_staff}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Günlük Hedef</p>
          <p className="text-xl font-bold text-ink">{w.daily_target.toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Bant Sayısı</p>
          <p className="text-xl font-bold text-ink">{w.line_count}</p>
        </div>
      </div>

      <WorkshopTabs
        workshopId={w.id}
        account={account as never}
        contacts={contacts as never}
        shares={shares as never}
        interactions={interactions as never}
        capabilities={capabilities as never}
        isActive={!!w.is_active}
        profil={profil as never}
        denetimler={denetimler as never}
        /* Yetenek sekmesi bant bazında düzenleme yapar; aktif bantlar lazım. */
        lines={lineList.filter((l) => l.is_active).map((l) => ({ id: l.id, code: l.code, name: l.name }))}
      />

      <LineManager workshop={w} lines={lineList} />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-ink py-2">
          Atölye Bilgilerini Düzenle ▾
        </summary>
        <div className="mt-4">
          <WorkshopForm workshop={w} />
        </div>
      </details>

      <AtolyeTehlikeliIslemler id={w.id} kod={w.code} aktif={!!w.is_active} />
    </div>
  )
}
