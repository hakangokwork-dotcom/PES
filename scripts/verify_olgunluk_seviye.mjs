#!/usr/bin/env node
/**
 * Olgunluk seviye kuralının davranış testi (031).
 *
 * NEDEN VAR: seviye hiçbir yerde saklanmıyor, v_olgunluk_surec_seviye'de
 * hesaplanıyor. Kural yanlışsa 130 atölyenin skoru sessizce yanlış olur ve
 * bunu fark ettirecek bir hata mesajı yoktur. Bu yüzden kural iddia
 * edilmez, çalıştırılıp ölçülür.
 *
 * Her şey TEK transaction içinde yapılır ve sonunda geri alınır —
 * canlı veriye tek satır yazmaz.
 *
 *   node scripts/verify_olgunluk_seviye.mjs
 */
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const SABLON_KOD = arg('kod', 'v4')

const env = envOku(join(__dir, '../.env.local'))
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

let gecti = 0
let kaldi = 0
const kontrol = (ad, beklenen, gercek) => {
  const ok = String(beklenen) === String(gercek)
  if (ok) { gecti++; console.log(`  OK    ${ad}  -> ${gercek}`) }
  else { kaldi++; console.log(`  KALDI ${ad}  -> beklenen ${beklenen}, gelen ${gercek}`) }
}

const GERI_AL = 'DOGRULAMA_BITTI_GERI_AL'

