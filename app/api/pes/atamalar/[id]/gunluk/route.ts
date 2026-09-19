import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { gunlukKaydet, planKaydet } from '@/lib/pes/gunluk-uretim'

/**
 * Bir bant tahsisinin günlük planı ve gerçekleşeni (tasarım K3).
 *
 *   PUT /api/pes/atamalar/57/gunluk
 *       { gunler: [{ tarih, planAdet?, adet?, hataliAdet? }] }
 *
 * ATÖLYE YAZAR, merkez okur. Yetki RLS'te: 036'nın politikası
 * atama_id → line_id → production_line.workshop_id zinciriyle atölye
 * kullanıcısını kendi bantlarına kilitler. Burada ayrıca rol kontrolü
 * YAPMIYORUZ — iki ayrı yetki kuralı zamanla birbirini tutmaz.
 *
 * Alan GÖNDERİLMEZSE dokunulmaz; null GÖNDERİLİRSE temizlenir:
 *   planAdet: null → elle giriş kalkar, gün bandın varsayılan payına döner
 *   adet:     null → gerçekleşen "girilmedi" olur (0 DEĞİL)
 * Plan ile gerçekleşen aynı satırda yaşar ve birbirini silmez.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

/** undefined = dokunma, null = temizle, sayı = yaz. */
function alan(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const atamaId = parseInt(params.id)
  if (!Number.isInteger(atamaId)) {
    return NextResponse.json({ error: 'Geçersiz atama' }, { status: 400 })
  }

  const body = await req.json()
  const gunler = body?.gunler
  if (!Array.isArray(gunler) || gunler.length === 0) {
    return NextResponse.json({ error: 'gunler dizisi gerekli' }, { status: 400 })
  }
  if (gunler.length > 400) {
    return NextResponse.json({ error: 'Tek seferde en fazla 400 gün' }, { status: 400 })
  }

  /* RLS atölyeyi zaten kısıtlıyor; atama görünmüyorsa 404 dönmek
     yetkisiz kullanıcıya varlığını da sızdırmaz. */
  const [atama] = await sql`SELECT id FROM work_order_stage_atama WHERE id = ${atamaId}`
  if (!atama) return NextResponse.json({ error: 'Atama bulunamadı' }, { status: 404 })

  /* Önce TÜMÜNÜ doğrula, sonra yaz: yarısı yazılmış bir gün dizisi
     bırakmak, kullanıcının neyi düzelteceğini bilememesi demektir. */
  const islemler: { tarih: string; plan?: number | null; adet?: number | null; hatali: number }[] = []
  for (const g of gunler) {
    const tarih = String(g?.tarih ?? '')
    if (!TARIH.test(tarih)) {
      return NextResponse.json({ error: `Geçersiz tarih: ${g?.tarih}` }, { status: 400 })
    }
    const plan = alan(g.planAdet)
    const adet = alan(g.adet)
    const hatali = Number(g.hataliAdet ?? 0)

    for (const [ad, v] of [['planAdet', plan], ['adet', adet]] as const) {
      if (Number.isNaN(v)) {
        return NextResponse.json({ error: `${ad} sayı olmalı (${tarih})` }, { status: 400 })
      }
      if (typeof v === 'number' && v < 0) {
        return NextResponse.json({ error: `${ad} negatif olamaz (${tarih})` }, { status: 400 })
      }
    }
    if (!Number.isFinite(hatali) || hatali < 0) {
      return NextResponse.json({ error: `hataliAdet negatif olamaz (${tarih})` }, { status: 400 })
    }
    if (plan === undefined && adet === undefined) continue

    islemler.push({ tarih, plan, adet, hatali: Math.round(hatali) })
  }

  if (islemler.length === 0) {
    return NextResponse.json({ error: 'Yazılacak alan yok' }, { status: 400 })
  }

  for (const i of islemler) {
    if (i.plan !== undefined) {
      await planKaydet(sql, tenant.tenantId, atamaId, i.tarih, i.plan)
    }
    if (i.adet !== undefined) {
      await gunlukKaydet(sql, tenant.tenantId, atamaId, i.tarih, i.adet, i.hatali)
    }
  }

  return NextResponse.json({ ok: true, yazilan: islemler.length })
})
