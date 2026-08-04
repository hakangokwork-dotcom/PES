#!/usr/bin/env node
/**
 * "Atölye isimleri.xlsx" -> workshop_profil_staging / workshop_profil / workshop_denetim
 *
 * NEDEN VAR: tedarik ekibinin künye tablosunda WKYS ve sosyal uygunluk
 * denetim tarihleri, puan/sınıf, FKU, tedarik müdürlüğü gibi alanlar var.
 * Bunlar sistemde yoktu; "hangi atölyenin denetimi yaklaşıyor" sorusu
 * elle Excel açmadan cevaplanamıyordu.
 *
 * ZORLUK: Excel resmi ünvan ("AKKUŞ PAZARLAMA VE TEKSTİL SAN.TİC.LTD.ŞTİ"),
 * sistem kısa ad ("AKKUŞ TEKSTİL") tutuyor. Birebir eşleşen çok az. Bu
 * yüzden jeton (kelime) örtüşmesiyle eşleştirilir ve SADECE tereddütsüz
 * olanlar otomatik işlenir; gerisi inceleme dosyasına gider —
 * yanlış atölyeye denetim tarihi yazmak, boş bırakmaktan kötüdür.
 *
 *   node scripts/import_atolye_profil.mjs              # kuru çalışma
 *   node scripts/import_atolye_profil.mjs --uygula     # DB'ye yazar
 *   node scripts/import_atolye_profil.mjs --dosya=...  # başka bir xlsx
 *
 * Kuru çalışmada da inceleme dosyası üretilir. Tekrar çalıştırılabilir:
 * staging (kaynak_dosya, satir_no), profil (workshop_id), denetim
 * (workshop_id, tip, tarih) üzerinden upsert eder.
 */
import xlsx from 'xlsx'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import {
  K, metin, jetonlar, kayitlariOku, profilAlanlari, denetimleriCikar, envOku,
} from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const UYGULA = process.argv.includes('--uygula')
const DOSYA = arg('dosya', 'C:/Users/bhaka/Downloads/Atölye isimleri.xlsx')
const INCELEME_CIKTI = arg('inceleme', join(__dir, '../atolye_eslestirme_incelemesi.xlsx'))

const env = envOku(join(__dir, '../.env.local'))
const { sayfa, kayitlar } = kayitlariOku(DOSYA)
console.log(`${basename(DOSYA)} / ${sayfa}: ${kayitlar.length} satır`)

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const [tenant] = await sql`SELECT id FROM tenant WHERE slug = 'default'`
if (!tenant) { console.error('default tenant bulunamadı'); await sql.end(); process.exit(1) }

const atolyeler = await sql`
  SELECT id, code, name FROM workshop WHERE tenant_id = ${tenant.id} ORDER BY name`
console.log(`DB (default tenant): ${atolyeler.length} atölye`)

/* ---- Eşleştirme ---- */
const skor = (dbJ, exJ) => (dbJ.length ? dbJ.filter((t) => exJ.includes(t)).length / dbJ.length : 0)

const sonuc = []
for (const a of atolyeler) {
  const dbJ = jetonlar(a.name)
  const puanli = kayitlar
    .map((k) => ({ k, sAd: skor(dbJ, k.jetonAd), sTum: skor(dbJ, k.jetonTum) }))
    .filter((x) => x.sTum > 0)
    .sort((x, y) => (y.sAd - x.sAd) || (y.sTum - x.sTum) || (y.k.degisiklik - x.k.degisiklik))

  const tam = puanli.filter((x) => x.sTum === 1)
  const tamKodlar = new Set(tam.map((x) => x.k.tkod ?? `satir:${x.k.satirNo}`))
  const enIyi = puanli[0]

  // KESİN olmanın üç şartı: tam örtüşme, tek tüzel kişilik, ve eşleşme
  // asıl ad alanından gelmiş olmalı. Tek kelimelik atölye adları yalnız
  // ünvandan eşleşiyorsa (ör. sahibin soyadı) otomatik kabul edilmez.
  const kesinMi = enIyi && enIyi.sTum === 1 && tamKodlar.size === 1 &&
                  (enIyi.sAd === 1 || dbJ.length >= 2)

  sonuc.push({
    atolye: a,
    dbJetonlar: dbJ,
    adaylar: puanli.slice(0, 3),
    tumEslesenler: enIyi ? puanli.filter((x) => x.sTum === enIyi.sTum) : [],
    durum: !enIyi || enIyi.sTum < 0.5 ? 'yok' : kesinMi ? 'kesin' : 'inceleme',
  })
}

