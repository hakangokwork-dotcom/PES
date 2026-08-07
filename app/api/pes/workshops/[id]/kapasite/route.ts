import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Atölyenin aşama bazlı günlük kapasitesi (tasarım K2).
 *
 *   GET  /api/pes/workshops/12/kapasite → aşama listesi + varsa kapasite
 *   PUT  /api/pes/workshops/12/kapasite → { stageId, gunlukKapasite | null }
 *
 * ELLE girilir; sistem kapasite tahmin etmez. Kaydı olmayan aşamada
 * yerleştirme tarih üretemez ve kullanıcıdan "girer/çıkar" tarihi ister.
 *
 * DİKİM burada YOK: onun kapasitesi bantların daily_target toplamıdır,
 * ayrıca girilmesi iki doğruluk kaynağı yaratırdı.
 */

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const satirlar = await sql`
    SELECT ps.id   AS stage_id,
           ps.code,
           ps.name,
           ps.sira_no,
           c.gunluk_kapasite,
           c.notlar
    FROM production_stage ps
    LEFT JOIN workshop_stage_capacity c
           ON c.stage_id = ps.id AND c.workshop_id = ${wid}
    WHERE ps.code <> 'DIKIM'
    ORDER BY ps.sira_no`

  return NextResponse.json({ kapasiteler: satirlar })
})

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const b = await req.json()
  const stageId = Number(b.stageId)
  if (!Number.isInteger(stageId)) {
    return NextResponse.json({ error: 'stageId gerekli' }, { status: 400 })
  }

  const [w] = await sql`SELECT id FROM workshop WHERE id = ${wid}`
  if (!w) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  const ham = b.gunlukKapasite
  const bosaltiliyor = ham === null || ham === undefined || String(ham).trim() === ''

  if (bosaltiliyor) {
    /* Boş bırakmak "kapasite tanımlı değil" demek — 0 yazmak DEĞİL.
       0 sonsuz süre üretirdi; kaydı silmek doğru davranış. */
    await sql`DELETE FROM workshop_stage_capacity
              WHERE workshop_id = ${wid} AND stage_id = ${stageId}`
    return NextResponse.json({ ok: true, gunlukKapasite: null })
  }

  const kapasite = Number(String(ham).replace(',', '.'))
  if (!Number.isFinite(kapasite) || kapasite <= 0) {
    return NextResponse.json({ error: 'Günlük kapasite 0’dan büyük olmalı' }, { status: 400 })
  }

  await sql`
    INSERT INTO workshop_stage_capacity ${sql({
      workshop_id: wid,
      stage_id: stageId,
      tenant_id: tenant.tenantId,
      gunluk_kapasite: Math.round(kapasite),
      notlar: b.notlar ? String(b.notlar) : null,
    })}
    ON CONFLICT (workshop_id, stage_id) DO UPDATE SET
      gunluk_kapasite = EXCLUDED.gunluk_kapasite,
      notlar = EXCLUDED.notlar,
      updated_at = now()`

  return NextResponse.json({ ok: true, gunlukKapasite: Math.round(kapasite) })
})
