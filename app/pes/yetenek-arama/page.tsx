import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import YetenekFiltrePaneli, { type BoyutBlok } from '@/components/pes/YetenekFiltrePaneli'

export const dynamic = 'force-dynamic'

/* "Bu işi kim yapabilir?" — yeteneğe göre bant/atölye arama.
 *
 * FİLTRE MANTIĞI: boyut içinde VEYA, boyutlar arasında VE.
 *   Klasman ∈ {Gömlek, Elbise} VE Kumaş ∈ {Keten} VE Makine ∈ {Reçme}
 *
 * SONUÇ BANT DÜZEYİNDE: yetenek bantta duruyor. Bir atölye eşleşir çünkü
 * EN AZ BİR bandı koşulların HEPSİNİ birden sağlar — iki ayrı bandın koşulları
 * paylaşması sayılmaz, o yanıltıcı olurdu ("bu atölye bunu yapar" derken
 * aslında hiçbir bandı tek başına yapamıyor olurdu).
 *
 * NEDEN TEK SORGU + JS: havuz küçük (~159 aktif bant, ~4000 yetenek satırı).
 * Faceted sayaç için boyut başına ayrı SQL yazmak yerine hepsini bir kez çekip
 * bellekte hesaplamak hem daha basit hem tek gidiş-dönüş.
 */

type YetenekSatiri = {
  line_id: number
  line_code: string
  line_name: string
  bant_turu: string | null
  operator_count: number
  workshop_id: number
  workshop_code: string
  workshop_name: string
  city: string | null
  dimension_code: string | null
  value_code: string | null
}

type KatalogSatiri = {
  boyut: string
  boyut_label: string
  boyut_sira: number | null
  value_code: string
  value_label: string
  value_sira: number | null
}

type Bant = {
  id: number
  code: string
  name: string
  bantTuru: string | null
  operator: number
  wsId: number
  wsCode: string
  wsName: string
  city: string | null
  yetenek: Map<string, Set<string>>
}

