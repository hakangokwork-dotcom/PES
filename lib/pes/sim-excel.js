import * as XLSX from 'xlsx'

/* ============================================================
   Üretim simülasyon Excel import/export yardımcıları
   Şablon: Ana Grup | Operasyon Adı | Çevrim (sn) | Tip | Makine Kodu | Operatör
   ============================================================ */

export const ANA_GRUP_LISTESI = ['Ön Bant', 'Arka Bant', 'Montaj', 'UKP', 'Yıkama', 'Son Montaj']

export const ANA_GRUP_META = {
  'Ön Bant':    { color: '#2563eb', x: 60,   y: 100, order: 0 },
  'Arka Bant':  { color: '#16a34a', x: 60,   y: 320, order: 1 },
  'Montaj':     { color: '#d97706', x: 360,  y: 210, order: 2 },
  'UKP':        { color: '#dc2626', x: 660,  y: 210, order: 3 },
  'Yıkama':     { color: '#0891b2', x: 960,  y: 120, order: 4 },
  'Son Montaj': { color: '#7c3aed', x: 960,  y: 320, order: 5 },
}

export const OP_TYPES = [
  'DİKİM', 'OVERLOK', 'ÇİMA', 'REÇME', 'PUNTEREZ',
  'OTOMAT', 'ÜTÜ', 'KESİM', 'KONTROL', 'TEMİZLİK', 'AKSESUAR', 'DESTEK',
]

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
  return String(s ?? '').toLowerCase().trim()
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
// mainOpsFromFlow: [{ name }] — kullanıcının Akış sekmesinde tanımladığı ana operasyonlar
// Boş ya da verilmezse standart liste kullanılır.
// Tek sheet: 'Operasyonlar'. Her ana operasyon için tek satır, sadece Ana Grup dolu, diğerleri boş.
export function downloadTemplate(mainOpsFromFlow) {
  const flowNames = (mainOpsFromFlow || []).map(m => m.name).filter(Boolean)
  const useNames = flowNames.length > 0 ? flowNames : ANA_GRUP_LISTESI

  const header = ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör']
  const rows = useNames.map(ag => [ag, '', '', '', '', ''])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = [
    { wch: 14 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Operasyonlar')

  XLSX.writeFile(wb, 'uretim_simulasyon_sablon.xlsx')
}

/* ─────── Dosyayı oku + satırları + meta çıkar ─────── */
export async function parseSimFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })

  // Operasyon sheet'i
  const opsSheetName = wb.SheetNames.includes('Operasyonlar')
    ? 'Operasyonlar'
    : wb.SheetNames.find(n => n.toLowerCase().includes('op')) || wb.SheetNames[0]
  const opsWs = wb.Sheets[opsSheetName]
  if (!opsWs) throw new Error('Dosyada okunabilir operasyon sheet yok')
  const rows = XLSX.utils.sheet_to_json(opsWs, { defval: null })

  // Bilgi sheet'i (opsiyonel)
  const bilgiSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'bilgi' || n.toLowerCase() === 'info')
  const meta = bilgiSheetName ? parseMetaSheet(wb.Sheets[bilgiSheetName]) : {}

  return { rows, meta }
}

