import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { getir, guncelle, sil } from '@/lib/pes/vsim-kayit'

export const GET = withTenantRoute<{ id: string }>((_req, ctx) => getir('tesis', ctx))
export const PUT = withTenantRoute<{ id: string }>((req, ctx) => guncelle('tesis', req, ctx))
export const DELETE = withTenantRoute<{ id: string }>((_req, ctx) => sil('tesis', ctx))
