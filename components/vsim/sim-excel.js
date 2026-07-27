import * as XLSX from 'xlsx'
import { getDomain } from './domains/index.js'

/* ============================================================
   Üretim simülasyon Excel import/export yardımcıları
   Şablon: Ana Grup | Operasyon Adı | Çevrim (sn) | Tip | <Kaynak> Kodu | <Personel>
   Operasyon tipleri artık burada tanımlı değil — tek kaynak domain pack'lerdir (bkz. src/domains, `opTypes` alanı).
   ============================================================ */

// buildSimDataFromRows'un fallback dalında (mainOps dosyadan üretilirken) hâlâ canlı
// kullanımı var — bu yüzden SİLİNMEDİ (yalnızca örnek/şablon üretimi için olsaydı silinirdi).
export const ANA_GRUP_LISTESI = ['Ön Bant', 'Arka Bant', 'Montaj', 'UKP', 'Yıkama', 'Son Montaj']

export const ANA_GRUP_META = {
  'Ön Bant':    { color: '#2563eb', x: 60,   y: 100, order: 0 },
  'Arka Bant':  { color: '#16a34a', x: 60,   y: 320, order: 1 },
  'Montaj':     { color: '#d97706', x: 360,  y: 210, order: 2 },
  'UKP':        { color: '#dc2626', x: 660,  y: 210, order: 3 },
  'Yıkama':     { color: '#0891b2', x: 960,  y: 120, order: 4 },
  'Son Montaj': { color: '#7c3aed', x: 960,  y: 320, order: 5 },
}

const uid = (p = '') => p + Math.random().toString(36).slice(2, 10)

/* ─────── Meta alan isimleri ─────── */
// Excel'deki "Alan" sütunundaki etiketler (normalize edilmiş karşılığı key)
export const META_ALAN_HARITASI = {
  'model adı': 'modelAdi',
  'model ad': 'modelAdi',
  'model no': 'modelNo',
  'plm id': 'modelNo',
  'plm': 'modelNo',
  'model no / plm id': 'modelNo',
  'atölye': 'atolyeAdi',
  'atölye adı': 'atolyeAdi',
  'atolye': 'atolyeAdi',
  'atolye adi': 'atolyeAdi',
  'tarih': 'tarih',
  'sipariş adedi': 'siparisAdedi',
  'siparis adedi': 'siparisAdedi',
  'adet': 'siparisAdedi',
  'sezon': 'sezon',
  'kumaş': 'kumas',
  'kumas': 'kumas',
  'kumaş tipi': 'kumas',
  'hazırlayan': 'hazirlayan',
  'hazirlayan': 'hazirlayan',
  'revizyon': 'revizyon',
  'notlar': 'notlar',
  'not': 'notlar',
  'müşteri': 'musteri',
  'musteri': 'musteri',
}

// Not: META_ORNEK şu an hiçbir yerde (downloadTemplate dahil) kullanılmıyor — "Bilgi"
// sheet'i şablon indirmede üretilmiyor. Bu yüzden domain'e göre parametrize edilmedi;
// tekstil örneği kalıyor. İleride bir "Bilgi" sheet'i şablona eklenirse domain'e göre
// güncellenmeli.
export const META_ORNEK = {
  'Model Adı':         'Erkek 5 Cep Denim Pantolon',
  'Model No / PLM ID': 'PN-2026-001',
  'Atölye Adı':        'İstanbul Atölyesi',
  'Müşteri':           'LC Waikiki',
  'Tarih':             new Date().toISOString().slice(0, 10),
  'Sipariş Adedi':     1000,
  'Sezon':             'Yaz 2026',
  'Kumaş Tipi':        'Denim (100% pamuk, 12 oz)',
  'Hazırlayan':        '',
  'Revizyon':          'v1',
  'Notlar':            'Yıkama sonrası 2 hafta içinde teslim',
}

function normalizeKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ─────── Operasyon sheet başlık eşlemesi ─────── */
// Legacy Türkçe başlıklar her zaman kabul edilir (geriye uyumluluk — eski Excel
// dosyaları domain kavramından önce üretildiği için hep 'Makine Kodu' / 'Operatör' kullanıyordu).
const BASE_OPS_HEADER_ALIASES = {
  '1seviye süreç': 'seviye1',
  '1 seviye süreç': 'seviye1',
  '1. seviye süreç': 'seviye1',
  '1seviye surec': 'seviye1',
  '1 seviye surec': 'seviye1',
  '1. seviye surec': 'seviye1',
  '2seviye süreç': 'seviye2',
  '2 seviye süreç': 'seviye2',
  '2. seviye süreç': 'seviye2',
  '2seviye surec': 'seviye2',
  '2 seviye surec': 'seviye2',
  '2. seviye surec': 'seviye2',
  '3seviye süreç': 'seviye3',
  '3 seviye süreç': 'seviye3',
  '3. seviye süreç': 'seviye3',
  '3seviye surec': 'seviye3',
  '3 seviye surec': 'seviye3',
  '3. seviye surec': 'seviye3',
  'sıra': 'sira',
  'sira': 'sira',
  'no': 'sira',
  'ana grup': 'anaGrup',
  'ana operasyon': 'anaGrup',
  'ana operasyon adı': 'anaGrup',
  'ana operasyon adi': 'anaGrup',
  'ana op': 'anaGrup',
  'operasyon adı': 'opAdi',
  'operasyon adi': 'opAdi',
  'alt operasyon': 'opAdi',
  'alt operasyon adı': 'opAdi',
  'alt operasyon adi': 'opAdi',
  '2. seviye alt operasyon': 'opAdi',
  '2 seviye alt operasyon': 'opAdi',
  'ikinci seviye alt operasyon': 'opAdi',
  '3. seviye alt operasyon': 'seviye3',
  '3 seviye alt operasyon': 'seviye3',
  'üçüncü seviye alt operasyon': 'seviye3',
  'ucuncu seviye alt operasyon': 'seviye3',
  '4. seviye alt operasyon': 'seviye4',
  '4 seviye alt operasyon': 'seviye4',
  'dördüncü seviye alt operasyon': 'seviye4',
  'dorduncu seviye alt operasyon': 'seviye4',
  '5. seviye alt operasyon': 'seviye5',
  '5 seviye alt operasyon': 'seviye5',
  'çevrim (sn)': 'cevrim',
  'cevrim (sn)': 'cevrim',
  'tip': 'tip',
  'makine kodu': 'makineKodu',
  'operatör': 'operator',
  'operator': 'operator',
  'öncesi': 'oncesi',
  'oncesi': 'oncesi',
  'önce': 'oncesi',
  'önceki': 'oncesi',
  'öncül': 'oncesi',
  'oncul': 'oncesi',
  'predecessor': 'oncesi',
}

// Öncül (Öncesi) ham metnini virgül / noktalı virgül / eğik çizgi / satır sonu
// ayraçlarına göre bölüp trim'lenmiş boş-olmayan ad listesine çevirir.
function parseOncesi(raw) {
  return String(raw ?? '')
    .split(/[,;/\n]+/).map(s => s.trim()).filter(Boolean)
}

function buildOpsHeaderAliases(domain) {
  const aliases = Object.fromEntries(
    Object.entries(BASE_OPS_HEADER_ALIASES).map(([key, value]) => [normalizeKey(key), value]),
  )
  if (domain?.labels) {
    // Kısıt: domain label'ları legacy başlık adlarıyla çakışamaz — farklı bir kanonik
    // alana işaret eden mevcut bir alias'ı ezmeye çalışan domain alias'ı yok sayılır.
    // (Örn. labels.person = 'Tip' olsaydı, koruma olmadan 'Tip' sütunu operator'e akardı.)
    const add = (key, canon) => {
      if (!(key in aliases) || aliases[key] === canon) aliases[key] = canon
    }
    add(normalizeKey(`${domain.labels.resource} Kodu`), 'makineKodu')
    add(normalizeKey(domain.labels.person), 'operator')
  }
  return aliases
}

// Ham sheet_to_json satırını (orijinal Excel başlık metniyle key'lenmiş) kanonik
// alan adlarına (anaGrup, opAdi, cevrim, tip, makineKodu, operator) çevirir.
function remapOpsRow(row, aliases) {
  const out = {}
  for (const [key, val] of Object.entries(row)) {
    const canon = aliases[normalizeKey(key)]
    if (canon) out[canon] = val
  }
  return out
}

