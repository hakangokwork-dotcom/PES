import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { sureTuret, type UretimGunu } from '@/lib/pes/gercek-sure'

/**
 * POST { bulten_id, workshop_id, donem, kaynak, dk_adet? }
 *
 * kaynak='beyan' → dk_adet gövdeden gelir (atölye ne diyor).
 * kaynak='uretim' → iş emri günlük üretiminden türetilir; bültene bağlı
 *   iş emirleri okunur, karışık günler atlanır.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const bultenId = Number(b.bulten_id)
  const workshopId = Number(b.workshop_id)
  const donem = String(b.donem ?? '')
  const kaynak = String(b.kaynak ?? '')

  if (!Number.isInteger(bultenId) || !Number.isInteger(workshopId) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(donem) || !['uretim', 'beyan'].includes(kaynak)) {
    return NextResponse.json(
      { error: 'bulten_id, workshop_id, donem (YYYY-MM) ve kaynak (uretim|beyan) zorunlu' },
      { status: 400 })
  }

  let dkAdet: number | null = null
  let gunSayisi = 0
  let atlananGun = 0

  if (kaynak === 'beyan') {
    dkAdet = b.dk_adet === null || b.dk_adet === undefined ? null : Number(b.dk_adet)
    if (dkAdet === null || !Number.isFinite(dkAdet) || dkAdet <= 0) {
      return NextResponse.json({ error: 'beyan için dk_adet pozitif olmalı' }, { status: 400 })
    }
  } else {
    const [yil, ay] = donem.split('-').map(Number)
    const [kadro] = await sql`
      SELECT sewing_staff, hours_per_day::float AS hours_per_day
      FROM workshop_economy
      WHERE workshop_id = ${workshopId} AND year = ${yil} AND month = ${ay}` as unknown as
      Array<{ sewing_staff: number | null; hours_per_day: number | null }>
    if (!kadro) {
      return NextResponse.json(
        { error: 'Bu atölyenin bu dönemde ekonomi satırı yok; kadro bilinmeden türetilemez' },
        { status: 400 })
    }

    /* Bültene bağlı iş emirlerinin üretim günleri. bantIsEmriSayisi: o gün
       o bantta üretim kaydı olan FARKLI iş emri sayısı — 1'den büyükse gün
       paylaştırılamaz ve atlanır. */
    const gunler = await sql`
      WITH gun AS (
        SELECT g.tarih::text AS tarih, a.line_id, a.work_order_id, g.adet
        FROM work_order_gunluk_uretim g
        JOIN work_order_stage_atama a ON a.id = g.atama_id
        JOIN production_line pl ON pl.id = a.line_id
        JOIN work_order wo ON wo.id = a.work_order_id
        WHERE pl.workshop_id = ${workshopId}
          AND wo.model_bulten_id = ${bultenId}
          AND g.adet IS NOT NULL
          AND date_part('year', g.tarih) = ${yil}
          AND date_part('month', g.tarih) = ${ay}
      ),
      bant_gun AS (
        SELECT g2.tarih::text AS tarih, a2.line_id,
               count(DISTINCT a2.work_order_id)::int AS is_emri
        FROM work_order_gunluk_uretim g2
        JOIN work_order_stage_atama a2 ON a2.id = g2.atama_id
        JOIN production_line pl2 ON pl2.id = a2.line_id
        WHERE pl2.workshop_id = ${workshopId} AND g2.adet IS NOT NULL
        GROUP BY g2.tarih, a2.line_id
      )
      SELECT gun.tarih, gun.work_order_id, gun.adet, bg.is_emri
      FROM gun JOIN bant_gun bg ON bg.tarih = gun.tarih AND bg.line_id = gun.line_id
      ORDER BY gun.tarih` as unknown as
      Array<{ tarih: string; work_order_id: number; adet: number; is_emri: number }>

    const girdi: UretimGunu[] = gunler.map(g => ({
      tarih: g.tarih, workOrderId: g.work_order_id,
      adet: Number(g.adet), bantIsEmriSayisi: Number(g.is_emri),
    }))
    const s = sureTuret(girdi, {
      sewingStaff: kadro.sewing_staff === null ? null : Number(kadro.sewing_staff),
      hoursPerDay: kadro.hours_per_day === null ? null : Number(kadro.hours_per_day),
    })
    dkAdet = s.dkAdet
    gunSayisi = s.gunSayisi
    atlananGun = s.atlananGun

    if (dkAdet === null) {
      return NextResponse.json({
        error: girdi.length === 0
          ? 'Bu bültene bağlı üretim kaydı yok. İş emrine bülten bağlanmadan türetilemez.'
          : `Uygun gün yok: ${atlananGun} gün atlandı (karışık bant ya da sıfır adet).`,
        atlananGun,
      }, { status: 400 })
    }
  }

  const [row] = await sql`
    INSERT INTO model_gercek_sure
      (bulten_id, workshop_id, tenant_id, donem, kaynak, dk_adet, gun_sayisi, atlanan_gun, not_metni)
    VALUES (${bultenId}, ${workshopId}, ${tenant.tenantId}, ${donem}, ${kaynak},
            ${dkAdet}, ${gunSayisi}, ${atlananGun}, ${b.not_metni ?? null})
    ON CONFLICT (bulten_id, workshop_id, donem, kaynak) DO UPDATE SET
      dk_adet = EXCLUDED.dk_adet, gun_sayisi = EXCLUDED.gun_sayisi,
      atlanan_gun = EXCLUDED.atlanan_gun, not_metni = EXCLUDED.not_metni, updated_at = now()
    RETURNING *`

  return NextResponse.json({ sure: row })
})
