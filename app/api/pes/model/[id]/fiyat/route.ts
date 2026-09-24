import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { modelFiyati } from '@/lib/pes/model-fiyat'

/**
 * POST — bülteni verilen dönemde, ekonomi verisi olan bütün atölyeler için
 * fiyatlar ve model_fiyat'a YAZAR.
 *
 * Fiyat saklanıyor çünkü bir karar anıdır; param_donem hangi varsayımla
 * hesaplandığını kaydeder.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const bultenId = Number(b.bulten_id)
  const donem = String(b.donem ?? '')
  const cmtFiyat = b.cmt_fiyat === null || b.cmt_fiyat === undefined ? null : Number(b.cmt_fiyat)
  const gunlukAdet = b.gunluk_adet === null || b.gunluk_adet === undefined ? null : Number(b.gunluk_adet)

  if (!Number.isInteger(bultenId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) {
    return NextResponse.json({ error: 'bulten_id ve donem (YYYY-MM) zorunlu' }, { status: 400 })
  }
  const [yil, ay] = donem.split('-').map(Number)

  const [bolum] = await sql`
    SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
           coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
           coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float  AS ukp
    FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}` as unknown as Array<{
      kesim: number; dikim: number; ukp: number
    }>
  if (!bolum || (bolum.kesim + bolum.dikim + bolum.ukp) === 0) {
    return NextResponse.json({ error: 'Bültende operasyon yok' }, { status: 400 })
  }

  const paramSatirlari = await sql`
    SELECT DISTINCT ON (param_key) param_key, param_value
    FROM economy_param WHERE donem <= ${donem} ORDER BY param_key, donem DESC`
  const param = paramCoz(paramSatirlari as unknown as Array<{ param_key: string; param_value: unknown }>)

  const [paramDonem] = await sql`
    SELECT max(donem) AS d FROM economy_param WHERE donem <= ${donem}` as unknown as Array<{ d: string | null }>

  const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])
  let yazilan = 0

  for (const r of ham) {
    if (r.veri_var !== true) continue
    const girdi = dbSatiriCoz(r as never, param)
    const rasyo = hesapla(girdi)

    const dikimKapasiteDk =
      girdi.ekonomi.sewing_staff === null || girdi.ekonomi.hours_per_day === null
        ? null
        : girdi.ekonomi.sewing_staff * girdi.ekonomi.hours_per_day * 60

    const f = modelFiyati({
      bolumSn: { KESIM: bolum.kesim, DIKIM: bolum.dikim, UKP: bolum.ukp },
      bolumDkMaliyet: {
        KESIM: rasyo.kesimDkMaliyet,
        DIKIM: rasyo.dikimDkMaliyet,
        UKP: rasyo.ukpDkMaliyet,
      },
      param,
      cmtFiyat,
      gunlukAdet,
      dikimKapasiteDk,
      dkMaliyet3D: girdi.dkMaliyet3D,
    })

    await sql`
      INSERT INTO model_fiyat (
        bulten_id, workshop_id, tenant_id, donem,
        kesim_dk, dikim_dk, ukp_dk, kesim_tl, dikim_tl, ukp_tl,
        toplam_maliyet, adil_fiyat, cmt_fiyat, kar_adet, marj,
        gunluk_adet, kapasite_payi, referans_3d, cmt_3d_sapma, param_donem)
      VALUES (
        ${bultenId}, ${r.workshop_id as number}, ${tenant.tenantId}, ${donem},
        ${f.kesimDk}, ${f.dikimDk}, ${f.ukpDk}, ${f.kesimTl}, ${f.dikimTl}, ${f.ukpTl},
        ${f.toplamMaliyet}, ${f.adilFiyat}, ${cmtFiyat}, ${f.karAdet}, ${f.marj},
        ${gunlukAdet}, ${f.kapasitePayi}, ${f.referans3D}, ${f.cmt3dSapma},
        ${paramDonem?.d ?? null})
      ON CONFLICT (bulten_id, workshop_id, donem) DO UPDATE SET
        kesim_dk = EXCLUDED.kesim_dk, dikim_dk = EXCLUDED.dikim_dk, ukp_dk = EXCLUDED.ukp_dk,
        kesim_tl = EXCLUDED.kesim_tl, dikim_tl = EXCLUDED.dikim_tl, ukp_tl = EXCLUDED.ukp_tl,
        toplam_maliyet = EXCLUDED.toplam_maliyet, adil_fiyat = EXCLUDED.adil_fiyat,
        cmt_fiyat = EXCLUDED.cmt_fiyat, kar_adet = EXCLUDED.kar_adet, marj = EXCLUDED.marj,
        gunluk_adet = EXCLUDED.gunluk_adet, kapasite_payi = EXCLUDED.kapasite_payi,
        referans_3d = EXCLUDED.referans_3d, cmt_3d_sapma = EXCLUDED.cmt_3d_sapma,
        param_donem = EXCLUDED.param_donem, hesaplandi_at = now()`
    yazilan++
  }

  return NextResponse.json({ yazilan, donem })
})
