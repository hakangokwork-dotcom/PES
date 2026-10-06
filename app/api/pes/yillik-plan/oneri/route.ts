import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeyseReddet } from '../_yetki'
import { aylikAdet, oneriUret, type OneriAdayi, type Tahsis } from '@/lib/pes/yillik-plan'
import {
  atolyeKapasiteleri, poAylikYuk, tahsisAylikYuk, atolyeUyumlari, atolyePuanlari,
} from '@/lib/pes/yillik-plan-veri'
import type { Kunye } from '@/lib/pes/kunye'

/**
 * Kalem için öneriyi hesaplayıp yazar. Yalnız kaynak='oneri' satırları
 * silinip yeniden yazılır; elle girilenler korunur.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const { kalemId } = await req.json()
  const id = Number(kalemId)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'kalemId zorunlu' }, { status: 400 })

  const [k] = await sql`
    SELECT k.*, k.sam_dk::float AS sam, k.aylik_profil::float8[] AS profil, h.yil,
           COALESCE((SELECT SUM(siparis_miktari) FROM work_order w
                      WHERE w.tahmin_kalem_id = k.id AND w.durum <> 'Iptal'), 0)::float AS tuketilen
      FROM talep_tahmini_kalem k JOIN talep_tahmini h ON h.id = k.tahmin_id
     WHERE k.id = ${id}
  ` as unknown as Array<Record<string, unknown> & { sam: number | null; profil: number[]; yil: number; adet: number; tuketilen: number }>
  if (!k) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })
  if (!k.sam) return NextResponse.json({ error: 'SAM eksik: ürün tipi seçin ya da SAM girin' }, { status: 400 })

  const kunye: Kunye = {
    ana_grup_kodu: k.ana_grup_kodu as string | null, klasman_kodu: k.klasman_kodu as string | null,
    kumas_turu_kodu: k.kumas_turu_kodu as string | null, kumas_grubu_kodu: k.kumas_grubu_kodu as string | null,
    cinsiyet_yas_kodu: k.cinsiyet_yas_kodu as string | null, kalite_kodu: k.kalite_kodu as string | null,
  }

  const [kap, po, digerTahsis, uyumlar, puanlar] = [
    await atolyeKapasiteleri(sql, k.yil, k.sam),
    await poAylikYuk(sql, k.yil),
    await tahsisAylikYuk(sql, k.yil, id),
    await atolyeUyumlari(sql, kunye),
    await atolyePuanlari(sql, k.yil, kunye, k.adet),
  ]

  const adaylar: OneriAdayi[] = kap.map((a) => {
    const p = po.yuk.get(a.workshopId) ?? []
    const t = digerTahsis.get(a.workshopId) ?? []
    return {
      workshopId: a.workshopId,
      puan: puanlar.get(a.workshopId) ?? 0,
      uyum: uyumlar.get(a.workshopId)?.uyum ?? 'bilinmiyor',
      bosDk: a.kapasiteDk === null ? Array<number>(12).fill(0) : a.kapasiteDk.map((c, m) => c - (p[m] ?? 0) - (t[m] ?? 0)),
    }
  })

  const elle = await sql`
    SELECT workshop_id AS "workshopId", ay, adet FROM talep_tahsis
     WHERE kalem_id = ${id} AND kaynak = 'elle'
  ` as unknown as Tahsis[]

  const sonuc = oneriUret({ /* Bağlı PO'lar zaten poAylikYuk'ta; ihtiyaç tüketilen kadar küçülür. */
    aylikAdet: aylikAdet(Math.max(0, k.adet - k.tuketilen), k.profil), samDk: k.sam, adaylar, elle })

  await sql`DELETE FROM talep_tahsis WHERE kalem_id = ${id} AND kaynak = 'oneri'`
  for (const t of sonuc.tahsisler) {
    await sql`
      INSERT INTO talep_tahsis (kalem_id, tenant_id, workshop_id, ay, adet, kaynak)
      VALUES (${id}, ${tenant.tenantId}, ${t.workshopId}, ${t.ay}, ${t.adet}, 'oneri')`
  }
  return NextResponse.json({
    tahsisSayisi: sonuc.tahsisler.length,
    tahsisEdilemeyen: sonuc.tahsisEdilemeyen,
  })
})
