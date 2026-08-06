import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import RevisionHistory from '@/components/pes/RevisionHistory'

export const dynamic = 'force-dynamic'

export default async function RevisionsPage() {
  const data = await withServerTenant(async (sql) => {
    // Yalnız birden fazla sürümü olan dönemler ilgi çekici; ama tek
    // sürümlüler de listelenir ki "hiç revize edilmemiş" görülebilsin.
    const rows = await sql`
      SELECT staging_id, workshop_id, workshop_code, donem, revision_no,
             source_ref, revision_note, submitted_at, superseded_at,
             is_current, raw, total_sc, quality_status
      FROM v_expense_revisions
      ORDER BY donem DESC, workshop_code, revision_no
      LIMIT 500
    `
    return { rows }
  })

  if (!data) redirect('/login')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/pes/veri-kalitesi" className="text-sm text-faint hover:text-ink">
          ← Veri Kalitesi
        </Link>
        <h1 className="text-2xl font-bold text-ink mt-2">Beyan Geçmişi</h1>
        <p className="text-faint mt-1">
          Her gider beyanının tüm sürümleri. Bir atölye geçmiş dönemi düzeltip
          yeniden gönderdiğinde eski beyan silinmez — burada durur. Böylece
          &ldquo;gider arttı mı, yoksa beyan mı düzeltildi&rdquo; sorusu cevaplanabilir.
        </p>
      </div>

      <RevisionHistory rows={data.rows as never} />
    </div>
  )
}
