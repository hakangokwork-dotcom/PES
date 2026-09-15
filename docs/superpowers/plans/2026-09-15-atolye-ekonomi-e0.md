# Atölye Ekonomi E0 — Veri Omurgası Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Atolye_Gider_Model.xlsx`'in parametre, veri ve 37 rasyoluk hesap katmanını PES'e taşımak; 11 pilot atölyeyi içeri alıp Excel'e karşı doğrulamak.

**Architecture:** Gider verisi `monthly_expense`'te kalır (iki kolon eklenir). Giderde olmayan alanlar yeni `workshop_economy` tablosuna, parametreler dönem versiyonlu `economy_param`'a, ham anket `economy_survey_staging`'e gider. 37 rasyo SQL view'de değil, `lib/pes/ekonomi-hesap.ts` içinde saf TypeScript fonksiyonlarında hesaplanır — her formül tek tek test edilir ve Excel'in önbellekli değerleri fixture olarak referans alınır.

**Tech Stack:** Next.js 16 App Router, TypeScript, vitest, postgres.js, Supabase/PostgreSQL (RLS), xlsx (SheetJS), Tailwind 4.

**Tasarım dokümanı:** `docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md`

**Dal:** `feat/atolye-ekonomi`

---

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `lib/pes/ekonomi-tipler.ts` | Tip tanımları ve parametre varsayılanları. Başka hiçbir mantık yok. |
| `lib/pes/ekonomi-hesap.ts` | 37 rasyonun saf fonksiyonları. DB bilmez, I/O yapmaz. |
| `lib/pes/ekonomi-hesap.test.ts` | Formül testleri + 11 pilotun Excel'e karşı doğrulaması. |
| `lib/pes/ekonomi-akran.ts` | Medyan, yüzdelik, marj sırası, akran grubu seçimi. |
| `lib/pes/ekonomi-akran.test.ts` | Akran testleri. |
| `lib/pes/ekonomi-anket.ts` | Anket satırını aylara bölme mantığı. Saf fonksiyon. |
| `lib/pes/ekonomi-anket.test.ts` | Bölme testleri. |
| `lib/pes/__fixtures__/ekonomi-pilot.json` | Excel'den üretilen 11 pilotun girdi + beklenen çıktısı. |
| `lib/pes/expense-mapping.ts` | **Değişir** — iki yeni kolon ve Excel başlıkları. |
| `supabase/migrations/037_atolye_ekonomi.sql` | İki kolon + üç yeni tablo + RLS. |
| `scripts/ekonomi_fixture_uret.mjs` | Excel → fixture JSON. Tekrar çalıştırılabilir. |
| `scripts/import_ekonomi_anket.mjs` | Excel `VERI_GIRIS` → staging → aylara böl → DB. |
| `scripts/verify_ekonomi.mjs` | DB'deki rasyolar ile Excel `HESAP` karşılaştırması. |
| `app/pes/ekonomi/page.tsx` | Atölye × dönem rasyo tablosu. |
| `app/pes/ekonomi/[id]/page.tsx` | Tek atölye karnesi. |
| `app/pes/ekonomi/giris/page.tsx` | Aylık ekonomi satırı girişi. |
| `app/pes/ekonomi/parametre/page.tsx` | Dönem versiyonlu parametre düzenleme. |
| `components/pes/PesDevSidebar.tsx` | **Değişir** — Ekonomi bağlantıları. |

**Faz sırası:** Faz 1 (hesap çekirdeği, DB'siz) → Faz 2 (şema) → Faz 3 (import ve doğrulama) → Faz 4 (ekranlar). Faz 1 tek başına test edilebilir ve DB'ye hiç dokunmaz; bu yüzden önce gelir.

---

# FAZ 1 — Hesap çekirdeği

## Task 1: Excel'den fixture üret

**Files:**
- Create: `scripts/ekonomi_fixture_uret.mjs`
- Create: `lib/pes/__fixtures__/ekonomi-pilot.json` (script üretir)

Excel `VERI_GIRIS` (girdi) ve `HESAP` (Excel'in hesapladığı beklenen çıktı) sayfalarını okuyup tek bir JSON'a yazar. Testler bu JSON'u referans alır. Excel güncellenince script yeniden çalıştırılır.

- [ ] **Step 1: Script'i yaz**

```js
/**
 * Atolye_Gider_Model.xlsx → lib/pes/__fixtures__/ekonomi-pilot.json
 *
 * VERI_GIRIS = girdi, HESAP = Excel'in hesapladığı beklenen çıktı.
 * Excel'in önbelleğe aldığı formül sonuçları okunur (cellDates yok, raw değer).
 * Excel güncellenince bu script yeniden çalıştırılır ve testler yeni
 * referansa karşı koşar.
 *
 * Kullanım: node scripts/ekonomi_fixture_uret.mjs
 */
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const KAYNAK = 'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx'
const HEDEF = join(__dir, '../lib/pes/__fixtures__/ekonomi-pilot.json')

const wb = XLSX.readFile(KAYNAK)

/** Sayfayı 3. satır başlıklı nesne dizisine çevirir (satır 1-2 açıklama). */
function satirlar(ad) {
  const ws = wb.Sheets[ad]
  if (!ws) throw new Error(`Sayfa yok: ${ad}`)
  return XLSX.utils.sheet_to_json(ws, { range: 2, defval: null })
}

const giris = satirlar('VERI_GIRIS').filter(r => r['Kısa ad'])
const hesap = satirlar('HESAP').filter(r => r['Kısa ad'])

if (giris.length !== hesap.length) {
  throw new Error(`VERI_GIRIS ${giris.length} satır, HESAP ${hesap.length} satır — eşleşmiyor`)
}

// PARAMETRE sayfası: A sütunu etiket, B sütunu değer. Formül hücreleri
// (B11, B12) önbellekli sonucu taşır; onları da alıyoruz ki test
// asgari dakika maliyetini yeniden türetmek zorunda kalmasın.
const pws = wb.Sheets['PARAMETRE']
const pOku = (hucre) => {
  const c = pws[hucre]
  if (!c) throw new Error(`PARAMETRE!${hucre} boş`)
  return c.v
}

const parametre = {
  min_wage_gross: pOku('B4'),
  min_wage_net: pOku('B5'),
  employer_cost: pOku('B6'),
  wage_support: pOku('B7'),
  minutes_per_day: pOku('B8'),
  nominal_days: pOku('B9'),
  effective_days: pOku('B10'),
  eff_cutting: pOku('B14'),
  eff_sewing: pOku('B15'),
  eff_ukp: pOku('B16'),
  target_margin: pOku('B17'),
  weight_cutting: pOku('B19'),
  weight_sewing: pOku('B20'),
  weight_ukp: pOku('B21'),
  revenue_adj_on: pOku('B23'),
  revenue_adj_divisor: pOku('B24'),
}

// Bölge 3D dakika maliyeti — PARAMETRE!A32:D37, GÜNCEL sütunu (D).
const dk3d = {}
for (let r = 32; r <= 37; r++) {
  const ad = pws['A' + r]?.v
  const deger = pws['D' + r]?.v
  if (ad != null && deger != null) dk3d[String(ad).trim()] = deger
}

const cikti = {
  uretildi: new Date().toISOString(),
  kaynak: KAYNAK,
  parametre,
  dk3d,
  atolyeler: giris.map((g, i) => ({
    ad: g['Kısa ad'],
    giris: g,
    beklenen: hesap[i],
  })),
}

mkdirSync(dirname(HEDEF), { recursive: true })
writeFileSync(HEDEF, JSON.stringify(cikti, null, 2), 'utf8')
console.log(`OK  ${cikti.atolyeler.length} atölye → ${HEDEF}`)
console.log(`    ${cikti.atolyeler.map(a => a.ad).join(', ')}`)
```

- [ ] **Step 2: Çalıştır**

Run: `node scripts/ekonomi_fixture_uret.mjs`
Expected:
```
OK  11 atölye → .../lib/pes/__fixtures__/ekonomi-pilot.json
    Örssan, Hediye Group, İmkot, Needles, Teknik Tekstil, Netclass, Bese, Srtteks, Simayteks, Bagisan, Boz Moda
```

- [ ] **Step 3: Örssan'ın beklenen değerlerini gözle doğrula**

Run: `node -e "const f=require('./lib/pes/__fixtures__/ekonomi-pilot.json');const o=f.atolyeler[0];console.log(o.ad, o.beklenen['Brüt gider (TL)'], o.beklenen['Aylık ciro (TL)'], o.beklenen['DİKİM dk maliyeti (TL/dk)'])"`

Expected: `Örssan 7553000 6059369.90270833 4.01791451409772`

Bu üç sayı elle doğrulandı:
- Brüt gider = `VERI_GIRIS!T4:AS4` toplamı = 5.300.000 işçilik + 2.253.000 diğer
- Ciro = 14.788.970,61 ÷ 3 × (1 + 5,5 ÷ 24)
- Dikim dk maliyeti = 6.253.000 ÷ ((6+90+35) × 9 × 22 × 60)

Tutmuyorsa Excel değişmiş demektir; devam etmeden önce nedenini bul.

- [ ] **Step 4: Commit**

```bash
git add scripts/ekonomi_fixture_uret.mjs lib/pes/__fixtures__/ekonomi-pilot.json
git commit -m "feat(ekonomi): Excel pilot verisinden test fixture ureteci

11 pilot atolyenin VERI_GIRIS girdisi ve HESAP'in hesapladigi beklenen
cikti tek JSON'da toplanir. Testler bu dosyayi referans alir; Excel
guncellenince script yeniden calistirilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Tipler ve parametre varsayılanları

**Files:**
- Create: `lib/pes/ekonomi-tipler.ts`

Sadece tip ve sabit. Mantık yok, test yok — bu dosyanın doğruluğunu Task 3'ün testleri kanıtlar.

- [ ] **Step 1: Dosyayı yaz**

```ts
/**
 * Atölye ekonomi modeli — tipler ve parametre varsayılanları.
 *
 * Kaynak: Atolye_Gider_Model.xlsx (PARAMETRE + VERI_GIRIS + HESAP sayfaları).
 * Tasarım: docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md
 *
 * Bu dosyada hesap YOK. Hesap ekonomi-hesap.ts'te; oradaki her fonksiyon
 * FORMULLER sayfasındaki bir satıra karşılık gelir.
 */

/** Dönem versiyonlu model parametreleri (economy_param tablosunun satırları). */
export type EkonomiParam = {
  /** Brüt asgari ücret, TL/ay. PARAMETRE!B4 */
  min_wage_gross: number
  /** Net asgari ücret, TL/ay. PARAMETRE!B5 — maaş/kişi kıyaslamasında kullanılır. */
  min_wage_net: number
  /** İşveren maliyeti (imalat, 5 puan SGK indirimi), TL/ay. PARAMETRE!B6 */
  employer_cost: number
  /** Asgari ücret desteği, TL/ay. PARAMETRE!B7 */
  wage_support: number
  /** Günlük çalışma dakikası (molalar hariç). PARAMETRE!B8 */
  minutes_per_day: number
  /** Aylık nominal çalışma günü. PARAMETRE!B9 */
  nominal_days: number
  /** Aylık efektif çalışma günü (tatil/izin/devamsızlık sonrası). PARAMETRE!B10 */
  effective_days: number
  /** Kesim verimliliği (MTM → gerçek dakika). PARAMETRE!B14 */
  eff_cutting: number
  /** Dikim verimliliği. PARAMETRE!B15 */
  eff_sewing: number
  /** UKP verimliliği. PARAMETRE!B16 */
  eff_ukp: number
  /** Hedef tedarikçi marjı. PARAMETRE!B17 */
  target_margin: number
  /** Kesim maaş ağırlığı (dakika maliyeti dağıtımı). PARAMETRE!B19 */
  weight_cutting: number
  /** Dikim maaş ağırlığı. PARAMETRE!B20 */
  weight_sewing: number
  /** UKP maaş ağırlığı. PARAMETRE!B21 */
  weight_ukp: number
  /** Boş gün ciro düzeltmesi açık mı (1 = evet). PARAMETRE!B23 */
  revenue_adj_on: number
  /** Boş gün düzeltme paydası (gün). PARAMETRE!B24 */
  revenue_adj_divisor: number
}

/** 2026-01 başlangıç değerleri. economy_param boşsa seed olarak yazılır. */
export const VARSAYILAN_PARAM: EkonomiParam = {
  min_wage_gross: 33030,
  min_wage_net: 28075.5,
  employer_cost: 39223.13,
  wage_support: 1270,
  minutes_per_day: 540,
  nominal_days: 22,
  effective_days: 19.5,
  eff_cutting: 0.75,
  eff_sewing: 0.65,
  eff_ukp: 0.75,
  target_margin: 0.15,
  weight_cutting: 1,
  weight_sewing: 1,
  weight_ukp: 1,
  revenue_adj_on: 1,
  revenue_adj_divisor: 24,
}

/**
 * monthly_expense'in 28 gider kalemi. Teşvik BURADA YOK — gider değil,
 * mahsup kalemidir ve brüt toplama girmez.
 *
 * ukp_consumables ve vehicle_depr migration 037 ile eklenir.
 */
export const GIDER_KALEMLERI = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
  'food', 'transport', 'cargo', 'rent', 'building_depr',
  'electricity', 'water', 'gas', 'thread', 'needle',
  'ukp_consumables', 'consumables', 'machine_maint', 'machine_depr',
  'vehicle_depr', 'vehicle', 'stationery', 'isg', 'consulting',
  'official_fees', 'insurance', 'communication', 'other',
] as const

export type GiderKalemi = (typeof GIDER_KALEMLERI)[number]

/** İşçilik sayılan beş kalem (HESAP!P — FORMULLER satır 15). */
export const ISCILIK_KALEMLERI: readonly GiderKalemi[] = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
]

/** Bir atölyenin bir ayına ait gider satırı. Eksik kalem null. */
export type GiderSatiri = Partial<Record<GiderKalemi, number | null>> & {
  /** Alınan teşvik, TL/ay. Gider değil — net giderden düşülür. */
  incentive_amount: number | null
}

/** workshop_economy satırı: giderde olmayan alanlar. */
export type EkonomiSatiri = {
  /** Aylık ciro, boş gün düzeltmesi ÖNCESİ (fatura toplamı ÷ ay sayısı). */
  revenue_declared: number | null
  /** Boş / dışarı çalışılan gün, aylık ortalama. */
  idle_days: number | null
  /** Beyan edilen aylık adet (bant kapasitesi tahmini). */
  qty_declared: number | null
  nominal_days: number | null
  actual_days: number | null
  hours_per_day: number | null
  cutting_staff: number | null
  sewing_staff: number | null
  ukp_staff: number | null
  office_staff: number | null
  area_m2: number | null
  source: 'anket' | 'elle' | 'turetilmis'
}

export type EkonomiGirdi = {
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
  param: EkonomiParam
  /** dk_maliyet tablosundan, atölyenin teşvik bölgesine göre. Yoksa null. */
  dkMaliyet3D: number | null
  /** PES üretim kaydından gerçekleşen adet. Yoksa null. */
  qtyActual: number | null
}

/**
 * 37 türetilmiş gösterge. Hesaplanamayan her alan null döner — 0 DEĞİL.
 * 0 "hesaplandı ve sıfır çıktı", null "hesaplanamadı" demektir; ekranda
 * ikisi farklı görünür.
 */
export type EkonomiRasyo = {
  toplamKisi: number | null
  uretimKisi: number | null
  dikimPayi: number | null

  aylikCiro: number | null
  aylikAdet: number | null
  ortFiyatAdet: number | null
  brutGider: number | null
  tesvik: number | null
  netGider: number | null
  karZarar: number | null
  marj: number | null

  iscilikToplam: number | null
  iscilikPayi: number | null
  iscilikDisiKisi: number | null
  iscilikYukKatsayisi: number | null

  ciroKisi: number | null
  netGiderKisi: number | null
  maasKisi: number | null
  adetDikimci: number | null

  nominalDikimDk: number | null
  fiiliDikimDk: number | null
  uretimKisiDk: number | null
  kisiDkMaliyet: number | null
  kesimDkMaliyet: number | null
  dikimDkMaliyet: number | null
  ukpDkMaliyet: number | null
  dikimDkCiro: number | null
  dakikaMarji: number | null
  fiiliDikimDkMaliyet: number | null
  asgariDkCarpani: number | null
  dikimDkAdet: number | null

  basabasFiyat: number | null
  adilFiyat: number | null
  fiyatSapmasi: number | null

  referans3D: number | null
  dkMaliyet3DOran: number | null
}
```

- [ ] **Step 2: Derlendiğini doğrula**

Run: `npx tsc --noEmit`
Expected: hata yok (mevcut projede başka hata varsa yalnız `ekonomi-tipler.ts` satırı içermediğini kontrol et)

- [ ] **Step 3: Commit**

```bash
git add lib/pes/ekonomi-tipler.ts
git commit -m "feat(ekonomi): tip tanimlari ve parametre varsayilanlari

16 parametre, 28 gider kalemi, girdi ve 37 alanlik rasyo tipi.
Hesaplanamayan alan null doner, 0 degil.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Hesap çekirdeği — kadro, ciro, gider, marj

**Files:**
- Create: `lib/pes/ekonomi-hesap.ts`
- Test: `lib/pes/ekonomi-hesap.test.ts`

`FORMULLER` satır 6–17 ve 35. Her fonksiyon tek bir göstergeyi hesaplar ve `export` edilir — testler tek tek çağırabilsin diye.

- [ ] **Step 1: Başarısız testi yaz**

`lib/pes/ekonomi-hesap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  bol, toplamKisi, uretimKisi, dikimPayi,
  aylikCiro, brutGider, netGider, marj,
  iscilikToplam, iscilikPayi, iscilikDisiKisi, iscilikYukKatsayisi,
} from './ekonomi-hesap'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'
import type { GiderSatiri, EkonomiSatiri } from './ekonomi-tipler'

/* Örssan — Atolye_Gider_Model.xlsx VERI_GIRIS satır 4.
   Beklenen değerler HESAP satır 4'ten; üçü elle yeniden hesaplandı. */
export const ORSSAN_GIDER: GiderSatiri = {
  personnel: 4900000, overtime: 200000, bonus: 0, sgk: 200000, severance_reserve: 0,
  food: 200000, transport: 350000, cargo: 150000, rent: 0, building_depr: 100000,
  electricity: 150000, water: 30000, gas: 50000, thread: 300000, needle: null,
  ukp_consumables: 200000, consumables: 250000, machine_maint: 50000, machine_depr: 20000,
  vehicle_depr: 20000, vehicle: 40000, stationery: 10000, isg: 30000, consulting: 50000,
  official_fees: 150000, insurance: 100000, communication: 3000, other: null,
  incentive_amount: 1300000,
}

export const ORSSAN_EKONOMI: EkonomiSatiri = {
  revenue_declared: 14788970.61 / 3,
  idle_days: 5.5,
  qty_declared: 43036.7,
  nominal_days: 22,
  actual_days: 15.25,
  hours_per_day: 9,
  cutting_staff: 6, sewing_staff: 90, ukp_staff: 35, office_staff: 6,
  area_m2: 5000,
  source: 'anket',
}

describe('bol', () => {
  it('normal bölme', () => {
    expect(bol(10, 4)).toBe(2.5)
  })

  it('payda sıfırsa null — 0 değil', () => {
    expect(bol(10, 0)).toBeNull()
  })

  it('payda null ise null', () => {
    expect(bol(10, null)).toBeNull()
  })

  it('pay null ise null', () => {
    expect(bol(null, 4)).toBeNull()
  })

  it('pay sıfırsa sonuç sıfır — null değil', () => {
    expect(bol(0, 4)).toBe(0)
  })
})

describe('kadro', () => {
  it('toplam kişi = kesim + dikim + UKP + ofis', () => {
    expect(toplamKisi(ORSSAN_EKONOMI)).toBe(137)
  })

  it('üretim kişi ofisi dışlar', () => {
    expect(uretimKisi(ORSSAN_EKONOMI)).toBe(131)
  })

  it('dikim payı toplam kişiye göre', () => {
    expect(dikimPayi(ORSSAN_EKONOMI)).toBeCloseTo(0.656934306569343, 12)
  })

  it('kadro tamamen boşsa toplam null', () => {
    const bos: EkonomiSatiri = {
      ...ORSSAN_EKONOMI,
      cutting_staff: null, sewing_staff: null, ukp_staff: null, office_staff: null,
    }
    expect(toplamKisi(bos)).toBeNull()
  })
})

describe('aylikCiro', () => {
  it('boş gün düzeltmesi uygulanır', () => {
    expect(aylikCiro(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(6059369.90270833, 6)
  })

  it('düzeltme kapalıysa ham ciro döner', () => {
    const kapali = { ...VARSAYILAN_PARAM, revenue_adj_on: 0 }
    expect(aylikCiro(ORSSAN_EKONOMI, kapali)).toBeCloseTo(14788970.61 / 3, 6)
  })

  it('boş gün yoksa düzeltme etkisiz', () => {
    const bosGunsuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, idle_days: 0 }
    expect(aylikCiro(bosGunsuz, VARSAYILAN_PARAM)).toBeCloseTo(14788970.61 / 3, 6)
  })

  it('ciro beyanı yoksa null', () => {
    const cirosuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, revenue_declared: null }
    expect(aylikCiro(cirosuz, VARSAYILAN_PARAM)).toBeNull()
  })
})

describe('gider', () => {
  it('brüt gider 28 kalemin toplamı, teşvik dahil DEĞİL', () => {
    expect(brutGider(ORSSAN_GIDER)).toBe(7553000)
  })

  it('net gider = brüt − teşvik', () => {
    expect(netGider(ORSSAN_GIDER)).toBe(6253000)
  })

  it('teşvik null ise net = brüt', () => {
    expect(netGider({ ...ORSSAN_GIDER, incentive_amount: null })).toBe(7553000)
  })

  it('işçilik beş kalemin toplamı', () => {
    expect(iscilikToplam(ORSSAN_GIDER)).toBe(5300000)
  })
})

describe('marj', () => {
  it('Örssan zararda', () => {
    expect(marj(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(-0.031955483887049, 12)
  })

  it('ciro sıfırsa null', () => {
    const cirosuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, revenue_declared: 0 }
    expect(marj(ORSSAN_GIDER, cirosuz, VARSAYILAN_PARAM)).toBeNull()
  })
})

describe('işçilik rasyoları', () => {
  it('işçilik payı teşvik düşülmüş işçilik ÷ net gider', () => {
    expect(iscilikPayi(ORSSAN_GIDER)).toBeCloseTo(0.639692947385255, 12)
  })

  it('işçilik dışı / kişi kirayı dışlar', () => {
    expect(iscilikDisiKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(16445.2554744526, 8)
  })

  it('işçilik yük katsayısı net maaşa göre', () => {
    expect(iscilikYukKatsayisi(ORSSAN_GIDER)).toBeCloseTo(0.816326530612245, 12)
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: FAIL — `Failed to resolve import "./ekonomi-hesap"`

- [ ] **Step 3: Uygulamayı yaz**

`lib/pes/ekonomi-hesap.ts`:

```ts
/**
 * Atölye ekonomi rasyoları — Atolye_Gider_Model.xlsx FORMULLER sayfasıyla
 * bire bir. Her fonksiyon bir göstergedir; hangi FORMULLER satırına
 * karşılık geldiği yorumda yazılıdır.
 *
 * KURAL 1: Hesaplanamayan her şey null döner, 0 değil. 0 "hesaplandı ve
 *   sıfır çıktı", null "hesaplanamadı" demektir. Excel ikisini de 0 yazıyor;
 *   burada bilerek ayrıldık çünkü ekranda 0 gösterilen bir atölye
 *   sıralamanın ucuna fırlar ve en kârlı ya da en zararlı sanılır.
 *
 * KURAL 2: Teşvik gider değildir. Brüt toplama girmez, net giderden düşülür.
 *
 * KURAL 3: Ofis dakikası ürün üretmez; maliyeti üretim dakikasına yüklenir.
 */
import {
  GIDER_KALEMLERI, ISCILIK_KALEMLERI,
  type EkonomiParam, type EkonomiSatiri, type GiderSatiri,
} from './ekonomi-tipler'

/** Güvenli bölme: payda 0/null ya da pay null ise null. */
export function bol(pay: number | null, payda: number | null): number | null {
  if (pay === null || payda === null || payda === 0) return null
  return pay / payda
}

/** Null'ları atlayarak toplar; hiç sayı yoksa null. */
function topla(degerler: Array<number | null | undefined>): number | null {
  let toplam = 0
  let sayiVar = false
  for (const d of degerler) {
    if (typeof d === 'number' && Number.isFinite(d)) {
      toplam += d
      sayiVar = true
    }
  }
  return sayiVar ? toplam : null
}

