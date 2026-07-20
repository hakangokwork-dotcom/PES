'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Process { id: number; code: string; name: string }
interface Category { id: number; code: string; name: string }
interface ModelRow { id: number; code: string; name: string; sam_minutes: number; source: string; process_name: string; category_name: string; template_code: string; process_id: number; category_id: number }
interface Bottleneck { model_code: string; bottleneck_operation: string | null; bottleneck_sec: number }

interface SamEntry { process_id: number; process_name: string; sam_minutes: number; source: string }

export default function WorkshopModelsWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}>
      <WorkshopModelsPage />
    </Suspense>
  )
}

function WorkshopModelsPage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [models, setModels] = useState<ModelRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [bottlenecks, setBottlenecks] = useState<Record<string, Bottleneck>>({})
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Yeni model formu
  const [form, setForm] = useState({ code: '', name: '', category_id: '', template_code: '' })
  const [samEntries, setSamEntries] = useState<SamEntry[]>([])

  // Darboğaz düzenleme
  const [editBnCode, setEditBnCode] = useState<string | null>(null)
  const [bnOp, setBnOp] = useState('')
  const [bnSec, setBnSec] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [mr, cr, pr, br] = await Promise.all([
      fetch('/api/pes/models').then(r => r.json()),
      fetch('/api/pes/categories').then(r => r.json()),
      fetch('/api/pes/processes').then(r => r.json()),
      fetch('/api/pes/bottleneck').then(r => r.json()),
    ])
    setModels(mr.models ?? [])
    setCategories(cr.categories ?? [])
    setProcesses(pr.processes ?? [])
    const bnMap: Record<string, Bottleneck> = {}
    for (const b of (br.bottlenecks ?? [])) bnMap[b.model_code] = b
    setBottlenecks(bnMap)
  }

  function initForm() {
    setShowForm(true)
    setSamEntries(processes.map(p => ({ process_id: p.id, process_name: `${p.code} — ${p.name}`, sam_minutes: 0, source: 'Pratik' })))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const activeSams = samEntries.filter(s => s.sam_minutes > 0)
    if (activeSams.length === 0) { setError('En az bir süreç için SAM girin'); return }
    setLoading(true); setError(''); setMessage('')

    for (const sam of activeSams) {
      await fetch('/api/pes/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: form.code, name: form.name, category_id: parseInt(form.category_id), template_code: form.template_code, process_id: sam.process_id, sam_minutes: sam.sam_minutes, source: sam.source }),
      })
    }
    setLoading(false); setMessage('Model kaydedildi'); setShowForm(false)
    setForm({ code: '', name: '', category_id: '', template_code: '' })
    loadData()
  }

  async function saveBn(code: string) {
    await fetch('/api/pes/bottleneck', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_code: code, bottleneck_operation: bnOp || null, bottleneck_sec: bnSec }),
    })
    setEditBnCode(null); loadData()
  }

  const grouped = models.reduce((acc, m) => {
    if (!acc[m.code]) acc[m.code] = { name: m.name, category_name: m.category_name, template_code: m.template_code, items: [] }
    acc[m.code].items.push(m)
    return acc
  }, {} as Record<string, { name: string; category_name: string; template_code: string; items: ModelRow[] }>)

  const totalFormSam = samEntries.reduce((s, e) => s + e.sam_minutes, 0)
  const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#197A56] focus:ring-1 focus:ring-[#197A56]'

  if (!wid) return <p>Atölye seçin</p>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/workshop?wid=${wid}`} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Model / SAM Kütüphanesi</h1>
        </div>
        <button onClick={() => showForm ? setShowForm(false) : initForm()} className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] text-sm font-medium">
          {showForm ? 'İptal' : '+ Yeni Model'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {/* Yeni Model Formu */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Model Bilgileri</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Model Kodu</label><input className={ic} value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} placeholder="PNT-BAGGY-01" required /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Model Adı</label><input className={ic} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Baggy Pantolon" required /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label><select className={ic} value={form.category_id} onChange={e => setForm(p => ({...p, category_id: e.target.value}))} required><option value="">Seçin</option>{categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Şablon</label><input className={ic} value={form.template_code} onChange={e => setForm(p => ({...p, template_code: e.target.value}))} placeholder="SABLON-PNT" required /></div>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 pt-2">Süreç Bazlı SAM (saniye)</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200"><th className="py-2 text-left text-gray-500">Süreç</th><th className="py-2 text-right text-gray-500 w-28">SAM (sn)</th><th className="py-2 text-center text-gray-500 w-24">Kaynak</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {samEntries.map((e, i) => (
                <tr key={i} className={e.sam_minutes > 0 ? 'bg-emerald-50' : ''}>
                  <td className="py-2 text-gray-700">{e.process_name}</td>
                  <td className="py-2 text-right"><input type="number" className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-right" value={e.sam_minutes || ''} onChange={ev => setSamEntries(p => p.map((s, j) => j === i ? {...s, sam_minutes: parseFloat(ev.target.value)||0} : s))} step={0.1} placeholder="0" /></td>
                  <td className="py-2 text-center"><select className="px-2 py-1 border border-gray-300 rounded text-sm" value={e.source} onChange={ev => setSamEntries(p => p.map((s, j) => j === i ? {...s, source: ev.target.value} : s))}><option value="Pratik">Pratik</option><option value="MTM">MTM</option></select></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-gray-300"><td className="py-2 font-semibold">Toplam</td><td className="py-2 text-right font-bold text-[#197A56]">{totalFormSam.toFixed(1)} sn ({(totalFormSam/60).toFixed(2)} dk)</td><td></td></tr></tfoot>
          </table>
          <button type="submit" disabled={loading} className="px-6 py-2.5 bg-[#197A56] text-white rounded-lg text-sm font-medium disabled:opacity-50">{loading ? 'Kaydediliyor...' : 'Modeli Kaydet'}</button>
        </form>
      )}

      {/* Model Listesi */}
      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([code, group]) => {
            const totalSam = group.items.reduce((s, m) => s + Number(m.sam_minutes), 0)
            const bn = bottlenecks[code]
            const maxDaily = bn ? Math.floor((9 * 3600) / Number(bn.bottleneck_sec)) : 0

            return (
              <div key={code} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[#197A56] font-bold text-lg">{code}</span>
                    <span className="text-gray-700 ml-2">{group.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{group.category_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Toplam SAM</span>
                    <span className="text-xl font-bold text-gray-900 ml-2">{totalSam.toFixed(1)} sn</span>
                    <span className="text-sm text-gray-400 ml-1">({(totalSam/60).toFixed(2)} dk)</span>
                  </div>
                </div>

                {/* Darboğaz — model bazlı */}
                {editBnCode === code ? (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] text-amber-600 mb-0.5">Darboğaz Operasyonu</label>
                      <input className="w-full px-2 py-1.5 border border-amber-300 rounded text-sm" value={bnOp} onChange={e => setBnOp(e.target.value)} placeholder="Açık Pat Takma" />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] text-amber-600 mb-0.5">Çevrim (sn)</label>
                      <input type="number" className="w-full px-2 py-1.5 border border-amber-300 rounded text-sm text-right" value={bnSec || ''} onChange={e => setBnSec(parseFloat(e.target.value)||0)} step={0.1} />
                    </div>
                    <div className="w-24 text-center pt-3">
                      <p className="text-lg font-bold text-amber-900">{bnSec > 0 ? Math.floor((9*3600)/bnSec).toLocaleString('tr-TR') : '—'}</p>
                      <p className="text-[10px] text-amber-600">adet/gün</p>
                    </div>
                    <div className="flex gap-1 pt-3">
                      <button onClick={() => saveBn(code)} className="text-xs px-3 py-1.5 bg-[#197A56] text-white rounded-lg">Kaydet</button>
                      <button onClick={() => setEditBnCode(null)} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg">İptal</button>
                    </div>
                  </div>
                ) : bn ? (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-amber-100" onClick={() => { setEditBnCode(code); setBnOp(bn.bottleneck_operation ?? ''); setBnSec(Number(bn.bottleneck_sec)) }}>
                    <div>
                      <span className="text-xs text-amber-600">Darboğaz: </span>
                      <span className="text-sm font-medium text-amber-800">{bn.bottleneck_operation ?? '—'} ({Number(bn.bottleneck_sec)} sn)</span>
                    </div>
                    <div>
                      <span className="text-xs text-amber-600">Maks Günlük: </span>
                      <span className="text-lg font-bold text-amber-900">{maxDaily.toLocaleString('tr-TR')} adet</span>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setEditBnCode(code); setBnOp(''); setBnSec(0) }} className="mb-3 w-full text-left bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-500 hover:bg-gray-100">
                    + Darboğaz bilgisi ekle
                  </button>
                )}

                {/* SAM Tablosu */}
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100"><th className="py-1.5 text-left text-gray-500 text-xs">Süreç</th><th className="py-1.5 text-right text-gray-500 text-xs">SAM (sn)</th><th className="py-1.5 text-center text-gray-500 text-xs">Kaynak</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.items.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="py-1.5 text-gray-600">{m.process_name}</td>
                        <td className="py-1.5 text-right font-medium text-gray-900">{Number(m.sam_minutes).toFixed(1)} sn</td>
                        <td className="py-1.5 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded ${m.source === 'MTM' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>{m.source}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Eder Maliyet merkez tarafına taşındı: /pes/eder-maliyet */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <Link
                    href={`/pes/eder-maliyet`}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Atölye Fiyatlama (Merkez) →
                  </Link>
                  <div className="text-xs text-gray-400">
                    konfeksiyon_v3 veri modeli
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600">Henüz model eklenmemiş</p>
          <p className="text-sm text-gray-400 mt-1">&quot;+ Yeni Model&quot; ile modellerinizin SAM verilerini girin</p>
        </div>
      )}
    </div>
  )
}
