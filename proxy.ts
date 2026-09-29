import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import {
  ATOLYE_COOKIE, KAPSAM_HEADER, atolyeKapsamindaMi, gecerliAtolyeId,
} from '@/lib/auth/atolye-kapsam'

export async function proxy(request: NextRequest) {
  const url = request.nextUrl

  /* Eski `?wid=` bağlantısı (yer imi, sayfa içi link): seçim çereze
     yazılmadıysa ekran atölyeyi gösterir ama panel onu tanımaz — kenar
     çubuğunda "Atölye seçin…" kalıyordu. Seçim adımından geçir. */
  const wid = gecerliAtolyeId(url.searchParams.get('wid'))
  if (
    wid && url.pathname.startsWith('/workshop') && url.pathname !== '/workshop/gir' &&
    request.cookies.get(ATOLYE_COOKIE)?.value !== String(wid)
  ) {
    const sonra = new URL(url)
    sonra.searchParams.delete('wid')
    const gir = new URL('/workshop/gir', url)
    gir.searchParams.set('wid', String(wid))
    gir.searchParams.set('sonra', sonra.pathname + sonra.search)
    return NextResponse.redirect(gir)
  }

  /* Atölye kapsamı işareti — istemciden gelen HER ZAMAN silinir, yalnız
     burada yazılır (bkz. lib/auth/atolye-kapsam.ts). */
  request.headers.delete(KAPSAM_HEADER)
  if (atolyeKapsamindaMi(url, request.headers.get('referer'))) {
    request.headers.set(KAPSAM_HEADER, '1')
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