/* ---------- Kadro ve ölçek — FORMULLER 6-8 ---------- */

/** HESAP!E — kesim + dikim + UKP + ofis. Kişi başı rasyoların paydası. */
export function toplamKisi(e: EkonomiSatiri): number | null {
  return topla([e.cutting_staff, e.sewing_staff, e.ukp_staff, e.office_staff])
}

/** HESAP!F — ofis hariç. Dakika maliyetinin paydası. */
export function uretimKisi(e: EkonomiSatiri): number | null {
  return topla([e.cutting_staff, e.sewing_staff, e.ukp_staff])
}

/** HESAP!G — dikim kişi ÷ toplam kişi. %55-75 tipik. */
export function dikimPayi(e: EkonomiSatiri): number | null {
  return bol(e.sewing_staff, toplamKisi(e))
}

/* ---------- Ciro — FORMULLER 9 ---------- */

/**
 * HESAP!H — fatura ÷ ay × (1 + boş gün ÷ payda).
 * Boş gün düzeltmesi dışarı/boş geçen günleri kapasiteye geri ekler;
 * revenue_adj_on = 0 ile kapatılabilir.
 */
export function aylikCiro(e: EkonomiSatiri, p: EkonomiParam): number | null {
  if (e.revenue_declared === null) return null
  if (p.revenue_adj_on !== 1 || p.revenue_adj_divisor === 0) return e.revenue_declared
  const bosGun = e.idle_days ?? 0
  return e.revenue_declared * (1 + bosGun / p.revenue_adj_divisor)
}

/* ---------- Gider — FORMULLER 11-12, 15 ---------- */

/** HESAP!K — 28 gider kaleminin toplamı. Teşvik BURADA YOK. */
export function brutGider(g: GiderSatiri): number | null {
  return topla(GIDER_KALEMLERI.map(k => g[k]))
}

/** HESAP!M — brüt gider − teşvik. Teşvik iade olarak geri geldiği için düşülür. */
export function netGider(g: GiderSatiri): number | null {
  const brut = brutGider(g)
  if (brut === null) return null
  return brut - (g.incentive_amount ?? 0)
}

/** HESAP!P — maaş + mesai + prim + SGK + kıdem. */
export function iscilikToplam(g: GiderSatiri): number | null {
  return topla(ISCILIK_KALEMLERI.map(k => g[k]))
}

/* ---------- Sonuç — FORMULLER 13-14 ---------- */

/** HESAP!N — aylık ciro − net gider. */
export function karZarar(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  const ciro = aylikCiro(e, p)
  const net = netGider(g)
  if (ciro === null || net === null) return null
  return ciro - net
}

/** HESAP!O — (ciro − net gider) ÷ ciro. Adet tahmininden etkilenmez. */
export function marj(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(karZarar(g, e, p), aylikCiro(e, p))
}

/* ---------- İşçilik rasyoları — FORMULLER 16-17, 35 ---------- */

/** HESAP!Q — (işçilik − teşvik) ÷ net gider. Pilotta %66-79. */
export function iscilikPayi(g: GiderSatiri): number | null {
  const isc = iscilikToplam(g)
  if (isc === null) return null
  return bol(isc - (g.incentive_amount ?? 0), netGider(g))
}

/**
 * HESAP!R — (brüt − işçilik − kira) ÷ toplam kişi.
 * Yemek, servis, enerji, sarf, bakım, idari: her çalışanla gelen işletme
 * maliyeti. Pilot medyanı 12.831 TL.
 */
export function iscilikDisiKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  const brut = brutGider(g)
  const isc = iscilikToplam(g)
  if (brut === null || isc === null) return null
  return bol(brut - isc - (g.rent ?? 0), toplamKisi(e))
}

/**
 * HESAP!AL — (işçilik − teşvik) ÷ net maaş.
 * Net maaşın üstüne mesai, prim, SGK ve kıdemle ne kadar bindiği.
 * Pilot: 6. bölge ~1,17, 1. bölge ~1,25.
 *
 * 1'in altına düşüyorsa teşvik SGK'dan büyük demektir ve beyan şüphelidir —
 * Örssan'da 0,82 çıkıyor (SGK 200 bin, teşvik 1,3 milyon). Task 13'teki
 * doğrulama bunu ayrıca raporlar.
 */
export function iscilikYukKatsayisi(g: GiderSatiri): number | null {
  const isc = iscilikToplam(g)
  if (isc === null) return null
  return bol(isc - (g.incentive_amount ?? 0), g.personnel ?? null)
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: PASS — 20 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/ekonomi-hesap.ts lib/pes/ekonomi-hesap.test.ts
git commit -m "feat(ekonomi): kadro, ciro, gider ve marj rasyolari

FORMULLER 6-17 ve 35. Tesvik brut toplama girmez, net giderden
dusulur. Hesaplanamayan alan null doner, 0 degil.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Hesap çekirdeği — kişi başı ve dakika

**Files:**
- Modify: `lib/pes/ekonomi-hesap.ts` (dosya sonuna eklenir)
- Modify: `lib/pes/ekonomi-hesap.test.ts` (dosya sonuna eklenir)

`FORMULLER` satır 18–31. Modelin kalbi burası: dakika maliyeti ve bölüm ayrıştırması.

- [ ] **Step 1: Başarısız testleri ekle**

`lib/pes/ekonomi-hesap.test.ts` sonuna:

```ts
import {
  ciroKisi, netGiderKisi, maasKisi, adetDikimci, ortFiyatAdet,
  nominalDikimDk, fiiliDikimDk, uretimKisiDk, kisiDkMaliyet,
  bolumDkMaliyet, dikimDkCiro, dakikaMarji, fiiliDikimDkMaliyet,
  asgariDkMaliyetNominal, asgariDkMaliyetEfektif, asgariDkCarpani, dikimDkAdet,
} from './ekonomi-hesap'

describe('kişi başı rasyolar', () => {
  it('ciro / kişi', () => {
    expect(ciroKisi(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(44228.9773920316, 8)
  })

  it('net gider / kişi', () => {
    expect(netGiderKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(45642.3357664234, 8)
  })

  it('maaş / kişi', () => {
    expect(maasKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(35766.4233576642, 8)
  })

  it('adet / dikimci', () => {
    expect(adetDikimci(ORSSAN_EKONOMI, null)).toBeCloseTo(478.185555555556, 8)
  })

  it('adet / dikimci PES gerçeği verilirse onu kullanır', () => {
    expect(adetDikimci(ORSSAN_EKONOMI, 36000)).toBe(400)
  })

  it('ortalama fiyat / adet', () => {
    expect(ortFiyatAdet(ORSSAN_EKONOMI, VARSAYILAN_PARAM, null))
      .toBeCloseTo(140.795411885863, 8)
  })
})

describe('dakika havuzları', () => {
  it('nominal dikim dakikası = dikim × saat × nominal gün × 60', () => {
    expect(nominalDikimDk(ORSSAN_EKONOMI)).toBe(1069200)
  })

  it('fiili dikim dakikası fiili günle', () => {
    expect(fiiliDikimDk(ORSSAN_EKONOMI)).toBe(741150)
  })

  it('üretim kişi-dakikası ofisi dışlar', () => {
    expect(uretimKisiDk(ORSSAN_EKONOMI)).toBe(1556280)
  })

  it('dikim kişi yoksa nominal dikim dakikası null', () => {
    const dikimsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, sewing_staff: null }
    expect(nominalDikimDk(dikimsiz)).toBeNull()
  })
})

describe('dakika maliyetleri', () => {
  it('kişi-dakika maliyeti = net gider ÷ üretim kişi-dakikası', () => {
    expect(kisiDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(4.01791451409772, 12)
  })

  it('ağırlıklar eşitken üç bölüm aynı değeri alır', () => {
    const k = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'kesim')
    const d = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'dikim')
    const u = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'ukp')
    expect(k).toBeCloseTo(4.01791451409772, 12)
    expect(d).toBeCloseTo(4.01791451409772, 12)
    expect(u).toBeCloseTo(4.01791451409772, 12)
  })

  it('dikim ağırlığı artınca dikim pahalılaşır, kesim ucuzlar', () => {
    const agirlikli = { ...VARSAYILAN_PARAM, weight_sewing: 1.2 }
    const d = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, agirlikli, 'dikim')!
    const k = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, agirlikli, 'kesim')!
    expect(d).toBeGreaterThan(4.01791451409772)
    expect(k).toBeLessThan(4.01791451409772)
  })

  it('ağırlıklı kişi toplamı sıfırsa null', () => {
    const kadrosuz: EkonomiSatiri = {
      ...ORSSAN_EKONOMI, cutting_staff: 0, sewing_staff: 0, ukp_staff: 0,
    }
    expect(bolumDkMaliyet(ORSSAN_GIDER, kadrosuz, VARSAYILAN_PARAM, 'dikim')).toBeNull()
  })

  it('dikim dakika cirosu', () => {
    expect(dikimDkCiro(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(5.66719968453829, 12)
  })

  it('dakika marjı negatif', () => {
    expect(dakikaMarji(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(-0.181098108203953, 12)
  })

  it('fiili dikim dakika maliyeti nominalden yüksek', () => {
    expect(fiiliDikimDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI))
      .toBeCloseTo(8.43688861903798, 12)
  })
})

describe('asgari ücret referansı', () => {
  it('nominal asgari dakika maliyeti', () => {
    expect(asgariDkMaliyetNominal(VARSAYILAN_PARAM)).toBeCloseTo(3.19470791245791, 12)
  })

  it('efektif dakika nominalden pahalı', () => {
    expect(asgariDkMaliyetEfektif(VARSAYILAN_PARAM))
      .toBeGreaterThan(asgariDkMaliyetNominal(VARSAYILAN_PARAM)!)
  })

  it('asgari dakika çarpanı', () => {
    expect(asgariDkCarpani(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(1.83062049896221, 11)
  })
})

describe('dikim dakikası / adet', () => {
  it('nominal dakika ÷ adet', () => {
    expect(dikimDkAdet(ORSSAN_EKONOMI, null)).toBeCloseTo(24.843912288814, 10)
  })

  it('adet sıfırsa null', () => {
    const adetsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, qty_declared: 0 }
    expect(dikimDkAdet(adetsiz, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: FAIL — `ciroKisi is not exported by ./ekonomi-hesap`

- [ ] **Step 3: Uygulamayı ekle**

`lib/pes/ekonomi-hesap.ts` sonuna:

```ts
/* ---------- Adet — beyan mı PES gerçeği mi ---------- */

/**
 * Hesaplarda kullanılacak adet. PES üretim kaydı varsa o, yoksa beyan.
 *
 * İkisi arasındaki fark bir hata değil sinyaldir: büyük sapma ya beyanın
 * ya iş emri kaydının zayıf olduğunu söyler. Hangisinin kullanıldığı
 * ekranda işaretlenir (adetKaynagi).
 */
export function kullanilanAdet(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return qtyActual ?? e.qty_declared
}

export function adetKaynagi(qtyActual: number | null): 'pes' | 'beyan' {
  return qtyActual === null ? 'beyan' : 'pes'
}

/** Beyan ile PES gerçeği arasındaki oransal sapma. İkisi de yoksa null. */
export function adetSapmasi(e: EkonomiSatiri, qtyActual: number | null): number | null {
  if (qtyActual === null || e.qty_declared === null || e.qty_declared === 0) return null
  return qtyActual / e.qty_declared - 1
}

/* ---------- Kişi başı — FORMULLER 10, 18-21 ---------- */

/** HESAP!S — aylık ciro ÷ toplam kişi. Marjla en güçlü ilişkiyi gösteren rasyo. */
export function ciroKisi(e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(aylikCiro(e, p), toplamKisi(e))
}

/** HESAP!T — net gider ÷ toplam kişi. Ciro/kişi ile yan yana okunur. */
export function netGiderKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), toplamKisi(e))
}

/** HESAP!U — net maaş ÷ toplam kişi. Asgari net ile kıyaslanır. */
export function maasKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(g.personnel ?? null, toplamKisi(e))
}

/** HESAP!V — aylık adet ÷ dikim kişi. Ürüne çok bağlı; aynı klasmanda kıyasla. */
export function adetDikimci(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return bol(kullanilanAdet(e, qtyActual), e.sewing_staff)
}

/** HESAP!J — aylık ciro ÷ aylık adet. Parça başına faturalanan ortalama CMT. */
export function ortFiyatAdet(
  e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  return bol(aylikCiro(e, p), kullanilanAdet(e, qtyActual))
}

/* ---------- Dakika havuzları — FORMULLER 22-24 ---------- */

/** HESAP!W — dikim kişi × saat × nominal gün × 60. Benchmark cetveli. */
export function nominalDikimDk(e: EkonomiSatiri): number | null {
  if (e.sewing_staff === null || e.hours_per_day === null || e.nominal_days === null) return null
  return e.sewing_staff * e.hours_per_day * e.nominal_days * 60
}

/** HESAP!X — fiili günle. Fiyatlama için bu kullanılır. */
export function fiiliDikimDk(e: EkonomiSatiri): number | null {
  if (e.sewing_staff === null || e.hours_per_day === null || e.actual_days === null) return null
  return e.sewing_staff * e.hours_per_day * e.actual_days * 60
}

/** HESAP!Y — üretim kişi × saat × nominal gün × 60. Bölüm maliyetlerinin ortak paydası. */
export function uretimKisiDk(e: EkonomiSatiri): number | null {
  const kisi = uretimKisi(e)
  if (kisi === null || e.hours_per_day === null || e.nominal_days === null) return null
  return kisi * e.hours_per_day * e.nominal_days * 60
}

/* ---------- Dakika maliyetleri — FORMULLER 25-30 ---------- */

/** HESAP!Z — net gider ÷ üretim kişi-dakikası. Tam yüklü bir üretim dakikası. */
export function kisiDkMaliyet(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), uretimKisiDk(e))
}

export type Bolum = 'kesim' | 'dikim' | 'ukp'

/**
 * HESAP!AA / AB / AC — net gider maaş ağırlığıyla bölümlere dağıtılır,
 * sonra bölümün dakikasına bölünür:
 *
 *   netGider × w_b ÷ ((kesim×w_k + dikim×w_d + ukp×w_u) × saat × gün × 60)
 *
 * Ağırlıklar 1/1/1 olduğu sürece üç değer aynı çıkar. Bölüm maaşları
 * toplandığında economy_param'dan ayrıştırılır; formül buna hazır.
 */
export function bolumDkMaliyet(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, bolum: Bolum,
): number | null {
  const net = netGider(g)
  if (net === null || e.hours_per_day === null || e.nominal_days === null) return null

  const agirlikliKisi =
    (e.cutting_staff ?? 0) * p.weight_cutting +
    (e.sewing_staff ?? 0) * p.weight_sewing +
    (e.ukp_staff ?? 0) * p.weight_ukp
  if (agirlikliKisi === 0) return null

  const w = bolum === 'kesim' ? p.weight_cutting
    : bolum === 'dikim' ? p.weight_sewing
    : p.weight_ukp

  return (net * w) / (agirlikliKisi * e.hours_per_day * e.nominal_days * 60)
}

/** HESAP!AD — aylık ciro ÷ nominal dikim dakikası. Kârı belirleyen gösterge. */
export function dikimDkCiro(e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(aylikCiro(e, p), nominalDikimDk(e))
}

/** HESAP!AE — (ciro − net gider) ÷ nominal dikim dakikası. */
export function dakikaMarji(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(karZarar(g, e, p), nominalDikimDk(e))
}

/** HESAP!AF — net gider ÷ fiili dikim dakikası. Nominalden ~%10-15 yüksek. */
export function fiiliDikimDkMaliyet(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), fiiliDikimDk(e))
}

/**
 * PARAMETRE!B11 — (işveren maliyeti − destek) ÷ (nominal gün × günlük dakika).
 * Türkiye'de bir dikim dakikasının olabileceği en düşük maliyet.
 */
export function asgariDkMaliyetNominal(p: EkonomiParam): number | null {
  return bol(p.employer_cost - p.wage_support, p.nominal_days * p.minutes_per_day)
}

/**
 * PARAMETRE!B12 — aynı pay ÷ (efektif gün × günlük dakika).
 * Ücret 30 gün ödenir ama ~19,5 gün dikilir; fiyatlama kararında bu kullanılır.
 */
export function asgariDkMaliyetEfektif(p: EkonomiParam): number | null {
  return bol(p.employer_cost - p.wage_support, p.effective_days * p.minutes_per_day)
}

/**
 * HESAP!AG — dikim dakika maliyeti ÷ asgari ücretli dakika.
 * ~1,3 yalın; 1,8-2,4 tipik; 3+ ağır (destek kadrosu, genel gider, boş zaman).
 */
export function asgariDkCarpani(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam,
): number | null {
  const dkMaliyet = bol(netGider(g), nominalDikimDk(e))
  return bol(dkMaliyet, asgariDkMaliyetNominal(p))
}

/**
 * HESAP!AH — nominal dikim dakikası ÷ aylık adet.
 * %100 verimlilikte parça başına düşen dikim dakikası; MTM ile kıyaslanınca
 * gerçek verimliliği verir (E3'ün girdisi).
 */
