import { NextResponse, type NextRequest } from 'next/server'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { withTenant } from '@/lib/supabase/tenant-db'
import { ATOLYE_COOKIE, gecerliAtolyeId } from '@/lib/auth/atolye-kapsam'

/**
 * GET /workshop/gir?wid=12 — merkez yöneticisi bir atölyenin paneline,
 *                            o atölyenin hesabıyla girmiş gibi girer.
 * GET /workshop/gir         — atölyeden çıkar, "hangi atölye?" ekranına döner.
 * &sonra=/workshop/...      — girişten sonra gidilecek sayfa (eski ?wid=
 *                             bağlantılarını proxy buraya çevirir).
 *
 * Kurallar: lib/auth/atolye-kapsam.ts. Atölyeye BAĞLI kullanıcı atölye
 * değiştiremez; seçim yalnız merkez yöneticisine açık.
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenantContext(req)
  const sonraParam = req.nextUrl.searchParams.get('sonra') ?? ''
  /* Açık yönlendirme olmasın: yalnız panel içi yol. */
  const sonra = /^\/workshop(\/|\?|$)/.test(sonraParam) ? sonraParam : '/workshop'
  const git = (yol: string) => NextResponse.redirect(new URL(yol, req.url))

  if (!tenant) return git('/login')
  if (tenant.workshopId && !tenant.atolyeSecimi) return git(sonra)
  if (!tenant.isInternalAdmin) return git('/workshop')

  const wid = gecerliAtolyeId(req.nextUrl.searchParams.get('wid'))
  if (!wid) {
    const r = git('/workshop')
    r.cookies.delete(ATOLYE_COOKIE)
    return r
  }

  /* Kapsamsız bakılır: seçili atölyenin RLS'i başka atölyeyi gizlerdi. */
  const [w] = await withTenant(tenant.tenantId, (sql) =>
    sql`SELECT id FROM workshop WHERE id = ${wid}`)
  if (!w) return git('/workshop')

  const r = git(sonra)
  r.cookies.set(ATOLYE_COOKIE, String(wid), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })
  return r
}
