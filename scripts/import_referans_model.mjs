/**
 * Referans model parça süreleri — ham MTM dosyasından ref_parca_sure'ye.
 *
 *   node scripts/import_referans_model.mjs            → kuru koşu, rapor
 *   node scripts/import_referans_model.mjs --uygula   → yazar
 *
 * Kaynak: Konfeksiyon_operasyonları/konfeksiyon_operasyonlari_ham.xlsx
 * (orijinal KONFEKSİYON OPERASYONLARI.xlsx, "HİYERARŞİ" sayfası, 46.244 satır).
 * Neden yapılandırılmış dosya değil de ham dosya: lib/pes/referans-model.ts.
 *
 * Yazma UPSERT'tür: (urun_tipi_id, bolge, ek_parca_ad) anahtarı sabit
 * kaldıkça id değişmez, merkezin elle düzelttiği reçeteler kırılmaz.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))
const UYGULA = process.argv.includes('--uygula')
const DOSYA = join(__dir, '../Konfeksiyon_operasyonları/konfeksiyon_operasyonlari_ham.xlsx')

const lib = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const m = await import('../lib/pes/referans-model.ts')
  un()
  return m
})

const wb = XLSX.readFile(DOSYA)
const sayfa = wb.Sheets['HİYERARŞİ']
if (!sayfa) { console.error('HATA: "HİYERARŞİ" sayfası yok'); process.exit(1) }
// blankrows: true — boş satır diziden düşerse sıra kayar (E3 tuzağı).
const ham = XLSX.utils.sheet_to_json(sayfa, { header: 1, blankrows: true }).slice(1)
const satirlar = ham.map((r) => ({
  klasman: r[0] ?? '', bolge: r[1] ?? '', ekParca: r[2] ?? '', operasyon: r[4] ?? '', mtm: Number(r[5]),
}))

const { gorunumler, atlanan } = lib.gorunumleriCikar(satirlar)
const parcalar = lib.parcaSureleri(gorunumler)
console.log(`Satır ${satirlar.length} · atlanan ${atlanan} · görünüm ${gorunumler.length} · parça ${parcalar.length}`)

const sql = postgres(env.DATABASE_URL, { max: 1 })
try {
  const tipler = await sql`SELECT id, klasman_ad FROM ref_urun_tipi`
  const varyantlar = await sql`SELECT id, tam_ad FROM ref_ek_parca_varyant`
  const tipId = new Map(tipler.map((t) => [lib.adNormalize(t.klasman_ad), t.id]))
  const varId = new Map(varyantlar.map((v) => [lib.adNormalize(v.tam_ad), v.id]))

  const eslesmeyenTip = new Set()
  let varyantsiz = 0
  const yazilacak = []
  for (const p of parcalar) {
    const u = tipId.get(p.klasman)
    if (!u) { eslesmeyenTip.add(p.klasman); continue }
    const v = varId.get(p.ekParca) ?? null
    if (v === null) varyantsiz++
    yazilacak.push({
      urun_tipi_id: u, bolge: p.bolge, ek_parca_ad: p.ekParca, ek_parca_varyant_id: v,
      gorulme: p.gorulme, sn_medyan: p.snMedyan, sn_min: p.snMin, sn_max: p.snMax, op_sayisi: p.opSayisi,
    })
  }
  console.log(`Ürün tipi eşleşmeyen: ${eslesmeyenTip.size}${eslesmeyenTip.size ? ' → ' + [...eslesmeyenTip].join(', ') : ''}`)
  console.log(`Varyantı kütüphanede bulunmayan parça: ${varyantsiz} (ad ile saklanır, hesaba girer)`)

  // Ürün tipi başına ortalama model özeti
  const tipAd = new Map(tipler.map((t) => [t.id, t.klasman_ad]))
  const grup = new Map()
  for (const y of yazilacak) {
    const l = grup.get(y.urun_tipi_id) ?? []
    l.push({ bolge: y.bolge, ekParca: y.ek_parca_ad, gorulme: y.gorulme, snMedyan: y.sn_medyan })
    grup.set(y.urun_tipi_id, l)
  }
  const ozet = [...grup.entries()].map(([u, l]) => ({
    urun: tipAd.get(u), model: lib.modelSayisiTahmini(l), parca: l.length,
    dikim_sn: Math.round(lib.referansDikimSn(l)), guven: lib.guvenEtiketi(lib.modelSayisiTahmini(l)),
  })).sort((a, b) => b.model - a.model)
  console.table(ozet)
  const say = ozet.reduce((m, o) => ({ ...m, [o.guven]: (m[o.guven] ?? 0) + 1 }), {})
  console.log('Güven dağılımı:', say)

  if (!UYGULA) { console.log('\nKuru koşu. Yazmak için --uygula'); process.exit(0) }

  await sql.begin(async (tx) => {
    for (let i = 0; i < yazilacak.length; i += 500) {
      const parti = yazilacak.slice(i, i + 500)
      await tx`
        INSERT INTO ref_parca_sure ${tx(parti)}
        ON CONFLICT (urun_tipi_id, bolge, ek_parca_ad) DO UPDATE SET
          ek_parca_varyant_id = EXCLUDED.ek_parca_varyant_id,
          gorulme = EXCLUDED.gorulme, sn_medyan = EXCLUDED.sn_medyan,
          sn_min = EXCLUDED.sn_min, sn_max = EXCLUDED.sn_max,
          op_sayisi = EXCLUDED.op_sayisi, son_guncelleme = now()`
    }
  })
  const [n] = await sql`SELECT count(*)::int AS n FROM ref_parca_sure`
  console.log(`Yazıldı. ref_parca_sure: ${n.n} satır`)
} finally {
  await sql.end()
}
