// app/api/pes/olcu-sartname/[id]/onayla/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * POST { onaylayan, onay_tarihi } — 'Önerilen' → 'Müşteri onaylı'.
 * Aynı model × kategori × aşamadaki önceki onaylı revizyon 'Geçersiz' olur
 * (aynı transaction; tekil onaylı indeksi sırayı zorunlu kılar).
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Müşteri onayını yalnız merkez işler' }, { status: 403 })
  }
  const id = Number(params.id)
  const b = await req.json()
  const onaylayan = String(b.onaylayan ?? '').trim()
  if (!onaylayan) return NextResponse.json({ error: 'Onaylayan (müşteri tarafı kişi/birim) zorunlu' }, { status: 400 })
  if (!TARIH.test(String(b.onay_tarihi ?? ''))) return NextResponse.json({ error: 'Onay tarihi YYYY-AA-GG olmalı' }, { status: 400 })

  const [s] = await sql`SELECT model_bulten_id, kumas_kategorisi, asama, durum FROM olcu_sartname WHERE id = ${id}`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  if (s.durum !== 'Önerilen') return NextResponse.json({ error: 'Yalnız Önerilen şartname onaylanır' }, { status: 422 })
  const [n] = await sql`SELECT count(*)::int AS c FROM olcu_noktasi WHERE sartname_id = ${id}`
  if (n.c === 0) return NextResponse.json({ error: 'Ölçü noktası olmayan şartname onaylanamaz' }, { status: 422 })

  await sql`
    UPDATE olcu_sartname SET durum = 'Geçersiz'
     WHERE model_bulten_id = ${s.model_bulten_id} AND kumas_kategorisi = ${s.kumas_kategorisi}
       AND asama = ${s.asama} AND durum = 'Müşteri onaylı'`
  await sql`
    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = ${onaylayan}, onay_tarihi = ${b.onay_tarihi}
     WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