export default async function YetenekAramaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const veri = await withServerTenant(async (sql) => {
    const [satirlar, katalog] = await Promise.all([
      sql`
        SELECT pl.id AS line_id, pl.code AS line_code, pl.name AS line_name,
               pl.bant_turu, pl.operator_count,
               w.id AS workshop_id, w.code AS workshop_code, w.name AS workshop_name, w.city,
               lc.dimension_code, lc.value_code
        FROM production_line pl
        JOIN workshop w ON w.id = pl.workshop_id AND w.is_active
        LEFT JOIN line_capability lc ON lc.line_id = pl.id AND lc.attribute_type = 'PROFILE'
        WHERE pl.is_active
        ORDER BY w.code, pl.code`,
      sql`
        SELECT cd.code AS boyut, cd.label AS boyut_label, cd.sort_order AS boyut_sira,
               cv.code AS value_code, cv.label AS value_label, cv.sort_order AS value_sira
        FROM capability_dimension cd
        JOIN capability_value cv ON cv.dimension_id = cd.id
        ORDER BY cd.sort_order NULLS LAST, cv.sort_order NULLS LAST`,
    ])
    return {
      satirlar: satirlar as unknown as YetenekSatiri[],
      katalog: katalog as unknown as KatalogSatiri[],
    }
  })

  if (veri === null) redirect('/login')

  /* Satırları banda topla */
  const bantlar = new Map<number, Bant>()
  for (const r of veri.satirlar) {
    let b = bantlar.get(r.line_id)
    if (!b) {
      b = {
        id: r.line_id, code: r.line_code, name: r.line_name,
        bantTuru: r.bant_turu, operator: r.operator_count,
        wsId: r.workshop_id, wsCode: r.workshop_code, wsName: r.workshop_name,
        city: r.city, yetenek: new Map(),
      }
      bantlar.set(r.line_id, b)
    }
    if (r.dimension_code && r.value_code) {
      let set = b.yetenek.get(r.dimension_code)
      if (!set) { set = new Set(); b.yetenek.set(r.dimension_code, set) }
      set.add(r.value_code)
    }
  }
  const tumBantlar = [...bantlar.values()]

  /* Katalogda YETENEĞİ OLAN boyutlar — hiç işaretlenmemiş boyut (kalite, sezon)
     panelde yer kaplamasın. "Hangi alanda yeteneğimiz var" sorusunun cevabı da bu. */
  const doluBoyut = new Set<string>()
  for (const b of tumBantlar) for (const d of b.yetenek.keys()) doluBoyut.add(d)

  /* URL'den seçili filtreler */
  const secili: Record<string, string[]> = {}
  for (const k of doluBoyut) {
    const ham = sp[k]
    const dizi = (Array.isArray(ham) ? ham.join(',') : ham ?? '').split(',').filter(Boolean)
    if (dizi.length) secili[k] = dizi
  }
  const seciliBoyutlar = Object.keys(secili)

  /* Bir bant, verilen boyut kümesinin HEPSİNİ sağlıyor mu (boyut-içi VEYA) */
  const uyar = (b: Bant, boyutlar: string[]) =>
    boyutlar.every((d) => {
      const bantDegerleri = b.yetenek.get(d)
      return !!bantDegerleri && secili[d].some((v) => bantDegerleri.has(v))
    })

  const sonuc = tumBantlar.filter((b) => uyar(b, seciliBoyutlar))

  /* Faceted sayaç: her boyut için, O BOYUT HARİÇ diğer filtreler uygulanmış
     havuzda her değerin kaç bantta olduğu. Kendi filtresini dışlamazsak seçili
     olmayan değerler hep 0 görünür ve panel kullanılamaz hale gelir. */
  const bloklar: BoyutBlok[] = []
  const boyutBilgi = new Map<string, { label: string; sira: number | null; degerler: KatalogSatiri[] }>()
  for (const k of veri.katalog) {
    if (!doluBoyut.has(k.boyut)) continue
    let bi = boyutBilgi.get(k.boyut)
    if (!bi) { bi = { label: k.boyut_label, sira: k.boyut_sira, degerler: [] }; boyutBilgi.set(k.boyut, bi) }
    bi.degerler.push(k)
  }

  for (const [boyut, bi] of boyutBilgi) {
    const digerBoyutlar = seciliBoyutlar.filter((d) => d !== boyut)
    const havuz = tumBantlar.filter((b) => uyar(b, digerBoyutlar))
    const sayac = new Map<string, number>()
    for (const b of havuz) {
      for (const v of b.yetenek.get(boyut) ?? []) sayac.set(v, (sayac.get(v) ?? 0) + 1)
    }
    const degerler = bi.degerler
      .map((d) => ({ code: d.value_code, label: d.value_label, adet: sayac.get(d.value_code) ?? 0 }))
      .filter((d) => d.adet > 0 || (secili[boyut] ?? []).includes(d.code))
    if (degerler.length) bloklar.push({ code: boyut, label: bi.label, degerler })
  }
  bloklar.sort((a, b) => {
    const sa = boyutBilgi.get(a.code)?.sira ?? 999
    const sb = boyutBilgi.get(b.code)?.sira ?? 999
    return sa - sb
  })

  /* Sonucu atölyeye grupla */
  const atolyeler = new Map<number, { code: string; name: string; city: string | null; bantlar: Bant[] }>()
  for (const b of sonuc) {
    let a = atolyeler.get(b.wsId)
    if (!a) { a = { code: b.wsCode, name: b.wsName, city: b.city, bantlar: [] }; atolyeler.set(b.wsId, a) }
    a.bantlar.push(b)
  }
  const atolyeListesi = [...atolyeler.values()].sort((a, b) => a.code.localeCompare(b.code, 'tr'))

  /* Seçili filtrelerin okunabilir özeti */
  const ozet = seciliBoyutlar.map((d) => {
    const bi = boyutBilgi.get(d)
    const etiketler = secili[d].map((v) => bi?.degerler.find((x) => x.value_code === v)?.value_label ?? v)
    return `${bi?.label ?? d}: ${etiketler.join(' / ')}`
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Yetenek Arama</h1>
        <p className="text-gray-500 mt-1">
          {seciliBoyutlar.length === 0
            ? `${tumBantlar.length} aktif bant · filtre seçin`
            : `${sonuc.length} bant · ${atolyeListesi.length} atölye eşleşiyor`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        <YetenekFiltrePaneli bloklar={bloklar} secili={secili} />

        <div className="space-y-4">
          {ozet.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-900">
              <span className="font-medium">Aranan: </span>
              {ozet.join('  ·  ')}
            </div>
          )}

          {atolyeListesi.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-600">Bu koşulların hepsini birden sağlayan bant yok.</p>
              <p className="text-xs text-gray-400 mt-1">
                Filtrelerden birini kaldırıp tekrar deneyin — sayaçlar hangi seçimin daraltacağını gösterir.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {atolyeListesi.map((a) => (
                <div key={a.code} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="min-w-0">
                      <span className="text-[#197A56] font-semibold">{a.code}</span>
                      <span className="text-gray-900 font-medium ml-2">{a.name}</span>
                      {a.city && <span className="text-gray-500 text-sm ml-2">· {a.city}</span>}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 ml-3">
                      {a.bantlar.length} bant eşleşti
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {a.bantlar.map((b) => (
                      <div key={b.id} className="px-5 py-2.5 flex items-center justify-between gap-4 text-sm">
                        <div className="min-w-0">
                          <span className="text-gray-900">{b.name}</span>
                          <span className="text-gray-400 text-xs ml-2">{b.code}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                          {b.bantTuru && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              {b.bantTuru}
                            </span>
                          )}
                          {b.operator > 0 && <span>{b.operator} operatör</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
