import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/* Katalogda olmayan bir terimi kullanıcının eklemesi.
 *
 * TENANT'A ÖZEL yazılır (tenant_id dolu). Global katalog (tenant_id NULL)
 * yalnız migration ile değişir — 019d'nin hibrit deseni: herkes global +
 * kendi tenant'ının değerlerini görür, yalnız kendininkini yazabilir.
 * Bir kullanıcının eklediği terim başka müşterilerin kataloğunu kirletmez.
 */

const semasi = z.object({
  dimension_code: z.string().min(1).max(50),
  label: z.string().trim().min(1).max(80),
})

/* Türkçe harfleri koruyarak ASCII koda çevirir — 023b migration'ıyla
   AYNI kural, yoksa aynı terim iki farklı kodla iki kez girebilir. */
const TR: Record<string, string> = {
  'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I',
  'ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U',
}
const kodla = (s: string) =>
  s.split('').map((c) => TR[c] ?? c).join('')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const parsed = semasi.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { dimension_code, label } = parsed.data
  const code = kodla(label)
  if (!code) {
    return NextResponse.json({ error: 'Terim en az bir harf veya rakam içermeli' }, { status: 400 })
  }

  const [dim] = await sql`SELECT id FROM capability_dimension WHERE code = ${dimension_code}`
  if (!dim) return NextResponse.json({ error: 'Boyut bulunamadı' }, { status: 404 })

  /* Zaten var mı? Global ya da tenant'a özel farketmez — varsa onu döndür,
     ikiz terim oluşturma. */
  const [mevcut] = await sql`
    SELECT code, label FROM capability_value
    WHERE dimension_id = ${dim.id} AND code = ${code}`
  if (mevcut) {
    return NextResponse.json({ ok: true, zatenVardi: true, value: mevcut })
  }

  const [sonSira] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) AS s FROM capability_value WHERE dimension_id = ${dim.id}`

  const [row] = await sql`
    INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
    VALUES (${dim.id}, ${code}, ${label}, ${Number(sonSira.s) + 1}, ${tenant.tenantId})
    RETURNING code, label`

  return NextResponse.json({ ok: true, zatenVardi: false, value: row })
})
