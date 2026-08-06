'use client'

import { useState, useEffect } from 'react'
import { tierColor, trendIcon } from '@/lib/pes/scoring'
import type { ScoreTier, TrendDirection } from '@/types/pes'

interface ScoreRow {
  workshop_id: number
  workshop_code: string
  workshop_name: string
  workshop_type: string
  year: number
  month: number
  efficiency_sc: number | null
  quality_sc: number | null
  delivery_sc: number | null
  cost_sc: number | null
  compliance_sc: number | null
  composite_sc: number | null
  tier: ScoreTier | null
  trend: TrendDirection | null
}

interface Workshop { id: number; code: string; name: string }

export default function ScoringPage() {
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/pes/scoring').then(r => r.json()).then(d => setScores(d.scores ?? []))
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
  }, [])

  async function calculateAll() {
    setLoading(true)
    setMessage('')
    let count = 0

    for (const w of workshops) {
      const res = await fetch('/api/pes/scoring/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: w.id, year, month }),
      })
      if (res.ok) count++
    }

    setMessage(`${count} atölye için skor hesaplandı`)
    setLoading(false)

    // Listeyi yenile
    const r = await fetch('/api/pes/scoring')
    const d = await r.json()
    setScores(d.scores ?? [])
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tedarikçi Skorlama</h1>
          <p className="text-faint mt-1">Atölye performans değerlendirmesi</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <select className="px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button
            onClick={calculateAll}
            disabled={loading}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Hesaplanıyor...' : 'Tüm Skorları Hesapla'}
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>
      )}

      {/* Ağırlık bilgisi */}
      <div className="bg-canvas border border-line-soft rounded-xl p-4">
        <p className="text-xs text-faint">
          Verimlilik %30 · Kalite %25 · Teslimat %20 · Maliyet %15 · Uyumluluk %10
        </p>
      </div>

      {/* Skor Tablosu */}
      {scores.length > 0 ? (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line-soft">
                <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Dönem</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Verimlilik</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Kalite</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Teslimat</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Maliyet</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Uyumluluk</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Bileşik</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Kademe</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scores.map((s, i) => {
                const tc = s.tier ? tierColor(s.tier) : { bg: 'bg-gray-100', text: 'text-faint' }
                return (
                  <tr key={i} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <span className="text-accent font-medium">{s.workshop_code}</span>
                      <span className="text-faint ml-2 text-xs">{s.workshop_name}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted">{s.year}/{s.month}</td>
                    <td className="px-4 py-3 text-right">{s.efficiency_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s.quality_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s.delivery_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s.cost_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s.compliance_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-ink">{s.composite_sc ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {s.tier && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.bg} ${tc.text}`}>
                          {s.tier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-lg">
                      {s.trend ? trendIcon(s.trend) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-canvas border border-line-soft rounded-xl p-8 text-center">
          <p className="text-muted">Henüz skor hesaplanmamış</p>
          <p className="text-sm text-faint mt-1">Önce üretim ve kalite verisi girin, sonra skorları hesaplayın</p>
        </div>
      )}
    </div>
  )
}
