// app/api/pes/olcu-sartname/[id]/onayla/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'
import { gercekTarih } from '@/lib/pes/olcu-sartname'

/**
 * POST { onaylayan, onay_tarihi } — 'Önerilen' → 'Müşteri onaylı'.  (x-kayit-surum zorunlu)
 * Aynı model × kategori × aşamadaki önceki onaylı revizyon 'Geçersiz' olur
 * (aynı transaction; tekil onaylı indeksi sırayı zorunlu kılar).
 *
 * Sürüm kontrolü burada, yalnız onaylanan şartnameye yapılır (055 tetikleyicisiyle
 * aynı kural); sonra app.beklenen_surum boşaltılır, yoksa tetikleyici önceki
 * onaylı satırı da bu sürüme göre denetleyip yanlış 409 verirdi.
 */
export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Müşteri onayını yalnız merkez işler' }, { status: 403 })
  }
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const b = await req.json()
  const onaylayan = String(b.onaylayan ?? '').trim()
  if (!onaylayan) return NextResponse.json({ error: 'Onaylayan (müşteri tarafı kişi/birim) zorunlu' }, { status: 400 })
  if (!gercekTarih(String(b.onay_tarihi ?? ''))) return NextResponse.json({ error: 'Onay tarihi geçerli bir gün olmalı (YYYY-AA-GG)' }, { status: 400 })

  const surum = req.headers.get('x-kayit-surum') ?? 'yok'
  // Zaman yalnız ayrı parametreyle gider: 'yok'/'eski' timestamptz'e çevrilmeye çalışılmasın.
  const zaman = surum !== 'yok' && surum !== 'eski' && !Number.isNaN(Date.parse(surum)) ? surum : null
  const [s] = await sql`
    SELECT model_bulten_id, kumas_kategorisi, asama, durum,
           CASE WHEN ${surum} = 'eski' THEN girildi_at IS NULL
                ELSE ${zaman}::timestamptz IS NOT NULL
                 AND date_trunc('milliseconds', girildi_at) IS NOT DISTINCT FROM ${zaman}::timestamptz
           END AS surum_ayni
      FROM olcu_sartname WHERE id = ${id} FOR UPDATE`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  if (!s.surum_ayni) {
    return NextResponse.json({ error: 'Şartname siz açtıktan sonra değişti; sayfayı yenileyin.', cakisma: true }, { status: 409 })
  }
  if (s.durum !== 'Önerilen') return NextResponse.json({ error: 'Yalnız Önerilen şartname onaylanır' }, { status: 422 })
  const [n] = await sql`SELECT count(*)::int AS c FROM olcu_noktasi WHERE sartname_id = ${id}`
  if (n.c === 0) return NextResponse.json({ error: 'Ölçü noktası olmayan şartname onaylanamaz' }, { status: 422 })

  await sql`SELECT set_config('app.beklenen_surum', '', true)`
  await sql`
    UPDATE olcu_sartname SET durum = 'Geçersiz'
     WHERE model_bulten_id = ${s.model_bulten_id} AND kumas_kategorisi = ${s.kumas_kategorisi}
       AND asama = ${s.asama} AND durum = 'Müşteri onaylı'`
  await sql`
    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = ${onaylayan}, onay_tarihi = ${b.onay_tarihi}
     WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