function opPathFromRow(row) {
  return processLevelsFromRow(row).slice(1)
}

function processLevelsFromRow(row) {
  const legacyLevel1 = row.anaGrup
  const legacyLevel2 = row.opAdi
  return [
    row.seviye1 ?? legacyLevel1,
    row.seviye2 ?? legacyLevel2,
    row.seviye3,
    row.seviye4,
    row.seviye5,
  ]
    .map(v => (v ?? '').toString().trim())
    .filter(Boolean)
}

function opNameFromRow(row) {
  const levels = processLevelsFromRow(row)
  return levels[levels.length - 1] || ''
}

function processPathName(row) {
  return processLevelsFromRow(row).join(' / ')
}

function parseNumber(value) {
  if (typeof value === 'number') return value
  const raw = String(value ?? '').trim()
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  return Number(normalized)
}

function parseMetaSheet(ws) {
  if (!ws) return {}
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const meta = {}
  for (const row of rows) {
    if (!row || row.length < 2) continue
    const label = normalizeKey(row[0])
    if (!label || label === 'alan' || label === 'bilgi') continue  // header satırını atla
    const mapped = META_ALAN_HARITASI[label] || label.replace(/\s+/g, '_')
    const val = row[1]
    if (val != null && val !== '') {
      // Tarih ise ISO format'a çevir (Excel bazen Date objesi döner)
      if (mapped === 'tarih' && val instanceof Date) {
        meta[mapped] = val.toISOString().slice(0, 10)
      } else {
        meta[mapped] = val
      }
    }
  }
  return meta
}

/* ─────── Şablon indirme ─────── */
// mainOpsFromFlow: [{ name }] — kullanıcının Akış sekmesinde tanımladığı ana operasyonlar.
// Boş ya da verilmezse domain'e uygun yer tutucu gruplar kullanılır (textile: klasik
// konfeksiyon listesi, diğerleri: jenerik 'Süreç N').
// domain: sütun başlıklarını (Kaynak/Personel terimi) ve örnek Tip değerini belirler.
// Verilmezse (eski çağrı biçimi) tekstil domain'ine düşer — geriye uyumlu davranış.
// Tek sheet: 'Operasyonlar'. Her ana operasyon için tek satır: Ana Grup dolu, Tip örnek
// değerle (domain'in ilk op tipi) dolu, diğer sütunlar boş.
// Saf yardımcı: şablon aoa'sını (header + satırlar) üretir. downloadTemplate bunu
// çağırıp XLSX.writeFile ile indirir; test edilebilirlik için ayrık tutuldu.
// 'Öncesi' kolonu header'ın SONUNA eklenir (mevcut kolon sırası bozulmaz). Placeholder
// setlerinde örnek öncül zinciri doldurulur; kullanıcının verdiği flowNames'te sıra
// bilinmediğinden Öncesi boş bırakılır.
export function buildTemplateAOA(mainOpsFromFlow, domain) {
  const d = domain || getDomain('textile')
  const flowNames = (mainOpsFromFlow || []).map(m => m.name).filter(Boolean)
  const useNames = flowNames.length > 0 ? flowNames : ['Hazırlık', 'Birleştirme']

  const header = ['Sıra', '1.Seviye Süreç', '2.Seviye Süreç', '3.Seviye Süreç', 'Çevrim (sn)', 'Tip', `${d.labels.resource} Kodu`, d.labels.person, 'Öncesi']
  const exampleTip = d.opTypes[0] || ''

  const rows = flowNames.length > 0
    ? useNames.map((name, idx) => [idx + 1, name, '', '', '', exampleTip, '', '', ''])
    : [
        [1, 'Hazırlık', 'Kemer Çatım', '', 17.08, exampleTip, '', '', ''],
        [2, 'Hazırlık', 'Kemer Çıma', '', 11.66, exampleTip, '', '', ''],
        [3, 'Birleştirme', 'Ön Bant', 'Ön Kemer Takma', 32.15, exampleTip, '', '', 'Hazırlık'],
        [4, 'Birleştirme', 'Arka Bant', 'Etek Dönüp İp', 12.34, exampleTip, '', '', ''],
      ]
  return [header, ...rows]
}

