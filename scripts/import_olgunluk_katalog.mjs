#!/usr/bin/env node
/**
 * "olgunluk_katalog_taslak.xlsx" -> olgunluk_sablon / kategori / surec / kriter
 *
 * NEDEN VAR: olgunluk kataloğu (33 süreç, ~170 madde) elle girilemeyecek
 * kadar büyük. Kaynak "WKYS Olgunluk Seviyesi_v4" Excel'inin seviye
 * tanımları a/b/c şıklarına bölünüp bu dosyaya ayrıştırıldı; buradan
 * veritabanına taşınıyor.
 *
 * BU BİR SEED'DİR, SENKRONİZASYON DEĞİL. Şablona bağlı denetim varsa
 * script yazmayı reddeder — kriteri değiştirmek geçmiş denetimin skorunu
 * açıklanamaz hale getirir. O noktadan sonra doğru yol: şablonu klonla,
 * taslakta düzenle, yayınla (031'deki kilit trigger'ı da bunu zorlar).
 *
 *   node scripts/import_olgunluk_katalog.mjs              # kuru çalışma
 *   node scripts/import_olgunluk_katalog.mjs --uygula     # DB'ye yazar
 *   node scripts/import_olgunluk_katalog.mjs --kod=v5 --dosya=...
 */
import xlsx from 'xlsx'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { envOku, metin } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const UYGULA = process.argv.includes('--uygula')
const DOSYA = arg('dosya', join(__dir, '../olgunluk_katalog_taslak.xlsx'))
const SABLON_KOD = arg('kod', 'v4')
const SABLON_AD = arg('ad', 'WKYS Olgunluk Seviyesi v4')

/* ---- Okuma ---- */
const wb = xlsx.readFile(DOSYA, { cellDates: false })
const sayfa = (ad) => {
  if (!wb.Sheets[ad]) { console.error(`Sayfa yok: ${ad}`); process.exit(1) }
  return xlsx.utils.sheet_to_json(wb.Sheets[ad], { raw: false, defval: null, blankrows: false })
}
// "3.5 (öneri)" -> "3.5"; kod veritabanında sade tutulur.
const kodSade = (v) => (metin(v) || '').replace(/\s*\(öneri\)\s*/gi, '').trim()

const kategoriler = sayfa('Kategoriler')
  .map((r, i) => ({ kod: metin(r.KATEGORI_ID), ad: metin(r.KATEGORI_ADI), sira: i + 1 }))
  .filter((k) => k.kod && k.ad)

const surecler = sayfa('Süreçler')
  .map((r, i) => ({
    kod: kodSade(r.KOD),
    ad: metin(r['SÜREÇ ADI']),
    kategoriKod: metin(r.KATEGORI_ID),
    agirlik: Number(metin(r.AGIRLIK) ?? 1) || 1,
    not: metin(r.NOT),
    sira: i + 1,
  }))
  .filter((s) => s.kod && s.ad)

const kriterSatiri = (surecKod, seviye, metinDeger, taraf) => ({
  surecKod, seviye: Number(seviye), metin: metinDeger,
  taraf: taraf === 'Marka/Tedarik' ? 'MARKA' : 'ATOLYE',
})

const kriterler = sayfa('Kriterler')
  .filter((r) => (metin(r.DURUM) || '').toUpperCase() !== 'SİL')
  .map((r) => kriterSatiri(kodSade(r.SUREC_KOD), r.SEVIYE, metin(r['KRİTER METNİ']), metin(r.TARAF)))
  .filter((k) => k.surecKod && k.metin)

// Beyin Fırt havuzundan yalnız ONAYLI SUREC_KOD doldurulmuş satırlar gelir.
const havuz = sayfa('Beyin Fırt Havuzu')
  .filter((r) => metin(r['ONAYLI SUREC_KOD']))
  .map((r) => kriterSatiri(kodSade(r['ONAYLI SUREC_KOD']), r.SEVIYE, metin(r['KRİTER METNİ']), null))
  .filter((k) => k.surecKod && k.metin)

const tumKriterler = [...kriterler, ...havuz]

console.log(`${basename(DOSYA)}: ${kategoriler.length} kategori, ${surecler.length} süreç, ` +
            `${kriterler.length} kriter + havuzdan ${havuz.length} = ${tumKriterler.length}`)

/* ---- Doğrulama — bozuk katalog yüklemek boş katalogdan kötüdür ---- */
const katKodlar = new Set(kategoriler.map((k) => k.kod))
const surecKodlar = new Set(surecler.map((s) => s.kod))
const hatalar = []

for (const s of surecler) {
  if (!katKodlar.has(s.kategoriKod)) hatalar.push(`süreç ${s.kod}: kategori yok -> ${s.kategoriKod}`)
  if (!(s.agirlik > 0)) hatalar.push(`süreç ${s.kod}: ağırlık pozitif değil -> ${s.agirlik}`)
}
const cift = surecler.map((s) => s.kod).filter((k, i, a) => a.indexOf(k) !== i)
if (cift.length) hatalar.push(`tekrarlanan süreç kodu: ${[...new Set(cift)].join(', ')}`)

for (const k of tumKriterler) {
  if (!surecKodlar.has(k.surecKod)) hatalar.push(`kriter: süreç yok -> ${k.surecKod} / ${k.metin.slice(0, 40)}`)
  if (!(k.seviye >= 1 && k.seviye <= 3)) hatalar.push(`kriter ${k.surecKod}: seviye 1-3 değil -> ${k.seviye}`)
}

