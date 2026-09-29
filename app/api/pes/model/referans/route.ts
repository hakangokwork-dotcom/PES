import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { donemCoz, donemYaz } from '@/lib/pes/donem'
import { referansTablosu, varsayilanDonem } from '@/lib/pes/referans-sorgu'

/**
 * GET ?donem=YYYY-MM[&format=csv] — referans model tablosu, 6 teşvik bölgesi.
 *
 * YALNIZ MERKEZ. Referans fiyat pazarlık bilgisidir; atölye oturumu
 * (workshopId dolu) 403 alır. ref_parca_sure katalog tablosu olduğu için
 * RLS bunu tek başına durdurmaz — kontrol burada.
 */
export const GET = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Yalnız merkez paneli' }, { status: 403 })
  }
  const u = new URL(req.url)
  const d = donemCoz(u.searchParams.get('donem'))
  const donem = d ? donemYaz(d) : varsayilanDonem()
  const t = await referansTablosu(sql, donem)

  if (u.searchParams.get('format') !== 'csv') return NextResponse.json(t)

  const bolgeler = Object.keys(t.dkMaliyet).map(Number).sort()
  const sayi = (v: number | null, basamak = 2) => (v === null ? '' : v.toFixed(basamak).replace('.', ','))
  const metin = (v: string | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const baslik = [
    'urun_tipi', 'urun_grubu', 'segment', 'guven', 'model_sayisi', 'parca_sayisi',
    'kesim_dk_tahmini', 'dikim_dk', 'ukp_dk_tahmini', 'toplam_dk',
    ...bolgeler.flatMap((b) => [`b${b}_kesim_tl`, `b${b}_dikim_tl`, `b${b}_ukp_tl`, `b${b}_toplam_tl`]),
  ]
  const satirlar = t.satirlar.map((s) => {
    const dk = (sn: number | null) => (sn === null ? null : sn / 60)
    const top = s.sure.kesimSn === null || s.sure.ukpSn === null ? null : s.sure.kesimSn + s.sure.dikimSn + s.sure.ukpSn
    return [
      metin(s.klasman), metin(s.urunGrubu), metin(s.segment), s.guven, s.modelSayisi, s.parcaSayisi,
      sayi(dk(s.sure.kesimSn), 3), sayi(dk(s.sure.dikimSn), 3), sayi(dk(s.sure.ukpSn), 3), sayi(dk(top), 3),
      ...bolgeler.flatMap((b) => {
        const f = s.fiyat[b]
        return [sayi(f.kesimTl), sayi(f.dikimTl), sayi(f.ukpTl), sayi(f.toplamTl)]
      }),
    ].join(';')
  })
  // Türkçe Excel: ; ayraç, virgül ondalık, BOM ile UTF-8.
  const govde = '﻿' + [
    `# 3D dönemi ${t.dkDonem ?? '-'}; parametre dönemi ${t.paramDonem ?? 'varsayılan'}; kesim/UKP personel oranı ${t.oranlar.kesim}/${t.oranlar.ukp}`,
    baslik.join(';'), ...satirlar,
  ].join('\r\n')
  return new NextResponse(govde, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="referans-model-fiyat-${donem}.csv"`,
    },
  })
})
