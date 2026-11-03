'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ImportResult {
  message: string
  stats: {
    total_parsed: number
    inserted: number
    updated: number
    failed: number
    duplicates_in_csv: number
    skipped_rows: number
  }
  errors?: string[]
}

export default function ImportWorkshopsPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/pes/workshops/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Import başarısız')
        setLoading(false)
        return
      }

      setResult(data)
      setLoading(false)
    } catch {
      setError('Sunucu hatası')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/pes/workshops" className="text-sm text-faint hover:text-ink">
          ← Atölyeler
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink mt-2">CSV Import</h1>
        <p className="text-faint mt-1">Atölye listesini CSV dosyasından toplu olarak yükleyin</p>
      </div>

      {/* Upload */}
      <div className="bg-surface border border-line-soft rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-2">CSV Dosyası Seçin</label>
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-faint file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-soft file:text-accent hover:file:bg-accent-soft"
          />
          <p className="text-xs text-faint mt-2">
            Semicolon (;) ile ayrılmış CSV dosyası. İlk satır header olmalı.
          </p>
        </div>

        <div className="bg-canvas border border-line-soft rounded-lg p-4">
          <p className="text-xs font-medium text-muted mb-2">Beklenen kolonlar:</p>
          <p className="text-xs text-faint">
            ATÖLYE ADI ; BW ATÖLYE ADI ; T&apos;li KOD ; ... ; İL ; İLÇE ; ... ; AKTİF/PASİF ; CMT/UKP/DİKİM ; ...
          </p>
        </div>

        {error && (
          <div className="bg-danger-soft border border-danger-line text-danger text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Import ediliyor...' : 'Import Başlat'}
        </button>
      </div>

      {/* Sonuç */}
      {result && (
        <div className="bg-surface border border-line-soft rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Import Sonucu</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-accent-soft border border-line-soft rounded-lg p-3">
              <p className="text-xs text-accent-ink">Parse Edilen</p>
              <p className="text-xl font-bold text-accent-ink">{result.stats.total_parsed}</p>
            </div>
            <div className="bg-accent-soft border border-line-soft rounded-lg p-3">
              <p className="text-xs text-accent-ink">Yeni Eklenen</p>
              <p className="text-xl font-bold text-accent-ink">{result.stats.inserted}</p>
            </div>
            <div className="bg-canvas border border-line rounded-lg p-3">
              <p className="text-xs text-muted">Güncellenen</p>
              <p className="text-xl font-bold text-ink">{result.stats.updated}</p>
            </div>
            <div className="bg-warn-soft border border-line-soft rounded-lg p-3">
              <p className="text-xs text-warn">CSV Duplikatlar</p>
              <p className="text-xl font-bold text-warn">{result.stats.duplicates_in_csv}</p>
            </div>
            <div className="bg-canvas border border-line-soft rounded-lg p-3">
              <p className="text-xs text-muted">Atlanan Satır</p>
              <p className="text-xl font-bold text-ink">{result.stats.skipped_rows}</p>
            </div>
            {result.stats.failed > 0 && (
              <div className="bg-danger-soft border border-danger-line rounded-lg p-3">
                <p className="text-xs text-danger">Başarısız</p>
                <p className="text-xl font-bold text-danger">{result.stats.failed}</p>
              </div>
            )}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="bg-danger-soft border border-danger-line rounded-lg p-4">
              <p className="text-sm font-medium text-danger mb-2">Hatalar:</p>
              <ul className="text-xs text-danger space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => router.push('/pes/workshops')}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
          >
            Atölye Listesine Git →
          </button>
        </div>
      )}
    </div>
  )
}
