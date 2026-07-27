import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/* Atölye sahiplenme — "bu atölyeyle ben ilgileniyorum".
   Erişim kısıtı DEĞİL (bkz. migration 026): sahiplenmemek kimseyi hiçbir
   yerden alıkoymaz, sahiplenmek de kimseyi dışarıda bırakmaz. */

export const POST = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  }

  const [row] = await sql`
    SELECT id, owner_user_id FROM workshop WHERE id = ${id}`
  if (!row) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  /* Başkası sahiplenmişse üstüne yazma — sahiplik sessizce el değiştirmesin.
     Devir gerekiyorsa önce mevcut sahip bırakır (DELETE). */
  if (row.owner_user_id && row.owner_user_id !== tenant.userId) {
    return NextResponse.json(
      { error: 'Bu atölyeyi başka bir kullanıcı sahiplenmiş' },
      { status: 409 }
    )
  }

  await sql`
    UPDATE workshop
    SET owner_user_id = ${tenant.userId}, owned_at = NOW(), updated_at = NOW()
    WHERE id = ${id}`

  return NextResponse.json({ ok: true, owned: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  }

  /* Yalnız kendi sahipliğini bırakabilir; yönetici (internal admin) her
     sahipliği kaldırabilir — yanlış sahiplenmeleri düzeltmek için. */
  const [row] = await sql`SELECT owner_user_id FROM workshop WHERE id = ${id}`
  if (!row) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  if (row.owner_user_id && row.owner_user_id !== tenant.userId && !tenant.isInternalAdmin) {
    return NextResponse.json({ error: 'Bu sahipliği kaldırma yetkiniz yok' }, { status: 403 })
  }

  await sql`
    UPDATE workshop
    SET owner_user_id = NULL, owned_at = NULL, updated_at = NOW()
    WHERE id = ${id}`

  return NextResponse.json({ ok: true, owned: false })
})
