import { NextResponse } from 'next/server'
import type postgres from 'postgres'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeyseReddet } from '../_yetki'
import { kodlariDogrula, kunyeyiAyikla } from '@/lib/pes/kunye'
import { esitProfil, profilGecerli } from '@/lib/pes/yillik-plan'
import { referansSamDk } from '@/lib/pes/yillik-plan-veri'

/**
 * Tahmin kalemi. SAM: elle verildiyse 'elle'; verilmediyse ürün tipinin
 * referansından 'referans'; ikisi de yoksa null (ekranda "SAM eksik").
 */

async function samCoz(
  sql: postgres.TransactionSql,
  samGirdi: unknown, urunTipiId: number | null,
): Promise<{ sam: number | null; kaynak: 'elle' | 'referans' | null } | { hata: string }> {
  if (samGirdi !== undefined && samGirdi !== null && samGirdi !== '') {
    const s = Number(samGirdi)
    if (!(s > 0)) return { hata: 'sam_dk sıfırdan büyük olmalı' }
    return { sam: s, kaynak: 'elle' }
  }
  if (urunTipiId) {
    const r = await referansSamDk(sql, urunTipiId)
    if (r) return { sam: Math.round(r * 1000) / 1000, kaynak: 'referans' }
  }
  return { sam: null, kaynak: null }
}

/** Boş → null; geçerli pozitif tam sayı → sayı; aksi → 'gecersiz'. */
function urunTipiOku(v: unknown): number | null | 'gecersiz' {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 'gecersiz'
}

/** FK denetimi RLS'i atlar; ürün tipi var mı, açık sorguyla bakılır. */
async function urunTipiVarMi(sql: postgres.TransactionSql, id: number): Promise<boolean> {
  const r = await sql`SELECT 1 FROM ref_urun_tipi WHERE id = ${id}`
  return r.length > 0
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await req.json()
  const tahminId = Number(b.tahminId)
  const ad = String(b.ad ?? '').trim()
  const adet = Number(b.adet)
  if (!Number.isInteger(tahminId) || !ad || !Number.isInteger(adet) || adet <= 0) {
    return NextResponse.json({ error: 'tahminId, ad ve pozitif adet zorunlu' }, { status: 400 })
  }
  const profil = b.aylikProfil ?? esitProfil()
  if (!profilGecerli(profil)) {
    return NextResponse.json({ error: 'Aylık profil 12 değer ve toplam 100 olmalı' }, { status: 400 })
  }
  const [tahmin] = await sql`SELECT 1 FROM talep_tahmini WHERE id = ${tahminId}`
  if (!tahmin) return NextResponse.json({ error: 'Tahmin bulunamadı' }, { status: 404 })
  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  const urunTipiId = urunTipiOku(b.urunTipiId)
  if (urunTipiId === 'gecersiz' || (urunTipiId !== null && !(await urunTipiVarMi(sql, urunTipiId)))) {
    return NextResponse.json({ error: 'urunTipiId geçersiz' }, { status: 400 })
  }
  const sam = await samCoz(sql, b.samDk, urunTipiId)
  if ('hata' in sam) return NextResponse.json({ error: sam.hata }, { status: 400 })

  const [row] = await sql`
    INSERT INTO talep_tahmini_kalem (
      tahmin_id, tenant_id, ad, ana_grup_kodu, klasman_kodu, kumas_turu_kodu,
      kumas_grubu_kodu, cinsiyet_yas_kodu, kalite_kodu, kumasci,
      urun_tipi_id, sam_dk, sam_kaynak, adet, aylik_profil)
    VALUES (
      ${tahminId}, ${tenant.tenantId}, ${ad.slice(0, 120)},
      ${kunye.ana_grup_kodu ?? null}, ${kunye.klasman_kodu ?? null}, ${kunye.kumas_turu_kodu ?? null},
      ${kunye.kumas_grubu_kodu ?? null}, ${kunye.cinsiyet_yas_kodu ?? null}, ${kunye.kalite_kodu ?? null},
      ${kunye.kumasci ?? null}, ${urunTipiId}, ${sam.sam}, ${sam.kaynak}, ${adet},
      ${profil.map((p) => Math.round(p * 100) / 100)}::numeric[])
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: row.id })
})

export const PATCH = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const [mevcut] = await sql`
    SELECT urun_tipi_id, sam_dk::float AS sam_dk, sam_kaynak
      FROM talep_tahmini_kalem WHERE id = ${id}
  ` as unknown as Array<{ urun_tipi_id: number | null; sam_dk: number | null; sam_kaynak: string | null }>
  if (!mevcut) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })

  if (b.aylikProfil !== undefined && !profilGecerli(b.aylikProfil)) {
    return NextResponse.json({ error: 'Aylık profil 12 değer ve toplam 100 olmalı' }, { status: 400 })
  }
  if (b.adet !== undefined && !(Number.isInteger(Number(b.adet)) && Number(b.adet) > 0)) {
    return NextResponse.json({ error: 'adet pozitif tam sayı olmalı' }, { status: 400 })
  }
  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  /* Ürün tipi ya da SAM değiştiyse SAM yeniden çözülür; samDk: null elle
     ezmeyi kaldırıp referansa döner. */
  const girilen = b.urunTipiId === undefined ? mevcut.urun_tipi_id : urunTipiOku(b.urunTipiId)
  if (girilen === 'gecersiz' || (b.urunTipiId !== undefined && girilen !== null && !(await urunTipiVarMi(sql, girilen)))) {
    return NextResponse.json({ error: 'urunTipiId geçersiz' }, { status: 400 })
  }
  const urunTipiId = girilen
  let sam = { sam: mevcut.sam_dk, kaynak: mevcut.sam_kaynak }
  if (b.samDk !== undefined || b.urunTipiId !== undefined) {
    const girdi = b.samDk !== undefined ? b.samDk
      : (mevcut.sam_kaynak === 'elle' ? mevcut.sam_dk : null)
    const c = await samCoz(sql, girdi, urunTipiId)
    if ('hata' in c) return NextResponse.json({ error: c.hata }, { status: 400 })
    sam = c
  }

  /* Yalnız gövdede gelen künye alanları değişir. */
  const kunyeKayit = kunye as Record<string, string | null>
  const kolonlar = Object.keys(kunyeKayit)
  if (kolonlar.length > 0) {
    await sql`UPDATE talep_tahmini_kalem SET ${sql(kunyeKayit, ...kolonlar)} WHERE id = ${id}`
  }

  await sql`
    UPDATE talep_tahmini_kalem SET
      ad           = coalesce(nullif(${b.ad === undefined ? null : String(b.ad).trim().slice(0, 120)}::text, ''), ad),
      adet         = coalesce(${b.adet === undefined ? null : Number(b.adet)}::int, adet),
      aylik_profil = coalesce(${b.aylikProfil === undefined ? null
                      : (b.aylikProfil as number[]).map((p) => Math.round(p * 100) / 100)}::numeric[], aylik_profil),
      urun_tipi_id = ${urunTipiId},
      sam_dk       = ${sam.sam},
      sam_kaynak   = ${sam.kaynak},
      updated_at   = now()
    WHERE id = ${id}`
  return NextResponse.json({ id })
})

export const DELETE = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const [b] = await sql`SELECT count(*)::int AS n FROM work_order WHERE tahmin_kalem_id = ${id}` as unknown as Array<{ n: number }>
  if (b.n > 0) return NextResponse.json({ error: 'Kaleme bağlı sipariş var; önce bağları çözün' }, { status: 409 })
  await sql`DELETE FROM talep_tahmini_kalem WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
