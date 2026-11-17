// app/api/pes/olcu-sartname/[id]/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 *   GET    → { sartname, noktalar: [{ id, kod, ad, musteri_adi, yontem, kritik, sira,
 *                                     degerler: { [beden]: { nominal, tol_eksi, tol_arti } } }] }
 *            Atölye de okur (RLS: kendi iş emrinin modeli).
 *   PUT    { notlar, noktalar: [{ kod, ad, musteri_adi?, yontem?, kritik?, degerler }] }
 *            Izgarayı tümden değiştirir. Yalnız 'Önerilen' (tetikleyici PT422 → 422).
 *            x-kayit-surum başlığı: araya giren değişiklik 409.
 *   DELETE → yalnız 'Önerilen'.
 */
type Deger = { nominal: number; tol_eksi: number; tol_arti: number }
type NoktaGirdi = { kod: string; ad: string; musteri_adi?: string | null; yontem?: string | null; kritik?: boolean; degerler: Record<string, Deger> }

const merkezDegil = () => NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const [sartname] = await sql`
    SELECT s.id, s.model_bulten_id, s.kumas_kategorisi, s.asama, s.revizyon, s.durum,
           s.onaylayan, s.onay_tarihi::text, s.notlar, s.giren_taraf, s.giren_eposta, s.girildi_at
      FROM olcu_sartname s WHERE s.id = ${id}`
  if (!sartname) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  const noktalar = await sql`
    SELECT n.id, n.kod, n.ad, n.musteri_adi, n.yontem, n.kritik, n.sira,
           coalesce(jsonb_object_agg(d.beden, jsonb_build_object(
               'nominal', d.nominal, 'tol_eksi', d.tol_eksi, 'tol_arti', d.tol_arti))
             FILTER (WHERE d.beden IS NOT NULL), '{}'::jsonb) AS degerler
      FROM olcu_noktasi n LEFT JOIN olcu_degeri d ON d.nokta_id = n.id
     WHERE n.sartname_id = ${id}
     GROUP BY n.id ORDER BY n.sira, n.id`
  return NextResponse.json({ sartname, noktalar })
})

function dogrula(noktalar: unknown): string | null {
  if (!Array.isArray(noktalar)) return 'noktalar dizi olmalı'
  const kodlar = new Set<string>()
  for (const [i, n] of (noktalar as NoktaGirdi[]).entries()) {
    if (!n?.kod?.trim() || !n?.ad?.trim()) return `${i + 1}. nokta: kod ve ad zorunlu`
    if (kodlar.has(n.kod.trim())) return `Kod tekrarlanıyor: ${n.kod}`
    kodlar.add(n.kod.trim())
    for (const [beden, d] of Object.entries(n.degerler ?? {})) {
      if (!beden.trim()) return `${n.kod}: beden boş`
      for (const k of ['nominal', 'tol_eksi', 'tol_arti'] as const) {
        if (typeof d?.[k] !== 'number' || !Number.isFinite(d[k])) return `${n.kod} / ${beden}: ${k} sayı olmalı`
      }
      if (d.tol_eksi < 0 || d.tol_arti < 0) return `${n.kod} / ${beden}: tolerans negatif olamaz`
    }
  }
  return null
}

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const id = Number(params.id)
  const b = await req.json()
  const hata = dogrula(b.noktalar)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })

  // Başlığa yazmak 055 sürüm kontrolünü tetikler (x-kayit-surum); 409 burada oluşur.
  const [s] = await sql`
    UPDATE olcu_sartname SET notlar = ${b.notlar ? String(b.notlar).trim() : null}
     WHERE id = ${id} RETURNING id, durum`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })

  await sql`DELETE FROM olcu_noktasi WHERE sartname_id = ${id}`
  for (const [i, n] of (b.noktalar as NoktaGirdi[]).entries()) {
    const [nk] = await sql`
      INSERT INTO olcu_noktasi ${sql({
        tenant_id: tenant.tenantId, sartname_id: id, kod: n.kod.trim(), ad: n.ad.trim(),
        musteri_adi: n.musteri_adi?.trim() || null, yontem: n.yontem?.trim() || null,
        kritik: !!n.kritik, sira: i,
      })} RETURNING id`
    const degerler = Object.entries(n.degerler ?? {}).map(([beden, d]) => ({
      tenant_id: tenant.tenantId, nokta_id: nk.id, beden: beden.trim(),
      nominal: d.nominal, tol_eksi: d.tol_eksi, tol_arti: d.tol_arti,
    }))
    if (degerler.length) await sql`INSERT INTO olcu_degeri ${sql(degerler)}`
  }
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const silinen = await sql`DELETE FROM olcu_sartname WHERE id = ${Number(params.id)} RETURNING id`
  if (!silinen.length) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