export function dikimDkAdet(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return bol(nominalDikimDk(e), kullanilanAdet(e, qtyActual))
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: PASS — 38 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/ekonomi-hesap.ts lib/pes/ekonomi-hesap.test.ts
git commit -m "feat(ekonomi): kisi basi ve dakika rasyolari

FORMULLER 18-31. Bolum dakika maliyeti net gideri maas agirligiyla
kesim/dikim/UKP'ye dagitir; agirliklar 1/1/1 iken uc deger ayni.
Adet PES uretim kaydi varsa oradan, yoksa beyandan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Hesap çekirdeği — fiyat, referans ve birleştirme

**Files:**
- Modify: `lib/pes/ekonomi-hesap.ts`
- Modify: `lib/pes/ekonomi-hesap.test.ts`

`FORMULLER` satır 32–34 ve 49–50, ardından hepsini tek çağrıda toplayan `hesapla()`.

- [ ] **Step 1: Başarısız testleri ekle**

`lib/pes/ekonomi-hesap.test.ts` sonuna:

```ts
import { basabasFiyat, adilFiyat, fiyatSapmasi, dkMaliyet3DOran, hesapla } from './ekonomi-hesap'

describe('fiyat', () => {
  it('başabaş fiyat = net gider ÷ adet', () => {
    expect(basabasFiyat(ORSSAN_GIDER, ORSSAN_EKONOMI, null))
      .toBeCloseTo(145.294597401752, 9)
  })

  it('adil fiyat hedef marjla', () => {
    expect(adilFiyat(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null))
      .toBeCloseTo(167.088787012015, 9)
  })

  it('Örssan adil fiyatın altında çalışıyor', () => {
    const sapma = fiyatSapmasi(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null)!
    expect(sapma).toBeCloseTo(-0.157361697312826, 10)
    expect(sapma).toBeLessThan(0)
  })

  it('adet yoksa başabaş null', () => {
    const adetsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, qty_declared: null }
    expect(basabasFiyat(ORSSAN_GIDER, adetsiz, null)).toBeNull()
  })
})

describe('3D referans', () => {
  it('dikim dk maliyeti ÷ bölge 3D değeri', () => {
    expect(dkMaliyet3DOran(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 5.05))
      .toBeCloseTo(0.795626636454994, 11)
  })

  it('bölge değeri yoksa null', () => {
    expect(dkMaliyet3DOran(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null)).toBeNull()
  })
})

describe('hesapla — tam rasyo seti', () => {
  const r = hesapla({
    gider: ORSSAN_GIDER,
    ekonomi: ORSSAN_EKONOMI,
    param: VARSAYILAN_PARAM,
    dkMaliyet3D: 5.05,
    qtyActual: null,
  })

  it('37 alanın hepsini döndürür', () => {
    expect(Object.keys(r)).toHaveLength(37)
  })

  it('anahtar göstergeler Excel ile aynı', () => {
    expect(r.toplamKisi).toBe(137)
    expect(r.netGider).toBe(6253000)
    expect(r.marj).toBeCloseTo(-0.031955483887049, 12)
    expect(r.dikimDkMaliyet).toBeCloseTo(4.01791451409772, 12)
    expect(r.adilFiyat).toBeCloseTo(167.088787012015, 9)
  })

  it('tamamen boş girdide her alan null, hata atmaz', () => {
    const bosEkonomi: EkonomiSatiri = {
      revenue_declared: null, idle_days: null, qty_declared: null,
      nominal_days: null, actual_days: null, hours_per_day: null,
      cutting_staff: null, sewing_staff: null, ukp_staff: null, office_staff: null,
      area_m2: null, source: 'elle',
    }
    const bos = hesapla({
      gider: { incentive_amount: null },
      ekonomi: bosEkonomi,
      param: VARSAYILAN_PARAM,
      dkMaliyet3D: null,
      qtyActual: null,
    })
    expect(Object.values(bos).every(v => v === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: FAIL — `hesapla is not exported by ./ekonomi-hesap`

- [ ] **Step 3: Uygulamayı ekle**

`lib/pes/ekonomi-hesap.ts` sonuna:

```ts
/* ---------- Fiyat — FORMULLER 32-34 ---------- */

/** HESAP!AI — net gider ÷ aylık adet. Sıfır kârla yaşadığı ortalama CMT. */
export function basabasFiyat(
  g: GiderSatiri, e: EkonomiSatiri, qtyActual: number | null,
): number | null {
  return bol(netGider(g), kullanilanAdet(e, qtyActual))
}

/** HESAP!AJ — başabaş × (1 + hedef marj). Tedarikçiyi ayakta tutan fiyat. */
export function adilFiyat(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  const bb = basabasFiyat(g, e, qtyActual)
  if (bb === null) return null
  return bb * (1 + p.target_margin)
}

/**
 * HESAP!AK — ortalama fiyat ÷ adil fiyat − 1.
 * Negatifse atölye adilin altında çalışıyor: gizli pahalı, süreklilik riski.
 */
export function fiyatSapmasi(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  const oran = bol(ortFiyatAdet(e, p, qtyActual), adilFiyat(g, e, p, qtyActual))
  return oran === null ? null : oran - 1
}

/* ---------- 3D referans — FORMULLER 49-50 ---------- */

/**
 * HESAP!AN — atölyenin gerçekleşen dikim dakika maliyeti ÷ bölge 3D değeri.
 * 1,00 = referansla aynı; 1,20 = %20 pahalı; 0,85 = referansın altında
 * (yalın ya da eksik bildirim).
 */
export function dkMaliyet3DOran(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, dk3d: number | null,
): number | null {
  return bol(bolumDkMaliyet(g, e, p, 'dikim'), dk3d)
}

/* ---------- Birleştirme ---------- */

/**
 * Tek bir atölye-ayın 37 rasyosunu hesaplar.
 * Ekranlar ve import doğrulaması bunu çağırır; tek tek fonksiyonlar
 * testler ve E3/E5 içindir.
 */
export function hesapla(girdi: EkonomiGirdi): EkonomiRasyo {
  const { gider: g, ekonomi: e, param: p, dkMaliyet3D, qtyActual } = girdi
  return {
    toplamKisi: toplamKisi(e),
    uretimKisi: uretimKisi(e),
    dikimPayi: dikimPayi(e),

    aylikCiro: aylikCiro(e, p),
    aylikAdet: kullanilanAdet(e, qtyActual),
    ortFiyatAdet: ortFiyatAdet(e, p, qtyActual),
    brutGider: brutGider(g),
    tesvik: g.incentive_amount,
    netGider: netGider(g),
    karZarar: karZarar(g, e, p),
    marj: marj(g, e, p),

    iscilikToplam: iscilikToplam(g),
    iscilikPayi: iscilikPayi(g),
    iscilikDisiKisi: iscilikDisiKisi(g, e),
    iscilikYukKatsayisi: iscilikYukKatsayisi(g),

    ciroKisi: ciroKisi(e, p),
    netGiderKisi: netGiderKisi(g, e),
    maasKisi: maasKisi(g, e),
    adetDikimci: adetDikimci(e, qtyActual),

    nominalDikimDk: nominalDikimDk(e),
    fiiliDikimDk: fiiliDikimDk(e),
    uretimKisiDk: uretimKisiDk(e),
    kisiDkMaliyet: kisiDkMaliyet(g, e),
    kesimDkMaliyet: bolumDkMaliyet(g, e, p, 'kesim'),
    dikimDkMaliyet: bolumDkMaliyet(g, e, p, 'dikim'),
    ukpDkMaliyet: bolumDkMaliyet(g, e, p, 'ukp'),
    dikimDkCiro: dikimDkCiro(e, p),
    dakikaMarji: dakikaMarji(g, e, p),
    fiiliDikimDkMaliyet: fiiliDikimDkMaliyet(g, e),
    asgariDkCarpani: asgariDkCarpani(g, e, p),
    dikimDkAdet: dikimDkAdet(e, qtyActual),

    basabasFiyat: basabasFiyat(g, e, qtyActual),
    adilFiyat: adilFiyat(g, e, p, qtyActual),
    fiyatSapmasi: fiyatSapmasi(g, e, p, qtyActual),

    referans3D: dkMaliyet3D,
    dkMaliyet3DOran: dkMaliyet3DOran(g, e, p, dkMaliyet3D),
  }
}
```

`ekonomi-hesap.ts`'in en üstündeki import satırına `EkonomiGirdi` ve `EkonomiRasyo` eklenir:

```ts
import {
  GIDER_KALEMLERI, ISCILIK_KALEMLERI,
  type EkonomiGirdi, type EkonomiParam, type EkonomiRasyo,
  type EkonomiSatiri, type GiderSatiri,
} from './ekonomi-tipler'
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-hesap.test.ts`
Expected: PASS — 47 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/ekonomi-hesap.ts lib/pes/ekonomi-hesap.test.ts
git commit -m "feat(ekonomi): fiyat, 3D referans ve hesapla() birlestirmesi

FORMULLER 32-34 ve 49-50. hesapla() tek atolye-ayin 37 rasyosunu
dondurur; bos girdide her alan null, hata atmaz.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```


---

## Task 6: `expense-mapping.ts`'i iki yeni kaleme ve Excel başlıklarına aç

**Files:**
- Modify: `lib/pes/expense-mapping.ts`
- Test: `lib/pes/expense-mapping.test.ts` (yeni dosya)

`expense-mapping.ts` dosyasının kendi sözü: *"form başlığı değişince YALNIZ bu dosya güncellenir."* Anket çözümleyicisi (Task 7) kendi sözlüğünü tutmayacak, buradan okuyacak — yoksa başlık değiştiğinde bir dosya güncellenir, öteki sessizce `null` üretir.

- [ ] **Step 1: Başarısız testi yaz**

`lib/pes/expense-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchExpenseColumn, EXPENSE_LABELS, INTEGER_EXPENSE_COLUMNS } from './expense-mapping'

describe('yeni kalemler', () => {
  it('UKP sarf ayrı kolona düşer, genel sarfa değil', () => {
    expect(matchExpenseColumn('UKP sarf')).toBe('ukp_consumables')
    expect(matchExpenseColumn('Genel üretim sarf')).toBe('consumables')
  })

  it('taşıt amortismanı araç yakıtından ayrı', () => {
    expect(matchExpenseColumn('Taşıt / demirbaş amortismanı')).toBe('vehicle_depr')
    expect(matchExpenseColumn('Araç yakıt ve bakım')).toBe('vehicle')
  })

  it('iki yeni kolonun etiketi var', () => {
    expect(EXPENSE_LABELS.ukp_consumables).toBeTruthy()
    expect(EXPENSE_LABELS.vehicle_depr).toBeTruthy()
  })

  it('yeni kolonlar NUMERIC — yuvarlanacak listede olmamalı', () => {
    expect(INTEGER_EXPENSE_COLUMNS.has('ukp_consumables')).toBe(false)
    expect(INTEGER_EXPENSE_COLUMNS.has('vehicle_depr')).toBe(false)
  })
})

describe('Excel VERI_GIRIS başlıkları', () => {
  const beklenen: Array<[string, string]> = [
    ['Maaş (net, TL/ay)', 'personnel'],
    ['Fazla mesai', 'overtime'],
    ['Prim ve ikramiye', 'bonus'],
    ['SGK', 'sgk'],
    ['Kıdem karşılığı', 'severance_reserve'],
    ['Yemek', 'food'],
    ['Servis', 'transport'],
    ['Nakliye', 'cargo'],
    ['Kira', 'rent'],
    ['Bina amortismanı', 'building_depr'],
    ['Elektrik', 'electricity'],
    ['Su', 'water'],
    ['Isıtma', 'gas'],
    ['İğne ve iplik', 'thread'],
    ['UKP sarf', 'ukp_consumables'],
    ['Genel üretim sarf', 'consumables'],
    ['Bakım ve yedek parça', 'machine_maint'],
    ['Makine amortismanı', 'machine_depr'],
    ['Taşıt / demirbaş amortismanı', 'vehicle_depr'],
    ['Araç yakıt ve bakım', 'vehicle'],
    ['Kırtasiye', 'stationery'],
    ['İSG', 'isg'],
    ['Danışmanlık', 'consulting'],
    ['Ek resmi giderler', 'official_fees'],
    ['Sigorta', 'insurance'],
    ['Diğer (telefon, internet)', 'communication'],
    ['Alınan teşvik (TL/ay)', 'incentive_amount'],
  ]

  for (const [baslik, kolon] of beklenen) {
    it(`"${baslik}" → ${kolon}`, () => {
      expect(matchExpenseColumn(baslik)).toBe(kolon)
    })
  }

  it('ekonomi alanları gider sayılmaz', () => {
    expect(matchExpenseColumn('Dikim kişi')).toBeNull()
    expect(matchExpenseColumn('Aylık adet (bant kapasitesi)')).toBeNull()
    expect(matchExpenseColumn('Üretim alanı (m²)')).toBeNull()
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/expense-mapping.test.ts`
Expected: FAIL — `expected null to be 'ukp_consumables'` ve birkaç başlık daha

- [ ] **Step 3: `expense-mapping.ts`'i güncelle**

`ExpenseColumn` birleşimine iki kolon eklenir:

```ts
export type ExpenseColumn =
  | 'personnel' | 'sgk' | 'food' | 'electricity' | 'water' | 'gas'
  | 'transport' | 'vehicle' | 'cargo' | 'machine_maint' | 'thread' | 'other'
  | 'rent' | 'building_depr' | 'machine_depr' | 'insurance' | 'overtime'
  | 'bonus' | 'severance_reserve' | 'incentive_amount' | 'isg' | 'consulting'
  | 'official_fees' | 'communication' | 'stationery' | 'needle' | 'consumables'
  | 'ukp_consumables' | 'vehicle_depr'
```

`EXPENSE_LABELS`'a iki satır (`other: 'Diğer',` satırından önce):

```ts
  ukp_consumables: 'UKP Sarf',
  vehicle_depr: 'Taşıt / Demirbaş Amortismanı',
```

`SYNONYMS`'e iki giriş ve mevcut üç girişe Excel varyantları. Eşleme normalize edilmiş **tam** başlık üzerinden yapıldığı için `'sarf'` ile `'ukp sarf'` ayrı anahtarlardır — birbirini gölgelemez:

```ts
  // ... mevcut girişler, şu üçü genişletilir:
  gas: ['dogalgaz', 'gaz', 'dogal gaz', 'isitma'],
  cargo: ['kargo', 'kargo gideri', 'nakliye'],
  thread: ['iplik', 'iplik gideri', 'dikis ipligi', 'igne ve iplik'],
  machine_maint: ['makine bakim', 'bakim', 'bakim onarim', 'makine bakim onarim',
                  'teknik servis', 'bakim ve yedek parca'],
  vehicle: ['arac', 'arac gideri', 'akaryakit', 'yakit', 'arac yakit ve bakim'],
  official_fees: ['resmi harc', 'harc', 'vergi', 'resmi odemeler', 'belediye',
                  'ek resmi giderler'],
  consumables: ['sarf', 'sarf malzeme', 'sarf malzemesi', 'yardimci malzeme',
                'genel uretim sarf'],
  // ... ve iki yeni giriş:
  incentive_amount: ['tesvik', 'tesvik tutari', 'sgk tesviki', 'devlet destegi',
                     'alinan tesvik'],
  ukp_consumables: ['ukp sarf', 'ukp sarfi', 'utu kontrol paket sarf'],
  vehicle_depr: ['tasit amortismani', 'demirbas amortismani',
                 'tasit demirbas amortismani', 'tasit ve demirbas amortismani'],
```

**Dikkat:** `'Diğer (telefon, internet)'` normalize edilince `'diger'` olur (parantez içi atılır) ve mevcut `other` sinonimine düşer — ama Excel'de bu başlık telefon/internet demektir. `communication` sinonimlerine tam başlığı ekleyip `other`'dan önce eşlenmesini sağla:

```ts
  communication: ['telefon', 'internet', 'iletisim', 'telefon internet',
                  'haberlesme', 'diger telefon internet'],
```

Bu tek başına yetmez: `normalizeHeader` parantezi attığı için `'Diğer (telefon, internet)'` → `'diger'`. Bu yüzden `normalizeHeader`'ı **değiştirme**; onun yerine `ekonomi-anket.ts` (Task 7) bu tek başlığı açıkça `communication`'a yönlendirir ve neden gerektiği orada yazılıdır. Testteki `['Diğer (telefon, internet)', 'communication']` satırını bu yüzden **kaldır** ve yerine şunu koy:

```ts
  it('parantezli "Diğer" başlığı burada other a düşer — VERI_GIRIS özel durumu Task 7 de çözülür', () => {
    expect(matchExpenseColumn('Diğer (telefon, internet)')).toBe('other')
  })
```

`INTEGER_EXPENSE_COLUMNS` **değişmez** — iki yeni kolon `NUMERIC(14,2)`, yuvarlanmamalı.

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/expense-mapping.test.ts`
Expected: PASS

- [ ] **Step 5: Mevcut gider import'unun kırılmadığını doğrula**

Run: `npm test`
Expected: PASS — `import_atolye_gider_form.mjs` bu sözlüğü kullanıyor; yeni sinonimler var olanları değiştirmedi

- [ ] **Step 6: Commit**

```bash
git add lib/pes/expense-mapping.ts lib/pes/expense-mapping.test.ts
git commit -m "feat(ekonomi): expense-mapping iki yeni kalem ve Excel basliklari

ukp_consumables ve vehicle_depr kolonlari, VERI_GIRIS basliklarinin
sinonimleri. Baslik sozlugu tek yerde kaliyor: anket cozumleyicisi
kendi sozlugunu tutmayacak, buradan okuyacak.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Anket satırını çözme ve aylara bölme

**Files:**
- Create: `lib/pes/ekonomi-anket.ts`
- Test: `lib/pes/ekonomi-anket.test.ts`

Excel `VERI_GIRIS` satırını `GiderSatiri` + `EkonomiSatiri`'ye çevirir ve anket dönemini aylara böler. Hem Task 8'in doğrulama testi hem Task 13'ün import script'i bunu kullanır — tek yerde yaşaması şart.

**Önemli:** `VERI_GIRIS` satır 1 açıkça diyor ki *"Tutarlar aylık TL."* Yani gider kalemleri zaten aylıktır; bölünmez. Bölünen tek şey cirodur: `Kesilen fatura toplamı ÷ Fatura dönemi (ay)`. Anket 3 ayı kapsıyorsa üç ay da **aynı** aylık değerleri alır ve üçü de `source='turetilmis'` olur — çünkü bu üç ayın ayrı ayrı ölçümü değil, üçüne birden atfedilen bir ortalamadır.

**Bilinen boşluk:** `VERI_GIRIS` kaç ay olduğunu söylüyor ama **hangi aydan başladığını söylemiyor.** Import script'i bu yüzden `--baslangic YYYY-MM` argümanını zorunlu ister ve seçilen ayı `economy_survey_staging.period_start`'a yazar. Tahmin edilmez.

- [ ] **Step 1: Başarısız testi yaz**

`lib/pes/ekonomi-anket.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { anketSatiriCoz, anketiAylaraBol, sgkSupheliMi } from './ekonomi-anket'

/* Atolye_Gider_Model.xlsx VERI_GIRIS satır 4 — Örssan, başlıklar birebir. */
const ORSSAN_HAM: Record<string, unknown> = {
  'No': 1,
  'Kısa ad': 'Örssan',
  'İşletme unvanı': 'ÖRSSAN TEKSTİL SANAYİ VE DIŞ TİCARET LTD ŞTİ',
  'Klasman (Taha Giyim tedarik yönetimi)': '315 - Erkek Çocuk',
  'Teşvik bölgesi': '6.Bölge',
  'Üretim alanı (m²)': 5000,
  'Kesim kişi': 6,
  'Dikim kişi': 90,
  'UKP kişi (ütü-kontrol-paket)': 35,
  'Ofis kişi': 6,
  'Günlük çalışma saati': 9,
  'Haftalık gün': 4,
  'Aylık nominal çalışma günü': 22,
  'Fiili çalışma günü (aylık ort.)': 15.25,
  'Boş / dışarı çalışılan gün (aylık ort.)': 5.5,
  'Kesilen fatura toplamı (TL)': 14788970.61,
  'Fatura dönemi (ay)': 3,
  'Aylık adet (bant kapasitesi)': 43036.7,
  'Alınan teşvik (TL/ay)': 1300000,
  'Maaş (net, TL/ay)': 4900000,
  'Fazla mesai': 200000,
  'Prim ve ikramiye': 0,
  'SGK': 200000,
  'Kıdem karşılığı': 0,
  'Yemek': 200000,
  'Servis': 350000,
  'Nakliye': 150000,
  'Kira': 0,
  'Bina amortismanı': 100000,
  'Elektrik': 150000,
  'Su': 30000,
  'Isıtma': 50000,
  'İğne ve iplik': 300000,
  'UKP sarf': 200000,
  'Genel üretim sarf': 250000,
  'Bakım ve yedek parça': 50000,
  'Makine amortismanı': 20000,
  'Taşıt / demirbaş amortismanı': 20000,
  'Araç yakıt ve bakım': 40000,
  'Kırtasiye': 10000,
  'İSG': 30000,
  'Danışmanlık': 50000,
  'Ek resmi giderler': 150000,
  'Sigorta': 100000,
  'Diğer (telefon, internet)': 3000,
}

describe('anketSatiriCoz', () => {
  const c = anketSatiriCoz(ORSSAN_HAM)

  it('kısa adı ve unvanı okur', () => {
    expect(c.kisaAd).toBe('Örssan')
    expect(c.unvan).toContain('ÖRSSAN')
  })

  it('teşvik bölgesini sayıya çevirir', () => {
    expect(c.bolge).toBe(6)
  })

  it('klasmanı noktalı virgülden böler', () => {
    expect(c.klasmanlar).toEqual(['315 - Erkek Çocuk'])
  })

  it('çoklu klasmanı böler', () => {
    const cok = anketSatiriCoz({
      ...ORSSAN_HAM,
      'Klasman (Taha Giyim tedarik yönetimi)': '315 - Erkek Çocuk;310 - Kız Bebek',
    })
    expect(cok.klasmanlar).toEqual(['315 - Erkek Çocuk', '310 - Kız Bebek'])
  })

  it('ciroyu ay sayısına böler', () => {
    expect(c.ekonomi.revenue_declared).toBeCloseTo(14788970.61 / 3, 8)
  })

  it('kadroyu doğru yerleştirir', () => {
    expect(c.ekonomi.cutting_staff).toBe(6)
    expect(c.ekonomi.sewing_staff).toBe(90)
    expect(c.ekonomi.ukp_staff).toBe(35)
    expect(c.ekonomi.office_staff).toBe(6)
  })

  it('UKP sarf ile genel üretim sarfı ayrı kolonlara yazar', () => {
    expect(c.gider.ukp_consumables).toBe(200000)
    expect(c.gider.consumables).toBe(250000)
  })

  it('taşıt amortismanını araç yakıtından ayırır', () => {
    expect(c.gider.vehicle_depr).toBe(20000)
    expect(c.gider.vehicle).toBe(40000)
  })

  it('iğne+iplik birleşik alanı thread e yazar, needle boş kalır', () => {
    expect(c.gider.thread).toBe(300000)
    expect(c.gider.needle).toBeNull()
    expect(c.birlesikAlanlar).toContain('İğne ve iplik → thread')
  })

  it('teşviki gider değil mahsup olarak okur', () => {
    expect(c.gider.incentive_amount).toBe(1300000)
  })

  it('parantezli "Diğer" başlığı communication a gider, other a değil', () => {
    expect(c.gider.communication).toBe(3000)
    expect(c.gider.other ?? null).toBeNull()
  })

  it('fatura dönemini ay sayısı olarak verir', () => {
    expect(c.aySayisi).toBe(3)
  })
})

describe('anketiAylaraBol', () => {
  const c = anketSatiriCoz(ORSSAN_HAM)

  it('3 aylık anket 3 satır üretir', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar).toHaveLength(3)
    expect(aylar.map(a => `${a.year}-${String(a.month).padStart(2, '0')}`))
      .toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('yıl sınırını aşar', () => {
    const aylar = anketiAylaraBol(c, '2026-11')
    expect(aylar.map(a => `${a.year}-${String(a.month).padStart(2, '0')}`))
      .toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('çok aylı anketin her ayı turetilmis işaretlenir', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar.every(a => a.ekonomi.source === 'turetilmis')).toBe(true)
  })

  it('tek aylı anket anket olarak işaretlenir', () => {
    const tekAy = anketSatiriCoz({ ...ORSSAN_HAM, 'Fatura dönemi (ay)': 1 })
    const aylar = anketiAylaraBol(tekAy, '2026-04')
    expect(aylar).toHaveLength(1)
    expect(aylar[0].ekonomi.source).toBe('anket')
  })

  it('gider kalemleri bölünmez — her ay aynı aylık tutarı taşır', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar.every(a => a.gider.personnel === 4900000)).toBe(true)
  })

  it('bozuk başlangıç ayında hata atar', () => {
    expect(() => anketiAylaraBol(c, '2026-13')).toThrow(/başlangıç ayı/)
  })
})

describe('sgkSupheliMi', () => {
  it('teşvik SGK dan büyükse şüpheli', () => {
    expect(sgkSupheliMi({ sgk: 200000, incentive_amount: 1300000 })).toBe(true)
  })

  it('teşvik SGK dan küçükse temiz', () => {
    expect(sgkSupheliMi({ sgk: 1800000, incentive_amount: 1200000 })).toBe(false)
  })

  it('teşvik yoksa temiz', () => {
    expect(sgkSupheliMi({ sgk: 200000, incentive_amount: null })).toBe(false)
  })

  it('SGK yoksa şüpheli sayılmaz — ayrı bir eksiklik', () => {
    expect(sgkSupheliMi({ sgk: null, incentive_amount: 1300000 })).toBe(false)
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-anket.test.ts`
Expected: FAIL — `Failed to resolve import "./ekonomi-anket"`

- [ ] **Step 3: Uygulamayı yaz**

`lib/pes/ekonomi-anket.ts`:

```ts
/**
 * Atölye gider anketi (Atolye_Gider_Model.xlsx VERI_GIRIS) → PES tipleri.
 *
 * VERI_GIRIS satır 1: "Tutarlar aylık TL." Gider kalemleri ZATEN aylıktır,
 * bölünmez. Bölünen tek şey cirodur:
 *   aylık ciro = Kesilen fatura toplamı ÷ Fatura dönemi (ay)
 *
 * Anket birden fazla ayı kapsıyorsa her ay aynı aylık değerleri alır ve
 * hepsi 'turetilmis' işaretlenir — çünkü bu, üç ayın ayrı ölçümü değil,
 * üçüne birden atfedilen bir ortalamadır. Ekranda gri gösterilir.
 *
 * Anketin HANGİ AYDAN başladığı Excel'de yoktur; çağıran zorunlu olarak
 * verir (import script'inde --baslangic). Tahmin edilmez.
 */
import { matchExpenseColumn, parseAmount } from './expense-mapping'
import type { EkonomiSatiri, GiderSatiri } from './ekonomi-tipler'

/**
 * VERI_GIRIS'e özel başlıklar. Genel sözlük bunları doğru yere koyamaz
 * çünkü normalizeHeader parantez içini atıyor:
 *   "Diğer (telefon, internet)" → "diger" → other
 * Oysa Excel'de bu başlık telefon ve interneti kastediyor.
 */
const OZEL_BASLIK: Partial<Record<string, keyof GiderSatiri>> = {
  'Diğer (telefon, internet)': 'communication',
}

/**
 * Tek Excel başlığının birden fazla PES kalemini kapsadığı yerler.
 * Ayrıştırılamaz; hangi kolona toplandığı raporlanır.
 */
const BIRLESIK_ALANLAR: Record<string, string> = {
  'İğne ve iplik': 'İğne ve iplik → thread',
}

export type CozulmusAnket = {
  kisaAd: string
  unvan: string | null
  bolge: number | null
  klasmanlar: string[]
  aySayisi: number
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
  birlesikAlanlar: string[]
}

/** "6.Bölge" → 6. Tanınmayan biçimde null. */
function bolgeCoz(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const m = /(\d)/.exec(String(v))
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 6 ? n : null
}

export function anketSatiriCoz(ham: Record<string, unknown>): CozulmusAnket {
  const gider: GiderSatiri = { incentive_amount: null }
  const birlesik: string[] = []

  // Başlık sözlüğü expense-mapping.ts'te tek yerde yaşar. Burada yalnız
  // VERI_GIRIS'e özel istisnalar geçersiz kılar.
  for (const baslik of Object.keys(ham)) {
    const kolon = OZEL_BASLIK[baslik] ?? matchExpenseColumn(baslik)
    if (!kolon) continue
    const deger = parseAmount(ham[baslik])
    if (deger === null) continue
    ;(gider as Record<string, number | null>)[kolon] = deger
    if (BIRLESIK_ALANLAR[baslik]) birlesik.push(BIRLESIK_ALANLAR[baslik])
  }

  // İğne kalemi ayrı sorulmadığı sürece boş kalır; toplamı thread taşır.
  if (gider.needle === undefined) gider.needle = null

  const ayHam = parseAmount(ham['Fatura dönemi (ay)'])
  const aySayisi = ayHam && ayHam > 0 ? Math.round(ayHam) : 1
  const fatura = parseAmount(ham['Kesilen fatura toplamı (TL)'])

  const ekonomi: EkonomiSatiri = {
    revenue_declared: fatura === null ? null : fatura / aySayisi,
    idle_days: parseAmount(ham['Boş / dışarı çalışılan gün (aylık ort.)']),
    qty_declared: parseAmount(ham['Aylık adet (bant kapasitesi)']),
    nominal_days: parseAmount(ham['Aylık nominal çalışma günü']),
    actual_days: parseAmount(ham['Fiili çalışma günü (aylık ort.)']),
    hours_per_day: parseAmount(ham['Günlük çalışma saati']),
    cutting_staff: parseAmount(ham['Kesim kişi']),
    sewing_staff: parseAmount(ham['Dikim kişi']),
    ukp_staff: parseAmount(ham['UKP kişi (ütü-kontrol-paket)']),
    office_staff: parseAmount(ham['Ofis kişi']),
    area_m2: parseAmount(ham['Üretim alanı (m²)']),
    source: aySayisi > 1 ? 'turetilmis' : 'anket',
  }

  const klasmanHam = ham['Klasman (Taha Giyim tedarik yönetimi)']
  const klasmanlar = klasmanHam
    ? String(klasmanHam).split(';').map(s => s.trim()).filter(Boolean)
    : []

  return {
    kisaAd: String(ham['Kısa ad'] ?? '').trim(),
    unvan: ham['İşletme unvanı'] ? String(ham['İşletme unvanı']).trim() : null,
    bolge: bolgeCoz(ham['Teşvik bölgesi']),
    klasmanlar,
    aySayisi,
    gider,
    ekonomi,
    birlesikAlanlar: birlesik,
  }
}

export type AylikSatir = {
  year: number
  month: number
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
}

/**
 * Anketi kapsadığı aylara yayar. Gider kalemleri zaten aylık olduğu için
 * bölünmez; her ay aynı tutarları taşır ve çok aylıysa 'turetilmis' olur.
 *
 * @param baslangic 'YYYY-MM' — anketin kapsadığı ilk ay. Zorunlu.
 */
export function anketiAylaraBol(c: CozulmusAnket, baslangic: string): AylikSatir[] {
  const m = /^(\d{4})-(\d{2})$/.exec(baslangic.trim())
  if (!m) throw new Error(`Geçersiz başlangıç ayı: "${baslangic}" — YYYY-MM bekleniyor`)
  const yil = Number(m[1])
  const ay = Number(m[2])
  if (ay < 1 || ay > 12) throw new Error(`Geçersiz başlangıç ayı: "${baslangic}" — ay 1-12 olmalı`)

  const satirlar: AylikSatir[] = []
  for (let i = 0; i < c.aySayisi; i++) {
    const toplam = (ay - 1) + i
    satirlar.push({
      year: yil + Math.floor(toplam / 12),
      month: (toplam % 12) + 1,
      gider: { ...c.gider },
      ekonomi: { ...c.ekonomi },
    })
  }
  return satirlar
}

/**
 * FORMULLER!E12 uyarısı: net gider = brüt − teşvik kuralı SGK'nın BRÜT
 * bildirildiğini varsayar. Teşvik SGK'dan büyükse SGK net bildirilmiş
 * demektir ve teşvik iki kez düşülür — net gider olduğundan düşük çıkar.
 *
 * Örssan pilotu bu durumda: SGK 200 bin, teşvik 1,3 milyon.
 */
export function sgkSupheliMi(g: Pick<GiderSatiri, 'sgk' | 'incentive_amount'>): boolean {
  if (g.sgk === null || g.sgk === undefined) return false
  if (g.incentive_amount === null || g.incentive_amount === undefined) return false
  return g.incentive_amount > g.sgk
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-anket.test.ts`
Expected: PASS — 22 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/ekonomi-anket.ts lib/pes/ekonomi-anket.test.ts
git commit -m "feat(ekonomi): anket satiri cozumu ve aylara bolme

VERI_GIRIS basliklari -> PES tipleri. Gider kalemleri zaten aylik,
bolunmez; yalniz ciro ay sayisina bolunur. Cok ayli anketin her ayi
turetilmis isaretlenir. Baslangic ayi Excel'de yok, cagiran verir.
sgkSupheliMi FORMULLER!E12 uyarisini kurala cevirir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 11 pilotun tamamını Excel'e karşı doğrula

**Files:**
- Create: `lib/pes/ekonomi-pilot.test.ts`

Task 1'in ürettiği fixture'daki her atölye için `hesapla()` çalıştırılır ve Excel `HESAP` sayfasının o satırıyla karşılaştırılır. Excel bu işin referans uygulamasıdır; ondan sapma bir hatadır.

- [ ] **Step 1: Testi yaz**

`lib/pes/ekonomi-pilot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { anketSatiriCoz } from './ekonomi-anket'
import { hesapla } from './ekonomi-hesap'
import type { EkonomiParam, EkonomiRasyo } from './ekonomi-tipler'
import fixture from './__fixtures__/ekonomi-pilot.json'

/**
 * Excel HESAP başlığı → EkonomiRasyo alanı.
 * Sol taraf Atolye_Gider_Model.xlsx HESAP satır 3'ten birebir kopyalanmıştır.
 */
const ESLESME: Array<[string, keyof EkonomiRasyo, number]> = [
  ['Toplam kişi', 'toplamKisi', 9],
  ['Üretim kişi (kesim+dikim+UKP)', 'uretimKisi', 9],
  ['Dikim payı', 'dikimPayi', 10],
  ['Aylık ciro (TL)', 'aylikCiro', 4],
  ['Ortalama fiyat / adet', 'ortFiyatAdet', 6],
  ['Brüt gider (TL)', 'brutGider', 4],
  ['Net gider (TL)', 'netGider', 4],
  ['Kâr / zarar (TL)', 'karZarar', 4],
  ['Marj %', 'marj', 10],
  ['İşçilik toplamı (maaş+mesai+prim+SGK+kıdem)', 'iscilikToplam', 4],
  ['İşçilik payı (net)', 'iscilikPayi', 10],
  ['İşçilik dışı / kişi, kira hariç', 'iscilikDisiKisi', 6],
  ['Ciro / kişi', 'ciroKisi', 5],
  ['Net gider / kişi', 'netGiderKisi', 5],
  ['Maaş / kişi', 'maasKisi', 5],
  ['Adet / dikimci', 'adetDikimci', 6],
  ['Nominal dikim dakikası / ay', 'nominalDikimDk', 4],
  ['Fiili dikim dakikası / ay', 'fiiliDikimDk', 4],
  ['Üretim kişi-dakikası (nominal)', 'uretimKisiDk', 4],
  ['Kişi-dakika maliyeti (TL/dk)', 'kisiDkMaliyet', 10],
  ['KESİM dk maliyeti (TL/dk)', 'kesimDkMaliyet', 10],
  ['DİKİM dk maliyeti (TL/dk)', 'dikimDkMaliyet', 10],
  ['UKP dk maliyeti (TL/dk)', 'ukpDkMaliyet', 10],
  ['Dikim dk cirosu (TL/dk)', 'dikimDkCiro', 10],
  ['Dakika marjı (ciro − maliyet, TL/dk)', 'dakikaMarji', 10],
  ['Fiili dikim dk maliyeti (TL/dk)', 'fiiliDikimDkMaliyet', 10],
  ['Asgari dakika çarpanı (× asgari ücretli dk)', 'asgariDkCarpani', 9],
  ['Dikim dakikası / adet (nominal)', 'dikimDkAdet', 8],
  ['Başabaş fiyat / adet', 'basabasFiyat', 7],
  ['Adil fiyat / adet (hedef marjla)', 'adilFiyat', 7],
  ['Fiyat sapması (fiyat ÷ adil − 1)', 'fiyatSapmasi', 9],
  ['İşçilik yük katsayısı (işçilik net ÷ maaş)', 'iscilikYukKatsayisi', 10],
  ['Dikim dk maliyeti ÷ 3D referans', 'dkMaliyet3DOran', 9],
]

const param = fixture.parametre as EkonomiParam
const dk3d = fixture.dk3d as Record<string, number>

describe('11 pilot atölye — Excel HESAP ile birebir', () => {
  it('fixture 11 atölye içeriyor', () => {
    expect(fixture.atolyeler).toHaveLength(11)
  })

  for (const atolye of fixture.atolyeler) {
    describe(atolye.ad, () => {
      const cozum = anketSatiriCoz(atolye.giris as Record<string, unknown>)
      const bolgeAd = String((atolye.giris as Record<string, unknown>)['Teşvik bölgesi'] ?? '').trim()
      const rasyo = hesapla({
        gider: cozum.gider,
        ekonomi: cozum.ekonomi,
        param,
        dkMaliyet3D: dk3d[bolgeAd] ?? null,
        qtyActual: null,
      })

      for (const [excelBaslik, alan, hassasiyet] of ESLESME) {
        const beklenen = (atolye.beklenen as Record<string, unknown>)[excelBaslik]
        if (typeof beklenen !== 'number') continue

        it(`${excelBaslik}`, () => {
          const bulunan = rasyo[alan]
          expect(bulunan, `${alan} null döndü`).not.toBeNull()
          expect(bulunan as number).toBeCloseTo(beklenen, hassasiyet)
        })
      }
    })
  }
})
```

- [ ] **Step 2: Testi çalıştır**

Run: `npx vitest run lib/pes/ekonomi-pilot.test.ts`
Expected: PASS — 11 atölye × ~33 gösterge ≈ 360 test

Bir gösterge kırılırsa önce **Excel'in mi yoksa kodun mu** doğru olduğuna karar ver: `FORMULLER` sayfasındaki sözlü tanımı oku, elle hesapla. Excel hatalıysa (pilot veride bilinen iki örnek var — Bese kıdem ve Örssan ek resmi/sigorta) `OKU_BENI` notunu güncelleyip fixture'ı yeniden üret; kod hatalıysa formülü düzelt.

- [ ] **Step 3: Commit**

```bash
git add lib/pes/ekonomi-pilot.test.ts
git commit -m "test(ekonomi): 11 pilot atolye Excel HESAP'a karsi dogrulandi

hesapla() ciktisi Atolye_Gider_Model.xlsx'in onbellekli formul
sonuclariyla gosterge gosterge karsilastirilir. Excel bu isin
referans uygulamasi; sapma bir hatadir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Akran grubu ve sıralama

**Files:**
- Create: `lib/pes/ekonomi-akran.ts`
- Test: `lib/pes/ekonomi-akran.test.ts`

`FORMULLER` satır 36, 53 ve 56. Medyan, yüzdelik ve akran grubu seçimi. Yalnız cirosu olan atölyeler örnekleme girer.

- [ ] **Step 1: Başarısız testi yaz**

`lib/pes/ekonomi-akran.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { medyan, yuzdelikSkor, buyuklukBandi, akranGrubu, marjSirasi } from './ekonomi-akran'
import type { AkranAdayi } from './ekonomi-akran'

function aday(
  ad: string, marj: number | null, klasman: string[], dikim: number,
): AkranAdayi {
  return { workshopId: ad.length, ad, klasmanlar: klasman, sewingStaff: dikim, marj }
}

const ORNEKLEM: AkranAdayi[] = [
  aday('A', 0.10, ['315 - Erkek Çocuk'], 40),
  aday('BB', 0.05, ['315 - Erkek Çocuk'], 45),
  aday('CCC', -0.03, ['315 - Erkek Çocuk'], 90),
  aday('DDDD', -0.20, ['300 - Kız Çocuk 1'], 95),
  aday('EEEEE', 0.02, ['300 - Kız Çocuk 1'], 120),
  aday('FFFFFF', null, ['315 - Erkek Çocuk'], 50),
]

describe('medyan', () => {
  it('tek sayıda ortadaki', () => {
    expect(medyan([3, 1, 2])).toBe(2)
  })

  it('çift sayıda iki ortancanın ortalaması', () => {
    expect(medyan([4, 1, 3, 2])).toBe(2.5)
  })

  it('null değerleri atlar', () => {
    expect(medyan([1, null, 3])).toBe(2)
  })

  it('hiç sayı yoksa null', () => {
    expect(medyan([null, null])).toBeNull()
  })

  it('boş dizide null', () => {
    expect(medyan([])).toBeNull()
  })
})

describe('yuzdelikSkor', () => {
  it('en iyi 100', () => {
    expect(yuzdelikSkor(10, [2, 4, 6, 8, 10])).toBe(100)
  })

  it('en kötü 0', () => {
    expect(yuzdelikSkor(2, [2, 4, 6, 8, 10])).toBe(0)
  })

  it('ortadaki 50', () => {
    expect(yuzdelikSkor(6, [2, 4, 6, 8, 10])).toBe(50)
  })

  it('tek elemanlı örneklemde null — kıyas yok', () => {
    expect(yuzdelikSkor(5, [5])).toBeNull()
  })

  it('değer null ise null', () => {
    expect(yuzdelikSkor(null, [2, 4, 6])).toBeNull()
  })
})

describe('buyuklukBandi', () => {
  it('50 altı kucuk', () => {
    expect(buyuklukBandi(40)).toBe('kucuk')
  })

  it('50 dahil orta', () => {
    expect(buyuklukBandi(50)).toBe('orta')
  })

  it('100 üstü buyuk', () => {
    expect(buyuklukBandi(120)).toBe('buyuk')
  })

  it('bilinmiyorsa null', () => {
    expect(buyuklukBandi(null)).toBeNull()
  })
})

describe('akranGrubu', () => {
  it('yeterli örneklem yoksa klasmana düşer', () => {
    const hedef = ORNEKLEM[2] // CCC, 315 klasman, 90 kişi = orta
    const g = akranGrubu(hedef, ORNEKLEM, 5)
    expect(g.kademe).toBe('klasman')
    expect(g.uyeler.map(u => u.ad).sort()).toEqual(['A', 'BB', 'CCC'])
  })

  it('klasmanda da yetmezse tüm örnekleme düşer', () => {
    const hedef = ORNEKLEM[3] // DDDD, 300 klasman — yalnız 2 üye
    const g = akranGrubu(hedef, ORNEKLEM, 5)
    expect(g.kademe).toBe('tumu')
    expect(g.uyeler).toHaveLength(5) // marjı null olan FFFFFF dışarıda
  })

  it('cirosu olmayan atölye örnekleme girmez', () => {
    const hedef = ORNEKLEM[0]
    const g = akranGrubu(hedef, ORNEKLEM, 1)
    expect(g.uyeler.some(u => u.ad === 'FFFFFF')).toBe(false)
  })

  it('n her zaman raporlanır', () => {
    const g = akranGrubu(ORNEKLEM[0], ORNEKLEM, 5)
    expect(g.n).toBe(g.uyeler.length)
  })

  it('eşik düşükse en dar kademede kalır', () => {
    const hedef = ORNEKLEM[0] // A, 315, 40 kişi = kucuk
    const g = akranGrubu(hedef, ORNEKLEM, 2)
    expect(g.kademe).toBe('klasman+buyukluk')
    expect(g.uyeler.map(u => u.ad).sort()).toEqual(['A', 'BB'])
  })
})

describe('marjSirasi', () => {
  it('en kârlı 1', () => {
    expect(marjSirasi(0.10, ORNEKLEM)).toBe(1)
  })

  it('en zararlı sonuncu', () => {
    expect(marjSirasi(-0.20, ORNEKLEM)).toBe(5)
  })

  it('marjı olmayan sıralanmaz', () => {
    expect(marjSirasi(null, ORNEKLEM)).toBeNull()
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-akran.test.ts`
Expected: FAIL — `Failed to resolve import "./ekonomi-akran"`

- [ ] **Step 3: Uygulamayı yaz**

`lib/pes/ekonomi-akran.ts`:

```ts
/**
 * Akran karşılaştırması — medyan, yüzdelik, sıralama.
 *
 * FORMULLER!E53: "Benchmark = örneklem medyanı. 30+ atölyede aynı klasman /
 * büyüklük / bölge akran grubuna geçilmeli."
 *
 * Bugün 11 atölye var; medyan bu örneklemde zayıf bir istatistiktir. Bunu
 * gizlemek yerine her karşılaştırmanın yanında kademe ve n gösterilir.
 */

export type BuyuklukBandi = 'kucuk' | 'orta' | 'buyuk'

export type AkranAdayi = {
  workshopId: number
  ad: string
  klasmanlar: string[]
  sewingStaff: number | null
  /** Marjı null olan atölye örnekleme girmez — cirosu yok demektir. */
  marj: number | null
}

export type AkranKademesi = 'klasman+buyukluk' | 'klasman' | 'tumu'

export type AkranSonucu = {
  kademe: AkranKademesi
  n: number
  uyeler: AkranAdayi[]
}

/** Null'ları atlayarak medyan. Hiç sayı yoksa null. */
export function medyan(degerler: Array<number | null>): number | null {
  const sayilar = degerler.filter((d): d is number => d !== null && Number.isFinite(d))
  if (sayilar.length === 0) return null
  const s = [...sayilar].sort((a, b) => a - b)
  const orta = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[orta] : (s[orta - 1] + s[orta]) / 2
}

/**
 * FORMULLER!C56 — kendisinden kötü olan atölye sayısı ÷ (n − 1) × 100.
 * Tek elemanlı örneklemde kıyas yoktur; null döner.
 */
export function yuzdelikSkor(deger: number | null, orneklem: Array<number | null>): number | null {
  if (deger === null) return null
  const sayilar = orneklem.filter((d): d is number => d !== null && Number.isFinite(d))
  if (sayilar.length < 2) return null
  const kotuSayisi = sayilar.filter(d => d < deger).length
  return (kotuSayisi / (sayilar.length - 1)) * 100
}

/** Dikim kişi sayısına göre büyüklük bandı. Sınırlar tasarım dokümanından. */
export function buyuklukBandi(sewingStaff: number | null): BuyuklukBandi | null {
  if (sewingStaff === null) return null
  if (sewingStaff < 50) return 'kucuk'
  if (sewingStaff <= 100) return 'orta'
  return 'buyuk'
}

/**
 * Kademeli akran grubu:
 *   1. aynı klasman + aynı büyüklük bandı
 *   2. n < esik ise → aynı klasman
 *   3. hâlâ n < esik ise → tüm örneklem
 *
 * Hedef atölye her zaman grubun içindedir. Marjı null olan (cirosu
 * olmayan) atölyeler hiçbir kademede sayılmaz.
 */
export function akranGrubu(
  hedef: AkranAdayi, tumu: AkranAdayi[], esik = 5,
): AkranSonucu {
  const gecerli = tumu.filter(a => a.marj !== null)
  const hedefBant = buyuklukBandi(hedef.sewingStaff)

  const klasmanOrtak = (a: AkranAdayi) =>
    a.klasmanlar.some(k => hedef.klasmanlar.includes(k))

  const dar = gecerli.filter(a => klasmanOrtak(a) && buyuklukBandi(a.sewingStaff) === hedefBant)
  if (dar.length >= esik) return { kademe: 'klasman+buyukluk', n: dar.length, uyeler: dar }

  const orta = gecerli.filter(klasmanOrtak)
  if (orta.length >= esik) return { kademe: 'klasman', n: orta.length, uyeler: orta }

  return { kademe: 'tumu', n: gecerli.length, uyeler: gecerli }
}

/**
 * HESAP!AO — marjı kendisinden büyük olan atölye sayısı + 1. 1 = en kârlı.
 * Marjı olmayan atölye sıralanmaz.
 */
export function marjSirasi(marj: number | null, orneklem: AkranAdayi[]): number | null {
  if (marj === null) return null
  const ustunde = orneklem.filter(a => a.marj !== null && a.marj > marj).length
  return ustunde + 1
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-akran.test.ts`
Expected: PASS — 21 test

- [ ] **Step 5: Tüm Faz 1 testlerini birlikte çalıştır**

Run: `npm test`
Expected: PASS — mevcut testler dahil hiçbiri kırılmamış olmalı

- [ ] **Step 6: Commit**

```bash
git add lib/pes/ekonomi-akran.ts lib/pes/ekonomi-akran.test.ts
git commit -m "feat(ekonomi): akran grubu, medyan, yuzdelik ve marj sirasi

Kademeli akran secimi: klasman+buyukluk -> klasman -> tumu. Cirosu
olmayan atolye orneklem disi. n her karsilastirmada raporlanir cunku
11 atolyede medyan zayif bir istatistik.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 2 — Veritabanı

## Task 10: Migration 037 yaz

**Files:**
- Create: `supabase/migrations/037_atolye_ekonomi.sql`

**Dikkat — iki tuzak:**

1. **`OR workshop_id IS NULL` KULLANILMAYACAK.** 035'ten gelen bu kalıp NULL yazılan satırı bütün atölyelere görünür kılıyor. `workshop_economy.workshop_id` zaten `NOT NULL`, ama daha önemlisi bu tablo **atölye kullanıcısına hiç açılmıyor** (tasarım kararı: iç ekip girer, atölye görmez). Politika bunu `current_workshop_id() IS NULL` ile zorlar.

2. **`monthly_expense`'in eski kolonları `BIGINT`.** Yeni iki kolon `NUMERIC(14,2)` — 021'de eklenen 15 kalemle aynı. `expense-mapping.coerceForColumn` yuvarlamayı zaten hallediyor; yeni kolonları `INTEGER_EXPENSE_COLUMNS`'a **eklememek** gerekiyor.

- [ ] **Step 1: Migration'ı yaz**

```sql
-- ============================================================
-- Migration 037 — Atölye ekonomi veri omurgası
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-15-atolye-ekonomi-e0.md
-- Veri kaynağı:    Atolye_Gider_Model.xlsx
--
-- NE EKLİYOR:
--   1. monthly_expense'e iki kalem — ukp_consumables, vehicle_depr
--   2. workshop_economy   — giderde olmayan aylık alanlar (ciro, adet, gün, kadro)
--   3. economy_param      — dönem versiyonlu 16 model parametresi
--   4. economy_survey_staging — ham anket satırı (izlenebilirlik)
--
-- NE EKLEMİYOR:
--   Bölge 3D dakika maliyeti. Mevcut dk_maliyet (007) tablosundan okunur;
--   Excel'in PARAMETRE!D32:D37 bloğu onun kopyasıdır ve ikiye ayrılmamalı.
--
-- GÖRÜNÜRLÜK: Bu üç tablo İÇ EKİP içindir. Atölye kullanıcısı (033) hiçbirini
--   göremez — politikalar current_workshop_id() IS NULL şartıyla bunu zorlar.
--   035'teki "OR workshop_id IS NULL" kalıbı BİLEREK kullanılmadı: o kalıp
--   NULL yazılan satırı bütün atölyelere açıyor.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. monthly_expense: iki eksik kalem ----------
-- Excel'in 26 gider satırının 24'ü zaten karşılanıyor. Kalan ikisi:
ALTER TABLE monthly_expense
    ADD COLUMN IF NOT EXISTS ukp_consumables NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS vehicle_depr    NUMERIC(14,2);

COMMENT ON COLUMN monthly_expense.ukp_consumables IS
'UKP (ütü-kontrol-paket) sarfı. consumables''tan ayrı: ikisi birlikte yazılırsa UKP bölümünün dakika maliyeti hesaplanamaz.';
COMMENT ON COLUMN monthly_expense.vehicle_depr IS
'Taşıt / demirbaş amortismanı. vehicle''dan ayrı: o yakıt ve bakım yani nakit gider, bu amortisman.';

-- ---------- 2. workshop_economy ----------
CREATE TABLE IF NOT EXISTS workshop_economy (
    id                SERIAL PRIMARY KEY,
    workshop_id       INTEGER  NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id         UUID     NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    year              SMALLINT NOT NULL,
    month             SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),

    -- Ciro: boş gün düzeltmesi ÖNCESİ. Düzeltme hesap katmanında yapılır ki
    -- parametre değişince geçmiş veri yeniden yazılmak zorunda kalmasın.
    revenue_declared  NUMERIC(16,2),
    idle_days         NUMERIC(5,2),
    qty_declared      INTEGER,

    nominal_days      NUMERIC(5,2),
    actual_days       NUMERIC(5,2),
    hours_per_day     NUMERIC(4,1),

    -- O AYA ait kadro. workshop tablosundaki kadro bugünkü durumdur ve
    -- güncellenince geçmişi siler; ekonomi geriye dönük hesaplandığı için
    -- ayın kendi kadrosu burada durmalı.
    cutting_staff     SMALLINT,
    sewing_staff      SMALLINT,
    ukp_staff         SMALLINT,
    office_staff      SMALLINT,

    area_m2           INTEGER,

    source            TEXT     NOT NULL DEFAULT 'elle',
    survey_id         INTEGER,
    note              TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (workshop_id, year, month),
    CONSTRAINT we_source_chk CHECK (source IN ('anket','elle','turetilmis')),
    CONSTRAINT we_year_chk   CHECK (year BETWEEN 2000 AND 2100),
    -- Türetilmiş satır kaynağını göstermek zorunda; aksi halde birkaç ay
    -- içinde hangi ayın gerçek hangisinin atıf olduğu kaybolur.
    CONSTRAINT we_turetilmis_kaynakli CHECK (source <> 'turetilmis' OR survey_id IS NOT NULL)
);

COMMENT ON TABLE workshop_economy IS
'Atölye aylık ekonomi satırı: giderde olmayan alanlar. monthly_expense ile aynı anahtar. İÇ EKİP verisi — atölye kullanıcısı göremez.';
COMMENT ON COLUMN workshop_economy.source IS
'anket = beyandan tek aya geldi | elle = iç ekip girdi | turetilmis = çok aylı anketten bölündü, gerçek ölçüm değil';

CREATE INDEX IF NOT EXISTS idx_we_tenant   ON workshop_economy(tenant_id);
CREATE INDEX IF NOT EXISTS idx_we_donem    ON workshop_economy(year, month);
CREATE INDEX IF NOT EXISTS idx_we_workshop ON workshop_economy(workshop_id, year, month);

DROP TRIGGER IF EXISTS trg_we_updated ON workshop_economy;
CREATE TRIGGER trg_we_updated BEFORE UPDATE ON workshop_economy
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 3. economy_param ----------
CREATE TABLE IF NOT EXISTS economy_param (
    donem       VARCHAR(7) NOT NULL,          -- 'YYYY-MM'
    param_key   TEXT       NOT NULL,
    param_value NUMERIC(14,4) NOT NULL,
    tenant_id   UUID       NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, donem, param_key),
    CONSTRAINT ep_donem_chk CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE economy_param IS
'Ekonomi modelinin dönem versiyonlu parametreleri (Atolye_Gider_Model.xlsx PARAMETRE sayfası). Bir ay hesaplanırken o aydan küçük veya eşit en yakın dönem kullanılır; asgari ücret değişince geçmiş bozulmaz.';

DROP TRIGGER IF EXISTS trg_ep_updated ON economy_param;
CREATE TRIGGER trg_ep_updated BEFORE UPDATE ON economy_param
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 4. economy_survey_staging ----------
CREATE TABLE IF NOT EXISTS economy_survey_staging (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    raw               JSONB NOT NULL,
    workshop_name_raw TEXT,
    workshop_id       INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    match_status      TEXT NOT NULL DEFAULT 'eslesmedi',
    period_start      VARCHAR(7),                       -- 'YYYY-MM'
    period_months     SMALLINT NOT NULL DEFAULT 1,
    promoted_at       TIMESTAMPTZ,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ess_match_chk CHECK (match_status IN ('kesin','inceleme','eslesmedi')),
    CONSTRAINT ess_months_chk CHECK (period_months BETWEEN 1 AND 24),
    CONSTRAINT ess_donem_chk CHECK (period_start IS NULL OR period_start ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE economy_survey_staging IS
'Ham gider anketi satırı, dokunulmadan. Aylara bölme izi burada kalır; yanlış bölünen anket geri alınıp yeniden bölünebilir.';
COMMENT ON COLUMN economy_survey_staging.period_start IS
'Anketin kapsadığı ilk ay. Excel VERI_GIRIS kaç ay olduğunu söylüyor ama hangi aydan başladığını söylemiyor — import sırasında elle verilir, tahmin edilmez.';

CREATE INDEX IF NOT EXISTS idx_ess_tenant  ON economy_survey_staging(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ess_status  ON economy_survey_staging(match_status)
    WHERE promoted_at IS NULL;

ALTER TABLE workshop_economy
    DROP CONSTRAINT IF EXISTS we_survey_fk;
ALTER TABLE workshop_economy
    ADD CONSTRAINT we_survey_fk FOREIGN KEY (survey_id)
    REFERENCES economy_survey_staging(id) ON DELETE SET NULL;

-- ---------- 5. RLS ----------
-- Üç tablo da İÇ EKİP verisi. Atölye kullanıcısının oturumunda
-- current_workshop_id() dolu olur; bu şart onu tamamen dışarıda tutar.
--
-- 035'in "OR workshop_id IS NULL" kalıbı BİLEREK yok: o kalıp NULL yazılan
-- satırı her atölyeye açıyor ve burada görünürlük zaten istenmiyor.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['workshop_economy','economy_param','economy_survey_staging'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- 028: public şemada anon/authenticated yetkisiz kalsın.
REVOKE ALL ON workshop_economy, economy_param, economy_survey_staging
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 workshop_economy, economy_param, economy_survey_staging TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE workshop_economy_id_seq TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE economy_survey_staging_id_seq TO pes_app';
    END IF;
END $$;

-- ---------- 6. Parametre tohumu — 2026-01 ----------
-- Atolye_Gider_Model.xlsx PARAMETRE sayfasının başlangıç değerleri.
-- Her tenant için yazılır; tenant yoksa hiçbir şey eklenmez.
INSERT INTO economy_param (tenant_id, donem, param_key, param_value, note)
SELECT t.id, '2026-01', p.k, p.v, p.n
FROM tenant t
CROSS JOIN (VALUES
    ('min_wage_gross',      33030.0000, 'Brüt asgari ücret — ÇSGB 2026'),
    ('min_wage_net',        28075.5000, 'Net asgari ücret — ÇSGB 2026'),
    ('employer_cost',       39223.1300, 'İşveren maliyeti, imalat 5 puan SGK indirimi'),
    ('wage_support',         1270.0000, 'Asgari ücret desteği — 2026 için sürüyor'),
    ('minutes_per_day',       540.0000, '9 saat × 60, molalar hariç'),
    ('nominal_days',           22.0000, '52 hafta × 5 gün ÷ 12'),
    ('effective_days',         19.5000, 'Resmi tatil, izin ve devamsızlık sonrası'),
    ('eff_cutting',             0.7500, 'Kesim verimliliği'),
    ('eff_sewing',              0.6500, 'Dikim verimliliği — tipik Türk bandı %50-70'),
    ('eff_ukp',                 0.7500, 'UKP verimliliği'),
    ('target_margin',           0.1500, 'Hedef tedarikçi marjı'),
    ('weight_cutting',          1.0000, 'Kesim maaş ağırlığı — bölüm maaşları toplanınca güncellenir'),
    ('weight_sewing',           1.0000, 'Dikim maaş ağırlığı'),
    ('weight_ukp',              1.0000, 'UKP maaş ağırlığı'),
    ('revenue_adj_on',          1.0000, 'Boş gün ciro düzeltmesi açık'),
    ('revenue_adj_divisor',    24.0000, 'Boş gün düzeltme paydası')
) AS p(k, v, n)
ON CONFLICT (tenant_id, donem, param_key) DO NOTHING;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM economy_param WHERE donem = '2026-01';
--   → tenant sayısı × 16
--
-- Atölye kullanıcısı görememeli:
--   SET LOCAL pes.workshop_id = '1';
--   SELECT count(*) FROM workshop_economy;   -- → 0
--
-- node scripts/verify_public_api.mjs
-- node scripts/verify_workshop_isolation.mjs
--
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS workshop_economy;
--   DROP TABLE IF EXISTS economy_survey_staging;
--   DROP TABLE IF EXISTS economy_param;
--   ALTER TABLE monthly_expense DROP COLUMN IF EXISTS ukp_consumables;
--   ALTER TABLE monthly_expense DROP COLUMN IF EXISTS vehicle_depr;
--   COMMIT;
```

- [ ] **Step 2: Commit (henüz uygulama yok)**

```bash
git add supabase/migrations/037_atolye_ekonomi.sql
git commit -m "feat(ekonomi): migration 037 — ekonomi veri omurgasi semasi

monthly_expense'e ukp_consumables ve vehicle_depr; workshop_economy,
economy_param (donem versiyonlu, 2026-01 tohumlu) ve
economy_survey_staging tablolari.

RLS: uc tablo da ic ekip verisi, atolye kullanicisi goremez
(current_workshop_id() IS NULL). 035'in OR workshop_id IS NULL kalibi
bilerek kullanilmadi — o kalip NULL satiri her atolyeye aciyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```


### Task 10 ek adımı: `v_expense_groups` görünümünü güncelle

`v_expense_groups` (021) kolonları tek tek sayıyor; `SELECT *` kullanmıyor. Yani yeni iki kalem yazıldığı anda **mevcut gider panosunun toplamı eksik kalır** ve kimse fark etmez. Görünüm aynı migration içinde yenilenmeli.

- [ ] **Step 1b: Migration 037'ye görünüm yenilemesini ekle**

`037_atolye_ekonomi.sql` içinde, RLS bloğundan **önce** (bölüm 4 ile 5 arasına):

```sql
-- ---------- 4b. v_expense_groups — iki yeni kalem ----------
-- 021'deki görünüm kolonları tek tek sayıyor. Yeni kalemler eklenmezse
-- gider panosunun toplamı sessizce eksik kalır:
--   ukp_consumables → G6 üretim sarf (UKP sarfı bir sarf kalemidir)
--   vehicle_depr    → G5 makine ve bakım (amortisman, nakit gider değil;
--                      vehicle yakıt/bakım olarak G7'de kalır)
-- Doluluk paydası 27 → 29.
CREATE OR REPLACE VIEW v_expense_groups AS
SELECT
    me.id,
    me.tenant_id,
    me.workshop_id,
    me.year,
    me.month,
    me.work_days,

    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)            AS g1_iscilik,

    COALESCE(me.food,0) + COALESCE(me.transport,0)                          AS g2_personel_yan,

    COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)  AS g3_enerji,

    COALESCE(me.rent,0) + COALESCE(me.building_depr,0)                      AS g4_mekan,

    COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)                                         AS g5_makine,

    COALESCE(me.thread,0) + COALESCE(me.needle,0)
      + COALESCE(me.consumables,0) + COALESCE(me.ukp_consumables,0)         AS g6_sarf,

    COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0)
      + COALESCE(me.vehicle,0)                                              AS g7_dis_hizmet,

    COALESCE(me.other,0)                                                    AS g8_diger,

    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.ukp_consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)                                                AS toplam_brut,

    COALESCE(me.incentive_amount,0)                                         AS tesvik,
    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.ukp_consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)
      - COALESCE(me.incentive_amount,0)                                     AS toplam_net,

    (
      (me.personnel IS NOT NULL)::int + (me.sgk IS NOT NULL)::int
    + (me.food IS NOT NULL)::int + (me.electricity IS NOT NULL)::int
    + (me.water IS NOT NULL)::int + (me.gas IS NOT NULL)::int
    + (me.transport IS NOT NULL)::int + (me.vehicle IS NOT NULL)::int
    + (me.cargo IS NOT NULL)::int + (me.machine_maint IS NOT NULL)::int
    + (me.thread IS NOT NULL)::int + (me.other IS NOT NULL)::int
    + (me.rent IS NOT NULL)::int + (me.building_depr IS NOT NULL)::int
    + (me.machine_depr IS NOT NULL)::int + (me.insurance IS NOT NULL)::int
    + (me.overtime IS NOT NULL)::int + (me.bonus IS NOT NULL)::int
    + (me.severance_reserve IS NOT NULL)::int + (me.incentive_amount IS NOT NULL)::int
    + (me.isg IS NOT NULL)::int + (me.consulting IS NOT NULL)::int
    + (me.official_fees IS NOT NULL)::int + (me.communication IS NOT NULL)::int
    + (me.stationery IS NOT NULL)::int + (me.needle IS NOT NULL)::int
    + (me.consumables IS NOT NULL)::int
    + (me.ukp_consumables IS NOT NULL)::int + (me.vehicle_depr IS NOT NULL)::int
    )::numeric / 29.0                                                       AS doluluk_orani
FROM monthly_expense me;

COMMENT ON VIEW v_expense_groups IS 'Kanonik gider grupları G1-G8 + brüt/net çift defter + doluluk oranı. 037 ile ukp_consumables (G6) ve vehicle_depr (G5) eklendi, doluluk paydası 29 oldu.';
```

Rollback bloğuna da eklenir (021'in tanımına geri dönmek için):

```sql
--   -- v_expense_groups'u 021'deki haline döndür:
--   \i supabase/migrations/021_expense_v2.sql   -- yalnız 3. bölüm
```

- [ ] **Step 2b: Görünümün doğru saydığını doğrula**

Migration uygulandıktan sonra (Task 11'in ardından):

Run:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{
  const fs=await import('node:fs');
  const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
  const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
  console.log(await sql\`SELECT g5_makine, g6_sarf, toplam_brut, doluluk_orani
                        FROM v_expense_groups LIMIT 3\`);
  await sql.end();
});"
```
Expected: sorgu hata vermeden çalışır; `doluluk_orani` değerleri 29 paydasıyla hafif düşmüş olmalı (mevcut satırlarda yeni iki kalem NULL).

---

## Task 11: Migration'ı uygula ve izolasyonu doğrula

**Files:** yok — çalıştırma ve doğrulama adımı.

- [ ] **Step 1: Uygula**

Run: `node scripts/_migrate_one.mjs 037_atolye_ekonomi.sql`
Expected: `OK   037_atolye_ekonomi.sql`

Hata alırsan migration atomik (`BEGIN`/`COMMIT`) olduğu için hiçbir şey yazılmamıştır; hatayı düzeltip yeniden çalıştır.

- [ ] **Step 2: Parametre tohumunun yazıldığını doğrula**

Run:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{
  const fs=await import('node:fs');
  const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
  const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
  console.log(await sql\`SELECT donem, count(*) FROM economy_param GROUP BY donem\`);
  console.log(await sql\`SELECT column_name FROM information_schema.columns
    WHERE table_name='monthly_expense' AND column_name IN ('ukp_consumables','vehicle_depr')\`);
  await sql.end();
});"
```
Expected: `donem: '2026-01', count: <tenant sayısı × 16>` ve iki kolon adı listelenir

- [ ] **Step 3: Mevcut izolasyon doğrulayıcılarını çalıştır**

Run: `node scripts/verify_public_api.mjs`
Expected: yeni üç tablo için `anon`/`authenticated` yetkisi YOK raporu

Run: `node scripts/verify_workshop_isolation.mjs`
Expected: mevcut kontroller geçmeli — yeni tablolar atölye oturumunda 0 satır

Run: `node scripts/verify_tenant_isolation.mjs`
Expected: PASS

- [ ] **Step 4: Mevcut gider panosunun kırılmadığını doğrula**

Run: `npm run build`
Expected: derleme başarılı.

Ardından gider panosunu tarayıcıda aç (`npm run dev`, `/pes/gider-panosu`) ve G5/G6 sütunlarının hâlâ dolduğunu, `doluluk_orani`nın makul kaldığını gör. Task 10 ek adımı görünümü zaten güncelledi; bu adım onun gerçekten uygulandığını doğrular.

- [ ] **Step 5: Commit (varsa düzeltme)**

```bash
git add -A
git commit -m "chore(ekonomi): migration 037 uygulandi ve izolasyon dogrulandi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 3 — Pilot göçü ve doğrulama

## Task 12: Anket import script'i

**Files:**
- Create: `scripts/import_ekonomi_anket.mjs`

`VERI_GIRIS` → `economy_survey_staging` (ham) → isim eşlemesi → aylara bölme → `monthly_expense` + `workshop_economy`.

**Üç kural:**
1. **Varsayılan kuru çalışma.** Yazmak için `--uygula` şart.
2. **İsim eşlemesi otomatik atamaz.** `kesin` olmayan satır yazılmaz, rapora düşer, kullanıcıya sorulur.
3. **`--baslangic YYYY-MM` zorunlu.** Excel anketin kaç ay olduğunu söylüyor ama hangi aydan başladığını söylemiyor. Tahmin edilmez.

- [ ] **Step 1: Script'i yaz**

```js
/**
 * Atölye gider anketi (Atolye_Gider_Model.xlsx VERI_GIRIS) → PES.
 *
 * Akış: ham satır → economy_survey_staging → isim eşlemesi → aylara bölme
 *       → monthly_expense + workshop_economy
 *
 * Kullanım:
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04 --uygula
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04 --dosya "C:\\yol\\anket.xlsx"
 *
 * --baslangic ZORUNLU: Excel kaç ay olduğunu söylüyor, hangi aydan
 *   başladığını söylemiyor. Tahmin edilmez.
 * --uygula olmadan hiçbir şey yazılmaz; rapor basılır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jetonlar, envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const arg = (ad, varsayilan = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : varsayilan
}
const UYGULA = process.argv.includes('--uygula')
const BASLANGIC = arg('baslangic')
const DOSYA = arg('dosya',
  'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx')

if (!BASLANGIC || !/^\d{4}-(0[1-9]|1[0-2])$/.test(BASLANGIC)) {
  console.error('HATA: --baslangic YYYY-MM zorunlu.')
  console.error('  Excel anketin kaç ay olduğunu söylüyor ama hangi aydan')
  console.error('  başladığını söylemiyor. Bu yüzden tahmin edilmiyor.')
  process.exit(1)
}

// ---------- 1. Excel'i oku ----------
const wb = XLSX.readFile(DOSYA)
const ws = wb.Sheets['VERI_GIRIS']
if (!ws) { console.error(`HATA: VERI_GIRIS sayfası yok — ${DOSYA}`); process.exit(1) }

// Satır 1-2 açıklama, satır 3 başlık.
const hamSatirlar = XLSX.utils.sheet_to_json(ws, { range: 2, defval: null })
  .filter(r => r['Kısa ad'])

console.log(`Okundu: ${hamSatirlar.length} atölye satırı — ${DOSYA}`)

// ---------- 2. Çözümle ----------
// Not: anketSatiriCoz ve anketiAylaraBol TypeScript. Node'dan çağırmak için
// tsx gerekir; bunun yerine çözümlemeyi burada tekrar etmiyoruz — script
// derlenmiş JS'e değil, aynı sözlüğe dayansın diye lib'i tsx ile yüklüyoruz.
const { anketSatiriCoz, anketiAylaraBol, sgkSupheliMi } =
  await import('tsx/esm/api').then(async ({ register }) => {
    const un = register()
    const mod = await import('../lib/pes/ekonomi-anket.ts')
    un()
    return mod
  })

const cozumler = hamSatirlar.map((ham, i) => ({
  satirNo: i + 4,                       // Excel satır numarası (başlık 3)
  ham,
  cozum: anketSatiriCoz(ham),
}))

// ---------- 3. Atölyelerle eşle ----------
const sql = postgres(env.APP_DATABASE_URL ?? env.DATABASE_URL,
  { max: 1, prepare: false, connect_timeout: 15 })

const atolyeler = await sql`SELECT id, code, name, tenant_id FROM workshop`
const tenantId = atolyeler[0]?.tenant_id
if (!tenantId) { console.error('HATA: workshop tablosu boş, tenant belirlenemedi'); await sql.end(); process.exit(1) }

function esle(kisaAd, unvan) {
  const aJ = new Set(jetonlar(kisaAd))
  const uJ = new Set(jetonlar(unvan ?? ''))
  let enIyi = null
  for (const w of atolyeler) {
    const dbJ = new Set(jetonlar(w.name))
    const ortakAd = [...aJ].filter(t => dbJ.has(t)).length
    const ortakUnvan = [...uJ].filter(t => dbJ.has(t)).length
    const skor = aJ.size ? ortakAd / aJ.size : 0
    const skorU = uJ.size ? ortakUnvan / uJ.size : 0
    const toplam = Math.max(skor, skorU)
    if (!enIyi || toplam > enIyi.skor) enIyi = { atolye: w, skor: toplam }
  }
  if (!enIyi || enIyi.skor === 0) return { durum: 'eslesmedi', atolye: null, skor: 0 }
  // Kesin sayılması için kısa adın TÜM ayırt edici jetonları eşleşmeli.
  return {
    durum: enIyi.skor === 1 ? 'kesin' : enIyi.skor >= 0.5 ? 'inceleme' : 'eslesmedi',
    atolye: enIyi.atolye,
    skor: enIyi.skor,
  }
}

const sonuc = cozumler.map(c => ({ ...c, eslesme: esle(c.cozum.kisaAd, c.cozum.unvan) }))
const kesinler = sonuc.filter(s => s.eslesme.durum === 'kesin')
const bekleyenler = sonuc.filter(s => s.eslesme.durum !== 'kesin')

console.log(`\nEşleştirme: kesin=${kesinler.length}  inceleme=${sonuc.filter(s => s.eslesme.durum === 'inceleme').length}  eşleşmedi=${sonuc.filter(s => s.eslesme.durum === 'eslesmedi').length}`)

// ---------- 4. Veri kalitesi uyarıları ----------
const uyarilar = []
for (const s of sonuc) {
  const g = s.cozum.gider
  if (sgkSupheliMi(g)) {
    uyarilar.push(`${s.cozum.kisaAd}: teşvik (${g.incentive_amount}) SGK'dan (${g.sgk}) büyük — SGK net bildirilmiş olabilir, net gider olduğundan DÜŞÜK çıkar`)
  }
  if (s.cozum.birlesikAlanlar.length) {
    uyarilar.push(`${s.cozum.kisaAd}: birleşik alan — ${s.cozum.birlesikAlanlar.join(', ')}`)
  }
  if (s.cozum.bolge === null) {
    uyarilar.push(`${s.cozum.kisaAd}: teşvik bölgesi okunamadı — 3D referans hesaplanamayacak`)
  }
}
if (uyarilar.length) {
  console.log('\nVERİ KALİTESİ UYARILARI')
  for (const u of uyarilar) console.log('  ! ' + u)
}

// ---------- 5. Bekleyenleri dosyaya yaz ----------
if (bekleyenler.length) {
  const yol = join(__dir, '../ekonomi_eslesmeyen.json')
  writeFileSync(yol, JSON.stringify(bekleyenler.map(b => ({
    satirNo: b.satirNo,
    kisaAd: b.cozum.kisaAd,
    unvan: b.cozum.unvan,
    onerilen: b.eslesme.atolye ? { id: b.eslesme.atolye.id, name: b.eslesme.atolye.name } : null,
    skor: Number(b.eslesme.skor.toFixed(2)),
  })), null, 2), 'utf8')
  console.log(`\n${bekleyenler.length} satır eşleşmedi ya da inceleme gerektiriyor → ${yol}`)
  console.log('Bunlar YAZILMADI. Eşleşmeleri onayla, sonra tekrar çalıştır.')
}

// ---------- 6. Yazma planı ----------
const plan = []
for (const s of kesinler) {
  const aylar = anketiAylaraBol(s.cozum, BASLANGIC)
  for (const ay of aylar) {
    plan.push({ workshopId: s.eslesme.atolye.id, ad: s.cozum.kisaAd, satirNo: s.satirNo,
                ham: s.ham, aySayisi: s.cozum.aySayisi, ...ay })
  }
}

console.log(`\nYazma planı: ${kesinler.length} atölye × ${plan.length / (kesinler.length || 1)} ay = ${plan.length} satır`)
console.log(`Dönem: ${BASLANGIC} → ${plan.length ? `${plan[plan.length - 1].year}-${String(plan[plan.length - 1].month).padStart(2, '0')}` : '-'}`)

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  await sql.end()
  process.exit(0)
}

// ---------- 7. Yaz ----------
let yazilanStaging = 0, yazilanGider = 0, yazilanEkonomi = 0

await sql.begin(async (tx) => {
  for (const s of kesinler) {
    const [staging] = await tx`
      INSERT INTO economy_survey_staging
        (tenant_id, raw, workshop_name_raw, workshop_id, match_status,
         period_start, period_months, promoted_at)
      VALUES (${tenantId}, ${sql.json(s.ham)}, ${s.cozum.kisaAd},
              ${s.eslesme.atolye.id}, 'kesin', ${BASLANGIC},
              ${s.cozum.aySayisi}, now())
      RETURNING id`
    yazilanStaging++

    for (const ay of anketiAylaraBol(s.cozum, BASLANGIC)) {
      const g = ay.gider
      await tx`
        INSERT INTO monthly_expense (
          workshop_id, tenant_id, year, month, work_days,
          personnel, overtime, bonus, sgk, severance_reserve,
          food, transport, cargo, rent, building_depr,
          electricity, water, gas, thread, needle,
          ukp_consumables, consumables, machine_maint, machine_depr,
          vehicle_depr, vehicle, stationery, isg, consulting,
          official_fees, insurance, communication, other, incentive_amount)
        VALUES (
          ${s.eslesme.atolye.id}, ${tenantId}, ${ay.year}, ${ay.month},
          ${Math.round(ay.ekonomi.actual_days ?? 22)},
          ${Math.round(g.personnel ?? 0)}, ${g.overtime ?? null}, ${g.bonus ?? null},
          ${Math.round(g.sgk ?? 0)}, ${g.severance_reserve ?? null},
          ${Math.round(g.food ?? 0)}, ${Math.round(g.transport ?? 0)},
          ${Math.round(g.cargo ?? 0)}, ${g.rent ?? null}, ${g.building_depr ?? null},
          ${Math.round(g.electricity ?? 0)}, ${Math.round(g.water ?? 0)},
          ${Math.round(g.gas ?? 0)}, ${Math.round(g.thread ?? 0)}, ${g.needle ?? null},
          ${g.ukp_consumables ?? null}, ${g.consumables ?? null},
          ${Math.round(g.machine_maint ?? 0)}, ${g.machine_depr ?? null},
          ${g.vehicle_depr ?? null}, ${Math.round(g.vehicle ?? 0)},
          ${g.stationery ?? null}, ${g.isg ?? null}, ${g.consulting ?? null},
          ${g.official_fees ?? null}, ${g.insurance ?? null},
          ${g.communication ?? null}, ${Math.round(g.other ?? 0)},
          ${g.incentive_amount ?? null})
        ON CONFLICT (workshop_id, year, month) DO UPDATE SET
          personnel = EXCLUDED.personnel, overtime = EXCLUDED.overtime,
          bonus = EXCLUDED.bonus, sgk = EXCLUDED.sgk,
          severance_reserve = EXCLUDED.severance_reserve,
          food = EXCLUDED.food, transport = EXCLUDED.transport,
          cargo = EXCLUDED.cargo, rent = EXCLUDED.rent,
          building_depr = EXCLUDED.building_depr, electricity = EXCLUDED.electricity,
          water = EXCLUDED.water, gas = EXCLUDED.gas, thread = EXCLUDED.thread,
          needle = EXCLUDED.needle, ukp_consumables = EXCLUDED.ukp_consumables,
          consumables = EXCLUDED.consumables, machine_maint = EXCLUDED.machine_maint,
          machine_depr = EXCLUDED.machine_depr, vehicle_depr = EXCLUDED.vehicle_depr,
          vehicle = EXCLUDED.vehicle, stationery = EXCLUDED.stationery,
          isg = EXCLUDED.isg, consulting = EXCLUDED.consulting,
          official_fees = EXCLUDED.official_fees, insurance = EXCLUDED.insurance,
          communication = EXCLUDED.communication, other = EXCLUDED.other,
          incentive_amount = EXCLUDED.incentive_amount,
          updated_at = now()`
      yazilanGider++

      const e = ay.ekonomi
      await tx`
        INSERT INTO workshop_economy (
          workshop_id, tenant_id, year, month,
          revenue_declared, idle_days, qty_declared,
          nominal_days, actual_days, hours_per_day,
          cutting_staff, sewing_staff, ukp_staff, office_staff,
          area_m2, source, survey_id, note)
        VALUES (
          ${s.eslesme.atolye.id}, ${tenantId}, ${ay.year}, ${ay.month},
          ${e.revenue_declared}, ${e.idle_days}, ${e.qty_declared},
          ${e.nominal_days}, ${e.actual_days}, ${e.hours_per_day},
          ${e.cutting_staff}, ${e.sewing_staff}, ${e.ukp_staff}, ${e.office_staff},
          ${e.area_m2}, ${e.source}, ${staging.id},
          ${`Atolye_Gider_Model.xlsx VERI_GIRIS satır ${s.satirNo}`})
        ON CONFLICT (workshop_id, year, month) DO UPDATE SET
          revenue_declared = EXCLUDED.revenue_declared,
          idle_days = EXCLUDED.idle_days, qty_declared = EXCLUDED.qty_declared,
          nominal_days = EXCLUDED.nominal_days, actual_days = EXCLUDED.actual_days,
          hours_per_day = EXCLUDED.hours_per_day,
          cutting_staff = EXCLUDED.cutting_staff, sewing_staff = EXCLUDED.sewing_staff,
          ukp_staff = EXCLUDED.ukp_staff, office_staff = EXCLUDED.office_staff,
          area_m2 = EXCLUDED.area_m2, source = EXCLUDED.source,
          survey_id = EXCLUDED.survey_id, note = EXCLUDED.note,
          updated_at = now()`
      yazilanEkonomi++
    }
  }
})

console.log(`\nYAZILDI: staging=${yazilanStaging}  monthly_expense=${yazilanGider}  workshop_economy=${yazilanEkonomi}`)
if (bekleyenler.length) {
  console.log(`UYARI: ${bekleyenler.length} satır hâlâ eşleşmemiş durumda ve yazılmadı.`)
}
await sql.end()
```

- [ ] **Step 2: `tsx` bağımlılığını ekle**

Script TypeScript lib'ini doğrudan yüklüyor; böylece başlık sözlüğü tek yerde kalır.

Run: `npm install --save-dev tsx`
Expected: `tsx` devDependencies'e eklenir

- [ ] **Step 3: Kuru çalıştır**

Run: `node scripts/import_ekonomi_anket.mjs --baslangic 2026-04`
Expected:
```
Okundu: 11 atölye satırı — ...
Eşleştirme: kesin=?  inceleme=?  eşleşmedi=?
VERİ KALİTESİ UYARILARI
  ! Örssan: teşvik (1300000) SGK'dan (200000) büyük — ...
  ! Örssan: birleşik alan — İğne ve iplik → thread
  ...
Yazma planı: N atölye × 3 ay = 3N satır
KURU ÇALIŞMA — hiçbir şey yazılmadı.
```

**Eşleşmeyen varsa dur.** `ekonomi_eslesmeyen.json` dosyasını aç, her satır için doğru atölyeyi **kullanıcıya sor**. Tahmin ederek devam etme — bu veri fiyat pazarlığına girecek.

- [ ] **Step 4: Onaydan sonra uygula**

Run: `node scripts/import_ekonomi_anket.mjs --baslangic 2026-04 --uygula`
Expected: `YAZILDI: staging=N  monthly_expense=3N  workshop_economy=3N`

- [ ] **Step 5: Commit**

```bash
git add scripts/import_ekonomi_anket.mjs package.json package-lock.json
git commit -m "feat(ekonomi): anket import script'i

VERI_GIRIS -> staging -> isim eslemesi -> aylara bolme -> monthly_expense
+ workshop_economy. Varsayilan kuru calisma; --uygula sart.
--baslangic YYYY-MM zorunlu cunku Excel baslangic ayini soylemiyor.
Kesin olmayan eslesme YAZILMAZ, ekonomi_eslesmeyen.json'a dusar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: DB'deki rasyoları Excel'e karşı doğrula

**Files:**
- Create: `scripts/verify_ekonomi.mjs`

Task 8 saf fonksiyonları Excel'e karşı doğruladı. Bu script **DB'den okunan** veriyle aynı sonuçların çıktığını doğrular — yani import'un kalemleri doğru kolonlara koyduğunu. İkisi farklı sorular; ikisi de gerekli.

- [ ] **Step 1: Script'i yaz**

```js
/**
 * PES'teki ekonomi rasyolarını Atolye_Gider_Model.xlsx HESAP sayfasıyla
 * karşılaştırır. ‰1 üstü sapma hatadır.
 *
 * Task 8'in testi saf fonksiyonları doğruluyor; bu script import'un
 * kalemleri doğru kolonlara koyduğunu doğruluyor. Bir kalem yanlış
 * kolona giderse fonksiyon testleri geçer ama bu script kırılır.
 *
 * Kullanım: node scripts/verify_ekonomi.mjs --donem 2026-04
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : v
}
const DONEM = arg('donem')
if (!DONEM || !/^\d{4}-(0[1-9]|1[0-2])$/.test(DONEM)) {
  console.error('HATA: --donem YYYY-MM zorunlu')
  process.exit(1)
}
const [YIL, AY] = DONEM.split('-').map(Number)
const TOLERANS = 0.001   // ‰1

const { hesapla } = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const mod = await import('../lib/pes/ekonomi-hesap.ts')
  un()
  return mod
})

// ---------- Excel referansı ----------
const wb = XLSX.readFile(
  'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx')
const excelHesap = XLSX.utils.sheet_to_json(wb.Sheets['HESAP'], { range: 2, defval: null })
  .filter(r => r['Kısa ad'])
const excelIndeks = new Map(excelHesap.map(r => [String(r['Kısa ad']).trim(), r]))

// ---------- PES verisi ----------
const sql = postgres(env.APP_DATABASE_URL ?? env.DATABASE_URL, { max: 1, prepare: false })

const satirlar = await sql`
  SELECT w.id, w.name, w.bolge,
         me.*, we.*,
         dk.dk_maliyet_tl
  FROM workshop_economy we
  JOIN workshop w        ON w.id = we.workshop_id
  LEFT JOIN monthly_expense me
         ON me.workshop_id = we.workshop_id
        AND me.year = we.year AND me.month = we.month
  LEFT JOIN LATERAL (
        SELECT dk_maliyet_tl FROM dk_maliyet
        WHERE bolge = w.bolge AND donem <= ${DONEM}
        ORDER BY donem DESC LIMIT 1) dk ON TRUE
  WHERE we.year = ${YIL} AND we.month = ${AY}`

const paramSatirlari = await sql`
  SELECT DISTINCT ON (param_key) param_key, param_value
  FROM economy_param WHERE donem <= ${DONEM}
  ORDER BY param_key, donem DESC`
const param = Object.fromEntries(paramSatirlari.map(p => [p.param_key, Number(p.param_value)]))

console.log(`Dönem ${DONEM}: PES'te ${satirlar.length} ekonomi satırı, Excel'de ${excelHesap.length} atölye`)

// ---------- Karşılaştır ----------
const ESLESME = [
  ['Toplam kişi', 'toplamKisi'],
  ['Aylık ciro (TL)', 'aylikCiro'],
  ['Brüt gider (TL)', 'brutGider'],
  ['Net gider (TL)', 'netGider'],
  ['Marj %', 'marj'],
  ['İşçilik toplamı (maaş+mesai+prim+SGK+kıdem)', 'iscilikToplam'],
  ['Ciro / kişi', 'ciroKisi'],
  ['DİKİM dk maliyeti (TL/dk)', 'dikimDkMaliyet'],
  ['Dikim dk cirosu (TL/dk)', 'dikimDkCiro'],
  ['Asgari dakika çarpanı (× asgari ücretli dk)', 'asgariDkCarpani'],
  ['Başabaş fiyat / adet', 'basabasFiyat'],
  ['Adil fiyat / adet (hedef marjla)', 'adilFiyat'],
]

let hata = 0, kontrol = 0, atlanan = 0

for (const r of satirlar) {
  const excel = excelIndeks.get(r.name) ??
                [...excelIndeks.entries()].find(([k]) => r.name.includes(k))?.[1]
  if (!excel) { console.log(`  ? ${r.name}: Excel'de karşılığı yok, atlandı`); atlanan++; continue }

  const rasyo = hesapla({
    gider: r,
    ekonomi: {
      revenue_declared: r.revenue_declared === null ? null : Number(r.revenue_declared),
      idle_days: r.idle_days === null ? null : Number(r.idle_days),
      qty_declared: r.qty_declared,
      nominal_days: r.nominal_days === null ? null : Number(r.nominal_days),
      actual_days: r.actual_days === null ? null : Number(r.actual_days),
      hours_per_day: r.hours_per_day === null ? null : Number(r.hours_per_day),
      cutting_staff: r.cutting_staff, sewing_staff: r.sewing_staff,
      ukp_staff: r.ukp_staff, office_staff: r.office_staff,
      area_m2: r.area_m2, source: r.source,
    },
    param,
    dkMaliyet3D: r.dk_maliyet_tl === null || r.dk_maliyet_tl === undefined
      ? null : Number(r.dk_maliyet_tl),
    qtyActual: null,
  })

  for (const [excelBaslik, alan] of ESLESME) {
    const beklenen = excel[excelBaslik]
    if (typeof beklenen !== 'number') continue
    const bulunan = rasyo[alan]
    kontrol++
    if (bulunan === null) {
      console.log(`  X ${r.name} / ${alan}: PES null, Excel ${beklenen}`)
      hata++
      continue
    }
    const payda = Math.abs(beklenen) < 1e-9 ? 1 : Math.abs(beklenen)
    const sapma = Math.abs(bulunan - beklenen) / payda
    if (sapma > TOLERANS) {
      console.log(`  X ${r.name} / ${alan}: PES ${bulunan.toFixed(6)} ≠ Excel ${Number(beklenen).toFixed(6)} (‰${(sapma * 1000).toFixed(1)})`)
      hata++
    }
  }
}

console.log(`\n${kontrol} kontrol, ${hata} sapma, ${atlanan} atölye atlandı`)

// postgres.js NUMERIC'i string döndürür. Number() ile sarılmayan bir alan
// sessizce NaN üretir; bu yüzden NaN'ı da hata sayıyoruz.
if (hata > 0) {
  console.error('\nDOĞRULAMA BAŞARISIZ — sapmaların nedenini bul, tolerans yükseltme.')
  process.exitCode = 1
} else {
  console.log('\nDOĞRULAMA BAŞARILI — PES rasyoları Excel ile ‰1 içinde.')
}
await sql.end()
```

- [ ] **Step 2: Çalıştır**

Run: `node scripts/verify_ekonomi.mjs --donem 2026-04`
Expected: `DOĞRULAMA BAŞARILI — PES rasyoları Excel ile ‰1 içinde.`

Sapma çıkarsa sırayla kontrol et:
1. **`NaN` mı?** `postgres.js` `NUMERIC` kolonları **string** döndürür. `Number()` ile sarılmamış bir alan sessizce `NaN` üretir — hafızadaki bilinen tuzak. Yukarıdaki sorguda `revenue_declared`, `idle_days`, `nominal_days`, `actual_days`, `hours_per_day` ve `dk_maliyet_tl` bu yüzden açıkça sarılı; `monthly_expense`'in 021 kalemleri de `NUMERIC` olduğu için `hesapla()`ya `r` olarak geçen gider nesnesinde aynı sorun çıkabilir. Çıkarsa gider alanlarını da `Number()` ile sar.
2. **Kalem yanlış kolonda mı?** Brüt gider tutup net gider tutmuyorsa teşvik; brüt gider tutmuyorsa bir kalem kayıp.
3. **Excel mi hatalı?** `OKU_BENI!B12` iki bilinen düzeltme sayıyor (Bese kıdem, Örssan ek resmi/sigorta). Üçüncü bir tane bulursan oraya yaz.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_ekonomi.mjs
git commit -m "feat(ekonomi): DB rasyolarini Excel HESAP'a karsi dogrulayan script

Task 8 saf fonksiyonlari dogruluyor; bu script import'un kalemleri
dogru kolonlara koydugunu dogruluyor. Bir kalem yanlis kolona giderse
fonksiyon testleri gecer, bu kirilir. Tolerans binde 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 4 — Ekranlar

## Task 14: DB satırını hesap girdisine çeviren katman

**Files:**
- Create: `lib/pes/ekonomi-sorgu.ts`
- Test: `lib/pes/ekonomi-sorgu.test.ts`

**Bu görevin tek sebebi bir tuzak:** `postgres.js` `NUMERIC` kolonları **string** döndürür. `revenue_declared` bir string olarak `hesapla()`ya girerse aritmetik sessizce `NaN` üretir; TypeScript bunu yakalamaz çünkü tip iddiası çalışma zamanında doğrulanmaz. Dönüştürme tek bir yerde, test edilerek yapılmalı.

- [ ] **Step 1: Başarısız testi yaz**

`lib/pes/ekonomi-sorgu.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sayiya, dbSatiriCoz, paramCoz } from './ekonomi-sorgu'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'

describe('sayiya', () => {
  it('postgres NUMERIC string ini sayıya çevirir', () => {
    expect(sayiya('4929656.87')).toBe(4929656.87)
  })

  it('sayıyı olduğu gibi bırakır', () => {
    expect(sayiya(22)).toBe(22)
  })

  it('null null kalır', () => {
    expect(sayiya(null)).toBeNull()
  })

  it('undefined null olur', () => {
    expect(sayiya(undefined)).toBeNull()
  })

  it('sayıya çevrilemeyen string null olur — NaN DEĞİL', () => {
    expect(sayiya('abc')).toBeNull()
  })

  it('boş string null olur', () => {
    expect(sayiya('')).toBeNull()
  })
})

describe('dbSatiriCoz', () => {
  /* postgres.js'in gerçekte döndürdüğü biçim: NUMERIC -> string,
     INTEGER/SMALLINT -> number. */
  const HAM = {
    workshop_id: 7, name: 'Örssan', code: 'W007', bolge: 6, veri_var: true,
    revenue_declared: '4929656.87',
    idle_days: '5.50',
    qty_declared: 43037,
    nominal_days: '22.00',
    actual_days: '15.25',
    hours_per_day: '9.0',
    cutting_staff: 6, sewing_staff: 90, ukp_staff: 35, office_staff: 6,
    area_m2: 5000, source: 'turetilmis',
    personnel: 4900000, sgk: 200000,
    overtime: '200000.00', bonus: '0.00', severance_reserve: null,
    rent: '0.00', ukp_consumables: '200000.00', vehicle_depr: '20000.00',
    incentive_amount: '1300000.00',
    dk_maliyet_tl: '5.05',
    qty_actual: null,
  }

  const g = dbSatiriCoz(HAM, VARSAYILAN_PARAM)

  it('NUMERIC alanları sayıya çevirir', () => {
    expect(g.ekonomi.revenue_declared).toBe(4929656.87)
    expect(g.ekonomi.idle_days).toBe(5.5)
    expect(g.ekonomi.hours_per_day).toBe(9)
    expect(g.gider.overtime).toBe(200000)
    expect(g.gider.incentive_amount).toBe(1300000)
  })

  it('hiçbir alan NaN olmaz', () => {
    const hepsi = [...Object.values(g.gider), ...Object.values(g.ekonomi)]
    expect(hepsi.some(v => typeof v === 'number' && Number.isNaN(v))).toBe(false)
  })

  it('3D dakika maliyetini sayıya çevirir', () => {
    expect(g.dkMaliyet3D).toBe(5.05)
  })

  it('0.00 sıfır kalır, null olmaz', () => {
    expect(g.gider.rent).toBe(0)
    expect(g.gider.bonus).toBe(0)
  })

  it('gerçek null null kalır', () => {
    expect(g.gider.severance_reserve).toBeNull()
  })

  it('source değerini taşır', () => {
    expect(g.ekonomi.source).toBe('turetilmis')
  })
})

describe('paramCoz', () => {
  it('satırları parametre nesnesine çevirir', () => {
    const p = paramCoz([
      { param_key: 'target_margin', param_value: '0.1500' },
      { param_key: 'nominal_days', param_value: '22.0000' },
    ])
    expect(p.target_margin).toBe(0.15)
    expect(p.nominal_days).toBe(22)
  })

  it('eksik anahtarlar varsayılandan tamamlanır', () => {
    const p = paramCoz([{ param_key: 'target_margin', param_value: '0.2000' }])
    expect(p.target_margin).toBe(0.2)
    expect(p.minutes_per_day).toBe(VARSAYILAN_PARAM.minutes_per_day)
  })

  it('boş listede tamamen varsayılan döner', () => {
    expect(paramCoz([])).toEqual(VARSAYILAN_PARAM)
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/ekonomi-sorgu.test.ts`
Expected: FAIL — `Failed to resolve import "./ekonomi-sorgu"`

- [ ] **Step 3: Uygulamayı yaz**

`lib/pes/ekonomi-sorgu.ts`:

```ts
/**
 * DB satırı → hesap girdisi.
 *
 * TEK SEBEBİ BİR TUZAK: postgres.js NUMERIC kolonları STRING döndürür.
 * '4929656.87' doğrudan hesapla()'ya girerse aritmetik sessizce NaN üretir
 * ve TypeScript bunu yakalamaz — tip iddiası çalışma zamanında
 * doğrulanmıyor. Dönüştürme burada, tek yerde ve test edilerek yapılır.
 */
import { VARSAYILAN_PARAM, type EkonomiGirdi, type EkonomiParam } from './ekonomi-tipler'

/** Her şeyi sayıya çevirir; çevrilemiyorsa null. NaN asla dönmez. */
export function sayiya(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Sorgunun döndürdüğü ham satır. Alanlar string ya da number olabilir. */
export type EkonomiDbSatiri = Record<string, unknown> & {
  workshop_id: number
  name: string
  bolge: number | null
  /** false ise bu atölyenin o ay ekonomi satırı yok — bütün alanlar null. */
  veri_var: boolean
}

const GIDER_ALANLARI = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
  'food', 'transport', 'cargo', 'rent', 'building_depr',
  'electricity', 'water', 'gas', 'thread', 'needle',
  'ukp_consumables', 'consumables', 'machine_maint', 'machine_depr',
  'vehicle_depr', 'vehicle', 'stationery', 'isg', 'consulting',
  'official_fees', 'insurance', 'communication', 'other', 'incentive_amount',
] as const

export function dbSatiriCoz(r: EkonomiDbSatiri, param: EkonomiParam): EkonomiGirdi {
  const gider = { incentive_amount: null } as Record<string, number | null>
  for (const alan of GIDER_ALANLARI) gider[alan] = sayiya(r[alan])

  const ham = r.source
  const source = ham === 'anket' || ham === 'elle' || ham === 'turetilmis' ? ham : 'elle'

  return {
    gider: gider as EkonomiGirdi['gider'],
    ekonomi: {
      revenue_declared: sayiya(r.revenue_declared),
      idle_days: sayiya(r.idle_days),
      qty_declared: sayiya(r.qty_declared),
      nominal_days: sayiya(r.nominal_days),
      actual_days: sayiya(r.actual_days),
      hours_per_day: sayiya(r.hours_per_day),
      cutting_staff: sayiya(r.cutting_staff),
      sewing_staff: sayiya(r.sewing_staff),
      ukp_staff: sayiya(r.ukp_staff),
      office_staff: sayiya(r.office_staff),
      area_m2: sayiya(r.area_m2),
      source,
    },
    param,
    dkMaliyet3D: sayiya(r.dk_maliyet_tl),
    qtyActual: sayiya(r.qty_actual),
  }
}

/** economy_param satırlarını nesneye çevirir; eksikler varsayılandan tamamlanır. */
export function paramCoz(
  satirlar: Array<{ param_key: string; param_value: unknown }>,
): EkonomiParam {
  const p: Record<string, number> = { ...VARSAYILAN_PARAM }
  for (const s of satirlar) {
    const v = sayiya(s.param_value)
    if (v !== null && s.param_key in p) p[s.param_key] = v
  }
  return p as EkonomiParam
}

/**
 * Bir dönemin ekonomi satırlarını, gideri ve bölge 3D değeriyle getirir.
 *
 * Temel tablo workshop'tır, workshop_economy DEĞİL: ekonomi satırı olmayan
 * aktif atölye de sonuca girer, bütün alanları null olarak. hesapla() bu
 * satırda 37 null döndürür ve ekran "veri yok" gösterir. Sıfırla
 * doldurmak onları sıralamanın uçlarına fırlatırdı — en kârlı ya da en
 * zararlı sanılırlardı.
 */
export const EKONOMI_SORGUSU = `
  SELECT
    w.id AS workshop_id, w.name, w.code, w.bolge,
    we.id IS NOT NULL AS veri_var,
    we.revenue_declared, we.idle_days, we.qty_declared,
    we.nominal_days, we.actual_days, we.hours_per_day,
    we.cutting_staff, we.sewing_staff, we.ukp_staff, we.office_staff,
    we.area_m2, we.source,
    me.personnel, me.overtime, me.bonus, me.sgk, me.severance_reserve,
    me.food, me.transport, me.cargo, me.rent, me.building_depr,
    me.electricity, me.water, me.gas, me.thread, me.needle,
    me.ukp_consumables, me.consumables, me.machine_maint, me.machine_depr,
    me.vehicle_depr, me.vehicle, me.stationery, me.isg, me.consulting,
    me.official_fees, me.insurance, me.communication, me.other,
    me.incentive_amount,
    dk.dk_maliyet_tl,
    mp.qty_actual
  FROM workshop w
  LEFT JOIN workshop_economy we
         ON we.workshop_id = w.id AND we.year = $2 AND we.month = $3
  LEFT JOIN monthly_expense me
         ON me.workshop_id = w.id AND me.year = $2 AND me.month = $3
  LEFT JOIN LATERAL (
        SELECT dk_maliyet_tl FROM dk_maliyet
        WHERE bolge = w.bolge AND donem <= $1
        ORDER BY donem DESC LIMIT 1) dk ON TRUE
  LEFT JOIN LATERAL (
        SELECT SUM(actual_qty)::int AS qty_actual
        FROM monthly_production
        WHERE workshop_id = w.id AND year = $2 AND month = $3) mp ON TRUE
  WHERE w.is_active
  ORDER BY (we.workshop_id IS NULL), w.name
`
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/ekonomi-sorgu.test.ts`
Expected: PASS — 16 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/ekonomi-sorgu.ts lib/pes/ekonomi-sorgu.test.ts
git commit -m "feat(ekonomi): DB satiri -> hesap girdisi donusturme katmani

postgres.js NUMERIC'i string donduruyor; donusturulmeden hesapla()'ya
giren alan sessizce NaN uretiyor ve TypeScript yakalamiyor. Donusturme
tek yerde, test edilerek. sayiya() NaN yerine null doner.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: `/pes/ekonomi` — atölye × dönem rasyo tablosu

**Files:**
- Create: `app/pes/ekonomi/page.tsx`
- Create: `app/pes/ekonomi/kolonlar.ts`

Desen `/pes/gider-panosu` ile aynı: server component, `withServerTenant`, `donemCoz`, `force-dynamic`.

- [ ] **Step 1: Kolon sözlüğünü yaz**

`app/pes/ekonomi/kolonlar.ts`:

```ts
import type { EkonomiRasyo } from '@/lib/pes/ekonomi-tipler'

export type Bicim = 'tl' | 'tl2' | 'yuzde' | 'sayi' | 'sayi1' | 'kat'

export type KolonTanim = {
  alan: keyof EkonomiRasyo
  baslik: string
  bicim: Bicim
  /** Varsayılan görünümde açık mı. Tümü kolon seçiciden açılabilir. */
  varsayilan: boolean
  /** Büyük olan iyi mi? Sıralama okunun yönü ve renk için. */
  buyukIyi: boolean | null
  /** Hücreye basılınca gösterilen açıklama — FORMULLER sayfasından. */
  okuma: string
}

export const KOLONLAR: KolonTanim[] = [
  { alan: 'toplamKisi', baslik: 'Toplam kişi', bicim: 'sayi', varsayilan: true, buyukIyi: null,
    okuma: 'Kesim + dikim + UKP + ofis. Kişi başı rasyoların paydası.' },
  { alan: 'dikimPayi', baslik: 'Dikim payı', bicim: 'yuzde', varsayilan: true, buyukIyi: true,
    okuma: '%55-75 tipik. Düşükse bitim/ofis kadrosu ağır demektir; fiyat taşıyorsa sorun değil.' },
  { alan: 'aylikCiro', baslik: 'Aylık ciro', bicim: 'tl', varsayilan: true, buyukIyi: true,
    okuma: 'Faturaya dayalı aylık ciro. Boş gün düzeltmesi dışarı geçen günleri kapasiteye geri ekler.' },
  { alan: 'netGider', baslik: 'Net gider', bicim: 'tl', varsayilan: true, buyukIyi: false,
    okuma: 'Brüt gider − teşvik. Teşvik iade olarak geri geldiği için maliyetten düşülür.' },
  { alan: 'karZarar', baslik: 'Kâr / zarar', bicim: 'tl', varsayilan: true, buyukIyi: true,
    okuma: 'Atölyenin aylık faaliyet sonucu.' },
  { alan: 'marj', baslik: 'Marj', bicim: 'yuzde', varsayilan: true, buyukIyi: true,
    okuma: '+%10 üstü sağlıklı, −%10…+%10 başabaş, −%10 altı zarar. Adet tahmininden etkilenmez.' },
  { alan: 'ciroKisi', baslik: 'Ciro / kişi', bicim: 'tl', varsayilan: true, buyukIyi: true,
    okuma: 'Çalışan başına ekonomik çıktı. Pilotta marjla en güçlü ilişkiyi gösteren rasyo.' },
  { alan: 'dikimDkMaliyet', baslik: 'Dikim dk maliyeti', bicim: 'tl2', varsayilan: true, buyukIyi: false,
    okuma: 'Net gider maaş ağırlığıyla bölümlere dağıtılır, sonra bölümün dakikasına bölünür.' },
  { alan: 'dikimDkCiro', baslik: 'Dikim dk cirosu', bicim: 'tl2', varsayilan: true, buyukIyi: true,
    okuma: 'Bir dikim dakikasının kazandırdığı. Pilotta maliyet neredeyse düzken bu 5 kat değişiyordu: kârı belirleyen budur.' },
  { alan: 'asgariDkCarpani', baslik: 'Asgari dk çarpanı', bicim: 'kat', varsayilan: true, buyukIyi: false,
    okuma: '~1,3 yalın; 1,8-2,4 tipik; 3+ ağır (destek kadrosu, genel gider ya da boş zaman).' },
  { alan: 'basabasFiyat', baslik: 'Başabaş fiyat', bicim: 'tl2', varsayilan: true, buyukIyi: false,
    okuma: 'Bu karmada atölyenin sıfır kârla yaşadığı ortalama CMT.' },
  { alan: 'adilFiyat', baslik: 'Adil fiyat', bicim: 'tl2', varsayilan: true, buyukIyi: null,
    okuma: 'Tedarikçiyi ayakta tutan fiyat. Bu fiyatın altı atölyeyi zamanla zayıflatır.' },
  { alan: 'fiyatSapmasi', baslik: 'Fiyat sapması', bicim: 'yuzde', varsayilan: true, buyukIyi: true,
    okuma: 'Negatifse atölye adilin altında çalışıyor (gizli pahalı: süreklilik riski); pozitifse pahalı ama yaşayabilir.' },

  { alan: 'uretimKisi', baslik: 'Üretim kişi', bicim: 'sayi', varsayilan: false, buyukIyi: null,
    okuma: 'Ofis hariç. Dakika maliyetinin paydası.' },
  { alan: 'aylikAdet', baslik: 'Aylık adet', bicim: 'sayi', varsayilan: false, buyukIyi: true,
    okuma: 'PES üretim kaydı varsa oradan, yoksa beyandan. Kaynağı hücrede işaretli.' },
  { alan: 'ortFiyatAdet', baslik: 'Ort. fiyat / adet', bicim: 'tl2', varsayilan: false, buyukIyi: true,
    okuma: 'Atölyenin parça başına faturaladığı ortalama CMT.' },
  { alan: 'brutGider', baslik: 'Brüt gider', bicim: 'tl', varsayilan: false, buyukIyi: false,
    okuma: '28 gider kaleminin toplamı. Teşvik dahil değil.' },
  { alan: 'tesvik', baslik: 'Teşvik', bicim: 'tl', varsayilan: false, buyukIyi: true,
    okuma: 'Gider değil, mahsup kalemi. Net maliyetten düşülür.' },
  { alan: 'iscilikToplam', baslik: 'İşçilik toplamı', bicim: 'tl', varsayilan: false, buyukIyi: null,
    okuma: 'Maaş + mesai + prim + SGK + kıdem.' },
  { alan: 'iscilikPayi', baslik: 'İşçilik payı', bicim: 'yuzde', varsayilan: false, buyukIyi: null,
    okuma: 'Pilotta %66-79. Payın yüksekliği tek başına sorun değil; kişi başı ciroyla birlikte okunur.' },
  { alan: 'iscilikDisiKisi', baslik: 'İşçilik dışı / kişi', bicim: 'tl', varsayilan: false, buyukIyi: false,
    okuma: 'Yemek, servis, enerji, sarf, bakım, idari: her çalışanla gelen işletme maliyeti. Pilot medyanı 12.831 TL.' },
  { alan: 'iscilikYukKatsayisi', baslik: 'İşçilik yük katsayısı', bicim: 'kat', varsayilan: false, buyukIyi: false,
    okuma: 'Net maaşın üstüne mesai, prim, SGK ve kıdemle ne kadar bindiği. 1 in altı: teşvik SGK dan büyük, beyan şüpheli.' },
  { alan: 'netGiderKisi', baslik: 'Net gider / kişi', bicim: 'tl', varsayilan: false, buyukIyi: false,
    okuma: 'Ciro/kişi ile yan yana okunur: fark negatifse atölye kişi başına yeterli değer üretmiyor.' },
  { alan: 'maasKisi', baslik: 'Maaş / kişi', bicim: 'tl', varsayilan: false, buyukIyi: null,
    okuma: 'Asgari net 28.075 TL (2026) ile kıyaslanır; altındaysa maaş eksik bildirilmiş olabilir.' },
  { alan: 'adetDikimci', baslik: 'Adet / dikimci', bicim: 'sayi', varsayilan: false, buyukIyi: true,
    okuma: 'Ürüne çok bağlı (bebek parçası 1.000+, pantolon ~400); aynı klasman içinde kıyaslayın.' },
  { alan: 'nominalDikimDk', baslik: 'Nominal dikim dk', bicim: 'sayi', varsayilan: false, buyukIyi: null,
    okuma: 'Benchmark cetveli: herkes aynı 22 günle ölçülür.' },
  { alan: 'fiiliDikimDk', baslik: 'Fiili dikim dk', bicim: 'sayi', varsayilan: false, buyukIyi: null,
    okuma: 'Gerçek takvimle kapasite; fiyatlama için bu kullanılır.' },
  { alan: 'kisiDkMaliyet', baslik: 'Kişi-dk maliyeti', bicim: 'tl2', varsayilan: false, buyukIyi: false,
    okuma: 'Bir üretim çalışanının bir dakikasının tam yüklü maliyeti (ofis, kira, enerji dahil).' },
  { alan: 'kesimDkMaliyet', baslik: 'Kesim dk maliyeti', bicim: 'tl2', varsayilan: false, buyukIyi: false,
    okuma: 'Bölüm maaş ağırlıkları eşitken dikim ve UKP ile aynı çıkar.' },
  { alan: 'ukpDkMaliyet', baslik: 'UKP dk maliyeti', bicim: 'tl2', varsayilan: false, buyukIyi: false,
    okuma: 'Bölüm maaş ağırlıkları eşitken kesim ve dikim ile aynı çıkar.' },
  { alan: 'dakikaMarji', baslik: 'Dakika marjı', bicim: 'tl2', varsayilan: false, buyukIyi: true,
    okuma: 'Dakika başına kâr ya da zarar, TL.' },
  { alan: 'fiiliDikimDkMaliyet', baslik: 'Fiili dikim dk maliyeti', bicim: 'tl2', varsayilan: false, buyukIyi: false,
    okuma: 'Gerçek takvimle dakika maliyeti; nominalden ~%10-15 yüksek.' },
  { alan: 'dikimDkAdet', baslik: 'Dikim dk / adet', bicim: 'sayi1', varsayilan: false, buyukIyi: false,
    okuma: '%100 verimlilikte parça başına düşen dikim dakikası; MTM ile kıyaslanınca gerçek verimliliği verir.' },
  { alan: 'uretimKisiDk', baslik: 'Üretim kişi-dk', bicim: 'sayi', varsayilan: false, buyukIyi: null,
    okuma: 'Kesim + dikim + UKP dakikalarının toplamı; bölüm dakika maliyetlerinin ortak paydası.' },
  { alan: 'referans3D', baslik: '3D referans dk', bicim: 'tl2', varsayilan: false, buyukIyi: null,
    okuma: 'Şirket içi "Türkiye Dk Maliyet Değeri – 3D" tablosundan, atölyenin teşvik bölgesine göre.' },
  { alan: 'dkMaliyet3DOran', baslik: 'Dikim dk ÷ 3D', bicim: 'kat', varsayilan: false, buyukIyi: false,
    okuma: '1,00 = referansla aynı; 1,20 = %20 pahalı dakika; 0,85 = referansın altında (yalın ya da eksik bildirim).' },
]

export const VARSAYILAN_KOLONLAR = KOLONLAR.filter(k => k.varsayilan).map(k => k.alan)

const TL = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const TL2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const SAYI1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

/** null → "—". Sıfır "0" olarak gösterilir; ikisi ASLA karışmaz. */
export function bicimle(deger: number | null, bicim: Bicim): string {
  if (deger === null || !Number.isFinite(deger)) return '—'
  switch (bicim) {
    case 'tl': return TL.format(deger)
    case 'tl2': return TL2.format(deger)
    case 'yuzde': return `%${SAYI1.format(deger * 100)}`
    case 'sayi': return TL.format(deger)
    case 'sayi1': return SAYI1.format(deger)
    case 'kat': return `${TL2.format(deger)}×`
  }
}
```

- [ ] **Step 2: Sayfayı yaz**

`app/pes/ekonomi/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemYaz, donemEtiket } from '@/lib/pes/donem'
import { dbSatiriCoz, paramCoz, EKONOMI_SORGUSU, type EkonomiDbSatiri } from '@/lib/pes/ekonomi-sorgu'
import { hesapla, adetSapmasi } from '@/lib/pes/ekonomi-hesap'
import { medyan, marjSirasi, type AkranAdayi } from '@/lib/pes/ekonomi-akran'
import type { EkonomiRasyo } from '@/lib/pes/ekonomi-tipler'
import { KOLONLAR, VARSAYILAN_KOLONLAR, bicimle } from './kolonlar'

/* ---------------------------------------------------------------
   Atölye Ekonomi — rasyo tablosu

   /pes/gider-panosu gider YAPISINA bakar (G1-G8 payları, beyan
   tamlığı). Burası EKONOMİYE bakar: ciro, marj, dakika maliyeti,
   adil fiyat. İkisi ayrı sorular, ayrı sayfalar.

   Kaynak model: Atolye_Gider_Model.xlsx
   Tasarım: docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md
--------------------------------------------------------------- */
export const dynamic = 'force-dynamic'

export default async function EkonomiPanosu({
  searchParams,
}: { searchParams: Promise<{ donem?: string; kolon?: string; sirala?: string }> }) {
  const sp = await searchParams
  const donemSecili = donemCoz(sp.donem)

  const data = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy ORDER BY yil DESC, ay DESC
    ` as Array<{ yil: number; ay: number }>

    const donem = donemSecili ?? donemler[0] ?? null
    if (!donem) return { donem: null, donemler, satirlar: [] }

    const donemStr = donemYaz(donem)

    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donemStr}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(
      EKONOMI_SORGUSU, [donemStr, donem.yil, donem.ay],
    ) as unknown as EkonomiDbSatiri[]

    const satirlar = ham.map(r => {
      const girdi = dbSatiriCoz(r, param)
      const sapma = adetSapmasi(girdi.ekonomi, girdi.qtyActual)
      return {
        workshopId: r.workshop_id,
        ad: r.name,
        bolge: r.bolge,
        veriVar: r.veri_var === true,
        source: girdi.ekonomi.source,
        adetKaynagi: girdi.qtyActual === null ? 'beyan' as const : 'pes' as const,
        /* Beyan ile PES üretimi %20'den fazla ayrışıyorsa uyarı. Fark bir
           hata değil sinyaldir: ya beyan ya iş emri kaydı zayıf. */
        adetSapmasi: sapma,
        adetSupheli: sapma !== null && Math.abs(sapma) > 0.20,
        rasyo: hesapla(girdi),
      }
    })

    return { donem, donemler, satirlar }
  })

  if (!data) redirect('/login')
  const { donem, donemler, satirlar } = data

  const secili = sp.kolon
    ? sp.kolon.split(',').filter(k => KOLONLAR.some(c => c.alan === k))
    : VARSAYILAN_KOLONLAR
  const kolonlar = KOLONLAR.filter(k => secili.includes(k.alan))

  const adaylar: AkranAdayi[] = satirlar.map(s => ({
    workshopId: s.workshopId, ad: s.ad, klasmanlar: [],
    sewingStaff: null, marj: s.rasyo.marj,
  }))

  const siraliAlan = sp.sirala as keyof EkonomiRasyo | undefined
  const gosterilecek = siraliAlan && KOLONLAR.some(k => k.alan === siraliAlan)
    ? [...satirlar].sort((a, b) => {
        const x = a.rasyo[siraliAlan], y = b.rasyo[siraliAlan]
        if (x === null) return 1
        if (y === null) return -1
        return y - x
      })
    : satirlar

  const medyanlar = Object.fromEntries(
    kolonlar.map(k => [k.alan, medyan(satirlar.map(s => s.rasyo[k.alan]))]),
  ) as Record<string, number | null>

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Atölye Ekonomi</h1>
          <p className="text-sm text-slate-500">
            {donem ? donemEtiket(donem) : 'Veri yok'} ·{' '}
            {satirlar.filter(s => s.veriVar).length}/{satirlar.length} atölyede veri
            {' · '}
            <Link href="/pes/gider-panosu" className="underline">gider yapısı →</Link>
            {' · '}
            <Link href="/pes/ekonomi/parametre" className="underline">parametreler</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {donemler.slice(0, 12).map(d => (
            <Link
              key={`${d.yil}-${d.ay}`}
              href={`/pes/ekonomi?donem=${donemYaz(d)}`}
              className={`px-2 py-1 rounded ${
                donem && d.yil === donem.yil && d.ay === donem.ay
                  ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
            >{donemYaz(d)}</Link>
          ))}
        </nav>
      </header>

      {satirlar.filter(s => s.veriVar).length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Bu dönem için hiçbir atölyenin ekonomi satırı yok. Anket içeri alınmadıysa:{' '}
          <code>node scripts/import_ekonomi_anket.mjs --baslangic YYYY-MM</code>
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-slate-50">Atölye</th>
                <th className="text-right px-3 py-2">Sıra</th>
                {kolonlar.map(k => (
                  <th key={k.alan} className="text-right px-3 py-2 whitespace-nowrap">
                    <Link
                      href={`/pes/ekonomi?donem=${donem ? donemYaz(donem) : ''}&sirala=${k.alan}${sp.kolon ? `&kolon=${sp.kolon}` : ''}`}
                      title={k.okuma}
                      className="underline decoration-dotted"
                    >{k.baslik}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gosterilecek.map(s => (
                <tr key={s.workshopId} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <Link href={`/pes/ekonomi/${s.workshopId}?donem=${donem ? donemYaz(donem) : ''}`}
                          className="underline">{s.ad}</Link>
                    {!s.veriVar && (
                      <span className="ml-2 text-xs text-slate-400">veri yok</span>
                    )}
                    {s.veriVar && s.source === 'turetilmis' && (
                      <span className="ml-2 text-xs text-slate-400"
                            title="Çok aylı beyandan türetildi — bu ayın ayrı ölçümü değil">türetilmiş</span>
                    )}
                    {s.adetSupheli && (
                      <span className="ml-2 text-xs text-amber-700"
                            title={`Beyan ile PES üretimi %${Math.abs(Math.round((s.adetSapmasi ?? 0) * 100))} ayrışıyor — ya beyan ya iş emri kaydı zayıf`}>
                        adet ?
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {marjSirasi(s.rasyo.marj, adaylar) ?? '—'}
                  </td>
                  {kolonlar.map(k => {
                    const v = s.rasyo[k.alan]
                    const renk = k.buyukIyi === null || v === null || medyanlar[k.alan] === null
                      ? ''
                      : (v > (medyanlar[k.alan] as number)) === k.buyukIyi
                        ? 'text-emerald-700' : 'text-rose-700'
                    return (
                      <td key={k.alan}
                          className={`px-3 py-2 text-right tabular-nums ${renk} ${v === null ? 'text-slate-300' : ''}`}>
                        {bicimle(v, k.bicim)}
                        {k.alan === 'aylikAdet' && v !== null && (
                          <span className="ml-1 text-xs text-slate-400">{s.adetKaynagi}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2">
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-slate-50 font-medium">
                  Medyan <span className="text-xs text-slate-500">n={satirlar.filter(s => s.rasyo.marj !== null).length}</span>
                </td>
                <td />
                {kolonlar.map(k => (
                  <td key={k.alan} className="px-3 py-2 text-right tabular-nums font-medium">
                    {bicimle(medyanlar[k.alan], k.bicim)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Kolon seç ({kolonlar.length}/{KOLONLAR.length})</summary>
        <div className="flex flex-wrap gap-2 pt-3">
          {KOLONLAR.map(k => {
            const acik = secili.includes(k.alan)
            const yeni = acik ? secili.filter(a => a !== k.alan) : [...secili, k.alan]
            return (
              <Link key={k.alan}
                    href={`/pes/ekonomi?donem=${donem ? donemYaz(donem) : ''}&kolon=${yeni.join(',')}`}
                    className={`px-2 py-1 rounded border text-xs ${acik ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                {k.baslik}
              </Link>
            )
          })}
        </div>
      </details>

      <p className="text-xs text-slate-400">
        Medyan bu dönemde cirosu olan {satirlar.filter(s => s.rasyo.marj !== null).length} atölye
        üzerinden. Küçük örneklemde medyan zayıf bir istatistiktir; n arttıkça güvenilirleşir.
        “—” hesaplanamadı demektir, sıfır değil. “adet ?” rozeti beyan ile PES
        üretim kaydının %20'den fazla ayrıştığını söyler.
      </p>
    </main>
  )
}
```

- [ ] **Step 3: Derle ve aç**

Run: `npm run build`
Expected: derleme başarılı

Run: `npm run dev`, tarayıcıda `/pes/ekonomi`
Expected: 11 atölye, 13 varsayılan kolon, altta medyan satırı, türetilmiş satırlarda etiket

- [ ] **Step 4: Commit**

```bash
git add app/pes/ekonomi/page.tsx app/pes/ekonomi/kolonlar.ts
git commit -m "feat(ekonomi): /pes/ekonomi rasyo tablosu

37 gosterge, kolon secici, siralama, medyan satiri ve marj sirasi.
Her kolonun basligi FORMULLER'deki okuma notunu tasiyor.
Hesaplanamayan hucre '—', sifir '0' — ikisi karismaz.
Turetilmis aylar etiketli, adet kaynagi (beyan/pes) hucrede isaretli.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 16: `/pes/ekonomi/[id]` — tek atölye karnesi

**Files:**
- Create: `app/pes/ekonomi/[id]/page.tsx`

Her rasyo, yanında akran medyanı ve yüzdelik yeri. Akran grubu kademesi ve `n` üstte yazılı.

- [ ] **Step 1: Sayfayı yaz**

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemYaz, donemEtiket } from '@/lib/pes/donem'
import { dbSatiriCoz, paramCoz, EKONOMI_SORGUSU, type EkonomiDbSatiri } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { medyan, yuzdelikSkor, akranGrubu, type AkranAdayi } from '@/lib/pes/ekonomi-akran'
import { KOLONLAR, bicimle } from '../kolonlar'

export const dynamic = 'force-dynamic'

const KADEME_ETIKET = {
  'klasman+buyukluk': 'aynı klasman ve büyüklük',
  'klasman': 'aynı klasman',
  'tumu': 'tüm örneklem',
} as const

export default async function EkonomiKarne({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ donem?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const workshopId = Number(id)
  if (!Number.isInteger(workshopId)) notFound()

  const donemSecili = donemCoz(sp.donem)

  const data = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy WHERE workshop_id = ${workshopId}
      ORDER BY yil DESC, ay DESC
    ` as Array<{ yil: number; ay: number }>

    const donem = donemSecili ?? donemler[0] ?? null
    if (!donem) return { donem: null, donemler, hedef: null, hepsi: [] }

    const donemStr = donemYaz(donem)
    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donemStr}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(
      EKONOMI_SORGUSU, [donemStr, donem.yil, donem.ay],
    ) as unknown as EkonomiDbSatiri[]

    // Klasman etiketleri — akran grubunun ilk kademesi buna dayanıyor.
    const klasmanlar = await sql`
      SELECT wp.workshop_id, cv.code
      FROM workshop_product wp
      JOIN capability_value cv ON cv.id = wp.capability_value_id
      WHERE cv.dimension_code = 'klasman'
    ` as Array<{ workshop_id: number; code: string }>
    const klasmanHarita = new Map<number, string[]>()
    for (const k of klasmanlar) {
      klasmanHarita.set(k.workshop_id, [...(klasmanHarita.get(k.workshop_id) ?? []), k.code])
    }

    const hepsi = ham.map(r => {
      const girdi = dbSatiriCoz(r, param)
      return {
        workshopId: r.workshop_id,
        ad: r.name,
        source: girdi.ekonomi.source,
        klasmanlar: klasmanHarita.get(r.workshop_id) ?? [],
        sewingStaff: girdi.ekonomi.sewing_staff,
        rasyo: hesapla(girdi),
      }
    })

    return { donem, donemler, hedef: hepsi.find(h => h.workshopId === workshopId) ?? null, hepsi }
  })

  if (!data) redirect('/login')
  const { donem, donemler, hedef, hepsi } = data
  if (!hedef) notFound()

  const adaylar: AkranAdayi[] = hepsi.map(h => ({
    workshopId: h.workshopId, ad: h.ad, klasmanlar: h.klasmanlar,
    sewingStaff: h.sewingStaff, marj: h.rasyo.marj,
  }))
  const hedefAday = adaylar.find(a => a.workshopId === workshopId)!
  const grup = akranGrubu(hedefAday, adaylar)
  const grupIdSet = new Set(grup.uyeler.map(u => u.workshopId))
  const grupSatirlari = hepsi.filter(h => grupIdSet.has(h.workshopId))

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{hedef.ad}</h1>
          <p className="text-sm text-slate-500">
            {donem ? donemEtiket(donem) : '—'}
            {!hedef.veriVar && ' · bu dönemde ekonomi satırı yok'}
            {hedef.veriVar && hedef.source === 'turetilmis' && ' · çok aylı beyandan türetildi'}
            {' · '}
            <Link href="/pes/ekonomi" className="underline">tüm atölyeler →</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {donemler.slice(0, 12).map(d => (
            <Link key={`${d.yil}-${d.ay}`}
                  href={`/pes/ekonomi/${workshopId}?donem=${donemYaz(d)}`}
                  className={`px-2 py-1 rounded ${
                    donem && d.yil === donem.yil && d.ay === donem.ay
                      ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
              {donemYaz(d)}
            </Link>
          ))}
        </nav>
      </header>

      <p className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Akran grubu: <strong>{KADEME_ETIKET[grup.kademe]}</strong>, n={grup.n}
        {grup.kademe === 'tumu' && ' — bu klasmanda yeterli örneklem yok, tüm atölyelerle kıyaslanıyor'}
        {grup.n < 5 && ' — örneklem küçük, medyanı temkinli okuyun'}
      </p>

      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Gösterge</th>
              <th className="text-right px-3 py-2">{hedef.ad}</th>
              <th className="text-right px-3 py-2">Akran medyanı</th>
              <th className="text-right px-3 py-2">Yüzdelik</th>
              <th className="text-left px-3 py-2">Nasıl okunur</th>
            </tr>
          </thead>
          <tbody>
            {KOLONLAR.map(k => {
              const v = hedef.rasyo[k.alan]
              const grupDegerleri = grupSatirlari.map(s => s.rasyo[k.alan])
              const med = medyan(grupDegerleri)
              const ham = yuzdelikSkor(v, grupDegerleri)
              // buyukIyi false ise yüzdelik ters çevrilir: düşük olan iyi.
              const skor = ham === null ? null : k.buyukIyi === false ? 100 - ham : ham
              return (
                <tr key={k.alan} className="border-t align-top">
                  <td className="px-3 py-2">{k.baslik}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${v === null ? 'text-slate-300' : ''}`}>
                    {bicimle(v, k.bicim)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {bicimle(med, k.bicim)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {skor === null || k.buyukIyi === null
                      ? <span className="text-slate-300">—</span>
                      : <span className={skor >= 50 ? 'text-emerald-700' : 'text-rose-700'}>
                          {Math.round(skor)}
                        </span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-md">{k.okuma}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Yüzdelik 0–100: 100 akran grubunun en iyisi. Yönü olmayan göstergelerde
        (kişi sayısı, adil fiyat gibi) yüzdelik gösterilmez — “iyi” diye bir yönü yoktur.
        “—” hesaplanamadı demektir, sıfır değil.
      </p>
    </main>
  )
}
```

- [ ] **Step 2: Derle ve aç**

Run: `npm run build`
Expected: derleme başarılı

Tarayıcıda `/pes/ekonomi` → bir atölye adına tıkla
Expected: 37 satırlık karne, üstte akran kademesi ve n

**Not:** `workshop_product` + `capability_value` bağı bu tenant'ta boşsa `klasmanlar` boş kalır ve akran grubu doğrudan `tumu` kademesine düşer — bu doğru davranıştır, uydurma klasman atanmaz. Sayfa bunu `n=11, tüm örneklem` diye yazar.

- [ ] **Step 3: Commit**

```bash
git add app/pes/ekonomi/\[id\]/page.tsx
git commit -m "feat(ekonomi): atolye karnesi — rasyo, akran medyani, yuzdelik

Akran grubu kademesi ve n her zaman ustte. Yonu olmayan gostergede
yuzdelik gosterilmez; dusuk-iyi gostergelerde skor ters cevrilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 17: Ekonomi satırı girişi

**Files:**
- Create: `app/api/pes/ekonomi/route.ts`
- Create: `app/pes/ekonomi/giris/page.tsx`
- Create: `app/pes/ekonomi/giris/Form.tsx`

Gider kalemleri buraya girilmez — onlar mevcut `/pes/expenses/import` akışında kalır. Burada yalnız giderde olmayan alanlar var.

- [ ] **Step 1: API route'u yaz**

`app/api/pes/ekonomi/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** Elle girilen ekonomi satırı. source her zaman 'elle' — türetilmiş satır
 *  yalnız import script'inden gelir ve survey_id taşımak zorundadır. */
export const POST = withTenantRoute(async (req, { sql, tenantId }) => {
  const b = await req.json()

  const workshopId = Number(b.workshop_id)
  const year = Number(b.year)
  const month = Number(b.month)
  if (!Number.isInteger(workshopId) || !Number.isInteger(year) ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'workshop_id, year ve month zorunlu' }, { status: 400 })
  }

  const s = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const [row] = await sql`
    INSERT INTO workshop_economy (
      workshop_id, tenant_id, year, month,
      revenue_declared, idle_days, qty_declared,
      nominal_days, actual_days, hours_per_day,
      cutting_staff, sewing_staff, ukp_staff, office_staff,
      area_m2, source, note)
    VALUES (
      ${workshopId}, ${tenantId}, ${year}, ${month},
      ${s(b.revenue_declared)}, ${s(b.idle_days)}, ${s(b.qty_declared)},
      ${s(b.nominal_days)}, ${s(b.actual_days)}, ${s(b.hours_per_day)},
      ${s(b.cutting_staff)}, ${s(b.sewing_staff)}, ${s(b.ukp_staff)}, ${s(b.office_staff)},
      ${s(b.area_m2)}, 'elle', ${b.note ?? null})
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      revenue_declared = EXCLUDED.revenue_declared,
      idle_days = EXCLUDED.idle_days,
      qty_declared = EXCLUDED.qty_declared,
      nominal_days = EXCLUDED.nominal_days,
      actual_days = EXCLUDED.actual_days,
      hours_per_day = EXCLUDED.hours_per_day,
      cutting_staff = EXCLUDED.cutting_staff,
      sewing_staff = EXCLUDED.sewing_staff,
      ukp_staff = EXCLUDED.ukp_staff,
      office_staff = EXCLUDED.office_staff,
      area_m2 = EXCLUDED.area_m2,
      source = 'elle',
      survey_id = NULL,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING *`

  return NextResponse.json({ satir: row })
})
```

- [ ] **Step 2: Formu yaz**

`app/pes/ekonomi/giris/Form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Atolye = { id: number; name: string }
type Mevcut = Record<string, string | number | null>

const ALANLAR: Array<[string, string, string]> = [
  ['revenue_declared', 'Aylık ciro (TL)', 'Fatura toplamı ÷ ay sayısı. Boş gün düzeltmesi ÖNCESİ.'],
  ['idle_days', 'Boş / dışarı gün', 'Aylık ortalama. Ciro düzeltmesinin girdisi.'],
  ['qty_declared', 'Aylık adet (beyan)', 'Bant kapasitesi tahmini. PES üretim kaydı varsa hesapta o kullanılır.'],
  ['nominal_days', 'Nominal çalışma günü', 'Tipik 22. Benchmark cetveli bununla ölçülür.'],
  ['actual_days', 'Fiili çalışma günü', 'Gerçek takvim. Fiyatlama bununla yapılır.'],
  ['hours_per_day', 'Günlük çalışma saati', 'Molalar hariç.'],
  ['cutting_staff', 'Kesim kişi', 'Bu AYA ait kadro.'],
  ['sewing_staff', 'Dikim kişi', 'Bu AYA ait kadro.'],
  ['ukp_staff', 'UKP kişi', 'Ütü, kontrol, paket.'],
  ['office_staff', 'Ofis kişi', 'Ürün üretmez ama maliyeti üretim dakikasına biner.'],
  ['area_m2', 'Üretim alanı (m²)', ''],
]

export default function Form({ atolyeler, donem, mevcut, workshopId }: {
  atolyeler: Atolye[]
  donem: { yil: number; ay: number }
  mevcut: Mevcut | null
  workshopId: number | null
}) {
  const router = useRouter()
  const [durum, setDurum] = useState<'hazir' | 'gonderiliyor' | 'kaydedildi' | string>('hazir')

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDurum('gonderiliyor')
    const fd = new FormData(e.currentTarget)
    const govde = Object.fromEntries(fd.entries())
    const r = await fetch('/api/pes/ekonomi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...govde, year: donem.yil, month: donem.ay }),
    })
    if (!r.ok) { setDurum((await r.json()).error ?? 'Kaydedilemedi'); return }
    setDurum('kaydedildi')
    router.refresh()
  }

  return (
    <form onSubmit={gonder} className="space-y-3 max-w-2xl">
      <label className="block">
        <span className="text-sm text-slate-600">Atölye</span>
        <select name="workshop_id" defaultValue={workshopId ?? ''} required
                onChange={e => router.push(`/pes/ekonomi/giris?atolye=${e.target.value}&donem=${donem.yil}-${String(donem.ay).padStart(2, '0')}`)}
                className="block w-full border rounded px-2 py-1">
          <option value="">— seçin —</option>
          {atolyeler.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>

      {ALANLAR.map(([ad, etiket, ipucu]) => (
        <label key={ad} className="block">
          <span className="text-sm text-slate-600">{etiket}</span>
          <input name={ad} type="number" step="any"
                 defaultValue={mevcut?.[ad] != null ? String(mevcut[ad]) : ''}
                 className="block w-full border rounded px-2 py-1 tabular-nums" />
          {ipucu && <span className="text-xs text-slate-400">{ipucu}</span>}
        </label>
      ))}

      <label className="block">
        <span className="text-sm text-slate-600">Not</span>
        <input name="note" defaultValue={mevcut?.note != null ? String(mevcut.note) : ''}
               className="block w-full border rounded px-2 py-1" />
      </label>

      <button type="submit" disabled={durum === 'gonderiliyor'}
              className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
        {durum === 'gonderiliyor' ? 'Kaydediliyor…' : 'Kaydet'}
      </button>

      {durum === 'kaydedildi' && <p className="text-sm text-emerald-700">Kaydedildi. Satır artık “elle” kaynaklı.</p>}
      {durum !== 'hazir' && durum !== 'gonderiliyor' && durum !== 'kaydedildi' &&
        <p className="text-sm text-rose-700">{durum}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Sayfayı yaz**

`app/pes/ekonomi/giris/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemEtiket } from '@/lib/pes/donem'
import Form from './Form'

export const dynamic = 'force-dynamic'

export default async function EkonomiGiris({
  searchParams,
}: { searchParams: Promise<{ donem?: string; atolye?: string }> }) {
  const sp = await searchParams
  const simdi = new Date()
  const donem = donemCoz(sp.donem) ?? { yil: simdi.getFullYear(), ay: simdi.getMonth() + 1 }
  const workshopId = sp.atolye ? Number(sp.atolye) : null

  const data = await withServerTenant(async (sql) => {
    const atolyeler = await sql`
      SELECT id, name FROM workshop WHERE is_active ORDER BY name
    ` as Array<{ id: number; name: string }>

    const mevcut = workshopId
      ? (await sql`
          SELECT * FROM workshop_economy
          WHERE workshop_id = ${workshopId}
            AND year = ${donem.yil} AND month = ${donem.ay}
        `)[0] ?? null
      : null

    return { atolyeler, mevcut }
  })

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ekonomi satırı girişi</h1>
        <p className="text-sm text-slate-500">
          {donemEtiket(donem)} ·{' '}
          <Link href="/pes/ekonomi" className="underline">panoya dön</Link>
        </p>
      </header>

      <p className="text-sm bg-slate-50 border rounded px-3 py-2 max-w-2xl">
        Burada yalnız <strong>giderde olmayan</strong> alanlar var. Gider kalemleri{' '}
        <Link href="/pes/expenses/import" className="underline">Gider Yükle</Link> akışında kalır.
        {data.mevcut?.source === 'turetilmis' && (
          <span className="block mt-1 text-amber-700">
            Bu satır çok aylı bir beyandan türetilmişti. Kaydedersen “elle” kaynaklı olur
            ve anket bağı kopar.
          </span>
        )}
      </p>

      <Form atolyeler={data.atolyeler} donem={donem}
            mevcut={data.mevcut as Record<string, string | number | null> | null}
            workshopId={workshopId} />
    </main>
  )
}
```

- [ ] **Step 4: Derle ve dene**

Run: `npm run build`
Expected: derleme başarılı

Tarayıcıda `/pes/ekonomi/giris` → bir atölye seç → ciro gir → Kaydet → `/pes/ekonomi`'de görün

- [ ] **Step 5: Commit**

```bash
git add app/api/pes/ekonomi/route.ts app/pes/ekonomi/giris/
git commit -m "feat(ekonomi): ekonomi satiri girisi ve API route

Yalniz giderde olmayan alanlar; gider kalemleri mevcut akista kaliyor.
Elle kayit source='elle' yapar ve survey_id'yi bosaltir — turetilmis
satirin uzerine yazildiginda anket bagi acikca koparilir ve kullaniciya
onceden soylenir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 18: `/pes/ekonomi/parametre` — dönem versiyonlu parametreler

**Files:**
- Create: `app/api/pes/ekonomi/parametre/route.ts`
- Create: `app/pes/ekonomi/parametre/page.tsx`
- Create: `app/pes/ekonomi/parametre/Form.tsx`

- [ ] **Step 1: API route'u yaz**

`app/api/pes/ekonomi/parametre/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { VARSAYILAN_PARAM } from '@/lib/pes/ekonomi-tipler'

const GECERLI_ANAHTARLAR = new Set(Object.keys(VARSAYILAN_PARAM))

export const POST = withTenantRoute(async (req, { sql, tenantId }) => {
  const b = await req.json()
  const donem = String(b.donem ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) {
    return NextResponse.json({ error: 'donem YYYY-MM olmalı' }, { status: 400 })
  }

  const girdiler = Object.entries(b.degerler ?? {})
    .filter(([k]) => GECERLI_ANAHTARLAR.has(k))
    .map(([k, v]) => ({ k, v: Number(v) }))
    .filter(({ v }) => Number.isFinite(v))

  if (girdiler.length === 0) {
    return NextResponse.json({ error: 'Geçerli parametre yok' }, { status: 400 })
  }

  await sql.begin(async (tx) => {
    for (const { k, v } of girdiler) {
      await tx`
        INSERT INTO economy_param (tenant_id, donem, param_key, param_value)
        VALUES (${tenantId}, ${donem}, ${k}, ${v})
        ON CONFLICT (tenant_id, donem, param_key)
        DO UPDATE SET param_value = EXCLUDED.param_value, updated_at = now()`
    }
  })

  // Bu dönem ve sonrası kaç ekonomi satırını etkiliyor?
  const [etki] = await sql`
    SELECT count(*)::int AS satir, count(DISTINCT workshop_id)::int AS atolye
    FROM workshop_economy
    WHERE (year::text || '-' || lpad(month::text, 2, '0')) >= ${donem}`

  return NextResponse.json({ yazilan: girdiler.length, etki })
})
```

- [ ] **Step 2: Formu yaz**

`app/pes/ekonomi/parametre/Form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type ParamTanim = { anahtar: string; etiket: string; aciklama: string }

export default function Form({ tanimlar, donem, mevcut }: {
  tanimlar: ParamTanim[]
  donem: string
  mevcut: Record<string, number>
}) {
  const router = useRouter()
  const [yeniDonem, setYeniDonem] = useState(donem)
  const [durum, setDurum] = useState<string>('hazir')
  const [etki, setEtki] = useState<{ satir: number; atolye: number } | null>(null)

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDurum('gonderiliyor')
    const fd = new FormData(e.currentTarget)
    const degerler = Object.fromEntries(
      tanimlar.map(t => [t.anahtar, fd.get(t.anahtar)]).filter(([, v]) => v !== null && v !== ''),
    )
    const r = await fetch('/api/pes/ekonomi/parametre', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ donem: yeniDonem, degerler }),
    })
    const j = await r.json()
    if (!r.ok) { setDurum(j.error ?? 'Kaydedilemedi'); return }
    setEtki(j.etki)
    setDurum('kaydedildi')
    router.refresh()
  }

  return (
    <form onSubmit={gonder} className="space-y-3 max-w-3xl">
      <label className="block">
        <span className="text-sm text-slate-600">Geçerlilik dönemi</span>
        <input value={yeniDonem} onChange={e => setYeniDonem(e.target.value)}
               pattern="\d{4}-\d{2}" required
               className="block border rounded px-2 py-1 tabular-nums" />
        <span className="text-xs text-slate-400">
          Bu dönemden itibaren geçerli olur. Önceki aylar eski değerlerle hesaplanmaya devam eder.
        </span>
      </label>

      <table className="text-sm w-full border rounded">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2">Parametre</th>
            <th className="text-right px-3 py-2">Değer</th>
            <th className="text-left px-3 py-2">Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {tanimlar.map(t => (
            <tr key={t.anahtar} className="border-t align-top">
              <td className="px-3 py-2">{t.etiket}</td>
              <td className="px-3 py-2 text-right">
                <input name={t.anahtar} type="number" step="any"
                       defaultValue={mevcut[t.anahtar]}
                       className="border rounded px-2 py-1 w-36 text-right tabular-nums" />
              </td>
              <td className="px-3 py-2 text-slate-500">{t.aciklama}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="submit" disabled={durum === 'gonderiliyor'}
              className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
        {durum === 'gonderiliyor' ? 'Kaydediliyor…' : `${yeniDonem} için kaydet`}
      </button>

      {durum === 'kaydedildi' && etki && (
        <p className="text-sm text-emerald-700">
          Kaydedildi. {yeniDonem} ve sonrasındaki {etki.satir} ekonomi satırı
          ({etki.atolye} atölye) artık bu değerlerle hesaplanıyor.
        </p>
      )}
      {!['hazir', 'gonderiliyor', 'kaydedildi'].includes(durum) &&
        <p className="text-sm text-rose-700">{durum}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Sayfayı yaz**

`app/pes/ekonomi/parametre/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { paramCoz } from '@/lib/pes/ekonomi-sorgu'
import Form, { type ParamTanim } from './Form'

export const dynamic = 'force-dynamic'

const TANIMLAR: ParamTanim[] = [
  { anahtar: 'min_wage_gross', etiket: 'Brüt asgari ücret (TL/ay)', aciklama: 'ÇSGB tablosu.' },
  { anahtar: 'min_wage_net', etiket: 'Net asgari ücret (TL/ay)', aciklama: 'Maaş/kişi kıyaslamasında referans.' },
  { anahtar: 'employer_cost', etiket: 'İşveren maliyeti (TL/ay)', aciklama: 'İmalat, 5 puan SGK indirimi.' },
  { anahtar: 'wage_support', etiket: 'Asgari ücret desteği (TL/ay)', aciklama: 'İşveren maliyetinden düşülür.' },
  { anahtar: 'minutes_per_day', etiket: 'Günlük çalışma dakikası', aciklama: '9 saat × 60; molalar hariç.' },
  { anahtar: 'nominal_days', etiket: 'Nominal çalışma günü', aciklama: '52 hafta × 5 gün ÷ 12. Benchmark cetveli.' },
  { anahtar: 'effective_days', etiket: 'Efektif çalışma günü', aciklama: 'Tatil, izin, devamsızlık sonrası. Fiyatlama kararında bu kullanılır.' },
  { anahtar: 'eff_cutting', etiket: 'Kesim verimliliği', aciklama: 'MTM ÷ verimlilik = gerçek dakika.' },
  { anahtar: 'eff_sewing', etiket: 'Dikim verimliliği', aciklama: 'Tipik Türk bandı %50-70; iyi dengelenmiş bant %75-85.' },
  { anahtar: 'eff_ukp', etiket: 'UKP verimliliği', aciklama: 'Ütü-kontrol-paket.' },
  { anahtar: 'target_margin', etiket: 'Hedef tedarikçi marjı', aciklama: 'Adil fiyat = başabaş × (1 + hedef marj).' },
  { anahtar: 'weight_cutting', etiket: 'Kesim maaş ağırlığı', aciklama: '1 = ortalama maaş. Üçü eşitken bölüm dakika maliyetleri aynı çıkar.' },
  { anahtar: 'weight_sewing', etiket: 'Dikim maaş ağırlığı', aciklama: 'Bölüm maaşları toplandığında güncellenir.' },
  { anahtar: 'weight_ukp', etiket: 'UKP maaş ağırlığı', aciklama: '' },
  { anahtar: 'revenue_adj_on', etiket: 'Boş gün ciro düzeltmesi', aciklama: '1 = açık, 0 = kapalı. Dışarı geçen günleri kapasiteye geri ekler.' },
  { anahtar: 'revenue_adj_divisor', etiket: 'Boş gün düzeltme paydası', aciklama: 'Ciro × (1 + boş gün ÷ bu sayı).' },
]

export default async function ParametreSayfasi({
  searchParams,
}: { searchParams: Promise<{ donem?: string }> }) {
  const sp = await searchParams
  const simdi = new Date()
  const donem = sp.donem && /^\d{4}-\d{2}$/.test(sp.donem)
    ? sp.donem
    : `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}`

  const data = await withServerTenant(async (sql) => {
    const etkin = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>

    const donemler = await sql`
      SELECT donem, count(*)::int AS adet FROM economy_param
      GROUP BY donem ORDER BY donem DESC
    ` as Array<{ donem: string; adet: number }>

    return { mevcut: paramCoz(etkin) as unknown as Record<string, number>, donemler }
  })

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ekonomi parametreleri</h1>
        <p className="text-sm text-slate-500">
          {donem} için geçerli değerler ·{' '}
          <Link href="/pes/ekonomi" className="underline">panoya dön</Link>
        </p>
      </header>

      <p className="text-sm bg-slate-50 border rounded px-3 py-2 max-w-3xl">
        Parametreler dönem versiyonludur. Bir ay hesaplanırken <strong>o aydan küçük veya
        eşit en yakın dönemin</strong> değerleri kullanılır — yani asgari ücret değiştiğinde
        yeni bir dönem eklersiniz, geçmiş aylar bozulmaz.
        {' '}Bölge 3D dakika maliyeti burada değil: <code>dk_maliyet</code> tablosundan okunur.
      </p>

      <Form tanimlar={TANIMLAR} donem={donem} mevcut={data.mevcut} />

      <section className="text-sm">
        <h2 className="font-medium mb-2">Kayıtlı dönemler</h2>
        <ul className="flex flex-wrap gap-2">
          {data.donemler.map(d => (
            <li key={d.donem}>
              <Link href={`/pes/ekonomi/parametre?donem=${d.donem}`}
                    className={`px-2 py-1 rounded border ${d.donem === donem ? 'bg-slate-900 text-white' : ''}`}>
                {d.donem} <span className="text-xs opacity-70">({d.adet})</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Derle ve dene**

Run: `npm run build`
Expected: derleme başarılı

Tarayıcıda `/pes/ekonomi/parametre` → hedef marjı 0,20 yap, dönemi `2026-05` yaz, kaydet
Expected: "2026-05 ve sonrasındaki N ekonomi satırı (M atölye) artık bu değerlerle hesaplanıyor."
Ardından `/pes/ekonomi?donem=2026-05`'te adil fiyatların yükseldiğini, `2026-04`'te değişmediğini gör.

- [ ] **Step 5: Commit**

```bash
git add app/api/pes/ekonomi/parametre/route.ts app/pes/ekonomi/parametre/
git commit -m "feat(ekonomi): donem versiyonlu parametre ekrani

Yeni donem eklenince gecmis aylar eski degerlerle hesaplanmaya devam
eder. Kaydetmeden once kac satir ve kac atolyenin etkilendigi soylenir.
Bolge 3D dk maliyeti burada degil — dk_maliyet tek kaynak.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 19: Navigasyon ve kapanış doğrulaması

**Files:**
- Modify: `components/pes/PesDevSidebar.tsx`

- [ ] **Step 1: Sidebar'a ekle**

`components/pes/PesDevSidebar.tsx` içinde "Gider Panosu" satırının hemen üstüne, aynı grup içine:

```tsx
      { label: 'Atölye Ekonomi',  href: '/pes/ekonomi',       icon: Coins },
```

`lucide-react` import listesine `Coins` eklenir. Ekonomi girişi ve parametre sayfaları menüde ayrı satır almaz — `/pes/ekonomi` başlığından bağlantılı oldukları için menü şişmez.

- [ ] **Step 2: Tüm testleri çalıştır**

Run: `npm test`
Expected: PASS — tüm dosyalar, hiçbiri kırılmamış

- [ ] **Step 3: Derle**

Run: `npm run build`
Expected: derleme başarılı, hata yok

- [ ] **Step 4: Uçtan uca doğrula**

Run: `node scripts/verify_ekonomi.mjs --donem 2026-04`
Expected: `DOĞRULAMA BAŞARILI — PES rasyoları Excel ile ‰1 içinde.`

Run: `node scripts/verify_workshop_isolation.mjs`
Expected: PASS

Run: `node scripts/verify_public_api.mjs`
Expected: PASS

Tarayıcıda sırayla aç ve gör:
- `/pes/ekonomi` → 11 atölye, medyan satırı, sıralama çalışıyor
- `/pes/ekonomi/<id>` → karne, akran kademesi ve n görünüyor
- `/pes/ekonomi/giris` → kayıt çalışıyor
- `/pes/ekonomi/parametre` → dönem ekleme çalışıyor
- `/pes/gider-panosu` → **kırılmamış**, G5/G6 dolu

- [ ] **Step 5: Commit**

```bash
git add components/pes/PesDevSidebar.tsx
git commit -m "feat(ekonomi): sidebar'a Atolye Ekonomi baglantisi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Bitiş durumu

E0 tamamlandığında elde olan:

- **41 kolonluk canlı rasyo tablosu** — 11 pilot atölye, Excel'e karşı ‰1 içinde doğrulanmış
- **Dönem versiyonlu 16 parametre** — asgari ücret değişince geçmiş bozulmuyor
- **Test edilebilir hesap çekirdeği** — `FORMULLER`'in 54 satırıyla bire bir, E1'den E5'e kadar her şeyin çağıracağı tek kaynak
- **İzlenebilir göç** — ham anket saklı, türetilmiş aylar işaretli, eşleşmeyen atölyeler sorulmuş
- **Bozulmamış gider akışı** — `monthly_expense` tek gider kaynağı, `/pes/gider-panosu` çalışıyor

E0 bitmeden E1–E5'e geçilmez: hepsi bu hesap çekirdeğini çağırıyor.
