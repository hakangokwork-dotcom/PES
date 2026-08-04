#!/usr/bin/env node
/**
 * Doldurulmuş inceleme dosyasını işler.
 *
 * import_atolye_profil.mjs tereddütsüz eşleşmeleri otomatik yazar; şüpheli
 * olanları atolye_eslestirme_incelemesi.xlsx dosyasına döker. Siz "SEÇİM"
 * kolonunu doldurup bu scripti çalıştırırsınız.
 *
 * SEÇİM kolonuna yazılabilecekler:
 *   1 / 2 / 3   -> o adayın satırı kullanılır
 *   S412        -> doğrudan kaynak Excel'in 412. satırı (adaylarda yoksa)
 *   YOK / boş   -> atlanır, atölye profilsiz kalır
 *
 *   node scripts/eslestirme_uygula.mjs            # ne yapacağını yazar
 *   node scripts/eslestirme_uygula.mjs --uygula   # DB'ye yazar
 *
 * Bu yolla gelen kayıtlar eslesme_yontemi='inceleme', data_confidence='orta'
 * damgası alır — otomatik eşleşmelerden ayırt edilebilsinler diye.
 */
import xlsx from 'xlsx'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { kayitlariOku, profilAlanlari, denetimleriCikar, envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const UYGULA = process.argv.includes('--uygula')
const KAYNAK = arg('dosya', 'C:/Users/bhaka/Downloads/Atölye isimleri.xlsx')
const INCELEME = arg('inceleme', join(__dir, '../atolye_eslestirme_incelemesi.xlsx'))

if (!existsSync(INCELEME)) {
  console.error(`İnceleme dosyası yok: ${INCELEME}`)
  console.error('Önce: node scripts/import_atolye_profil.mjs')
  process.exit(1)
}

const env = envOku(join(__dir, '../.env.local'))
const { kayitlar } = kayitlariOku(KAYNAK)
const satirIndeks = new Map(kayitlar.map((k) => [k.satirNo, k]))

const iwb = xlsx.readFile(INCELEME)
const incelemeSatirlari = xlsx.utils.sheet_to_json(iwb.Sheets[iwb.SheetNames[0]], { defval: '' })
console.log(`İnceleme dosyası: ${incelemeSatirlari.length} satır`)

/** SEÇİM hücresini kaynak Excel satır numarasına çevirir. */
function secimiCoz(satir) {
  const ham = String(satir['SEÇİM (1/2/3 veya YOK)'] ?? '').trim().toLocaleUpperCase('tr-TR')
  if (!ham || ham === 'YOK' || ham === 'HAYIR' || ham === '-') return null

  const dogrudan = ham.match(/^S\s*(\d+)$/)
  if (dogrudan) return { satirNo: parseInt(dogrudan[1], 10), kaynak: 'dogrudan' }

  if (['1', '2', '3'].includes(ham)) {
    const no = parseInt(String(satir[`ADAY ${ham} SATIR`] ?? ''), 10)
    return Number.isFinite(no) ? { satirNo: no, kaynak: `aday${ham}` } : null
  }
  return { hata: `anlaşılmayan seçim: "${ham}"` }
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const [tenant] = await sql`SELECT id FROM tenant WHERE slug = 'default'`
const atolyeler = await sql`
  SELECT id, code, name FROM workshop WHERE tenant_id = ${tenant.id}`
const kodIndeks = new Map(atolyeler.map((a) => [a.code, a]))

const planlanan = []
const hatalar = []
let atlanan = 0

for (const satir of incelemeSatirlari) {
  const kod = String(satir['ATÖLYE KODU'] ?? '').trim()
  const secim = secimiCoz(satir)
  if (!secim) { atlanan++; continue }
  if (secim.hata) { hatalar.push(`${kod}: ${secim.hata}`); continue }

  const atolye = kodIndeks.get(kod)
  if (!atolye) { hatalar.push(`${kod}: bu kodda atölye yok`); continue }

  const kayit = satirIndeks.get(secim.satirNo)
  if (!kayit) { hatalar.push(`${kod}: kaynak Excel'de ${secim.satirNo}. satır yok`); continue }

  planlanan.push({ atolye, kayit, kaynak: secim.kaynak })
}

console.log(`Seçilmiş: ${planlanan.length}  ·  atlanan (YOK/boş): ${atlanan}  ·  hatalı: ${hatalar.length}`)
if (hatalar.length) {
  console.log('\nHATALAR:')
  hatalar.forEach((h) => console.log('  ✗', h))
}

if (!planlanan.length) {
  console.log('\nİşlenecek seçim yok. SEÇİM kolonunu doldurup tekrar çalıştırın.')
  await sql.end({ timeout: 5 })
  process.exit(hatalar.length ? 1 : 0)
}

console.log('\nEŞLEŞTİRİLECEK:')
planlanan.forEach((p) => {
  const d = denetimleriCikar([p.kayit])
  console.log(`  ${p.atolye.code.padEnd(9)} ${p.atolye.name.slice(0, 28).padEnd(29)} <- ` +
              `${String(p.kayit.ad).slice(0, 42)} (satır ${p.kayit.satirNo}, ${d.length} denetim)`)
})

if (!UYGULA) {
  console.log('\n--- KURU ÇALIŞMA --- (--uygula ile yazılır)')
  await sql.end({ timeout: 5 })
  process.exit(0)
}

const kaynakAd = basename(KAYNAK)
await sql.begin(async (tx) => {
  for (const p of planlanan) {
    await tx`
      INSERT INTO workshop_profil ${tx({
        workshop_id: p.atolye.id, tenant_id: tenant.id,
        ...profilAlanlari(p.kayit),
        eslesme_yontemi: 'inceleme', data_confidence: 'orta',
      })}
      ON CONFLICT (workshop_id) DO UPDATE SET
        t_kod = EXCLUDED.t_kod, bw_atolye_adi = EXCLUDED.bw_atolye_adi,
        odito_adi = EXCLUDED.odito_adi, atolye_unvani = EXCLUDED.atolye_unvani,
        tedarik_mudurlugu = EXCLUDED.tedarik_mudurlugu, teknik_mudur = EXCLUDED.teknik_mudur,
        fku = EXCLUDED.fku, yetkili_kisi = EXCLUDED.yetkili_kisi,
        calisma_sekli = EXCLUDED.calisma_sekli, uretim_tipi = EXCLUDED.uretim_tipi,
        inspection = EXCLUDED.inspection, kapasite_tipi = EXCLUDED.kapasite_tipi,
        on_uretim_numunesi = EXCLUDED.on_uretim_numunesi,
        subjektif_sinif = EXCLUDED.subjektif_sinif,
        is_ortakligi_leveli = EXCLUDED.is_ortakligi_leveli,
        risk_seviyesi = EXCLUDED.risk_seviyesi,
        bolge_ad = EXCLUDED.bolge_ad, bant_sayisi = EXCLUDED.bant_sayisi,
        aylik_kapasite = EXCLUDED.aylik_kapasite, calisan_sayisi = EXCLUDED.calisan_sayisi,
        calisan_sayisi_alt = EXCLUDED.calisan_sayisi_alt, ozel_not = EXCLUDED.ozel_not,
        kaynak_satir = EXCLUDED.kaynak_satir,
        eslesme_yontemi = 'inceleme', data_confidence = 'orta', updated_at = now()`

    for (const d of denetimleriCikar([p.kayit])) {
      await tx`
        INSERT INTO workshop_denetim ${tx({
          workshop_id: p.atolye.id, tenant_id: tenant.id,
          tip: d.tip, tarih: d.tarih, puan: d.puan, sinif: d.sinif,
          kaynak: `${kaynakAd}#${p.kayit.satirNo} (inceleme)`,
        })}
        ON CONFLICT (workshop_id, tip, tarih) DO UPDATE SET
          puan  = COALESCE(EXCLUDED.puan,  workshop_denetim.puan),
          sinif = COALESCE(EXCLUDED.sinif, workshop_denetim.sinif)`
    }

    // staging'de de izini bırak — hangi satırın hangi atölyeye bağlandığı
    // yalnız profilde değil, ham veride de görünsün.
    await tx`
      UPDATE workshop_profil_staging
         SET eslesen_workshop_id = ${p.atolye.id}, eslesme_yontemi = 'inceleme'
       WHERE kaynak_dosya = ${kaynakAd} AND satir_no = ${p.kayit.satirNo}`
  }
})

console.log(`\n✓ ${planlanan.length} atölye eşleştirildi.`)
await sql.end({ timeout: 5 })
