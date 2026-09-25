#!/usr/bin/env node
/**
 * ÖRNEK veri tohumu — gösterim için, canlıdan KALDIRILMAK üzere.
 *
 *   node scripts/seed_ornek_veri.mjs              kuru çalışma (hiçbir şey yazmaz)
 *   node scripts/seed_ornek_veri.mjs --uygula     yazar
 *   node scripts/seed_ornek_veri.mjs --temizle    geri alır
 *
 * NEDEN BETİK: bu veri sanaldır ve canlıya geçmeden önce silinmek zorunda —
 * arkadaşlar gerçek veriyi girsin diye. Elle yazılan bir INSERT'in geri
 * alınması "hangi satırı eklemiştim" sorusuna dayanır; betik bunu
 * deterministik hâle getiriyor.
 *
 * NE YAZAR:
 *   1. Mevcut iş emirlerine künye (model adından türetilmiş, katalog kodları)
 *   2. `ORNEK-` önekli örnek iş emirleri — GERÇEK atölyelere, gerçek bantlara
 *   3. Bir örnek plan taslağı ve içinde yerleştirmeler
 *
 * HANGİ KİRACIYA: kullanıcıların bulunduğu kiracıya (varsayılan `default`).
 * İlk sürüm yalnız `demo-atolye`ye yazıyordu ve kullanıcı hiçbir şey
 * göremedi — RLS başka kiracının satırlarını göstermiyor. Hedef kiracı
 * artık "en çok kullanıcısı olan" kiracıdır.
 *
 * GERİ ALMA, ÜÇ KORUMA:
 *   1. Künye yalnız TAMAMEN BOŞ satıra yazılır; gerçek veri ezilmez.
 *   2. Temizlerken künye yalnız BETİĞİN yazacağıyla BİREBİR aynıysa
 *      boşaltılır — biri düzeltmişse o satıra dokunulmaz.
 *   3. Örnek iş emirleri `ORNEK-` önekiyle, taslak `ÖRNEK ` önekiyle
 *      işaretlenir; temizlik yalnız bunları siler.
 */
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const UYGULA = process.argv.includes('--uygula')
const TEMIZLE = process.argv.includes('--temizle')
if (UYGULA && TEMIZLE) {
  console.error('--uygula ve --temizle birlikte verilemez')
  process.exit(1)
}

const ORNEK_ONEK = 'ORNEK-'
const TASLAK_ONEK = 'ÖRNEK '

const KOLONLAR = [
  'ana_grup_kodu', 'klasman_kodu', 'kumas_turu_kodu',
  'kumas_grubu_kodu', 'cinsiyet_yas_kodu', 'kalite_kodu',
]
const BOYUT = {
  ana_grup_kodu: 'ana_grup', klasman_kodu: 'klasman', kumas_turu_kodu: 'kumas_turu',
  kumas_grubu_kodu: 'kumas_grubu', cinsiyet_yas_kodu: 'cinsiyet_yas', kalite_kodu: 'kalite',
}

/**
 * Model adı → künye. Kodlar KATALOGDAN; betik başlarken hepsini doğrular.
 *
 * BAZI ALANLAR BİLEREK BOŞ: örme bir tişörtün `ana_grup`u DOKUMA_UST
 * değildir ve katalogda örme karşılığı yok. Zorla doldurmak yanlış veri
 * üretirdi; boş bırakmak ayrıca ekranın "künye boş" durumunu da gösteriyor.
 */
