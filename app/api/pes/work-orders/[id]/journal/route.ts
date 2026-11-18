import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { SORUN_ETKILERI } from '@/lib/pes/is-emri-adim'

/* 064: sorun kaydında neden_kodu (sorun_neden) ve etki. */
export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const journal = await sql`SELECT j.*, ps.name AS stage_name, sn.ad AS neden_ad FROM work_order_journal j
    LEFT JOIN production_stage ps ON j.stage_id = ps.id
    LEFT JOIN sorun_neden sn ON sn.kod = j.neden_kodu
    WHERE work_order_id = ${id} ORDER BY tarih DESC, id DESC`
  return NextResponse.json({ journal })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  if (!body.aciklama) return NextResponse.json({ error: 'aciklama zorunlu' }, { status: 400 })
  const etki = body.etki || null
  if (etki && !(SORUN_ETKILERI as readonly string[]).includes(etki)) {
    return NextResponse.json({ error: 'Geçersiz etki' }, { status: 400 })
  }
  const tarih = body.tarih || new Date().toISOString().slice(0, 10)
  try {
    const [row] = await sql`INSERT INTO work_order_journal (
      tenant_id, work_order_id, stage_id, tarih, vardiya, tip, kategori, baslik, aciklama, oneri, yazan, paylasim_admin,
      neden_kodu, etki
    ) VALUES (
      ${tenant.tenantId}, ${id}, ${body.stage_id ?? null}, ${tarih},
      ${body.vardiya ?? 'Gündüz'}, ${body.tip ?? 'NOT'}, ${body.kategori ?? null},
      ${body.baslik ?? null}, ${body.aciklama}, ${body.oneri ?? null},
      ${body.yazan ?? null}, ${body.paylasim_admin ?? false},
      ${body.neden_kodu || null}, ${etki}
    ) RETURNING *`
    return NextResponse.json({ entry: row })
  } catch (e) {
    const pg = e as { code?: string; constraint_name?: string }
    if (pg.code === '23503' && pg.constraint_name?.includes('neden_kodu')) {
      return NextResponse.json({ error: 'Geçersiz sorun nedeni' }, { status: 400 })
    }
    throw e
  }
})
