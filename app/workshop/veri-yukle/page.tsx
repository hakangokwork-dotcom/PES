'use client'

import { Suspense, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

const TEMPLATES = [
  { key: 'setup', label: 'Atolye Kurulum (Tek Dosya)', desc: 'Profil + personel + bantlar + gider — bir kerede kurulum', icon: '★', color: 'emerald' },
  { key: 'production', label: 'Uretim Verisi', desc: 'Bant bazli aylik uretim hedef/gercek adetleri', icon: '⊞', color: 'emerald' },
  { key: 'expenses', label: 'Gider Verisi', desc: '12 gider kalemi + hedef ciro', icon: '₺', color: 'blue' },
  { key: 'quality', label: 'Kalite Verisi', desc: 'Kontrol, FPQ, red, tamir, hata kategorisi', icon: '◎', color: 'purple' },
  { key: 'downtime', label: 'Durus Kaydi', desc: 'Bant bazli durus suresi, tip ve neden', icon: '⏸', color: 'red' },
  { key: 'workforce', label: 'Isgucu Devir', desc: 'Personel hareketi, isinma, kidem', icon: '👥', color: 'amber' },
  { key: 'changeover', label: 'Model Degisim', desc: 'Bant bazli model degisim sureleri', icon: '↻', color: 'indigo' },
  { key: 'eder_operations', label: 'Eder Operasyonlar', desc: 'Operasyon grubu, alt operasyon, sure, kisi', icon: '⊕', color: 'teal' },
]

const COLORS: Record<string, string> = {
  emerald: 'border-emerald-200 bg-emerald-50',
  blue: 'border-blue-200 bg-blue-50',
  purple: 'border-purple-200 bg-purple-50',
  red: 'border-red-200 bg-red-50',
  amber: 'border-amber-200 bg-amber-50',
  indigo: 'border-indigo-200 bg-indigo-50',
  teal: 'border-teal-200 bg-teal-50',
}

export default function VeriYukleWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yukleniyor...</div>}><VeriYuklePage /></Suspense>
}

function VeriYuklePage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [results, setResults] = useState<Record<string, { ok?: boolean; message?: string; error?: string; imported?: number }>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleUpload(type: string) {
    const input = fileRefs.current[type]
    if (!input?.files?.[0] || !wid) return

    setUploading(type)
    const formData = new FormData()
    formData.append('file', input.files[0])
    formData.append('workshop_id', wid)
    formData.append('year', String(year))
    formData.append('month', String(month))

    try {
      const r = await fetch(`/api/pes/import/${type}`, { method: 'POST', body: formData })
      const d = await r.json()
      setResults(prev => ({ ...prev, [type]: d }))
      input.value = ''
    } catch (err) {
      setResults(prev => ({ ...prev, [type]: { error: 'Yukleme hatasi' } }))
    }
    setUploading(null)
  }

  if (!wid) return <div className="p-6 text-faint">Atolye secin</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Veri Yukle / Indir</h1>
        <p className="text-sm text-faint mt-1">CSV sablonlarini indirin, doldurun ve sisteme yukleyin</p>
      </div>

      {/* Donem Secimi */}
      <div className="bg-white border border-line-soft rounded-xl p-4 flex gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Yil</label>
          <select className="px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            <option value={2025}>2025</option><option value={2026}>2026</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Ay</label>
          <select className="px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <p className="text-sm text-faint pb-2">Yuklenen veriler {month}/{year} donemine kaydedilir</p>
      </div>

      {/* Nasil Kullanilir */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Nasil Kullanilir?</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li><strong>Sablon Indir</strong> butonuna tiklayin — ornek verili CSV dosyasi inecek</li>
          <li>Dosyayi Excel ile acin (ayirici: noktali virgul <code>;</code>)</li>
          <li>Ornek satirlari silin, kendi verilerinizi girin</li>
          <li>CSV olarak kaydedin ve <strong>Yukle</strong> butonuyla sisteme gonderin</li>
        </ol>
        <p className="text-xs text-blue-500 mt-2">Not: Bant kodlari (BANT-01 vb.) sistemde tanimli olmalidir. Profil sayfasindan bantlarinizi kontrol edin.</p>
      </div>

      {/* Sablon Kartlari */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map(t => {
          const res = results[t.key]
          return (
            <div key={t.key} className={`border rounded-xl p-5 ${COLORS[t.color]} space-y-3`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{t.icon}</span>
                    <h3 className="font-semibold text-ink">{t.label}</h3>
                  </div>
                  <p className="text-xs text-faint mt-1">{t.desc}</p>
                </div>
                <a
                  href={`/api/pes/templates/${t.key}`}
                  download
                  className="px-3 py-1.5 bg-white border border-line rounded-lg text-xs font-medium text-gray-700 hover:bg-canvas whitespace-nowrap"
                >
                  Sablon Indir
                </a>
              </div>

              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".csv,.txt"
                  ref={el => { fileRefs.current[t.key] = el }}
                  className="flex-1 text-sm text-muted file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-line file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-canvas"
                />
                <button
                  onClick={() => handleUpload(t.key)}
                  disabled={uploading === t.key}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {uploading === t.key ? 'Yukleniyor...' : 'Yukle'}
                </button>
              </div>

              {res && (
                <div className={`text-xs px-3 py-2 rounded-lg ${res.ok || res.imported ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {res.imported ? `${res.imported} kayit yuklendi` : res.error || res.message}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
