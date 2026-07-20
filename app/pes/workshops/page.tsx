import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'

export const dynamic = 'force-dynamic'

export default async function WorkshopsPage() {
  // Not: list/dbError eskiden modül seviyesindeydi. Sunucu süreci uzun
  // yaşadığı için eşzamanlı istekler arasında paylaşılıyor ve bir
  // kullanıcının satırları başkasına görünebiliyordu; dbError bir kez
  // set olunca kalıcı takılıyordu. Artık istek-yerel.
  let list: Record<string, unknown>[] = []
  let dbError = ''

  // getDB() doğrudan kullanımı tenant context'ini atlıyordu (set_config yok).
  // 019c sonrası bu sayfa 0 satır görürdü; withServerTenant doğru yol.
  const data = await withServerTenant(async (sql) => {
    return await sql`SELECT * FROM workshop ORDER BY code` as Record<string, unknown>[]
  }).catch((err: unknown) => {
    dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
    return [] as Record<string, unknown>[]
  })

  if (data === null) redirect('/login')
  list = data

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Atölyeler</h1>
          <p className="text-gray-500 mt-1">{dbError ? 'Bağlantı hatası' : `${list.length} atölye kayıtlı`}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pes/workshops/import" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
            CSV Import
          </Link>
          <Link href="/pes/workshops/new" className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors text-sm font-medium">
            + Yeni Atölye
          </Link>
        </div>
      </div>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{dbError}</p>
          <p className="text-xs text-red-500 mt-1">Supabase Dashboard &gt; Connect &gt; Session pooler bağlantı bilgilerini kontrol edin.</p>
        </div>
      )}

      {!dbError && list.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-left text-gray-500 font-medium">Kod</th>
                <th className="px-5 py-3 text-left text-gray-500 font-medium">Ad</th>
                <th className="px-5 py-3 text-left text-gray-500 font-medium">Şehir</th>
                <th className="px-5 py-3 text-left text-gray-500 font-medium">Tip</th>
                <th className="px-5 py-3 text-right text-gray-500 font-medium">Toplam</th>
                <th className="px-5 py-3 text-right text-gray-500 font-medium">Bant</th>
                <th className="px-5 py-3 text-center text-gray-500 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((w: Record<string, unknown>) => (
                <tr key={w.id as number} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/pes/workshops/${w.id}`} className="text-[#197A56] font-medium hover:underline">
                      {w.code as string}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-900 max-w-[200px] truncate">{w.name as string}</td>
                  <td className="px-5 py-3 text-gray-600">{(w.city as string) ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">{w.type as string}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-900">{w.total_staff as number}</td>
                  <td className="px-5 py-3 text-right text-gray-900">{w.line_count as number}</td>
                  <td className="px-5 py-3 text-center">
                    {w.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Aktif</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Pasif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!dbError && list.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600">Henüz atölye eklenmemiş</p>
          <Link href="/pes/workshops/import" className="text-[#197A56] hover:underline mt-2 inline-block">
            CSV ile toplu yükleyin →
          </Link>
        </div>
      )}
    </div>
  )
}
