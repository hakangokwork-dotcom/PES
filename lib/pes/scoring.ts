import type { ScoreTier, TrendDirection } from '@/types/pes'

// Skor ağırlıkları
const WEIGHTS = {
  efficiency: 0.30,
  quality: 0.25,
  delivery: 0.20,
  cost: 0.15,
  compliance: 0.10,
}

// Bileşik skor hesabı
export function calcCompositeScore(scores: {
  efficiency: number
  quality: number
  delivery: number
  cost: number
  compliance: number
}): number {
  return Math.round(
    scores.efficiency * WEIGHTS.efficiency +
    scores.quality * WEIGHTS.quality +
    scores.delivery * WEIGHTS.delivery +
    scores.cost * WEIGHTS.cost +
    scores.compliance * WEIGHTS.compliance
  )
}

// Kademe belirleme
export function determineTier(score: number): ScoreTier {
  if (score >= 85) return 'Stratejik'
  if (score >= 70) return 'Gelişen'
  if (score >= 55) return 'İzlemede'
  if (score >= 40) return 'Risk'
  return 'Kritik'
}

// Trend belirleme
export function determineTrend(current: number, previous: number | null): TrendDirection {
  if (previous === null) return 'Sabit'
  const diff = current - previous
  if (diff > 2) return 'Artış'
  if (diff < -2) return 'Düşüş'
  return 'Sabit'
}

// Kademe rengi
export function tierColor(tier: ScoreTier): { bg: string; text: string } {
  switch (tier) {
    case 'Stratejik': return { bg: 'bg-green-100', text: 'text-green-700' }
    case 'Gelişen': return { bg: 'bg-blue-100', text: 'text-blue-700' }
    case 'İzlemede': return { bg: 'bg-amber-100', text: 'text-amber-700' }
    case 'Risk': return { bg: 'bg-orange-100', text: 'text-orange-700' }
    case 'Kritik': return { bg: 'bg-red-100', text: 'text-red-700' }
  }
}

// Trend ikonu
export function trendIcon(trend: TrendDirection): string {
  switch (trend) {
    case 'Artış': return '↑'
    case 'Düşüş': return '↓'
    case 'Sabit': return '→'
  }
}
