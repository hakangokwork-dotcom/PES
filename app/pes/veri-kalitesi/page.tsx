import { withServerTenant } from '@/lib/supabase/tenant-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import QualityReport from '@/components/pes/QualityReport'

export const dynamic = 'force-dynamic'

export default async function VeriKalitesiPage() {
  const data = await withServerTenant(async (sql) => {
    const [scores, byStatus, params] = await Promise.all([
      sql`
        SELECT dq.id, dq.donem, dq.total_sc, dq.completeness_sc, dq.consistency_sc,
               dq.plausibility_sc, dq.crosscheck_sc, dq.status, dq.flags, dq.rule_version,
               w.code AS workshop_code, w.name AS workshop_name
        FROM declaration_quality dq
        LEFT JOIN workshop w ON w.id = dq.workshop_id
        ORDER BY dq.total_sc ASC, w.code
      `,
      sql`
        SELECT status, count(*)::int AS n, round(avg(total_sc),1) AS avg_sc
        FROM declaration_quality GROUP BY status
      `,
      sql`
        SELECT param_key, value_num, donem_from
        FROM validation_param
        WHERE param_key IN ('accept_threshold','winsorize_threshold')
        ORDER BY donem_from DESC
      `,
    ])
    return { scores, byStatus, params }
  })

  if (!data) redirect('/login')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Veri Kalitesi</h1>
        <p className="text-gray-500 mt-1">
          Gider beyanlarının güven skoru. Yalnız <strong>kabul edildi</strong> durumundaki
          kayıtlar peer benchmark havuzuna girer.
        </p>
      </div>

      {data.scores.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm text-amber-800 font-medium">Henüz skorlanmış beyan yok.</p>
          <p className="text-xs text-amber-700 mt-1">
            Skorlamayı başlatmak için aşağıdaki düğmeyi kullanın; mevcut tüm gider
            beyanları değerlendirilir.
          </p>
          <div className="mt-3">
            <QualityReport scores={[]} byStatus={[]} />
          </div>
        </div>
      ) : (
        <QualityReport
          scores={data.scores as never}
          byStatus={data.byStatus as never}
        />
      )}

      <p className="text-xs text-gray-400">
        Kural seti: <code>lib/pes/validation-rules.ts</code> · Parametreler{' '}
        <code>validation_param</code> tablosunda dönem bazlı tutulur.{' '}
        <Link href="/pes/workshops" className="text-[#197A56] hover:underline">
          Atölyeler
        </Link>
      </p>
    </div>
  )
}