if (hatalar.length) {
  console.error(`\n${hatalar.length} HATA:`)
  hatalar.slice(0, 30).forEach((h) => console.error('  ' + h))
  if (hatalar.length > 30) console.error(`  ... ve ${hatalar.length - 30} tane daha`)
  process.exit(1)
}

/* ---- Kriteri olmayan süreçler: engel değil, uyarı ---- */
const kriterAdedi = new Map()
for (const k of tumKriterler) kriterAdedi.set(k.surecKod, (kriterAdedi.get(k.surecKod) || 0) + 1)
const bos = surecler.filter((s) => !kriterAdedi.has(s.kod))
if (bos.length) {
  console.log(`\nUYARI — kriteri olmayan ${bos.length} süreç (denetimde "değerlendirilmedi" olur, puana girmez):`)
  bos.forEach((s) => console.log(`  ${s.kod}  ${s.ad}`))
}

const markaAdedi = tumKriterler.filter((k) => k.taraf === 'MARKA').length
console.log(`\nMarka/tedarik sorumluluğundaki madde: ${markaAdedi} (atölye puanına girmez)`)

if (!UYGULA) {
  console.log('\nKuru çalışma. Yazmak için --uygula ekleyin.')
  process.exit(0)
}

/* ---- Yazma ---- */
const env = envOku(join(__dir, '../.env.local'))
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

try {
  const [tenant] = await sql`SELECT id FROM tenant WHERE slug = 'default'`
  if (!tenant) throw new Error('default tenant bulunamadı')

  await sql.begin(async (tx) => {
    const [mevcut] = await tx`
      SELECT id, durum FROM olgunluk_sablon
       WHERE tenant_id = ${tenant.id} AND kod = ${SABLON_KOD}`

    if (mevcut) {
      if (mevcut.durum !== 'taslak') {
        throw new Error(
          `Şablon ${SABLON_KOD} "${mevcut.durum}" durumunda; seed yazamaz. ` +
          'Klonlayıp taslakta düzenleyin.')
      }
      const [{ adet }] = await tx`
        SELECT count(*)::int AS adet FROM olgunluk_denetim WHERE sablon_id = ${mevcut.id}`
      if (adet > 0) {
        throw new Error(
          `Şablon ${SABLON_KOD} ${adet} denetime bağlı; seed yeniden yazamaz. ` +
          'Klonlayıp taslakta düzenleyin.')
      }
      // Denetimsiz taslak: temiz sayfa. Kriter -> süreç -> kategori sırası FK gereği.
      await tx`DELETE FROM olgunluk_kriter   WHERE sablon_id = ${mevcut.id}`
      await tx`DELETE FROM olgunluk_surec    WHERE sablon_id = ${mevcut.id}`
      await tx`DELETE FROM olgunluk_kategori WHERE sablon_id = ${mevcut.id}`
    }

    const [sablon] = mevcut
      ? await tx`UPDATE olgunluk_sablon SET ad = ${SABLON_AD} WHERE id = ${mevcut.id} RETURNING id`
      : await tx`
          INSERT INTO olgunluk_sablon (tenant_id, kod, ad, aciklama, durum)
          VALUES (${tenant.id}, ${SABLON_KOD}, ${SABLON_AD},
                  ${'Kaynak: WKYS Olgunluk Seviyesi_v4 / new file.xlsx'}, 'taslak')
          RETURNING id`

    const katId = new Map()
    for (const k of kategoriler) {
      const [r] = await tx`
        INSERT INTO olgunluk_kategori (tenant_id, sablon_id, kod, ad, sira)
        VALUES (${tenant.id}, ${sablon.id}, ${k.kod}, ${k.ad}, ${k.sira})
        RETURNING id`
      katId.set(k.kod, r.id)
    }

    const surecId = new Map()
    for (const s of surecler) {
      const [r] = await tx`
        INSERT INTO olgunluk_surec
          (tenant_id, sablon_id, kategori_id, kod, ad, agirlik, sira, not_metni)
        VALUES (${tenant.id}, ${sablon.id}, ${katId.get(s.kategoriKod)},
                ${s.kod}, ${s.ad}, ${s.agirlik}, ${s.sira}, ${s.not})
        RETURNING id`
      surecId.set(s.kod, r.id)
    }

    // Sıra süreç+seviye içinde 1'den başlar; panel bunu sürükle-bırakla değiştirecek.
    const sayac = new Map()
    for (const k of tumKriterler) {
      const anahtar = `${k.surecKod}|${k.seviye}`
      const sira = (sayac.get(anahtar) || 0) + 1
      sayac.set(anahtar, sira)
      await tx`
        INSERT INTO olgunluk_kriter
          (tenant_id, sablon_id, surec_id, seviye, sira, metin, taraf)
        VALUES (${tenant.id}, ${sablon.id}, ${surecId.get(k.surecKod)},
                ${k.seviye}, ${sira}, ${k.metin}, ${k.taraf})`
    }

    console.log(`\nYazıldı: şablon #${sablon.id} (${SABLON_KOD}, taslak) — ` +
                `${kategoriler.length} kategori, ${surecler.length} süreç, ${tumKriterler.length} kriter`)
    console.log('Yayınlamak için: UPDATE olgunluk_sablon SET durum=\'yayinda\', ' +
                `yayin_tarihi=now() WHERE id=${sablon.id};`)
  })
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 3 })
}
