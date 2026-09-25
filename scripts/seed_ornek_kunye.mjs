#!/usr/bin/env node
/**
 * ÖRNEK künye tohumu — gösterim için, canlıdan KALDIRILMAK üzere.
 *
 *   node scripts/seed_ornek_kunye.mjs              kuru çalışma (hiçbir şey yazmaz)
 *   node scripts/seed_ornek_kunye.mjs --uygula     yazar
 *   node scripts/seed_ornek_kunye.mjs --temizle    geri alır
 *   node scripts/seed_ornek_kunye.mjs --tum-kiracilar   default kiracıyı da kapsa
 *
 * NEDEN BETİK, NEDEN DOĞRUDAN SQL DEĞİL: bu veri sanaldır ve canlıya
 * geçmeden önce silinmek zorunda — arkadaşlar gerçek künyeyi girsin diye.
 * Elle yazılan bir UPDATE'in geri alınması "hangi satıra ne yazmıştım"
 * sorusuna dayanır; betik bunu deterministik hâle getiriyor.
 *
 * İKİ KORUMA:
 *
 *   1. YALNIZ KÜNYESİ TAMAMEN BOŞ satır doldurulur. Gerçek veri asla
 *      ezilmez; betiği ikinci kez çalıştırmak da bir şeyi bozmaz.
 *
 *   2. TEMİZLERKEN yalnız BU BETİĞİN yazacağı değerlerle BİREBİR aynı
 *      olan satır boşaltılır. Biri bir alanı düzeltmişse o satıra
 *      dokunulmaz — "örneği sil" komutu gerçek veriyi silmemeli.
 *
 * VARSAYILAN OLARAK yalnız demo kiracısına yazar. `default` kiracıdaki
 * iş emirleri ekibin gerçek kayıtları; onlara uydurma künye yazmak,
 * tam da kaçınılması istenen şey.
 *
 * ATÖLYE YETENEĞİ TOHUMLANMIYOR — bilerek. Demo atölyelerinin yetenekleri
 * rastgele tohumlanmış ve tutarsız (Bursa Moda'nın klasmanı PANTOLON ama
 * kumaş grubu ORME); bu yüzden künye ne yazılsa uyum kırmızı çıkıyor.
 * Düzeltmek için line_capability'ye satır eklemek gerekirdi, ama
 * attribute_type CHECK'i yalnız 'PROFILE' ve 'ASSIGNED' kabul ediyor —
 * eklenen satırları işaretleyip temiz biçimde geri alamazdım. Paylaşılan
 * referans tablosuna, sonra çıkaramayacağım satır yazmaktansa uyumun
 * kırmızı görünmesi yeğdir; GERÇEK atölyelerde (default kiracı, 131
 * atölye, 3986 yetenek kaydı) veri tutarlı ve uyum anlamlı çalışıyor.
 */
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const UYGULA = process.argv.includes('--uygula')
const TEMIZLE = process.argv.includes('--temizle')
const TUM = process.argv.includes('--tum-kiracilar')

if (UYGULA && TEMIZLE) {
  console.error('--uygula ve --temizle birlikte verilemez')
  process.exit(1)
}

/* Künye kolonları — lib/pes/kunye.ts'teki KUNYE_BOYUTLARI ile aynı sıra. */
const KOLONLAR = [
  'ana_grup_kodu', 'klasman_kodu', 'kumas_turu_kodu',
  'kumas_grubu_kodu', 'cinsiyet_yas_kodu', 'kalite_kodu',
]

/**
 * Model adı → künye. Kodlar KATALOGDAN; uydurma kod yazılmaz, betik
 * başlarken hepsini doğrular.
 *
 * BAZI ALANLAR BİLEREK BOŞ. Örme bir tişörtün `ana_grup`u DOKUMA_UST
 * değildir ve katalogda örme karşılığı yok; zorla doldurmak yanlış veri
 * üretirdi. Boş bırakmak ayrıca ekranın "künye boş — kontrol edilemedi"
 * durumunu da gösteriyor.
 */
