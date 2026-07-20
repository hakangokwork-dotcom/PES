'use client'

import { useState, useEffect, useRef } from 'react'

interface Stats {
  urun_tipi_sayisi: number; ek_parca_sayisi: number; varyant_sayisi: number
  grup_sayisi: number; operasyon_sayisi: number; zaman_kaydi_sayisi: number; makine_sayisi: number
}

export default function ReferansPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Search
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([])

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const r = await fetch('/api/pes/referans?action=istatistik')
      const d = await r.json()
      setStats(d.istatistik ?? null)
    } catch { setStats(null) }
  }

  async function handleUpload() {
    const input = fileRef.current
    if (!input?.files?.[0]) return
    setUploading(true); setError(''); setResult(null)
    const formData = new FormData()
    formData.append('file', input.files[0])
    try {
      const r = await fetch('/api/pes/referans/import', { method: 'POST', body: formData })
      const d = await r.json()
      if (d.ok) { setResult(d.result); loadStats() }
      else setError(d.error || 'Yukleme hatasi')
    } catch { setError('Baglanti hatasi') }
    setUploading(false)
    if (input) input.value = ''
  }

  async function handleSearch() {
    if (!searchQ.trim()) return
    setLoading(true)
    try {
      const r = await fetch(`/api/pes/referans?action=urun_tipleri&q=${encodeURIComponent(searchQ)}`)
      const d = await r.json()
      setSearchResults(d.urun_tipleri ?? [])
    } catch { setSearchResults([]) }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Konfeksiyon Referans Kutuphanesi</h1>
        <p className="text-sm text-gray-500 mt-1">30K+ MTM operasyon zamani referans verisi</p>
      </div>

      {/* Istatistikler */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { l: 'Urun Tipi', v: stats.urun_tipi_sayisi },
            { l: 'Ek Parca', v: stats.ek_parca_sayisi },
            { l: 'Varyant', v: stats.varyant_sayisi },
            { l: 'Op Grup', v: stats.grup_sayisi },
            { l: 'Operasyon', v: stats.operasyon_sayisi },
            { l: 'Zaman Kaydi', v: stats.zaman_kaydi_sayisi },
            { l: 'Makine', v: stats.makine_sayisi },
          ].map(s => (
            <div key={s.l} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">{s.l}</p>
              <p className="text-xl font-bold text-gray-900">{s.v.toLocaleString('tr-TR')}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          Referans tablolari bos veya olusturulmamis. Once Supabase SQL Editor&apos;da <strong>012_konfeksiyon_referans.sql</strong> calistirin,
          sonra asagidan Excel dosyasini yukleyin.
        </div>
      )}

      {/* Excel Yukleme */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Referans Veri Yukle</h2>
        <p className="text-sm text-gray-500 mb-4">
          <strong>konfeksiyon_veri_modeli.xlsx</strong> dosyasini yukleyin. Sayfalar otomatik eslestirilir
          (urun_tipi, ek_parca_tipi, ek_parca_varyant, operasyon_grup, operasyon, makine_tipi, operasyon_zamani).
        </p>
        <div className="flex gap-3 items-center">
          <input type="file" accept=".xlsx,.xls" ref={fileRef}
            className="flex-1 text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50" />
          <button onClick={handleUpload} disabled={uploading}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {uploading ? 'Yukleniyor... (bu islem uzun surebilir)' : 'Yukle'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">Yukleme tamamlandi:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(result).map(([k, v]) => (
                <div key={k} className="text-xs text-green-700">
                  <span className="font-medium">{k}:</span> {v.toLocaleString('tr-TR')} kayit
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Arama */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Urun Tipi Ara</h2>
        <div className="flex gap-2 mb-4">
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="orn. GOMLEK, PANTOLON, KEY DENIM..." className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleSearch} disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Ara
          </button>
        </div>
        {searchResults.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left px-3 py-2">Klasman</th>
                <th className="text-center px-2 py-2">Segment</th>
                <th className="text-center px-2 py-2">Kumas</th>
                <th className="text-center px-2 py-2">Urun</th>
                <th className="text-center px-2 py-2">Kol</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.klasman_ad as string}</td>
                  <td className="text-center px-2 py-2 text-xs">{(r.segment as string) || '—'}</td>
                  <td className="text-center px-2 py-2 text-xs">{(r.kumas_grubu as string) || '—'}</td>
                  <td className="text-center px-2 py-2 text-xs">{(r.urun_grubu as string) || '—'}</td>
                  <td className="text-center px-2 py-2 text-xs">{(r.kol_tipi as string) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
