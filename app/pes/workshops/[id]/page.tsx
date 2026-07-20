import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Workshop, ProductionLine } from '@/types/pes'
import WorkshopForm from '@/components/pes/WorkshopForm'
import LineManager from '@/components/pes/LineManager'
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

  const data = await withServerTenant(async (sql) => {
    const workshops = await sql`SELECT * FROM workshop WHERE id = ${parseInt(id)}` as Workshop[]
    if (workshops.length === 0) return null
    const lineList = await sql`SELECT * FROM production_line WHERE workshop_id = ${parseInt(id)} ORDER BY code` as ProductionLine[]
    return { w: workshops[0], lineList }
  })

  if (!data) redirect('/pes/workshops')

  const { w, lineList } = data

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <Link href="/pes/workshops" className="text-sm text-gray-500 hover:text-gray-700">
          ← Atölyeler
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">{w.name}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
            Tip {w.type} — {TYPE_LABELS[w.type]}
          </span>
          {w.is_active ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Aktif</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Pasif</span>
          )}
        </div>
        <p className="text-gray-500 mt-1">{w.code} · {w.city ?? ''} {w.district ?? ''}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Dikim Operatörü</p>
          <p className="text-xl font-bold text-gray-900">{w.sewing_staff}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Toplam Çalışan</p>
          <p className="text-xl font-bold text-gray-900">{w.total_staff}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Günlük Hedef</p>
          <p className="text-xl font-bold text-gray-900">{w.daily_target.toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Bant Sayısı</p>
          <p className="text-xl font-bold text-gray-900">{w.line_count}</p>
        </div>
      </div>

      <LineManager workshop={w} lines={lineList} />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 py-2">
          Atölye Bilgilerini Düzenle ▾
        </summary>
        <div className="mt-4">
          <WorkshopForm workshop={w} />
        </div>
      </details>
    </div>
  )
}
