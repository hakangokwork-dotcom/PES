'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import TermTip from './TermTip'

type Flag = {
  field: string
  rule: string
  severity: 'info' | 'warn' | 'error'
  message: string
  suggested_fix?: string
}

type Score = {
  id: number
  donem: string
  workshop_code: string | null
  workshop_name: string | null
  total_sc: string | number
  completeness_sc: string | number
  consistency_sc: string | number
  plausibility_sc: string | number
  crosscheck_sc: string | number
  status: 'accepted' | 'winsorized' | 'rejected' | 'pending_fix'
  flags: Flag[]
  rule_version: string | null
}

type StatusRow = { status: string; n: number; avg_sc: string | number | null }

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Kabul edildi',
  winsorized: 'Kırpıldı',
  pending_fix: 'Düzeltme bekliyor',
  rejected: 'Reddedildi',
}

const STATUS_STYLES: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  winsorized: 'bg-amber-100 text-amber-700',
  pending_fix: 'bg-orange-100 text-orange-700',
  rejected: 'bg-red-100 text-red-700',
}

const SEVERITY_STYLES: Record<string, string> = {
  error: 'text-red-700 bg-red-50 border-red-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  info: 'text-gray-600 bg-gray-50 border-gray-200',
}

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v))

function scoreColor(v: number) {
  if (v >= 70) return 'text-green-700'
  if (v >= 50) return 'text-amber-700'
  return 'text-red-700'
}

export default function QualityReport({
  scores,
  byStatus,
}: {
  scores: Score[]
  byStatus: StatusRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const total = scores.length
  const accepted = byStatus.find((s) => s.status === 'accepted')?.n ?? 0
  const usableRatio = total > 0 ? (accepted / total) * 100 : 0

  async function rescore() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/pes/expenses/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Skorlama başarısız')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skorlama başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={rescore}
          disabled={busy}
          className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Skorlanıyor…' : 'Tüm beyanları yeniden skorla'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {total > 0 && (
        <>
          {/* Özet */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">
                <TermTip termKey="guven_skoru">Kullanılabilir Veri</TermTip>
              </p>
              <p className={`text-2xl font-bold ${scoreColor(usableRatio)}`}>
                %{usableRatio.toFixed(0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{accepted} / {total} beyan</p>
            </div>
            {byStatus.map((s) => (
              <div key={s.status} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500">{STATUS_LABELS[s.status] ?? s.status}</p>
                <p className="text-2xl font-bold text-gray-900">{s.n}</p>
                <p className="text-xs text-gray-400 mt-0.5">ort. {n(s.avg_sc).toFixed(1)}</p>
              </div>
            ))}
          </div>

          {/* Tablo */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Atölye</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Dönem</th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">
                      <TermTip termKey="doluluk_skoru">Doluluk</TermTip>
                    </th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">
                      <TermTip termKey="tutarlilik_skoru">Tutarlılık</TermTip>
                    </th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">
                      <TermTip termKey="makullük_skoru">Makullük</TermTip>
                    </th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">
                      <TermTip termKey="capraz_kontrol_skoru">Çapraz</TermTip>
                    </th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">
                      <TermTip termKey="guven_skoru">Toplam</TermTip>
                    </th>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">
                      <TermTip termKey="beyan_durumu">Durum</TermTip>
                    </th>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">Bayrak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scores.map((s) => {
                    const flags = Array.isArray(s.flags) ? s.flags : []
                    const errors = flags.filter((f) => f.severity === 'error').length
                    const isOpen = expanded === s.id
                    return (
                      <Fragment key={s.id}>
                        <tr
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900">{s.workshop_code}</span>
                            <span className="text-gray-400 ml-2 hidden md:inline">{s.workshop_name}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{s.donem}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{n(s.completeness_sc).toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{n(s.consistency_sc).toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{n(s.plausibility_sc).toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{n(s.crosscheck_sc).toFixed(0)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${scoreColor(n(s.total_sc))}`}>
                            {n(s.total_sc).toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status]}`}>
                              {STATUS_LABELS[s.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">
                            {flags.length > 0 ? (
                              <span className={errors > 0 ? 'text-red-600 font-medium' : ''}>
                                {flags.length}{errors > 0 && ` (${errors}!)`}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                        {isOpen && flags.length > 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-3 bg-gray-50">
                              <div className="space-y-2">
                                {flags.map((f, i) => (
                                  <div
                                    key={i}
                                    className={`text-xs border rounded-lg px-3 py-2 ${SEVERITY_STYLES[f.severity]}`}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold uppercase">{f.severity}</span>
                                      <code className="opacity-70">{f.rule}</code>
                                      <span className="opacity-50">·</span>
                                      <span className="font-medium">{f.field}</span>
                                    </div>
                                    <p className="mt-1">{f.message}</p>
                                    {f.suggested_fix && (
                                      <p className="mt-0.5 opacity-75">→ {f.suggested_fix}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Satıra tıklayarak bayrakları açabilirsiniz. Bir tane bile <strong>error</strong>{' '}
            bayrağı varsa, toplam puan eşiği geçse dahi kayıt kabul edilmez.
          </p>
        </>
      )}
    </div>
  )
}
