import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

interface Line {
  id: number; code: string; name: string;
  line_type: string | null;
  operator_count: number | null;
  daily_target: number | null;
  max_cycle_sec: number | null;
}
interface ExistingWO {
  id: number; line_id: number;
  baslangic_tarihi: string | null;
  bitis_tarihi: string | null;
  teslim_tarihi: string | null;
  siparis_miktari: number;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function dateOnly(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function toISO(d: Date): string { return d.toISOString().slice(0, 10) }

export const POST = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const { workshop_id, siparis_miktari, teslim_tarihi, sam_toplam_sn } = body

  if (!workshop_id || !siparis_miktari || !teslim_tarihi) {
    return NextResponse.json({ error: 'workshop_id, siparis_miktari, teslim_tarihi gerekli' }, { status: 400 })
  }

  const teslim = parseDate(teslim_tarihi)
  if (!teslim) return NextResponse.json({ error: 'Geçersiz teslim_tarihi' }, { status: 400 })

  const lines = await sql<Line[]>`
    SELECT id, code, name, line_type, operator_count, daily_target, max_cycle_sec
    FROM production_line
    WHERE workshop_id = ${workshop_id} AND is_active = TRUE
    ORDER BY id
  `
  if (lines.length === 0) {
    return NextResponse.json({ suggestions: [], error_msg: 'Atölyenin aktif bantı yok' })
  }

  const winStart = addDays(new Date(), -7)
  const winEnd = addDays(teslim, +30)
  const existingWOs = await sql<ExistingWO[]>`
    SELECT id, line_id, baslangic_tarihi, bitis_tarihi, teslim_tarihi, siparis_miktari
    FROM work_order
    WHERE workshop_id = ${workshop_id}
      AND line_id IS NOT NULL
      AND durum NOT IN ('İptal','Tamamlandi','Sevk Edildi')
      AND COALESCE(bitis_tarihi, teslim_tarihi) >= ${toISO(winStart)}
      AND COALESCE(baslangic_tarihi, teslim_tarihi) <= ${toISO(winEnd)}
  `

  const today = dateOnly(new Date())
  const teslimDay = dateOnly(teslim)
  const totalWindowDays = Math.max(1, daysBetween(today, winEnd))

  type Suggestion = {
    line_id: number; line_code: string; line_name: string;
    baslangic_tarihi: string; bitis_tarihi: string;
    gun_sayisi: number; daily_target: number; capacity_pct: number;
    score: number; reasons: string[]; warnings: string[];
  }
  const suggestions: Suggestion[] = []

  for (const line of lines) {
    let dailyTarget = Number(line.daily_target) || 0
    if (dailyTarget <= 0) {
      if (Number(sam_toplam_sn) > 0 && Number(line.operator_count) > 0) {
        const dakika_per_adet = (Number(sam_toplam_sn) / 60) / Number(line.operator_count)
        dailyTarget = Math.floor((540 * 0.85) / Math.max(0.1, dakika_per_adet))
      }
      if (dailyTarget <= 0) dailyTarget = 100
    }

    const neededDays = Math.max(1, Math.ceil(Number(siparis_miktari) / dailyTarget))

    const busyIntervals: { start: Date; end: Date }[] = existingWOs
      .filter(o => o.line_id === line.id)
      .map(o => {
        const start = parseDate(o.baslangic_tarihi) || parseDate(o.teslim_tarihi)
        const end = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
        if (!start || !end) return null
        return { start: dateOnly(start), end: dateOnly(end) }
      })
      .filter((x): x is { start: Date; end: Date } => x !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    let busyDays = 0
    for (const iv of busyIntervals) {
      const s = iv.start < today ? today : iv.start
      const e = iv.end > winEnd ? winEnd : iv.end
      if (e >= s) busyDays += daysBetween(s, e) + 1
    }
    const capacity_pct = Math.min(100, Math.round((busyDays / Math.max(1, totalWindowDays)) * 100))

    const earliestStart = today
    const latestStart = addDays(teslimDay, -(neededDays - 1))
    let suggestedStart: Date | null = null

    if (latestStart < earliestStart) {
      const reasons: string[] = []
      const warnings: string[] = ['Teslim tarihi yetersiz — yetişmek için ekstra mesai/operatör gerek']
      suggestedStart = today
      suggestions.push({
        line_id: line.id, line_code: line.code, line_name: line.name,
        baslangic_tarihi: toISO(suggestedStart),
        bitis_tarihi: toISO(addDays(suggestedStart, neededDays - 1)),
        gun_sayisi: neededDays, daily_target: dailyTarget, capacity_pct,
        score: 10, reasons, warnings,
      })
      continue
    }

    let cur = new Date(earliestStart)
    let runStart: Date | null = null
    let runLen = 0
    const fits = (d: Date) => {
      for (const iv of busyIntervals) {
        if (d >= iv.start && d <= iv.end) return false
      }
      return true
    }
    const stopAt = addDays(latestStart, +neededDays + 30)
    while (cur <= stopAt && !suggestedStart) {
      if (fits(cur)) {
        if (runStart === null) runStart = new Date(cur)
        runLen++
        if (runLen >= neededDays && runStart) {
          suggestedStart = runStart
          break
        }
      } else {
        runStart = null
        runLen = 0
      }
      cur = addDays(cur, 1)
    }

    const reasons: string[] = []
    const warnings: string[] = []

    if (!suggestedStart) {
      suggestedStart = today
      warnings.push('Bantta uygun ardışık slot bulunamadı — çakışma olabilir, manuel düzenle')
    }
    const suggestedEnd = addDays(suggestedStart, neededDays - 1)

    let score = 0
    const margin = daysBetween(suggestedEnd, teslimDay)
    if (margin >= 0) {
      score += 60
      if (margin >= 7) score += 20
      else if (margin >= 3) score += 10
      reasons.push(`Teslime ${margin} gün tampon kaldı`)
    } else {
      warnings.push(`${Math.abs(margin)} gün gecikme ile bitiyor`)
    }

    if (capacity_pct < 50)        { score += 30; reasons.push(`Bant boş (kullanım %${capacity_pct})`) }
    else if (capacity_pct < 75)   { score += 15; reasons.push(`Bant orta yüklü (%${capacity_pct})`) }
    else if (capacity_pct < 90)   { score += 5;  reasons.push(`Bant yoğun (%${capacity_pct})`) }
    else                          { warnings.push(`Bant çok yüklü (%${capacity_pct}) — sıkışıklık`) }

    if (Number(line.daily_target) > 0) {
      reasons.push(`Hedef ${dailyTarget} adet/gün → ${neededDays} gün sürer`)
    } else {
      reasons.push(`Bant kapasitesi tahmini ${dailyTarget} adet/gün (SAM'dan)`)
    }

    suggestions.push({
      line_id: line.id, line_code: line.code, line_name: line.name,
      baslangic_tarihi: toISO(suggestedStart),
      bitis_tarihi: toISO(suggestedEnd),
      gun_sayisi: neededDays, daily_target: dailyTarget, capacity_pct,
      score, reasons, warnings,
    })
  }

  suggestions.sort((a, b) => b.score - a.score)

  return NextResponse.json({ suggestions })
})