const kesinler = sonuc.filter((s) => s.durum === 'kesin')
const incelemeler = sonuc.filter((s) => s.durum !== 'kesin')
console.log(`Eşleştirme: kesin=${kesinler.length}  inceleme=${incelemeler.filter((s) => s.durum === 'inceleme').length}  yok=${sonuc.filter((s) => s.durum === 'yok').length}`)

/* Profil kaynağı: eşleşenler arasında en güncel, eşitlikte en dolu satır. */
const enIyiSatir = (esler) => [...esler]
  .sort((x, y) => (y.k.degisiklik - x.k.degisiklik) || (y.k.doluluk - x.k.doluluk))[0].k

const planlanan = kesinler.map((s) => {
  const esler = s.tumEslesenler.length ? s.tumEslesenler : s.adaylar
  return {
    atolye: s.atolye,
    kaynak: enIyiSatir(esler),
    denetimler: denetimleriCikar(esler.map((x) => x.k)),
  }
})
const denetimToplam = planlanan.reduce((n, p) => n + p.denetimler.length, 0)
console.log(`Yazılacak: ${planlanan.length} profil, ${denetimToplam} denetim kaydı, ${kayitlar.length} staging satırı`)

/* Eşleşen satır -> workshop haritası (staging için) */
const satirEslesme = new Map()
for (const s of kesinler) {
  for (const { k, sTum } of (s.tumEslesenler.length ? s.tumEslesenler : s.adaylar)) {
    satirEslesme.set(k.satirNo, { id: s.atolye.id, yontem: 'kesin', skor: sTum })
  }
}