export function downloadTemplate(mainOpsFromFlow, domain) {
  const aoa = buildTemplateAOA(mainOpsFromFlow, domain)

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 8 }, { wch: 22 }, { wch: 32 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Operasyonlar')

  const readme = [
    ['ProVSM Excel Şablonu - Kısa Kullanım'],
    [],
    ['Kolon', 'Açıklama'],
    ['1.Seviye Süreç', 'En üst akış seviyesi. Tek seviye yüklemede her satır bu sırayla ayrı akış adımı olur.'],
    ['2.Seviye Süreç', 'İkinci seviye varsa 1.Seviye altında operasyon sırası bu kolondan kurulur.'],
    ['3.Seviye Süreç', 'Üçüncü seviye varsa üretim/simülasyon operasyonu bu en alt seviyeden alınır.'],
    ['Çevrim (sn)', 'Saniye cinsinden çevrim süresi. 17,08 veya 17.08 formatı kabul edilir.'],
    ['Tip', 'Operasyon tipi. Boşsa uygulama varsayılan tipi kullanır.'],
    [`${domain?.labels?.resource || getDomain('textile').labels.resource} Kodu`, 'Opsiyonel kaynak/makine kodu.'],
    [domain?.labels?.person || getDomain('textile').labels.person, 'Opsiyonel operatör/personel adı.'],
    ['Öncesi', 'Opsiyonel. Bu seviyenin hangi 1.Seviye süreçten sonra geldiğini yazın. Boşsa Excel satır sırası kullanılır.'],
    [],
    ['Kural'],
    ['Hangi en derin seviye doluysa üretim sırası o seviyenin Excel satır sırasını izler.'],
    ['Örneğin sadece 1.Seviye Süreç doluysa simülasyon sırası 1.Seviye satırlarıdır.'],
    ['1+2 seviye doluysa 1.Seviye ana akış, 2.Seviye operasyon sırası olur.'],
    ['1+2+3 seviye doluysa 3.Seviye operasyonlar 2.Seviye bağlamıyla simülasyona girer.'],
  ]
  const readmeWs = XLSX.utils.aoa_to_sheet(readme)
  readmeWs['!cols'] = [{ wch: 28 }, { wch: 95 }]
  XLSX.utils.book_append_sheet(wb, readmeWs, 'README')

  XLSX.writeFile(wb, 'uretim_simulasyon_sablon.xlsx')
}

/* ─────── Dosyayı oku + satırları + meta çıkar ─────── */
// domain: eşleme sırasında legacy başlıklara EK olarak domain'in güncel Kaynak/Personel
// başlıklarını da tanır. Verilmezse yalnızca legacy başlıklar (eski davranış).
// Dönen rows: kanonik alan adlarıyla (anaGrup, opAdi, cevrim, tip, makineKodu, operator).
export async function parseSimFile(file, domain) {
  const arrayBuffer = await file.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })

  // Operasyon sheet'i
  const opsSheetName = wb.SheetNames.includes('Operasyonlar')
    ? 'Operasyonlar'
    : wb.SheetNames.find(n => n.toLowerCase().includes('op')) || wb.SheetNames[0]
  const opsWs = wb.Sheets[opsSheetName]
  if (!opsWs) throw new Error('Dosyada okunabilir operasyon sheet yok')
  const rawRows = XLSX.utils.sheet_to_json(opsWs, { defval: null })
  const aliases = buildOpsHeaderAliases(domain)
  const rows = rawRows.map(r => remapOpsRow(r, aliases))

  // Bilgi sheet'i (opsiyonel)
  const bilgiSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'bilgi' || n.toLowerCase() === 'info')
  const meta = bilgiSheetName ? parseMetaSheet(wb.Sheets[bilgiSheetName]) : {}

  return { rows, meta }
}