const ESLEME = [
  { desen: /polo/i,              kunye: [null, 'T_SHIRT', 'PENYE', 'ORME', 'ERKEK', 'CASUAL_TRENDY'] },
  { desen: /gömlek|gomlek/i,     kunye: ['DOKUMA_UST', 'GOMLEK', 'POPLIN', 'DOKUMA', 'ERKEK', 'PREMIUM_KLASIK'] },
  { desen: /elbise/i,            kunye: [null, 'ELBISE', 'INTERLOK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /hırka|hirka/i,       kunye: ['DIS_GIYIM', 'HIRKA', 'SELANIK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /şort|sort/i,         kunye: [null, 'SORT', 'GABARDIN', 'DOKUMA', 'ERKEK', 'CASUAL_TRENDY'] },
  { desen: /sweat/i,             kunye: [null, 'MODELLI_UST', 'SELANIK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /bluz/i,              kunye: ['DOKUMA_UST', 'BLUZ', 'VISKON', 'DOKUMA', 'KADIN', 'MODEST'] },
  { desen: /chino|pantolon|pnatolon/i, kunye: ['DOKUMA_ALT', 'PANTOLON', 'GABARDIN', 'DOKUMA', 'ERKEK', 'STANDART_VISION'] },
]

/* Desen sırası önemli: "Sweat Şort" hem şort hem sweat deseniyle eşleşir;
   şort önce gelsin ki klasman SORT olsun. */
function kunyeBul(modelAdi) {
  if (!modelAdi) return null
  for (const e of ESLEME) if (e.desen.test(modelAdi)) return e.kunye
  return null
}

/**
 * Örnek iş emirleri.
 *
 * `yerlestir: 'uygun'`   → künyenin BÜTÜN izlenen boyutlarını karşılayan
 *   atölyeye bağlanır. Yalnız klasmana bakmak YETMİYOR: uyum künyenin her
 *   boyutuna bakar, klasmanı tutup kumaş türü tutmayan atölye yine kırmızı
 *   çıkar — ilk sürümde tam bu yüzden her şey uyumsuz görünüyordu.
 * `yerlestir: 'uyumsuz'` → künyeyi karşılamayan atölyeye bağlanır ki uyarı
 *   rozeti ekranda gerçekten görünsün.
 * `yerlestir: null`      → HAVUZDA kalır; planlamacı sürükleyip uyumu canlı
 *   görsün.
 */
const ORNEK_EMIRLER = [
  { no: '001', model: 'Erkek Chino Pantolon', musteri: 'LC Waikiki', adet: 12000, gun: 45, yerlestir: 'uygun' },
  { no: '002', model: 'Klasik Gömlek',        musteri: 'Koton',      adet: 8000,  gun: 38, yerlestir: 'uygun' },
  { no: '003', model: 'Erkek Şort',           musteri: 'Defacto',    adet: 15000, gun: 52, yerlestir: 'uygun' },
  { no: '004', model: 'Kadın Bluz',           musteri: 'Mavi',       adet: 6000,  gun: 30, yerlestir: 'uyumsuz' },
  { no: '005', model: 'Erkek Chino Pantolon', musteri: 'Mudo',       adet: 20000, gun: 60, yerlestir: null },
  { no: '006', model: 'Klasik Gömlek',        musteri: 'Network',    adet: 5000,  gun: 25, yerlestir: null },
]

const TASLAK_ADI = `${TASLAK_ONEK}Plan`

function tarihEkle(gun) {
  const d = new Date()
  d.setDate(d.getDate() + gun)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const sql = postgres(env.DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

try {
  /* ---- Hedef kiracı: kullanıcıların bulunduğu yer ---- */
  const [kiraci] = await sql`
    SELECT t.id, t.slug, count(tu.user_id)::int AS kullanici
      FROM tenant t LEFT JOIN tenant_user tu ON tu.tenant_id = t.id
     GROUP BY t.id, t.slug ORDER BY kullanici DESC LIMIT 1`
  console.log(`Hedef kiracı: ${kiraci.slug} (${kiraci.kullanici} kullanıcı)\n`)

  /* ---- Kod doğrulaması ---- */
  const katalog = await sql`
    SELECT d.code AS boyut, v.code
      FROM capability_value v JOIN capability_dimension d ON d.id = v.dimension_id`
  const gecerli = new Set(katalog.map((r) => `${r.boyut}|${r.code}`))
  const kotu = []
  for (const e of ESLEME) {
    e.kunye.forEach((deger, i) => {
      if (deger === null) return
      if (!gecerli.has(`${BOYUT[KOLONLAR[i]]}|${deger}`)) kotu.push(`${e.desen} → ${deger}`)
    })
  }
  if (kotu.length > 0) {
    console.error('✗ Katalogda olmayan kod — hiçbir şey yazılmadı:')
    kotu.forEach((k) => console.error('   ', k))
    process.exit(1)
  }
  console.log(`✓ ${ESLEME.length} eşleme kuralının kodları katalogda doğrulandı\n`)

  /* Yetenek kataloğunda GERÇEKTEN izlenen boyutlar. Künyede olup burada
     geçmeyen boyut (kalite) atölye aramasında kullanılamaz — kullanılsaydı
     hiçbir atölye eşleşmezdi. */
  const izlenenBoyutlar = new Set(
    (await sql`SELECT DISTINCT dimension_code FROM line_capability`)
      .map((r) => r.dimension_code))

  /* ================= TEMİZLE ================= */
  if (TEMIZLE) {
    const taslaklar = await sql`
      DELETE FROM plan_taslak WHERE ad LIKE ${TASLAK_ONEK + '%'} RETURNING id`
    const emirler = await sql`
      DELETE FROM work_order WHERE is_emri_no LIKE ${ORNEK_ONEK + '%'} RETURNING id`

    /* Künye: yalnız betiğin yazacağıyla birebir aynıysa boşalt. */
    const kalanlar = await sql`
      SELECT id, model_adi, ana_grup_kodu, klasman_kodu, kumas_turu_kodu,
             kumas_grubu_kodu, cinsiyet_yas_kodu, kalite_kodu
        FROM work_order`
    let temizlenen = 0, korunan = 0
    for (const w of kalanlar) {
      const k = kunyeBul(w.model_adi)
      if (!k) continue
      const birebir = KOLONLAR.every((c, i) => (w[c] ?? null) === k[i])
      const hepsiBos = KOLONLAR.every((c) => w[c] === null)
      if (birebir) {
        temizlenen++
        await sql`
          UPDATE work_order SET ana_grup_kodu=NULL, klasman_kodu=NULL, kumas_turu_kodu=NULL,
            kumas_grubu_kodu=NULL, cinsiyet_yas_kodu=NULL, kalite_kodu=NULL, updated_at=now()
          WHERE id = ${w.id}`
      } else if (!hepsiBos) korunan++
    }

    console.log(`Silinen örnek taslak   : ${taslaklar.length}`)
    console.log(`Silinen örnek iş emri  : ${emirler.length}`)
    console.log(`Künyesi temizlenen     : ${temizlenen}`)
    console.log(`KORUNDU (elle düzenlenmiş): ${korunan}`)
    await sql.end()
    process.exit(0)
  }

  /* ================= UYGULA / KURU ================= */

  /* ---- 1) Mevcut iş emirlerine künye ---- */
  const mevcutlar = await sql`
    SELECT id, is_emri_no, model_adi, ana_grup_kodu, klasman_kodu, kumas_turu_kodu,
           kumas_grubu_kodu, cinsiyet_yas_kodu, kalite_kodu
      FROM work_order WHERE tenant_id = ${kiraci.id} ORDER BY id`
  let kunyeYazilan = 0, kunyeAtlanan = 0
  for (const w of mevcutlar) {
    const k = kunyeBul(w.model_adi)
    if (!k) continue
    if (!KOLONLAR.every((c) => w[c] === null)) { kunyeAtlanan++; continue }
    kunyeYazilan++
    if (UYGULA) {
      await sql`
        UPDATE work_order SET
          ana_grup_kodu=${k[0]}, klasman_kodu=${k[1]}, kumas_turu_kodu=${k[2]},
          kumas_grubu_kodu=${k[3]}, cinsiyet_yas_kodu=${k[4]}, kalite_kodu=${k[5]},
          updated_at=now()
        WHERE id = ${w.id}`
    }
  }
  console.log(`Mevcut iş emrine künye ${UYGULA ? 'yazıldı' : 'yazılacak'}: ${kunyeYazilan} (atlanan ${kunyeAtlanan})`)

  /* ---- 2) Örnek iş emirleri ---- */
  const varOlan = new Set(
    (await sql`SELECT is_emri_no FROM work_order WHERE is_emri_no LIKE ${ORNEK_ONEK + '%'}`)
      .map((r) => r.is_emri_no))

  let emirYazilan = 0
  const yeniIdler = []
  for (const e of ORNEK_EMIRLER) {
    const no = ORNEK_ONEK + e.no
    if (varOlan.has(no)) continue
    const k = kunyeBul(e.model)

    /* Künyenin İZLENEN her boyutunu karşılayan atölye ara — yalnız
       klasmana bakmak yetmez, uyum her boyuta bakıyor. */
    const boyutlar = []
    const degerler = []
    KOLONLAR.forEach((kol, i) => {
      if (k[i] !== null && izlenenBoyutlar.has(BOYUT[kol])) {
        boyutlar.push(BOYUT[kol])
        degerler.push(k[i])
      }
    })

    let atolye = null
    if (e.yerlestir === 'uygun') {
      const [a] = await sql`
        SELECT w.id, w.name, pl.id AS line_id, pl.daily_target
          FROM workshop w
          JOIN production_line pl ON pl.workshop_id = w.id AND pl.is_active AND pl.daily_target > 0
         WHERE w.tenant_id = ${kiraci.id} AND w.is_active
           AND w.id IN (
                 SELECT p2.workshop_id FROM line_capability lc
                   JOIN production_line p2 ON p2.id = lc.line_id
                   JOIN unnest(${boyutlar}::text[], ${degerler}::text[]) AS f(d, v)
                     ON f.d = lc.dimension_code AND f.v = lc.value_code
                  GROUP BY p2.workshop_id
                 HAVING count(DISTINCT lc.dimension_code) = ${boyutlar.length})
         ORDER BY pl.daily_target DESC LIMIT 1`
      atolye = a ?? null
      if (!atolye) console.log(`     (${no}: künyeyi tam karşılayan atölye yok, havuzda kalıyor)`)
    } else if (e.yerlestir === 'uyumsuz') {
      /* Künyeyi karşılamayan ama klasman kaydı OLAN atölye: uyarı rozeti
         görünsün diye. Kaydı hiç olmayan atölye "kontrol edilemedi" derdi. */
      const [a] = await sql`
        SELECT w.id, w.name, pl.id AS line_id
          FROM workshop w
          JOIN production_line pl ON pl.workshop_id = w.id AND pl.is_active AND pl.daily_target > 0
         WHERE w.tenant_id = ${kiraci.id} AND w.is_active
           AND EXISTS (SELECT 1 FROM line_capability lc
                         JOIN production_line p3 ON p3.id = lc.line_id
                        WHERE p3.workshop_id = w.id AND lc.dimension_code = 'klasman')
           AND w.id NOT IN (
                 SELECT p2.workshop_id FROM line_capability lc
                   JOIN production_line p2 ON p2.id = lc.line_id
                   JOIN unnest(${boyutlar}::text[], ${degerler}::text[]) AS f(d, v)
                     ON f.d = lc.dimension_code AND f.v = lc.value_code
                  GROUP BY p2.workshop_id
                 HAVING count(DISTINCT lc.dimension_code) = ${boyutlar.length})
         ORDER BY pl.daily_target DESC LIMIT 1`
      atolye = a ?? null
    }

    emirYazilan++
    console.log(`  ${no}  ${e.model.padEnd(22)} ${e.adet.toString().padStart(6)} adet  → ` +
      (atolye ? `${atolye.name} (bant ${atolye.line_id})` : 'HAVUZDA'))

    if (UYGULA) {
      const [row] = await sql`
        INSERT INTO work_order
          (tenant_id, is_emri_no, model_adi, musteri, siparis_miktari, teslim_tarihi,
           durum, workshop_id, line_id,
           ana_grup_kodu, klasman_kodu, kumas_turu_kodu, kumas_grubu_kodu,
           cinsiyet_yas_kodu, kalite_kodu)
        VALUES (${kiraci.id}, ${no}, ${e.model}, ${e.musteri}, ${e.adet},
                ${tarihEkle(e.gun)}::date,
                ${atolye ? 'Planlandi' : 'Bekleniyor'},
                ${atolye?.id ?? null}, ${atolye?.line_id ?? null},
                ${k[0]}, ${k[1]}, ${k[2]}, ${k[3]}, ${k[4]}, ${k[5]})
        RETURNING id`
      yeniIdler.push({ id: row.id, atolye })
    }
  }
  console.log(`Örnek iş emri ${UYGULA ? 'eklendi' : 'eklenecek'}: ${emirYazilan}`)

  /* ---- 3) Örnek plan taslağı ---- */
  const [taslakVar] = await sql`SELECT id FROM plan_taslak WHERE ad = ${TASLAK_ADI}`
  if (taslakVar) {
    console.log('Örnek taslak zaten var, atlandı.')
  } else if (UYGULA) {
    const [t] = await sql`
      INSERT INTO plan_taslak (tenant_id, ad, aciklama)
      VALUES (${kiraci.id}, ${TASLAK_ADI},
              'Gösterim için oluşturuldu — seed_ornek_veri.mjs --temizle ile kalkar')
      RETURNING id`
    let kalem = 0
    for (const y of yeniIdler) {
      if (!y.atolye) continue
      const [wo] = await sql`SELECT siparis_miktari FROM work_order WHERE id = ${y.id}`
      await sql`
        INSERT INTO plan_taslak_kalem
          (taslak_id, tenant_id, work_order_id, workshop_id, line_id, baslangic, adet)
        VALUES (${t.id}, ${kiraci.id}, ${y.id}, ${y.atolye.id}, ${y.atolye.line_id},
                ${tarihEkle(7)}::date, ${wo.siparis_miktari})
        ON CONFLICT DO NOTHING`
      kalem++
    }
    console.log(`Örnek taslak oluşturuldu: "${TASLAK_ADI}" (${kalem} yerleştirme)`)
  } else {
    console.log(`Örnek taslak oluşturulacak: "${TASLAK_ADI}"`)
  }

  if (!UYGULA) {
    console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  } else {
    console.log('\nBU VERİ SANALDIR. Canlıya geçmeden önce:')
    console.log('  node scripts/seed_ornek_veri.mjs --temizle')
  }
} finally {
  await sql.end()
}
