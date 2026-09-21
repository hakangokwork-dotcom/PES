import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { kodlariDogrula, kunyeyiAyikla } from '@/lib/pes/kunye'

/**
 * PO havuzu (spec K1, K4, §4).
 *   GET  /api/pes/siparisler?gorunum=havuz|atanmis|hepsi&q=
 *   POST /api/pes/siparisler  → havuza PO açar (workshop_id NULL, durum Taslak)
 *
 * Havuz kaydı AŞAMA ZİNCİRİ KURMAZ — wo_init_stages çağrılmaz. Zinciri
 * yerleştirme kurar (K5); aksi halde sihirbaz UPDATE modunda önce eski
 * zinciri silmek zorunda kalırdı.
 *
 * Tarihler ::text — postgres.js DATE'i Date nesnesine çevirir.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Kritik']

export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const gorunum = u.searchParams.get('gorunum') ?? 'havuz'
  const q = (u.searchParams.get('q') ?? '').trim()
  const desen = '%' + q + '%'

  const siparisler = await sql`
    SELECT wo.id, wo.is_emri_no, wo.siparis_no, wo.musteri, wo.model_adi, wo.stil_kodu, wo.sezon,
           wo.siparis_miktari, wo.teslim_tarihi::text, wo.oncelik, wo.durum, wo.workshop_id,
           w.name AS atolye_adi,
           wo.ana_grup_kodu, wo.klasman_kodu, wo.kumas_turu_kodu, wo.kumas_grubu_kodu,
           wo.cinsiyet_yas_kodu, wo.kalite_kodu, wo.kumasci,
           kl.label AS klasman, kt.label AS kumas_turu,
           (wo.teslim_tarihi - CURRENT_DATE)::int AS kalan_gun
      FROM work_order wo
      LEFT JOIN workshop w ON w.id = wo.workshop_id
      LEFT JOIN capability_value kl ON kl.code = wo.klasman_kodu
           AND kl.dimension_id = (SELECT id FROM capability_dimension WHERE code = 'klasman')
      LEFT JOIN capability_value kt ON kt.code = wo.kumas_turu_kodu
           AND kt.dimension_id = (SELECT id FROM capability_dimension WHERE code = 'kumas_turu')
     WHERE (${gorunum} = 'hepsi'
            OR (${gorunum} = 'havuz'   AND wo.workshop_id IS NULL)
            OR (${gorunum} = 'atanmis' AND wo.workshop_id IS NOT NULL))
       AND (${q} = '' OR wo.is_emri_no ILIKE ${desen} OR wo.musteri ILIKE ${desen}
            OR wo.model_adi ILIKE ${desen})
     ORDER BY wo.teslim_tarihi NULLS LAST, wo.id DESC
     LIMIT 500`
  return NextResponse.json({ siparisler })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const isEmriNo = String(b.is_emri_no ?? '').trim()
  const modelAdi = String(b.model_adi ?? '').trim()
  const adet = Number(b.siparis_miktari)
  if (!isEmriNo) return NextResponse.json({ error: 'Sipariş no gerekli' }, { status: 400 })
  if (!modelAdi) return NextResponse.json({ error: 'Model adı gerekli' }, { status: 400 })
  if (!Number.isInteger(adet) || adet <= 0) {
    return NextResponse.json({ error: 'Adet 0’dan büyük tam sayı olmalı' }, { status: 400 })
  }
  if (b.teslim_tarihi && !TARIH.test(String(b.teslim_tarihi))) {
    return NextResponse.json({ error: 'Teslim tarihi YYYY-AA-GG olmalı' }, { status: 400 })
  }

  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  const [mevcut] = await sql`SELECT id FROM work_order WHERE is_emri_no = ${isEmriNo}`
  if (mevcut) return NextResponse.json({ error: 'Bu sipariş no zaten var' }, { status: 409 })

  const [row] = await sql`
    INSERT INTO work_order ${sql({
      tenant_id: tenant.tenantId,
      workshop_id: null,
      is_emri_no: isEmriNo,
      siparis_no: b.siparis_no ? String(b.siparis_no).trim() : isEmriNo,
      musteri: b.musteri ? String(b.musteri).trim() : null,
      model_adi: modelAdi,
      stil_kodu: b.stil_kodu ? String(b.stil_kodu).trim() : null,
      sezon: b.sezon ? String(b.sezon).trim() : null,
      siparis_miktari: adet,
      teslim_tarihi: b.teslim_tarihi || null,
      oncelik: ONCELIKLER.includes(b.oncelik) ? b.oncelik : 'Normal',
      durum: 'Taslak',
      ...kunye,
    })}
    RETURNING id`
  return NextResponse.json({ ok: true, id: row.id })
})
