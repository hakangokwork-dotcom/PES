import { NextResponse, type NextRequest } from 'next/server'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { withTenant } from '@/lib/supabase/tenant-db'
import { ATOLYE_COOKIE } from '@/lib/auth/aktif-atolye'

/**
 * GET /workshop/gir?wid=12 — merkez kullanıcısı bir atölyenin paneline girer.
 * GET /workshop/gir         — atölyeden çıkar, seçim ekranına döner.
 *
 * Seçim çereze yazılır ki panelin her ekranı (sunucu bileşenleri dahil)
 * aynı atölyeyi görsün; bkz. lib/auth/aktif-atolye.ts.
 *
 * Atölyeye bağlı kullanıcı atölye değiştiremez — çerez onun için hiç
 * okunmaz, burada da yazılmaz.
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenantContext(req)
  const hedef = (yol: string) => NextResponse.redirect(new URL(yol, req.url))
  if (!tenant) return hedef('/login')
  if (tenant.workshopId) return hedef('/workshop')

  const wid = Number(req.nextUrl.searchParams.get('wid'))
  if (!Number.isInteger(wid) || wid <= 0) {
    const r = hedef('/workshop')
    r.cookies.delete(ATOLYE_COOKIE)
    return r
  }

  const [w] = await withTenant(tenant.tenantId, (sql) =>
    sql`SELECT id FROM workshop WHERE id = ${wid}`)
  if (!w) return hedef('/workshop')

  const r = hedef('/workshop')
  r.cookies.set(ATOLYE_COOKIE, String(wid), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })
  return r
}
