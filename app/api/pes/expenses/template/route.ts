import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { EXPENSE_LABELS, type ExpenseColumn } from '@/lib/pes/expense-mapping'

/**
 * GET /api/pes/expenses/template — boş gider beyan şablonu (xlsx)
 *
 * Şablon iki sayfadan oluşur:
 *   "Gider Beyani" — atölyelerin dolduracağı satırlar
 *   "Aciklama"     — her kalemin ne anlama geldiği
 *
 * xlsx bilerek sunucuda üretiliyor: paket ~430KB, client'a gitmemeli.
 */

// Şablon kolon sırası: meta alanlar önce, sonra gider kalemleri
const META_HEADERS = ['Atölye Kodu', 'Atölye Adı', 'Dönem (YYYY-MM)', 'Çalışma Günü'] as const

// EXPENSE_LABELS'in tanım sırası mantıksal gruplamayı zaten taşıyor
const EXPENSE_ORDER = Object.keys(EXPENSE_LABELS) as ExpenseColumn[]

const NOTES: Partial<Record<ExpenseColumn, string>> = {
  personnel: 'Net maaş toplamı. Fazla mesai ve primi ayrı kalemlere yazın.',
  sgk: 'İşveren payı dahil SGK primi.',
  overtime: 'Fazla mesai ödemeleri (personel maaşına dahil etmeyin).',
  bonus: 'Prim ve ikramiyeler.',
  severance_reserve: 'Kıdem tazminatı karşılığı — nakit çıkışı değil, dönemsel tahakkuk.',
  incentive_amount: 'GİDER DEĞİLDİR. Alınan teşvik tutarı; net maliyetten düşülür.',
  building_depr: 'Bina amortismanı. Kira ödüyorsanız burayı boş bırakın.',
  machine_depr: 'Makine amortismanı.',
  rent: 'İşyeri kirası. Mülk sahibiyseniz boş bırakın.',
  other: 'Yukarıdaki kalemlere girmeyen giderler.',
}

export const GET = withTenantRoute(async (_req, { sql }) => {
  // Atölye listesi şablona referans olarak eklenir — kod yazım hatasını azaltır
  const workshops = await sql`
    SELECT code, name FROM workshop WHERE is_active ORDER BY code
  ` as Array<{ code: string; name: string }>

  const headers = [...META_HEADERS, ...EXPENSE_ORDER.map((c) => EXPENSE_LABELS[c])]

  // Her aktif atölye için önceden doldurulmuş bir satır — kod/ad hazır gelir
  const rows = workshops.map((w) => {
    const row: Record<string, string | number | null> = {}
    headers.forEach((h) => { row[h] = null })
    row['Atölye Kodu'] = w.code
    row['Atölye Adı'] = w.name
    return row
  })

  const wb = XLSX.utils.book_new()

  const wsData = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [Object.fromEntries(headers.map(h => [h, null]))], { header: headers })
  wsData['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(h.length + 4, 30)) }))
  XLSX.utils.book_append_sheet(wb, wsData, 'Gider Beyani')

  const explain = EXPENSE_ORDER.map((c) => ({
    'Kalem': EXPENSE_LABELS[c],
    'Alan Adı': c,
    'Açıklama': NOTES[c] ?? '',
  }))
  const wsHelp = XLSX.utils.json_to_sheet(explain)
  wsHelp['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Aciklama')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pes-gider-beyan-sablonu.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
})