/* ─────── Satırları doğrula ─────── */
// allowedAnaGruplar: string[] — kullanıcının Akış'ta tanımladığı ana operasyon adları.
// Verilmezse standart ANA_GRUP_LISTESI kullanılır.
export function validateRows(rows, allowedAnaGruplar) {
  const allowed = (allowedAnaGruplar && allowedAnaGruplar.length > 0)
    ? allowedAnaGruplar
    : ANA_GRUP_LISTESI
  const out = []   // { ok, row, errors }
  const seenKey = new Set()
  rows.forEach((r, idx) => {
    const errors = []
    const rowNo = idx + 2  // header = 1
    const anaGrup = (r['Ana Grup'] ?? '').toString().trim()
    const opAdi = (r['Operasyon Adı'] ?? '').toString().trim()
    const cevrimRaw = r['Çevrim (sn)']
    const tip = (r['Tip'] ?? '').toString().trim() || 'DİKİM'
    const makineKodu = (r['Makine Kodu'] ?? '').toString().trim()
    const operator = (r['Operatör'] ?? '').toString().trim()

    if (!anaGrup) errors.push('Ana Grup boş')
    else if (!allowed.includes(anaGrup)) errors.push(`Ana Grup akışta yok (${anaGrup}) — geçerli: ${allowed.join(', ')}`)
    if (!opAdi) errors.push('Operasyon Adı boş')
    const cevrim = Number(cevrimRaw)
    if (!Number.isFinite(cevrim) || cevrim <= 0) errors.push(`Çevrim geçersiz (${cevrimRaw})`)
    // Tip serbest metin — kullanıcının makine tipi adlandırması ne olursa olsun kabul et

    const key = `${anaGrup}||${opAdi.toLowerCase()}`
    if (errors.length === 0) {
      if (seenKey.has(key)) errors.push('Aynı ana grup içinde tekrarlanan operasyon adı')
      else seenKey.add(key)
    }

    out.push({
      rowNo,
      ok: errors.length === 0,
      anaGrup, opAdi, cevrim, tip, makineKodu, operator,
      errors,
    })
  })
  return out
}

/* ─────── Geçerli satırlardan simülasyon datasına dönüştür ─────── */
// existing: { machines, operators, mainOps } — Akış sekmesinden gelen mevcut ana operasyonlar.
// mainOps verilirse korunur, dosyadan üretilmez. Verilmezse eski davranış (dosyadan üret).
export function buildSimDataFromRows(validRows, existing = { machines: [], operators: [], mainOps: null }) {
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
    // Akıştaki mainOps'u olduğu gibi koru — sadece kopyala
    mainOps = existing.mainOps.map(m => ({ ...m }))
  } else {
    // Eski davranış: dosyadaki ana grup adlarından üret
    const usedAnaGruplar = [...new Set(validRows.map(r => r.anaGrup))]
      .sort((a, b) => (ANA_GRUP_META[a]?.order ?? 99) - (ANA_GRUP_META[b]?.order ?? 99))

    mainOps = usedAnaGruplar.map((ag) => {
      const meta = ANA_GRUP_META[ag] || { color: '#64748b', x: 60, y: 200, order: 99 }
      return {
        id: 'mo_' + ag.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''),
        name: ag,
        color: meta.color,
        order: meta.order,
        nextIds: [],
        x: meta.x,
        y: meta.y,
      }
    })

    const successorMap = {
      'Hazırlık': ['Ön Bant', 'Arka Bant'],
      'Ön Bant': ['Montaj'],
      'Arka Bant': ['Montaj'],
      'Montaj': ['Yıkama'],
      'Yıkama': ['UKP'],
      'UKP': [],
    }
    for (const mo of mainOps) {
      const targets = (successorMap[mo.name] || []).filter(t => usedAnaGruplar.includes(t))
      mo.nextIds = targets.map(t => mainOps.find(x => x.name === t).id)
    }
  }

  // Alt operasyonlar: satır sırasında aynı ana grup içinde zincir
  const subOps = []
  const buckets = {}  // mainOpId -> [subIds in order]
  validRows.forEach((r, idx) => {
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
      type: r.tip || 'DİKİM',
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
    // Son sub'dan sonraki ana grubun ilk sub'una bağlantı (ana gruplar arası akış)
    const mo = mainOps.find(m => m.id === moId)
    if (!mo) continue
    const lastSub = list[list.length - 1]
    const downstreamMainIds = mo.nextIds
    for (const nextMoId of downstreamMainIds) {
      const nextList = buckets[nextMoId]
      if (nextList && nextList.length > 0) {
        lastSub.nextIds = [...(lastSub.nextIds || []), nextList[0].id]
      }
    }
  }

  return { mainOps, subOps, machines, operators }
}
