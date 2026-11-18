// app/api/pes/rotalar/[id]/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'
import { ORTAK_TIPLERI } from '@/lib/pes/is-emri-adim'
import { FORMLAR } from '@/lib/pes/formlar'

/**
 *   GET /api/pes/rotalar/3 → { rota, operasyonlar, asamalar, formlar }
 *   PUT /api/pes/rotalar/3 { ad, aciklama, aktif,
 *                            operasyonlar: [{ stage_id, ortak_tipi, zorunlu_formlar, varsayilan_ortak_id }] }
 *       Operasyonları tümden değiştirir; sıra 10, 20, 30…  Şablon iş emrine
 *       kopyalandığından (wo_rota_kur) geçmiş iş emirleri etkilenmez.
 */
type OpGirdi = { stage_id: number; ortak_tipi: string; zorunlu_formlar?: string[]; varsayilan_ortak_id?: number | null }
const FORM_KODLARI = new Set(FORMLAR.map(f => f.kod))
const merkezDegil = () => NextResponse.json({ error: 'Rota şablonlarını yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const [rota] = await sql`SELECT id, ad, aciklama, aktif FROM rota_sablonu WHERE id = ${id}`
  if (!rota) return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })
  const operasyonlar = await sql`
    SELECT o.id, o.sira, o.stage_id, ps.name AS stage_name, o.ortak_tipi, o.zorunlu_formlar,
           o.varsayilan_ortak_id, io.unvan AS varsayilan_ortak_unvan
      FROM rota_operasyonu o
      JOIN production_stage ps ON ps.id = o.stage_id
      LEFT JOIN is_ortagi io ON io.id = o.varsayilan_ortak_id
     WHERE o.sablon_id = ${id} ORDER BY o.sira`
  const asamalar = await sql`SELECT id, code, name FROM production_stage ORDER BY sira_no, id`
  const formlar = FORMLAR.map(f => ({ kod: f.kod, ad: f.ad }))
  return NextResponse.json({ rota, operasyonlar, asamalar, formlar })
})

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const b = await req.json()
  const ad = String(b.ad ?? '').trim()
  if (!ad) return NextResponse.json({ error: 'Şablon adı zorunlu' }, { status: 400 })
  if (!Array.isArray(b.operasyonlar)) return NextResponse.json({ error: 'operasyonlar dizi olmalı' }, { status: 400 })
  const ops = b.operasyonlar as OpGirdi[]

  const asamalar = new Set((await sql`SELECT id FROM production_stage`).map(r => r.id as number))
  const ortakIdler = ops.map(o => o.varsayilan_ortak_id).filter((v): v is number => Number.isInteger(v))
  const ortakTip = new Map<number, string>(ortakIdler.length
    ? (await sql`SELECT id, tip FROM is_ortagi WHERE id IN ${sql(ortakIdler)}`).map(r => [r.id as number, r.tip as string])
    : [])
  const gorulen = new Set<number>()
  for (const [i, o] of ops.entries()) {
    const n = `${i + 1}. operasyon`
    if (!asamalar.has(o?.stage_id)) return NextResponse.json({ error: `${n}: aşama seçin` }, { status: 400 })
    if (gorulen.has(o.stage_id)) return NextResponse.json({ error: `${n}: aynı aşama iki kez kullanılamaz` }, { status: 400 })
    gorulen.add(o.stage_id)
    if (!(ORTAK_TIPLERI as readonly string[]).includes(o.ortak_tipi)) {
      return NextResponse.json({ error: `${n}: firma tipi geçersiz` }, { status: 400 })
    }
    if (o.zorunlu_formlar != null && !Array.isArray(o.zorunlu_formlar)) {
      return NextResponse.json({ error: `${n}: zorunlu formlar dizi olmalı` }, { status: 400 })
    }
    const yanlisForm = (o.zorunlu_formlar ?? []).find(k => !FORM_KODLARI.has(k))
    if (yanlisForm) return NextResponse.json({ error: `${n}: bilinmeyen form ${yanlisForm}` }, { status: 400 })
    if (o.varsayilan_ortak_id != null && ortakTip.get(o.varsayilan_ortak_id) !== o.ortak_tipi) {
      return NextResponse.json({ error: `${n}: varsayılan firma ${o.ortak_tipi} tipinde olmalı` }, { status: 400 })
    }
  }

  try {
    const [r] = await sql`
      UPDATE rota_sablonu SET ${sql({ ad, aciklama: String(b.aciklama ?? '').trim() || null, aktif: b.aktif !== false })}
       WHERE id = ${id} RETURNING id`
    if (!r) return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return NextResponse.json({ error: `"${ad}" adlı şablon zaten var` }, { status: 409 })
    throw e
  }
  await sql`DELETE FROM rota_operasyonu WHERE sablon_id = ${id}`
  if (ops.length) {
    await sql`INSERT INTO rota_operasyonu ${sql(ops.map((o, i) => ({
      sablon_id: id, sira: (i + 1) * 10, stage_id: o.stage_id, ortak_tipi: o.ortak_tipi,
      zorunlu_formlar: [...new Set(o.zorunlu_formlar ?? [])], varsayilan_ortak_id: o.varsayilan_ortak_id ?? null,
    })))}`
  }
  return NextResponse.json({ ok: true })
})