const ESLEME = [
  { desen: /polo/i,        kunye: [null, 'T_SHIRT', 'PENYE', 'ORME', 'ERKEK', 'CASUAL_TRENDY'] },
  { desen: /gömlek|gomlek/i, kunye: ['DOKUMA_UST', 'GOMLEK', 'POPLIN', 'DOKUMA', 'ERKEK', 'PREMIUM_KLASIK'] },
  { desen: /elbise/i,      kunye: [null, 'ELBISE', 'INTERLOK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /hırka|hirka/i, kunye: ['DIS_GIYIM', 'HIRKA', 'SELANIK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /chino/i,       kunye: ['DOKUMA_ALT', 'PANTOLON', 'GABARDIN', 'DOKUMA', 'ERKEK', 'STANDART_VISION'] },
  { desen: /şort|sort/i,   kunye: [null, 'SORT', 'SELANIK', 'ORME', 'ERKEK', 'CASUAL_TRENDY'] },
  { desen: /sweat/i,       kunye: [null, 'MODELLI_UST', 'SELANIK', 'ORME', 'KADIN', 'CASUAL_TRENDY'] },
  { desen: /bluz/i,        kunye: ['DOKUMA_UST', 'BLUZ', 'VISKON', 'DOKUMA', 'KADIN', 'MODEST'] },
  { desen: /pantolon|pnatolon/i, kunye: ['DOKUMA_ALT', 'PANTOLON', 'GABARDIN', 'DOKUMA', 'ERKEK', 'STANDART_VISION'] },
]

/* Desen sırası önemli: "Sweat Şort" hem şort hem sweat deseniyle eşleşir;
   önce şort gelsin ki klasman SORT olsun. */
function kunyeBul(modelAdi) {
  if (!modelAdi) return null
  for (const e of ESLEME) if (e.desen.test(modelAdi)) return e.kunye
  return null
}

const sql = postgres(env.DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

try {
  /* ---- Kodların katalogda GERÇEKTEN var olduğunu doğrula ---- */
  const BOYUT = {
    ana_grup_kodu: 'ana_grup', klasman_kodu: 'klasman', kumas_turu_kodu: 'kumas_turu',
    kumas_grubu_kodu: 'kumas_grubu', cinsiyet_yas_kodu: 'cinsiyet_yas', kalite_kodu: 'kalite',
  }
  const katalog = await sql`
    SELECT d.code AS boyut, v.code
      FROM capability_value v JOIN capability_dimension d ON d.id = v.dimension_id`
  const gecerli = new Set(katalog.map((r) => `${r.boyut}|${r.code}`))

  const kotu = []
  for (const e of ESLEME) {
    e.kunye.forEach((deger, i) => {
      if (deger === null) return
      const anahtar = `${BOYUT[KOLONLAR[i]]}|${deger}`
      if (!gecerli.has(anahtar)) kotu.push(`${e.desen} → ${anahtar}`)
    })
  }
  if (kotu.length > 0) {
    console.error('✗ Katalogda olmayan kod(lar) — hiçbir şey yazılmadı:')
    kotu.forEach((k) => console.error('   ', k))
    process.exit(1)
  }
  console.log(`✓ ${ESLEME.length} eşleme kuralının kodları katalogda doğrulandı\n`)

  /* ---- Hedef satırlar ---- */
  const emirler = await sql`
    SELECT wo.id, wo.is_emri_no, wo.model_adi, t.slug AS kiraci,
           wo.ana_grup_kodu, wo.klasman_kodu, wo.kumas_turu_kodu,
           wo.kumas_grubu_kodu, wo.cinsiyet_yas_kodu, wo.kalite_kodu
      FROM work_order wo
      LEFT JOIN tenant t ON t.id = wo.tenant_id
     ORDER BY wo.id`

  const hedefler = emirler.filter((w) => TUM || w.kiraci !== 'default')
  const atlananKiraci = emirler.length - hedefler.length

  let yazilacak = 0, atlananDolu = 0, eslesmeyen = 0, temizlenecek = 0, korunan = 0

  for (const w of hedefler) {
    const kunye = kunyeBul(w.model_adi)
    if (!kunye) { eslesmeyen++; continue }

    const mevcut = KOLONLAR.map((k) => w[k])
    const hepsiBos = mevcut.every((v) => v === null)
    const birebirAyni = KOLONLAR.every((k, i) => (w[k] ?? null) === kunye[i])

    if (TEMIZLE) {
      if (birebirAyni) {
        temizlenecek++
        if (UYGULA || TEMIZLE) {
          /* --temizle kendi başına yazar; kuru çalışma için ayrıca
             --uygula istemek kafa karıştırırdı. */
          await sql`
            UPDATE work_order SET
              ana_grup_kodu = NULL, klasman_kodu = NULL, kumas_turu_kodu = NULL,
              kumas_grubu_kodu = NULL, cinsiyet_yas_kodu = NULL, kalite_kodu = NULL,
              updated_at = now()
            WHERE id = ${w.id}`
        }
      } else if (!hepsiBos) {
        korunan++
      }
      continue
    }

    if (!hepsiBos) { atlananDolu++; continue }
    yazilacak++
    if (UYGULA) {
      await sql`
        UPDATE work_order SET
          ana_grup_kodu     = ${kunye[0]},
          klasman_kodu      = ${kunye[1]},
          kumas_turu_kodu   = ${kunye[2]},
          kumas_grubu_kodu  = ${kunye[3]},
          cinsiyet_yas_kodu = ${kunye[4]},
          kalite_kodu       = ${kunye[5]},
          updated_at = now()
        WHERE id = ${w.id}`
    }
    console.log(`  ${String(w.is_emri_no).padEnd(16)} ${String(w.model_adi).padEnd(24)} → ` +
      kunye.map((x) => x ?? '—').join(' / '))
  }

  console.log()
  if (TEMIZLE) {
    console.log(`Temizlendi   : ${temizlenecek} iş emri`)
    console.log(`KORUNDU      : ${korunan} iş emri (künyesi örnekten FARKLI — elle düzenlenmiş)`)
  } else {
    console.log(`Yazıl${UYGULA ? 'dı' : 'acak'}     : ${yazilacak} iş emri`)
    console.log(`Atlandı (dolu): ${atlananDolu}`)
  }
  console.log(`Eşleşmeyen model: ${eslesmeyen}`)
  if (atlananKiraci > 0) {
    console.log(`'default' kiracıda atlanan: ${atlananKiraci} (--tum-kiracilar ile kapsanır)`)
  }

  if (!UYGULA && !TEMIZLE) {
    console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  }
  if (UYGULA) {
    console.log('\nBU VERİ SANALDIR. Canlıya geçmeden önce:')
    console.log('  node scripts/seed_ornek_kunye.mjs --temizle')
  }
} finally {
  await sql.end()
}