/* ─────── Satırları doğrula ─────── */
// allowedAnaGruplar: string[] — kullanıcının Akış'ta tanımladığı ana operasyon adları.
// Boş/verilmezse Ana Grup adı doğrulaması ATLANIR (akış tanımlı değilken grup adları
// doğrulanamaz; tekstil listesine düşmek blank domain kullanıcısına yanlış öneri olurdu).
// opTypes: string[] — geçerli domain opTypes listesi. Dolu ise listede olmayan Tip değeri
// UYARI olarak işaretlenir (tipUyari alanı) — satır REDDEDİLMEZ. Geriye uyumluluk:
// Faz-1 öncesi davranış serbest Tip metnini kabul ediyordu, plan (Task 5) da uyarı diyor.
// Boş/verilmezse (örn. blank domain) serbest metin kabul edilir.
export function validateRows(rows, allowedAnaGruplar, opTypes) {
  const allowed = (allowedAnaGruplar && allowedAnaGruplar.length > 0) ? allowedAnaGruplar : null
  const hasOpTypeList = Array.isArray(opTypes) && opTypes.length > 0
  const out = []   // { ok, row, errors }
  const seenKey = new Set()
  rows.forEach((r, idx) => {
    const errors = []
    const rowNo = idx + 2  // header = 1
    const levels = processLevelsFromRow(r)
    const anaGrup = levels[0] || ''
    const opAdi = opNameFromRow(r)
    const processPath = processPathName(r)
    const cevrimRaw = r.cevrim
    // Boş Tip → domain'in ilk op tipi (textile: 'DİKİM'); opTypes boşsa (blank domain) boş kalır
    const tip = (r.tip ?? '').toString().trim() || (hasOpTypeList ? opTypes[0] : '')
    const makineKodu = (r.makineKodu ?? '').toString().trim()
    const operator = (r.operator ?? '').toString().trim()

    if (!anaGrup) errors.push('1.Seviye Süreç boş')
    else if (allowed && !allowed.includes(anaGrup)) errors.push(`1.Seviye Süreç akışta yok (${anaGrup}) — geçerli: ${allowed.join(', ')}`)
    if (!opAdi) errors.push('Süreç adı boş')
    const cevrim = parseNumber(cevrimRaw)
    if (!Number.isFinite(cevrim) || cevrim <= 0) errors.push(`Çevrim geçersiz (${cevrimRaw})`)
    // Tip: opTypes listesi doluysa ve listede yoksa UYARI — satır reddedilmez (serbest metin kabul)
    const tipUyari = (hasOpTypeList && tip && !opTypes.includes(tip)) ? `Tip listede yok: ${tip}` : null

    // Öncesi (öncül): ham metin + ayrıştırılmış liste. allowed doluysa bilinmeyen
    // öncül adları için NON-BLOCKING uyarı üret (satır ok'unu ETKİLEMEZ, tipUyari gibi).
    const oncesi = (r.oncesi ?? '').toString().trim()
    const oncesiList = parseOncesi(r.oncesi)
    let oncesiUyari = null
    if (allowed && oncesiList.length > 0) {
      const unknown = oncesiList.filter(
        name => !allowed.some(a => a.trim().toLowerCase() === name.toLowerCase()),
      )
      if (unknown.length > 0) oncesiUyari = `Öncesi'de bilinmeyen grup: ${unknown.join(', ')}`
    }

    const key = `${anaGrup}||${processPath.toLowerCase()}`
    if (errors.length === 0) {
      if (seenKey.has(key)) errors.push('Aynı ana grup içinde tekrarlanan operasyon adı')
      else seenKey.add(key)
    }

    out.push({
      rowNo,
      ok: errors.length === 0,
      anaGrup, opAdi, opPath: opPathFromRow(r), processLevels: levels, processPath, sira: r.sira,
      cevrim, tip, makineKodu, operator,
      tipUyari,
      oncesi, oncesiList, oncesiUyari,
      errors,
    })
  })
  return out
}

// Yönlü grafta erişilebilirlik (saf, test edilebilir): adj = Map<id, nextIds[]>.
// `from`'dan `to`'ya (uzunluk >= 0) bir yol var mı? from === to ise true (self-loop'u
// da döngü sayar). Öncesi kenar eklemeden önce döngü kontrolü için kullanılır.
function reaches(adj, from, to) {
  if (from === to) return true
  const seen = new Set()
  const stack = [from]
  while (stack.length) {
    const cur = stack.pop()
    if (cur === to) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const n of (adj.get(cur) || [])) stack.push(n)
  }
  return false
}

