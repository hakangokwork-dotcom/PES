// CSV satırlarını parse edip workshop verisine dönüştürür
// Kaynak CSV semicolon (;) ile ayrılmış, Windows-1254 encoding

export interface RawWorkshopRow {
  atolye_adi: string
  bw_atolye_adi: string
  t_kod: string
  odito_adi: string
  atolye_unvani: string
  bant_sayisi: string
  inspection: string
  calisma_sekli: string
  aktif_pasif: string
  cmt_ukp_dikim: string
  tedarik_mudurlugu: string
  bolge: string
  il: string
  ilce: string
  teknik_mudur: string
  fku: string
  subjektif_sinif: string
  aylik_kapasite: string
  on_uretim_numunesi: string
  yetkili_kisi: string
  telefon: string
  eposta: string
  calisan_sayisi: string
  wkys_denetim_tarihi: string
  wkys_puani: string
  wkys_sinifi: string
  sosyal_denetim_tarihi: string
  sosyal_puani: string
  sosyal_sinifi: string
  calisan_sayisi_2: string
  is_ortakligi_leveli: string
  aylik_gider: string
  risk_seviyesi: string
  ozel_not: string
  kullanici: string
  degisiklik_zamani: string
  sabit_degisken: string
}

// CMT/UKP/DİKİM → Workshop Type
function mapType(raw: string): 'CMT' | 'CM' | 'MT' | 'M' {
  const val = raw.toUpperCase().replace(/\s+/g, '').replace(/-/g, '')
  if (val === 'CMT') return 'CMT'
  if (val.includes('KESIM') && val.includes('DIKIM') && val.includes('UKP')) return 'CMT'
  if (val.includes('KESIM') && val.includes('DIKIM')) return 'CM'
  if (val.includes('DIKIM') && val.includes('UKP')) return 'MT'
  if (val.includes('DIKIM')) return 'M'
  if (val === 'UKP') return 'MT'
  return 'CMT' // varsayılan
}

function cleanNumber(val: string): number {
  if (!val) return 0
  const cleaned = val.replace(/[^0-9]/g, '')
  return parseInt(cleaned) || 0
}

function cleanText(val: string): string {
  return val?.trim().replace(/^"|"$/g, '').trim() || ''
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export interface WorkshopImportData {
  code: string
  name: string
  city: string | null
  district: string | null
  type: 'CMT' | 'CM' | 'MT' | 'M'
  line_count: number
  is_active: boolean
  total_staff: number
  // ek bilgiler
  bolge: string | null
  calisma_sekli: string | null
  tedarik_mudurlugu: string | null
  subjektif_sinif: string | null
  aylik_kapasite: number
  wkys_puani: number | null
  wkys_sinifi: string | null
  sosyal_puani: string | null
  cmt_ukp_dikim: string | null
}

export function parseWorkshopCSV(csvContent: string): {
  workshops: WorkshopImportData[]
  duplicates: number
  skipped: number
  errors: string[]
} {
  const lines = csvContent.split('\n').filter(l => l.trim())
  const errors: string[] = []
  const seen = new Map<string, WorkshopImportData>()
  let skipped = 0
  let duplicateCount = 0

  // İlk satır header, atla
  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = parseCSVLine(lines[i])
      if (cols.length < 14) {
        skipped++
        continue
      }

      const tKod = cleanText(cols[2])
      if (!tKod || tKod === '0' || tKod === '#N/A') {
        skipped++
        continue
      }

      const name = cleanText(cols[0]) || cleanText(cols[4]) || cleanText(cols[1])
      if (!name) {
        skipped++
        continue
      }

      const aktifPasif = cleanText(cols[8]).toUpperCase()
      const isActive = aktifPasif.includes('AKTIF') && !aktifPasif.includes('PASIF')

      const bantSayisi = cleanNumber(cols[5])
      const calisanSayisi = cleanNumber(cols[22]) || cleanNumber(cols[29])
      const cmtType = cleanText(cols[9])

      const workshop: WorkshopImportData = {
        code: tKod,
        name: name.substring(0, 100),
        city: cleanText(cols[12]) || null,
        district: cleanText(cols[13]) || null,
        type: mapType(cmtType),
        line_count: bantSayisi > 0 ? bantSayisi : 1,
        is_active: isActive,
        total_staff: calisanSayisi,
        bolge: cleanText(cols[11]) || null,
        calisma_sekli: cleanText(cols[7]) || null,
        tedarik_mudurlugu: cleanText(cols[10]) || null,
        subjektif_sinif: cleanText(cols[16]) || null,
        aylik_kapasite: cleanNumber(cols[17]),
        wkys_puani: cols[24] ? parseFloat(cols[24].replace(',', '.')) || null : null,
        wkys_sinifi: cleanText(cols[25]) || null,
        sosyal_puani: cleanText(cols[27]) || null,
        cmt_ukp_dikim: cmtType || null,
      }

      // T kod bazında deduplicate — aktif olanı tercih et
      if (seen.has(tKod)) {
        duplicateCount++
        const existing = seen.get(tKod)!
        if (!existing.is_active && workshop.is_active) {
          seen.set(tKod, workshop)
        }
      } else {
        seen.set(tKod, workshop)
      }
    } catch (err) {
      errors.push(`Satır ${i + 1}: Parse hatası`)
    }
  }

  return {
    workshops: Array.from(seen.values()),
    duplicates: duplicateCount,
    skipped,
    errors,
  }
}
