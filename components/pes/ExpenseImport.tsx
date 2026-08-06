'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Flag = { field: string; rule: string; severity: 'info' | 'warn' | 'error'; message: string; suggested_fix?: string }

type RowReport = {
  rowIndex: number
  workshop_code: string | null
  workshop_id: number | null
  donem: string | null
  matched: boolean
  problem?: string
  score?: {
    total_sc: number
    completeness_sc: number
    status: 'accepted' | 'winsorized' | 'rejected' | 'pending_fix'
    flags: Flag[]
  }
}

type Mapping = {
  expense: Record<string, string>
  meta: Record<string, string>
  unmatched: string[]
}

type Result = {
  mode: 'preview' | 'commit'
  summary: {
    sheet: string
    total_rows: number
    matched: number
    unmatched: number
    by_status: Record<string, number>
    recognized_fields: number
    total_fields: number
  }
  mapping: Mapping
  reports: RowReport[]
}

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

export default function ExpenseImport() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [committed, setCommitted] = useState(false)

  async function send(mode: 'preview' | 'commit') {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pes/expenses/import?mode=${mode}`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'İşlem başarısız')
      setResult(json)
      if (mode === 'commit') {
        setCommitted(true)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Şablon */}
      <section className="bg-white border border-line-soft rounded-xl p-5">
        <h2 className="text-sm font-semibold text-ink">1 · Şablonu indirin</h2>
        <p className="text-sm text-faint mt-1">
          27 gider kalemini içeren boş şablon. Aktif atölyeler kod ve adlarıyla önceden
          doldurulur; her satıra dönem ve tutarları yazmanız yeterli.
        </p>
        <a
          href="/api/pes/expenses/template"
          className="inline-block mt-3 px-4 py-2 border border-line rounded-lg text-sm font-medium hover:bg-canvas transition-colors"
        >
          ↓ Şablonu indir (.xlsx)
        </a>
      </section>

      {/* 2. Yükle */}
      <section className="bg-white border border-line-soft rounded-xl p-5">
        <h2 className="text-sm font-semibold text-ink">2 · Doldurulmuş dosyayı yükleyin</h2>
        <p className="text-sm text-faint mt-1">
          Önce önizleme yapılır — hiçbir şey kaydedilmez. Sonucu görüp onayladıktan sonra
          içeri aktarılır.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
              setCommitted(false)
              setError('')
            }}
            className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-line file:bg-white file:text-sm file:font-medium hover:file:bg-canvas"
          />
          <button
            onClick={() => send('preview')}
            disabled={!file || busy}
            className="px-4 py-2 border border-line rounded-lg text-sm font-medium hover:bg-canvas disabled:opacity-50"
          >
            {busy ? 'İşleniyor…' : 'Önizle'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </section>

      {result && (
        <>
          {/* Başlık eşleme */}
          <section className="bg-white border border-line-soft rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Başlık eşlemesi</h2>
            <p className="text-sm text-faint mt-1">
              <strong>{result.summary.sheet}</strong> sayfası ·{' '}
              {result.summary.recognized_fields}/{result.summary.total_fields} gider kalemi tanındı
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(result.mapping.expense).map(([col, header]) => (
                <span key={col} className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  {header} → {col}
                </span>
              ))}
            </div>

            {result.mapping.unmatched.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-faint mb-1.5">
                  Tanınmayan sütunlar (yok sayıldı):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.mapping.unmatched.map((h) => (
                    <span key={h} className="text-xs px-2 py-1 rounded-full bg-canvas text-faint">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Özet */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Satır" value={result.summary.total_rows} />
            <Stat label="Eşleşen" value={result.summary.matched} tone={result.summary.matched > 0 ? 'good' : 'bad'} />
            <Stat label="Eşleşmeyen" value={result.summary.unmatched} tone={result.summary.unmatched > 0 ? 'bad' : 'neutral'} />
            <Stat label="Kabul edilebilir" value={result.summary.by_status.accepted ?? 0} tone="good" />
          </div>

          {/* Satır raporu */}
          <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas border-b border-line-soft">
                    <th className="px-4 py-3 text-left text-faint font-medium">Satır</th>
                    <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                    <th className="px-4 py-3 text-left text-faint font-medium">Dönem</th>
                    <th className="px-4 py-3 text-right text-faint font-medium">Doluluk</th>
                    <th className="px-4 py-3 text-right text-faint font-medium">Skor</th>
                    <th className="px-4 py-3 text-left text-faint font-medium">Durum / Sorun</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {result.reports.map((r) => (
                    <tr key={r.rowIndex} className={r.matched ? '' : 'bg-red-50/50'}>
                      <td className="px-4 py-2.5 text-faint">{r.rowIndex}</td>
                      <td className="px-4 py-2.5 text-ink">{r.workshop_code ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted">{r.donem ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {r.score ? `%${r.score.completeness_sc.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-ink">
                        {r.score ? r.score.total_sc.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.problem ? (
                          <span className="text-xs text-red-600">{r.problem}</span>
                        ) : r.score ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.score.status]}`}>
                              {STATUS_LABELS[r.score.status]}
                            </span>
                            {r.score.flags.filter((f) => f.severity === 'error').slice(0, 1).map((f, i) => (
                              <span key={i} className="text-xs text-red-600">{f.message}</span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Onay */}
          {result.mode === 'preview' && result.summary.matched > 0 && (
            <section className="bg-white border border-line-soft rounded-xl p-5">
              <h2 className="text-sm font-semibold text-ink">3 · İçeri aktar</h2>
              <p className="text-sm text-faint mt-1">
                {result.summary.matched} satır kaydedilecek. Ham satırlar da saklanır
                (izlenebilirlik), düzeltme gerektiren kayıtlar sonradan düzenlenebilir.
              </p>
              <button
                onClick={() => send('commit')}
                disabled={busy}
                className="mt-3 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Aktarılıyor…' : `${result.summary.matched} satırı içeri aktar`}
              </button>
            </section>
          )}

          {committed && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm text-green-800 font-medium">
                {result.summary.matched} beyan içeri aktarıldı ve skorlandı.
              </p>
              <a href="/pes/veri-kalitesi" className="text-sm text-green-700 underline mt-1 inline-block">
                Veri kalitesi raporuna git →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-ink'
  return (
    <div className="bg-white border border-line-soft rounded-xl p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