/* ─────── Geçerli satırlardan simülasyon datasına dönüştür ─────── */
// existing: { machines, operators, mainOps } — Akış sekmesinden gelen mevcut ana operasyonlar.
// mainOps verilirse korunur, dosyadan üretilmez. Verilmezse eski davranış (dosyadan üret).
export function buildSimDataFromRows(validRows, existing = { machines: [], operators: [], mainOps: null }) {
  const warnings = []

  // "Öncesi" kolonu dolu mu? Doluysa ana-op akış grafiği ondan (yeniden) kurulur —
  // yetkili kaynak. Boşsa mevcut davranış (korunan mainOps veya textile successorMap).
  const hasOncesi = validRows.some(r => (r.oncesiList || []).length > 0)

  // Machines & operators — mevcutları koru, yoksa ekle
  const machines = [...(existing.machines || [])]
  const operators = [...(existing.operators || [])]

  function ensureMachine(kod) {
    if (!kod) return null
    const found = machines.find(m => (m.name || '').toLowerCase() === kod.toLowerCase())
    if (found) return found.id
    const id = uid('m_')
    machines.push({ id, name: kod, type: '', brand: '' })
    return id
  }
  function ensureOperator(ad) {
    if (!ad) return null
    const found = operators.find(o => (o.name || '').toLowerCase() === ad.toLowerCase())
    if (found) return found.id
    const id = uid('o_')
    operators.push({ id, name: ad, skill: 3 })
    return id
  }

  let mainOps
  if (existing.mainOps && existing.mainOps.length > 0) {
    // Akıştaki mainOps'u olduğu gibi koru — sadece kopyala. nextIds dizisini de KOPYALA
    // (referans paylaşma): çağıranın orijinal dizileriyle alias olmasın.
    mainOps = existing.mainOps.map(m => ({ ...m, nextIds: [...(m.nextIds || [])] }))
  } else {
    // Dosyadaki ana operasyon adlarından, Excel'deki ilk görülme sırasına göre üret.
    const sourceRows = [...validRows].sort((a, b) => {
      const na = Number(a.sira), nb = Number(b.sira)
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
      if (Number.isFinite(na) && !Number.isFinite(nb)) return -1
      if (!Number.isFinite(na) && Number.isFinite(nb)) return 1
      return 0
    })
    const usedAnaGruplar = []
    for (const r of sourceRows) {
      if (r.anaGrup && !usedAnaGruplar.some(g => g.toLocaleLowerCase('tr') === r.anaGrup.toLocaleLowerCase('tr'))) {
        usedAnaGruplar.push(r.anaGrup)
      }
    }

    // Slug çakışma koruması: Türkçe karakterler regexte düşer ('Süreç 1' → 'sre_1'),
    // rakamlar artık KORUNUR ([^a-z0-9_]) — 'Süreç 1'/'Süreç 2' zaten ayrışır. Yine de
    // tamamen ayrışamayan adlar ('Ölçüm'/'Örme' → ikisi de 'mo_lm' benzeri) için Set ile
    // takip edilir; ilk geçiş orijinal slug'ını korur, çakışan sonrakiler index/uid alır.
    const usedIds = new Set()
    const slugId = (ag, i) => {
      let base = 'mo_' + ag.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      if (base === 'mo_' || usedIds.has(base)) base = `${base}${base.endsWith('_') ? '' : '_'}${i}`
      if (usedIds.has(base)) base = 'mo_' + uid()
      usedIds.add(base)
      return base
    }

    mainOps = usedAnaGruplar.map((ag, i) => {
      // Bilinmeyen grup adları (blank domain / serbest adlandırma): nötr slate renk +
      // index tabanlı grid yerleşimi — hepsi aynı noktaya yığılmasın diye.
      const meta = ANA_GRUP_META[ag] || {
        color: '#64748b',
        x: 60 + (i % 4) * 300,
        y: 100 + Math.floor(i / 4) * 220,
        order: i,
      }
      return {
        id: slugId(ag, i),
        name: ag,
        color: meta.color,
        order: i,
        nextIds: [],
        x: meta.x,
        y: meta.y,
      }
    })

    // Öncesi kolonu yoksa Excel'deki ana operasyon sırası lineer akış kabul edilir.
    if (!hasOncesi) {
      mainOps.forEach((mo, i) => {
        mo.nextIds = mainOps[i + 1] ? [mainOps[i + 1].id] : []
      })
    }
  }

  // ── Öncesi → ana-op nextIds grafiği (yetkili). hasOncesi iken tüm mainOps.nextIds
  // SIFIRLANIR (stale/manuel kenarlar Öncesi ile değiştirilir), sonra öncül→ardıl
  // kenarları eklenir. Bilinmeyen öncül → uyarı; döngü oluşturan kenar → uyarı + atla.
  if (hasOncesi) {
    for (const mo of mainOps) mo.nextIds = []
    // adj Map, mo.nextIds dizilerine CANLI referans tutar (push edince erişilebilirlik güncel).
    const adj = new Map(mainOps.map(m => [m.id, m.nextIds]))
    // Türkçe İ/ı doğru eşleşsin diye locale-aware küçültme ('İplik' vs 'iplik').
    const normName = (s) => (s ?? '').toString().trim().toLocaleLowerCase('tr')
    const findByName = (name) => mainOps.find(m => normName(m.name) === normName(name))

    for (const G of mainOps) {
      // G'nin öncülleri = G'ye ait tüm satırların oncesiList birleşimi
      const preds = new Set()
      for (const r of validRows) {
        if (normName(r.anaGrup) !== normName(G.name)) continue
        for (const p of (r.oncesiList || [])) preds.add(p)
      }
      for (const name of preds) {
        const P = findByName(name)
        if (!P) { warnings.push(`Öncesi grubu bulunamadı: ${name} (grup: ${G.name})`); continue }
        // P → G kenarı döngü kapatır mı? G zaten P'ye erişiyorsa (G→…→P) evet.
        if (reaches(adj, G.id, P.id)) { warnings.push(`Öncesi döngüsü atlandı: ${P.name} → ${G.name}`); continue }
        if (!P.nextIds.includes(G.id)) P.nextIds.push(G.id)
      }
    }
  }

  // Alt operasyonlar: satır sırasında aynı ana grup içinde zincir
  const subOps = []
  const buckets = {}  // mainOpId -> [subIds in order]
  const rowsInOrder = [...validRows].sort((a, b) => {
    const na = Number(a.sira), nb = Number(b.sira)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    if (Number.isFinite(na) && !Number.isFinite(nb)) return -1
    if (!Number.isFinite(na) && Number.isFinite(nb)) return 1
    return 0
  })
  rowsInOrder.forEach((r, idx) => {
    const mo = mainOps.find(m => m.name === r.anaGrup)
    if (!mo) return
    const id = 's_' + (idx + 1) + '_' + Math.random().toString(36).slice(2, 6)
    const sub = {
      id,
      mainOpId: mo.id,
      name: r.opAdi,
      cycleTime: r.cevrim,
      machineId: ensureMachine(r.makineKodu),
      operatorId: ensureOperator(r.operator),
      type: r.tip || '',   // tip zaten validateRows'ta domain opTypes'ına göre default'landı — ikinci tekstil fallback'i yanlış olur
      order: 0,           // aşağıda düzeltilecek
      nextIds: [],
    }
    subOps.push(sub)
    if (!buckets[mo.id]) buckets[mo.id] = []
    buckets[mo.id].push(sub)
  })
  // Her bucket'ta order + nextIds zincirle
  for (const moId of Object.keys(buckets)) {
    const list = buckets[moId]
    list.forEach((s, i) => {
      s.order = i
      if (i < list.length - 1) s.nextIds = [list[i + 1].id]
    })
    // Gruplar arasi akis mainOps.nextIds uzerinden simulasyon motorunun grup
    // kopruleriyle tasinir. Burada dogrudan alt-op baglantisi eklemek, giris
    // alt-oplarinda hem pending hem groupInbox kapisi beklenmesine ve kilitlenmeye yol acar.
  }

  return { mainOps, subOps, machines, operators, warnings }
}
