// app/api/pes/is-ortaklari/[id]/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'
import { iletisimAlanlari } from '@/lib/pes/is-emri-adim'

/**
 *   PATCH /api/pes/is-ortaklari/7  { unvan?, kisa_ad?, …iletişim, aktif? }   (merkez)
 *         x-kayit-surum başlığı: araya giren değişiklik 409 (055).
 *         Atölye ortağında unvan/tip değişmez (atölye kaydından gelir).
 *         Silme yok: geçmiş adımlar firmaya bağlı kalsın (hafıza kuralı); pasifleştirilir.
 */
export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return NextResponse.json({ error: 'İş ortaklarını yalnız merkez yönetir' }, { status: 403 })
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const b = await req.json()
  const [o] = await sql`SELECT tip, unvan FROM is_ortagi WHERE id = ${id}`
  if (!o) return NextResponse.json({ error: 'İş ortağı bulunamadı' }, { status: 404 })
  if ('tip' in b && b.tip !== o.tip) return NextResponse.json({ error: 'Firma tipi değiştirilemez' }, { status: 400 })
  const veri: Record<string, string | boolean | null> = iletisimAlanlari(b)
  if ('unvan' in b) {
    const unvan = String(b.unvan ?? '').trim()
    if (o.tip === 'Atölye' && unvan !== o.unvan) {
      return NextResponse.json({ error: 'Atölye unvanı atölye kaydından gelir' }, { status: 400 })
    }
    if (!unvan) return NextResponse.json({ error: 'Unvan zorunlu' }, { status: 400 })
    veri.unvan = unvan
  }
  if ('aktif' in b) veri.aktif = !!b.aktif
  if (Object.keys(veri).length === 0) return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })
  try {
    await sql`UPDATE is_ortagi SET ${sql(veri)} WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Bu tipte aynı unvanlı firma zaten kayıtlı' }, { status: 409 })
    }
    throw e
  }
})
