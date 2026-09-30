/**
 * VSIM atölye kayıtları — hat/tesis (vsim_tesis) ve ürün grubu
 * (vsim_urun_grubu) için ortak API işleyicileri. İki kaynak aynı davranır;
 * farkları yalnız özet sütunlarıdır.
 *
 * GÖRÜNÜRLÜK RLS'te (048): atölye yalnız kendi satırlarını, merkez tümünü
 * görür. YAZMA yalnız atölye kapsamında (atölyenin kendisi ya da merkez
 * yöneticisinin atölye panelinden seçtiği atölye); merkez paneli salt okur —
 * bir atölyenin kaydını merkezden bilmeden ezmek olmasın diye.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { TenantContext } from '@/lib/auth/tenant-context'
import type postgres from 'postgres'

type Sql = postgres.Sql | postgres.TransactionSql
type Ctx<P> = { sql: Sql; tenant: TenantContext; params: P }

export type KayitTuru = 'tesis' | 'urun'
const TABLO: Record<KayitTuru, string> = { tesis: 'vsim_tesis', urun: 'vsim_urun_grubu' }

const ortak = {
  ad: z.string().trim().min(1, 'Ad gerekli').max(120, 'Ad en çok 120 karakter'),
  veri: z.record(z.string(), z.unknown()),
  varsayilan: z.boolean().optional(),
}
const sema = {
  tesis: z.object({ ...ortak, production_line_id: z.number().int().positive().nullable().optional(), oge_sayisi: z.number().int().min(0).optional() }),
  urun: z.object({
    ...ortak,
    urun_tipi_id: z.number().int().positive().nullable().optional(),
    kaynak: z.enum(['manuel', 'excel', 'referans']).optional(),
    adim_sayisi: z.number().int().min(0).optional(),
    toplam_sn: z.number().min(0).optional(),
  }),
}

const yazmaYasak = () => NextResponse.json(
  { error: 'Kaydetmek için atölye panelinden (ilgili atölye seçiliyken) girin. Merkez paneli kayıtları yalnız görüntüler.' },
  { status: 403 },
)

export async function listele(t: KayitTuru, req: NextRequest, { sql }: Ctx<unknown>) {
  const tablo = TABLO[t]
  const yalnizVarsayilan = req.nextUrl.searchParams.get('varsayilan') === '1'
  const ek = t === 'tesis'
    ? sql`, k.oge_sayisi, k.production_line_id`
    : sql`, k.urun_tipi_id, k.kaynak, k.adim_sayisi, k.toplam_sn::float AS toplam_sn`
  const rows = await sql`
    SELECT k.id, k.workshop_id, w.name AS atolye_adi, k.ad, k.varsayilan,
           k.updated_at, k.guncelleyen ${ek}
           ${yalnizVarsayilan ? sql`, k.veri` : sql``}
    FROM ${sql(tablo)} k LEFT JOIN workshop w ON w.id = k.workshop_id
    ${yalnizVarsayilan ? sql`WHERE k.varsayilan` : sql``}
    ORDER BY w.name NULLS LAST, k.varsayilan DESC, k.updated_at DESC`
  return NextResponse.json({ kayitlar: rows })
}

export async function getir(t: KayitTuru, { sql, params }: Ctx<{ id: string }>) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz kimlik' }, { status: 400 })
  const [row] = await sql`SELECT * FROM ${sql(TABLO[t])} WHERE id = ${id}`
  if (!row) return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 })
  return NextResponse.json({ kayit: row })
}

export async function olustur(t: KayitTuru, req: NextRequest, { sql, tenant }: Ctx<unknown>) {
  if (tenant.workshopId == null) return yazmaYasak()
  const parsed = sema[t].safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const d = parsed.data as z.infer<typeof sema.tesis> & z.infer<typeof sema.urun>
  const tablo = TABLO[t]
  if (d.varsayilan) await sql`UPDATE ${sql(tablo)} SET varsayilan = FALSE WHERE workshop_id = ${tenant.workshopId} AND varsayilan`
  const kim = tenant.userEmail
  const [row] = t === 'tesis'
    ? await sql`
        INSERT INTO vsim_tesis (tenant_id, workshop_id, ad, production_line_id, varsayilan, veri, oge_sayisi, olusturan, guncelleyen)
        VALUES (${tenant.tenantId}, ${tenant.workshopId}, ${d.ad}, ${d.production_line_id ?? null}, ${!!d.varsayilan},
                ${sql.json(d.veri as never)}, ${d.oge_sayisi ?? null}, ${kim}, ${kim})
        RETURNING id`
    : await sql`
        INSERT INTO vsim_urun_grubu (tenant_id, workshop_id, ad, urun_tipi_id, kaynak, varsayilan, veri, adim_sayisi, toplam_sn, olusturan, guncelleyen)
        VALUES (${tenant.tenantId}, ${tenant.workshopId}, ${d.ad}, ${d.urun_tipi_id ?? null}, ${d.kaynak ?? 'manuel'}, ${!!d.varsayilan},
                ${sql.json(d.veri as never)}, ${d.adim_sayisi ?? null}, ${d.toplam_sn ?? null}, ${kim}, ${kim})
        RETURNING id`
  return NextResponse.json({ kayit: { id: row.id } })
}

export async function guncelle(t: KayitTuru, req: NextRequest, { sql, tenant, params }: Ctx<{ id: string }>) {
  if (tenant.workshopId == null) return yazmaYasak()
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz kimlik' }, { status: 400 })
  const parsed = sema[t].partial().safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const d = parsed.data as Partial<z.infer<typeof sema.tesis> & z.infer<typeof sema.urun>>
  const tablo = TABLO[t]
  const [var_] = await sql`SELECT workshop_id FROM ${sql(tablo)} WHERE id = ${id}`
  if (!var_) return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 })
  if (d.varsayilan) await sql`UPDATE ${sql(tablo)} SET varsayilan = FALSE WHERE workshop_id = ${var_.workshop_id} AND varsayilan AND id <> ${id}`
  const kim = tenant.userEmail
  await sql`
    UPDATE ${sql(tablo)} SET
      ad = COALESCE(${d.ad ?? null}, ad),
      varsayilan = COALESCE(${d.varsayilan ?? null}, varsayilan),
      veri = COALESCE(${d.veri ? sql.json(d.veri as never) : null}, veri),
      ${t === 'tesis'
        ? sql`oge_sayisi = COALESCE(${d.oge_sayisi ?? null}, oge_sayisi),`
        : sql`adim_sayisi = COALESCE(${d.adim_sayisi ?? null}, adim_sayisi),
              toplam_sn = COALESCE(${d.toplam_sn ?? null}, toplam_sn),
              urun_tipi_id = COALESCE(${d.urun_tipi_id ?? null}, urun_tipi_id),
              kaynak = COALESCE(${d.kaynak ?? null}, kaynak),`}
      guncelleyen = ${kim}, updated_at = NOW()
    WHERE id = ${id}`
  return NextResponse.json({ kayit: { id } })
}

export async function sil(t: KayitTuru, { sql, tenant, params }: Ctx<{ id: string }>) {
  if (tenant.workshopId == null) return yazmaYasak()
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz kimlik' }, { status: 400 })
  const r = await sql`DELETE FROM ${sql(TABLO[t])} WHERE id = ${id} RETURNING id`
  if (!r.length) return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
