import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { listele, olustur } from '@/lib/pes/vsim-kayit'

/* VSIM atölye kaydı — liste (merkez tümü, atölye kendi) ve yeni kayıt (yalnız atölye kapsamı). */
export const GET = withTenantRoute((req, ctx) => listele('urun', req, ctx))
export const POST = withTenantRoute((req, ctx) => olustur('urun', req, ctx))