if (!UYGULA) {
  console.log('\n--- KURU ÇALIŞMA (--uygula ile yazılır) ---')
  planlanan.slice(0, 5).forEach((p) => console.log(
    `  ${p.atolye.code.padEnd(9)} ${p.atolye.name.slice(0, 28).padEnd(29)} <- ${String(p.kaynak.ad).slice(0, 40)} (${p.denetimler.length} denetim)`
  ))
} else {
  const kaynakAd = basename(DOSYA)
  await sql.begin(async (tx) => {
    await tx`DELETE FROM workshop_profil_staging WHERE kaynak_dosya = ${kaynakAd}`
    for (const k of kayitlar) {
      const e = satirEslesme.get(k.satirNo) ?? null
      const r = k.ham
      await tx`INSERT INTO workshop_profil_staging ${tx({
        tenant_id: tenant.id, kaynak_dosya: kaynakAd, satir_no: k.satirNo,
        atolye_adi: metin(r[K.ad]), bw_atolye_adi: metin(r[K.bw]), t_kod: metin(r[K.tkod]),
        odito_adi: metin(r[K.odito]), atolye_unvani: metin(r[K.unvan]),
        bant_sayisi: metin(r[K.bant]), inspection: metin(r[K.inspection]),
        calisma_sekli: metin(r[K.calismaSekli]), aktiflik: metin(r[K.aktiflik]),
        uretim_tipi: metin(r[K.uretimTipi]), tedarik_mudurlugu: metin(r[K.tedarik]),
        bolge: metin(r[K.bolge]), il: metin(r[K.il]), ilce: metin(r[K.ilce]),
        teknik_mudur: metin(r[K.teknikMudur]), fku: metin(r[K.fku]),
        subjektif_sinif: metin(r[K.subjektif]), aylik_kapasite: metin(r[K.aylikKapasite]),
        on_uretim_numunesi: metin(r[K.onUretim]), yetkili_kisi: metin(r[K.yetkili]),
        telefon: metin(r[K.telefon]), eposta: metin(r[K.eposta]),
        calisan_sayisi: metin(r[K.calisan]), wkys_tarih: metin(r[K.wkysTarih]),
        wkys_puan: metin(r[K.wkysPuan]), wkys_sinif: metin(r[K.wkysSinif]),
        sosyal_tarih: metin(r[K.sosyalTarih]), sosyal_puan: metin(r[K.sosyalPuan]),
        sosyal_sinif: metin(r[K.sosyalSinif]), calisan_sayisi_alt: metin(r[K.calisanAlt]),
        is_ortakligi_leveli: metin(r[K.isOrtakligi]), aylik_gider: metin(r[K.aylikGider]),
        risk_seviyesi: metin(r[K.risk]), ozel_not: metin(r[K.ozelNot]),
        kullanici: metin(r[K.kullanici]), degisiklik_zamani: metin(r[K.degisiklik]),
        kapasite_tipi: metin(r[K.kapasiteTipi]),
        eslesen_workshop_id: e?.id ?? null,
        eslesme_yontemi: e?.yontem ?? 'yok',
        eslesme_skoru: e?.skor ?? null,
      })}`
    }

    for (const p of planlanan) {
      await tx`
        INSERT INTO workshop_profil ${tx({
          workshop_id: p.atolye.id, tenant_id: tenant.id,
          ...profilAlanlari(p.kaynak),
          eslesme_yontemi: 'kesin', data_confidence: 'yuksek',
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
          kaynak_satir = EXCLUDED.kaynak_satir, updated_at = now()`

      for (const d of p.denetimler) {
        await tx`
          INSERT INTO workshop_denetim ${tx({
            workshop_id: p.atolye.id, tenant_id: tenant.id,
            tip: d.tip, tarih: d.tarih, puan: d.puan, sinif: d.sinif,
            kaynak: `${kaynakAd}#${p.kaynak.satirNo}`,
          })}
          ON CONFLICT (workshop_id, tip, tarih) DO UPDATE SET
            puan  = COALESCE(EXCLUDED.puan,  workshop_denetim.puan),
            sinif = COALESCE(EXCLUDED.sinif, workshop_denetim.sinif)`
      }
    }
  })
  console.log('✓ Yazıldı.')
}

/* ---- İNCELEME DOSYASI ---- */
const incelemeSatirlari = incelemeler.map((s) => {
  const sut = (i) => {
    const x = s.adaylar[i]
    return x
      ? { ad: x.k.ad ?? '', kod: x.k.tkod ?? '', skor: x.sTum.toFixed(2), satir: x.k.satirNo }
      : { ad: '', kod: '', skor: '', satir: '' }
  }
  const [a1, a2, a3] = [sut(0), sut(1), sut(2)]
  return {
    'ATÖLYE KODU': s.atolye.code,
    'SİSTEMDEKİ AD': s.atolye.name,
    'DURUM': s.durum === 'yok' ? 'ADAY YOK' : 'BELİRSİZ',
    'SEÇİM (1/2/3 veya YOK)': '',
    'ADAY 1': a1.ad, 'ADAY 1 KOD': a1.kod, 'ADAY 1 SKOR': a1.skor, 'ADAY 1 SATIR': a1.satir,
    'ADAY 2': a2.ad, 'ADAY 2 KOD': a2.kod, 'ADAY 2 SKOR': a2.skor, 'ADAY 2 SATIR': a2.satir,
    'ADAY 3': a3.ad, 'ADAY 3 KOD': a3.kod, 'ADAY 3 SKOR': a3.skor, 'ADAY 3 SATIR': a3.satir,
    'EŞLEŞEN KELİMELER': s.dbJetonlar.join(' '),
  }
})

const cwb = xlsx.utils.book_new()
const cws = xlsx.utils.json_to_sheet(incelemeSatirlari)
cws['!cols'] = [
  { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 22 },
  { wch: 42 }, { wch: 12 }, { wch: 11 }, { wch: 12 },
  { wch: 42 }, { wch: 12 }, { wch: 11 }, { wch: 12 },
  { wch: 42 }, { wch: 12 }, { wch: 11 }, { wch: 12 },
  { wch: 28 },
]
xlsx.utils.book_append_sheet(cwb, cws, 'Inceleme')
xlsx.writeFile(cwb, INCELEME_CIKTI)
console.log(`İnceleme dosyası: ${INCELEME_CIKTI} (${incelemeSatirlari.length} satır)`)

await sql.end({ timeout: 5 })