try {
  await sql.begin(async (tx) => {
    const [w] = await tx`SELECT id, tenant_id, name FROM workshop ORDER BY id LIMIT 1`
    const [sab] = await tx`SELECT id, durum FROM olgunluk_sablon WHERE kod = ${SABLON_KOD}`
    if (!w || !sab) throw new Error('atölye ya da şablon yok — önce katalogu yükleyin')

    // Üç seviyesi de dolu bir süreç seçilir; kural ancak orada tam sınanır.
    const [surec] = await tx`
      SELECT s.id, s.kod, s.ad
        FROM olgunluk_surec s
       WHERE s.sablon_id = ${sab.id}
         AND (SELECT count(DISTINCT seviye) FROM olgunluk_kriter k WHERE k.surec_id = s.id) = 3
       ORDER BY s.sira LIMIT 1`
    if (!surec) throw new Error('üç seviyesi de dolu süreç bulunamadı')

    const kriterler = await tx`
      SELECT id, seviye FROM olgunluk_kriter
       WHERE surec_id = ${surec.id} AND taraf = 'ATOLYE'
       ORDER BY seviye, sira`
    const sv = (n) => kriterler.filter((k) => k.seviye === n)

    console.log(`Atölye: ${w.name} | Süreç ${surec.kod} ${surec.ad}`)
    console.log(`Kriter: sv1=${sv(1).length} sv2=${sv(2).length} sv3=${sv(3).length}\n`)

    console.log('ŞABLON DURUMU')
    // Denetim yalnız yayındaki şablona açılabilir; test için yayına alınır
    // (transaction geri alınacağı için canlıda taslak kalır).
    let taslagaAcildi = false
    try {
      await tx.savepoint(async (sp) => {
        await sp`
          INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, denetci)
          VALUES (${w.tenant_id}, ${w.id}, ${sab.id}, CURRENT_DATE, 'kontrol')`
        taslagaAcildi = true
      })
    } catch { /* beklenen */ }
    kontrol('taslak şablona denetim açılamıyor', false, taslagaAcildi)

    await tx`UPDATE olgunluk_sablon SET durum = 'yayinda', yayin_tarihi = now() WHERE id = ${sab.id}`

    const [d] = await tx`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, durum, denetci)
      VALUES (${w.tenant_id}, ${w.id}, ${sab.id}, CURRENT_DATE, 'taslak', 'dogrulama')
      RETURNING id`

    /** cevaplar: [{id, sonuc}] — her seferinde sıfırdan yazılır */
    const cevapla = async (cevaplar) => {
      await tx`DELETE FROM olgunluk_denetim_kriter WHERE denetim_id = ${d.id}`
      for (const c of cevaplar) {
        await tx`
          INSERT INTO olgunluk_denetim_kriter (denetim_id, kriter_id, tenant_id, sonuc)
          VALUES (${d.id}, ${c.id}, ${w.tenant_id}, ${c.sonuc})`
      }
    }
    const seviye = async () => {
      const [r] = await tx`
        SELECT seviye FROM v_olgunluk_surec_seviye
         WHERE denetim_id = ${d.id} AND surec_id = ${surec.id}`
      return r?.seviye ?? 'NULL'
    }
    const hepsi = (sonuc, ...seviyeler) =>
      seviyeler.flatMap((n) => sv(n).map((k) => ({ id: k.id, sonuc })))

    console.log('SEVİYE KURALI')
    await cevapla([])
    kontrol('hiç cevap yok -> değerlendirilmedi', 'NULL', await seviye())

    await cevapla(hepsi('EVET', 1, 2, 3))
    kontrol('hepsi EVET', 3, await seviye())

    await cevapla([...hepsi('EVET', 1, 2), ...hepsi('HAYIR', 3)])
    kontrol('sv3 düştü', 2, await seviye())

    await cevapla([...hepsi('EVET', 1), ...hepsi('HAYIR', 2), ...hepsi('EVET', 3)])
    kontrol('sv2 düştü, sv3 sağlandı (tavan sv1)', 1, await seviye())

    await cevapla([
      { id: sv(1)[0].id, sonuc: 'HAYIR' },
      ...hepsi('EVET', 1).slice(1), ...hepsi('EVET', 2, 3),
    ])
    kontrol("sv1'de tek madde HAYIR", 0, await seviye())

    // Cevapsız madde EVET sayılmamalı: eksik denetim yüksek skor üretmemeli.
    await cevapla([...hepsi('EVET', 1).slice(1), ...hepsi('EVET', 2, 3)])
    kontrol("sv1'de tek madde cevapsız", 0, await seviye())

    // KAPSAM_DISI paydadan düşer: o operasyon atölyede yoksa ceza olmamalı.
    await cevapla([
      { id: sv(1)[0].id, sonuc: 'KAPSAM_DISI' },
      ...hepsi('EVET', 1).slice(1), ...hepsi('EVET', 2, 3),
    ])
    kontrol("sv1'de tek madde KAPSAM_DISI", 3, await seviye())

    console.log('\nPUAN VE PAYDA')
    await cevapla(hepsi('EVET', 1, 2, 3))
    const [ozet] = await tx`
      SELECT puan, max_puan, yuzde, degerlendirilen, degerlendirilmeyen
        FROM v_olgunluk_denetim_ozet WHERE denetim_id = ${d.id}`
    const [{ toplam }] = await tx`
      SELECT count(*)::int AS toplam FROM olgunluk_surec
       WHERE sablon_id = ${sab.id} AND aktif`
    kontrol('yalnız 1 süreç değerlendirildi', 1, ozet.degerlendirilen)
    kontrol('geri kalan süreç değerlendirilmedi', toplam - 1, ozet.degerlendirilmeyen)
    kontrol('puan = 3 x ağırlık(1)', 3, Number(ozet.puan))
    kontrol('payda yalnız değerlendirilenden', 3, Number(ozet.max_puan))
    kontrol('yüzde', '100.0', String(ozet.yuzde))

    const [{ kriteri_yok }] = await tx`
      SELECT count(*)::int AS kriteri_yok
        FROM v_olgunluk_surec_seviye ss
        JOIN olgunluk_surec s ON s.id = ss.surec_id
       WHERE ss.denetim_id = ${d.id} AND ss.cevapli_toplam = 0 AND ss.seviye IS NULL`
    kontrol('kriteri olmayan süreçler de satır üretiyor', toplam - 1, kriteri_yok)

    console.log('\nKORUMALAR')
    // Yayındaki şablonun kataloğu değişememeli (kilit trigger).
    let degisti = false
    try {
      await tx.savepoint(async (sp) => {
        await sp`UPDATE olgunluk_kriter SET metin = metin || ' x' WHERE id = ${sv(3)[0].id}`
        degisti = true
      })
    } catch { /* beklenen */ }
    kontrol('yayındaki şablonun kriteri değiştirilemiyor', false, degisti)

    // Cevaplanmış madde silinememeli (FK RESTRICT). Kilit trigger'ı devreden
    // çıkarmak için şablon geçici olarak taslağa alınır — yoksa hangi
    // korumanın durdurduğu ayırt edilemez.
    let silindi = false
    try {
      await tx.savepoint(async (sp) => {
        await sp`UPDATE olgunluk_sablon SET durum = 'taslak' WHERE id = ${sab.id}`
        await sp`DELETE FROM olgunluk_kriter WHERE id = ${sv(1)[0].id}`
        silindi = true
      })
    } catch { /* beklenen */ }
    kontrol('cevaplanmış kriter silinemiyor (kilit kapalıyken de)', false, silindi)

    throw new Error(GERI_AL)
  })
} catch (e) {
  if (e.message !== GERI_AL) {
    console.error('\nFAIL:', e.message)
    process.exitCode = 1
  }
} finally {
  await sql.end({ timeout: 3 })
}

console.log(`\n${gecti} geçti, ${kaldi} kaldı — yazılanlar geri alındı.`)
if (kaldi > 0) process.exitCode = 1
