import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Yetenek filtresinin seçenekleri: boyutlar, değerler ve KAÇ ATÖLYE.
 *
 * Sayı olmadan filtre kör: planlamacı "MOM_FIT" seçip boş ekranla
 * karşılaşmadan önce onu 2 atölyenin yaptığını görmeli.
 *
 * Yalnız AKTİF atölyelerin yetenekleri sayılır — takvimin kendisi de
 * aktifleri gösteriyor; farklı sayarsak filtre "7 atölye" deyip 4 tane
 * gösterir.
 */
export const GET = withTenantRoute(async (_req, { sql }) => {
  const satirlar = await sql`
    SELECT lc.dimension_code AS boyut,
           lc.value_code     AS deger,
           coalesce(cv.label, lc.value_code) AS etiket,
           count(DISTINCT pl.workshop_id)::int AS atolye
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
      JOIN workshop w ON w.id = pl.workshop_id
      LEFT JOIN capability_value cv ON cv.code = lc.value_code
     WHERE w.is_active AND pl.is_active
     GROUP BY lc.dimension_code, lc.value_code, cv.label
     HAVING count(DISTINCT pl.workshop_id) > 0
     ORDER BY lc.dimension_code, count(DISTINCT pl.workshop_id) DESC, lc.value_code
  ` as unknown as Array<{ boyut: string; deger: string; etiket: string; atolye: number }>

  /* Boyuta göre gruplanmış; arayüz kendi gruplamasın diye. Boyut sırası
     TOPLAM atölye sayısına göre: en ayırt edici boyut üstte olsun. */
  const gruplar = new Map<string, Array<{ deger: string; etiket: string; atolye: number }>>()
  for (const r of satirlar) {
    if (!gruplar.has(r.boyut)) gruplar.set(r.boyut, [])
    gruplar.get(r.boyut)!.push({ deger: r.deger, etiket: r.etiket, atolye: r.atolye })
  }

  const boyutlar = [...gruplar.entries()]
    .map(([boyut, degerler]) => ({ boyut, degerler }))
    .sort((a, b) => b.degerler.length - a.degerler.length || a.boyut.localeCompare(b.boyut))

  return NextResponse.json({ boyutlar })
})
