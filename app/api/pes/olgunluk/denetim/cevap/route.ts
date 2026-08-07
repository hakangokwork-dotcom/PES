import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { dbHata } from '../../_guard'

/**
 * Denetimde madde işaretleme — sistemin tek ham verisi.
 *
 *   PUT /api/pes/olgunluk/denetim/cevap
 *       { denetim_id, cevaplar: [{ kriter_id, sonuc, not_metni? }] }
 *
 * sonuc = EVET | HAYIR | KAPSAM_DISI | null
 *   null gönderilirse cevap SİLİNİR (= "henüz bakılmadı"). Bu, "hayır"dan
 *   farklı bir durum: cevapsız madde seviyeyi düşürür ama sürecin hiç
 *   cevabı yoksa süreç "değerlendirilmedi" sayılır ve paydadan düşer.
 *
 * TOPLU YAZAR: saha ekranı işaretlemeleri biriktirip tek istekte gönderir.
 * Madde başına istek, kötü bağlantıda yarım kalmış denetim demek olurdu.
 */

const SONUCLAR = new Set(['EVET', 'HAYIR', 'KAPSAM_DISI'])

export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const body = (await req.json()) as Record<string, unknown>
  const denetimId = Number(body.denetim_id)
  if (!Number.isInteger(denetimId)) {
    return NextResponse.json({ error: 'Geçersiz denetim' }, { status: 400 })
  }

  const [denetim] = await sql`
    SELECT id, sablon_id, durum FROM olgunluk_denetim WHERE id = ${denetimId}`
  if (!denetim) return NextResponse.json({ error: 'Denetim bulunamadı' }, { status: 404 })
  if (denetim.durum === 'tamamlandi') {
    return NextResponse.json({
      error: 'Denetim tamamlanmış; cevaplar kilitli. Değiştirmek için taslağa geri alın.',
    }, { status: 409 })
  }

  const ham = body.cevaplar
  if (!Array.isArray(ham) || ham.length === 0) {
    return NextResponse.json({ error: 'Cevap listesi boş' }, { status: 400 })
  }
  if (ham.length > 1000) {
    return NextResponse.json({ error: 'Tek seferde en fazla 1000 madde' }, { status: 400 })
  }

  const yazilacak: { kriter_id: number; sonuc: string; not_metni: string | null }[] = []
  const silinecek: number[] = []
  for (const c of ham as Record<string, unknown>[]) {
    const kid = Number(c.kriter_id)
    if (!Number.isInteger(kid)) {
      return NextResponse.json({ error: 'Geçersiz madde' }, { status: 400 })
    }
    const s = c.sonuc === null || c.sonuc === undefined || c.sonuc === ''
      ? null
      : String(c.sonuc).toUpperCase()
    if (s === null) { silinecek.push(kid); continue }
    if (!SONUCLAR.has(s)) {
      return NextResponse.json({ error: `Geçersiz sonuç: ${s}` }, { status: 400 })
    }
    yazilacak.push({
      kriter_id: kid, sonuc: s,
      not_metni: String(c.not_metni ?? '').trim() || null,
    })
  }

  // Maddelerin bu denetimin ŞABLONUNA ait olduğu doğrulanmalı: aksi halde
  // başka bir sürümün maddesine cevap yazılır, seviye hesabı onu hiç
  // görmez ve cevap sessizce kaybolur.
  const tumId = [...yazilacak.map((y) => y.kriter_id), ...silinecek]
  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet FROM olgunluk_kriter
     WHERE sablon_id = ${denetim.sablon_id} AND id = ANY(${tumId}::int[])`
  if (adet !== new Set(tumId).size) {
    return NextResponse.json({
      error: 'Bazı maddeler bu denetimin sürümüne ait değil',
    }, { status: 400 })
  }

  try {
    if (silinecek.length) {
      await sql`
        DELETE FROM olgunluk_denetim_kriter
         WHERE denetim_id = ${denetimId} AND kriter_id = ANY(${silinecek}::int[])`
    }
    for (const y of yazilacak) {
      await sql`
        INSERT INTO olgunluk_denetim_kriter
          (denetim_id, kriter_id, tenant_id, sonuc, not_metni)
        VALUES (${denetimId}, ${y.kriter_id}, ${tenant.tenantId}, ${y.sonuc}, ${y.not_metni})
        ON CONFLICT (denetim_id, kriter_id) DO UPDATE
          SET sonuc = EXCLUDED.sonuc, not_metni = EXCLUDED.not_metni, updated_at = now()`
    }

    // Yazdıktan sonra türetilmiş seviyeler geri döner: ekran kendi
    // hesabını yapmasın, kuralın tek kaynağı view olsun.
    const seviyeler = await sql`
      SELECT surec_id, seviye FROM v_olgunluk_surec_seviye WHERE denetim_id = ${denetimId}`
    const [ozet] = await sql`
      SELECT puan::text, max_puan::text, yuzde::text, degerlendirilen, degerlendirilmeyen
        FROM v_olgunluk_denetim_ozet WHERE denetim_id = ${denetimId}`
    return NextResponse.json({ seviyeler, ozet: ozet ?? null })
  } catch (e) {
    return dbHata(e)
  }
})
