// app/api/pes/sorunlar/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Sorun panosu (064, v_sorun_kayit): PROBLEM/BLOKAJ kayıtları adım × firma × neden.
 * Atölye kullanıcısı RLS ile yalnız kendi iş emirlerini görür.
 *
 *   GET /api/pes/sorunlar?durum=acik|hepsi&gun=90 → { kayitlar, ozet, nedenler }
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const p = req.nextUrl.searchParams
  const yalnizAcik = p.get('durum') !== 'hepsi'
  const gunHam = Number(p.get('gun') ?? 90)
  const gun = Number.isInteger(gunHam) && gunHam > 0 && gunHam <= 3650 ? gunHam : 90
  const kayitlar = await sql`
    SELECT id, work_order_id, is_emri_no, model_adi, stage_name, ortak_unvan, ortak_tipi, tip,
           neden_kodu, neden_ad, etki, baslik, aciklama, tarih::text, cozuldu
      FROM v_sorun_kayit
     WHERE tarih >= current_date - ${gun}::int AND (${!yalnizAcik} OR NOT cozuldu)
     ORDER BY tarih DESC, id DESC`
  // Özet seçimden bağımsız: açık / toplam birlikte görünsün.
  const ozet = await sql`
    SELECT stage_name, ortak_unvan, neden_ad,
           count(*) FILTER (WHERE NOT cozuldu)::int AS acik, count(*)::int AS toplam
      FROM v_sorun_kayit
     WHERE tarih >= current_date - ${gun}::int
     GROUP BY stage_name, ortak_unvan, neden_ad
     ORDER BY acik DESC, toplam DESC`
  const nedenler = await sql`SELECT kod, ad, sira FROM sorun_neden ORDER BY sira`
  return NextResponse.json({ kayitlar, ozet, nedenler })
})
