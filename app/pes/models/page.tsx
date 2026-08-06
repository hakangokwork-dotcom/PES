'use client'

import { useState, useEffect } from 'react'

interface Category { id: number; code: string; name: string }
interface Process { id: number; code: string; name: string; sort_order: number }
interface ModelRow {
  id: number; code: string; name: string; sam_minutes: number
  source: string; category_name: string; process_name: string; process_code: string
  template_code: string; process_id: number; category_id: number
}

interface Bottleneck {
  model_code: string; bottleneck_operation: string | null; bottleneck_sec: number; net_hours: number
}

interface SamEntry { process_id: number; process_name: string; sam_minutes: number; source: string }

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [bottlenecks, setBottlenecks] = useState<Record<string, Bottleneck>>({})
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ sam_minutes: 0, source: 'Pratik' })
  const [groupEditData, setGroupEditData] = useState<Record<number, { sam_minutes: number; source: string }>>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Toplu giriş formu
  const [form, setForm] = useState({ code: '', name: '', category_id: '', template_code: '' })
  const [samEntries, setSamEntries] = useState<SamEntry[]>([])

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

  // Kategori seçilince ilgili süreçleri SAM giriş listesine ekle
  function initSamEntries() {
    setSamEntries(processes.map(p => ({
      process_id: p.id,
      process_name: `${p.code} — ${p.name}`,
      sam_minutes: 0,
      source: 'Pratik',
    })))
  }

  function updateSam(idx: number, field: string, value: number | string) {
    setSamEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const activeSams = samEntries.filter(s => s.sam_minutes > 0)
    if (activeSams.length === 0) {
      setError('En az bir süreç için SAM değeri girin')
      setLoading(false)
      return
    }

    let saved = 0
    for (const sam of activeSams) {
      const res = await fetch('/api/pes/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          category_id: parseInt(form.category_id),
          template_code: form.template_code,
          process_id: sam.process_id,
          sam_minutes: sam.sam_minutes,
          source: sam.source,
        }),
      })
      if (res.ok) saved++
      else {
        const d = await res.json()
        setError(d.error)
        break
      }
    }

    setLoading(false)
    if (saved > 0) {
      setMessage(`${saved} süreç için SAM kaydedildi`)
      setShowForm(false)
      setForm({ code: '', name: '', category_id: '', template_code: '' })
      setSamEntries([])
      loadData()
    }
  }

  function startEdit(m: ModelRow) {
    setEditingId(m.id)
    setEditForm({ sam_minutes: Number(m.sam_minutes), source: m.source })
  }

  async function handleEdit(id: number) {
    setLoading(true)
    const res = await fetch(`/api/pes/models/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setLoading(false)
    if (res.ok) {
      setEditingId(null)
      setMessage('SAM güncellendi')
      loadData()
    }
  }

  // Grup düzenleme: tüm süreçleri göster (mevcut + eksik)
  const [groupEditRows, setGroupEditRows] = useState<{ process_id: number; process_code: string; process_name: string; sam_minutes: number; source: string; model_id: number | null }[]>([])

  function startGroupEdit(code: string, items: ModelRow[]) {
    setEditingGroup(code)
    setEditingId(null)

    // Tüm süreçleri listele, mevcutları doldur
    const rows = processes.map(p => {
      const existing = items.find(m => m.process_id === p.id)
      return {
        process_id: p.id,
        process_code: p.code,
        process_name: p.name,
        sam_minutes: existing ? Number(existing.sam_minutes) : 0,
        source: existing ? existing.source : 'Pratik',
        model_id: existing ? existing.id : null,
      }
    })
    setGroupEditRows(rows)
  }

  function updateGroupRow(idx: number, field: string, value: number | string) {
    setGroupEditRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleGroupSave(code: string, group: { name: string; template_code: string; category_name: string; items: ModelRow[] }) {
    setLoading(true)
    const firstItem = group.items[0]

    for (const row of groupEditRows) {
      if (row.model_id && row.sam_minutes > 0) {
        await fetch(`/api/pes/models/${row.model_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sam_minutes: row.sam_minutes, source: row.source }),
        })
      } else if (row.model_id && row.sam_minutes === 0) {
        await fetch(`/api/pes/models/${row.model_id}`, { method: 'DELETE' })
      } else if (!row.model_id && row.sam_minutes > 0 && firstItem) {
        await fetch('/api/pes/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code, name: group.name,
            category_id: firstItem.category_id,
            template_code: group.template_code,
            process_id: row.process_id,
            sam_minutes: row.sam_minutes,
            source: row.source,
          }),
        })
      }
    }

    setLoading(false)
    setEditingGroup(null)
    setMessage('SAM değerleri güncellendi')
    loadData()
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`"${label}" SAM kaydını silmek istediğinize emin misiniz?`)) return
    await fetch(`/api/pes/models/${id}`, { method: 'DELETE' })
    setMessage('Kayıt silindi')
    loadData()
  }

  // Modelleri code bazında grupla
  const grouped = models.reduce((acc, m) => {
    if (!acc[m.code]) acc[m.code] = { name: m.name, template_code: m.template_code, category_name: m.category_name, items: [] }
    acc[m.code].items.push(m)
    return acc
  }, {} as Record<string, { name: string; template_code: string; category_name: string; items: ModelRow[] }>)

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const editInputClass = 'px-2 py-1 border border-emerald-300 rounded text-sm focus:outline-none focus:border-accent bg-emerald-50'

  const totalFormSamSec = samEntries.reduce((sum, e) => sum + e.sam_minutes, 0)
  const totalFormSamMin = totalFormSamSec / 60

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Model / SAM Kütüphanesi</h1>
          <p className="text-faint mt-1">Model bazlı standart süre (SAM) verileri</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (!showForm) initSamEntries() }} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium">
          {showForm ? 'İptal' : '+ Yeni Model'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {/* Yeni Model + Toplu SAM Girişi */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line-soft rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-ink">Model Bilgileri</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Model Kodu</label>
              <input className={inputClass} value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} placeholder="PNT-BAGGY-01" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Model Adı</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Baggy Pantolon" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kategori</label>
              <select className={inputClass} value={form.category_id} onChange={e => setForm(p => ({...p, category_id: e.target.value}))} required>
                <option value="">Seçin...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Şablon Kodu</label>
              <input className={inputClass} value={form.template_code} onChange={e => setForm(p => ({...p, template_code: e.target.value}))} placeholder="SABLON-PNT" required />
            </div>
          </div>

          <h2 className="text-lg font-semibold text-ink pt-2">Süreç Bazlı SAM Değerleri</h2>
          <p className="text-xs text-faint">SAM değeri 0 olan süreçler kaydedilmez. Sadece ilgili süreçlerin SAM'ını girin.</p>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="py-2 text-left text-faint font-medium">Süreç</th>
                <th className="py-2 text-right text-faint font-medium w-28">SAM (sn)</th>
                <th className="py-2 text-center text-faint font-medium w-24">Kaynak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {samEntries.map((entry, idx) => (
                <tr key={idx} className={entry.sam_minutes > 0 ? 'bg-emerald-50' : ''}>
                  <td className="py-2 text-body">{entry.process_name}</td>
                  <td className="py-2 text-right">
                    <input type="number" className="w-24 px-2 py-1.5 border border-line rounded text-sm text-right focus:outline-none focus:border-accent"
                      value={entry.sam_minutes || ''} onChange={e => updateSam(idx, 'sam_minutes', parseFloat(e.target.value) || 0)} step={0.1} min={0} placeholder="0" />
                  </td>
                  <td className="py-2 text-center">
                    <select className="px-2 py-1 border border-line rounded text-sm" value={entry.source} onChange={e => updateSam(idx, 'source', e.target.value)}>
                      <option value="Pratik">Pratik</option>
                      <option value="MTM">MTM</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line">
                <td className="py-2 font-semibold text-ink">Toplam SAM</td>
                <td className="py-2 text-right font-bold text-lg text-accent">{totalFormSamSec.toFixed(1)} sn <span className="text-sm text-faint font-normal">({totalFormSamMin.toFixed(2)} dk)</span></td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <button type="submit" disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Modeli Kaydet'}
          </button>
        </form>
      )}

      {/* Model Listesi */}
      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([code, group]) => {
            const totalSamSec = group.items.reduce((sum, m) => sum + Number(m.sam_minutes), 0)
            const totalSamMin = totalSamSec / 60
            return (
              <div key={code} className="bg-white border border-line-soft rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-accent font-bold text-lg">{code}</span>
                    <span className="text-body ml-2">{group.name}</span>
                    <span className="text-xs text-faint ml-2">{group.category_name} · {group.template_code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs text-faint">Toplam SAM</span>
                      <span className="text-xl font-bold text-ink ml-2">{totalSamSec.toFixed(1)} sn</span>
                      <span className="text-sm text-faint ml-1">({totalSamMin.toFixed(2)} dk)</span>
                    </div>
                    {editingGroup === code ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleGroupSave(code, group)} disabled={loading} className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover">
                          {loading ? '...' : 'Tümünü Kaydet'}
                        </button>
                        <button onClick={() => setEditingGroup(null)} className="text-xs px-3 py-1.5 border border-line text-muted rounded-lg hover:bg-canvas">İptal</button>
                      </div>
                    ) : (
                      <button onClick={() => startGroupEdit(code, group.items)} className="text-xs px-3 py-1.5 border border-line text-muted rounded-lg hover:bg-canvas">Düzenle</button>
                    )}
                  </div>
                </div>

                <BottleneckBar code={code} bn={bottlenecks[code]} onSave={loadData} />
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-soft">
                      <th className="py-1.5 text-left text-faint font-medium text-xs">Süreç</th>
                      <th className="py-1.5 text-right text-faint font-medium text-xs">SAM (sn)</th>
                      <th className="py-1.5 text-center text-faint font-medium text-xs">Kaynak</th>
                      <th className="py-1.5 text-center text-faint font-medium text-xs">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {editingGroup === code ? (
                      groupEditRows.map((row, idx) => {
                        const hasSam = row.sam_minutes > 0
                        return (
                          <tr key={row.process_id} className={hasSam ? 'bg-emerald-50' : ''}>
                            <td className="py-1.5 text-muted">
                              <span className="text-xs text-faint mr-1">{row.process_code}</span>
                              {row.process_name}
                            </td>
                            <td className="py-1.5 text-right">
                              <input type="number" className={editInputClass} style={{width: 70}}
                                value={row.sam_minutes || ''} onChange={e => updateGroupRow(idx, 'sam_minutes', parseFloat(e.target.value) || 0)} step={0.1} placeholder="0" />
                            </td>
                            <td className="py-1.5 text-center">
                              <select className={editInputClass} value={row.source} onChange={e => updateGroupRow(idx, 'source', e.target.value)}>
                                <option value="Pratik">Pratik</option>
                                <option value="MTM">MTM</option>
                              </select>
                            </td>
                            <td className="py-1.5 text-center text-xs text-faint">
                              {row.model_id ? 'mevcut' : hasSam ? 'yeni' : ''}
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      group.items.map(m => (
                        <tr key={m.id} className="hover:bg-canvas">
                          <td className="py-1.5 text-muted">{m.process_name}</td>
                          <td className="py-1.5 text-right font-medium text-ink">{Number(m.sam_minutes).toFixed(1)} sn</td>
                          <td className="py-1.5 text-center">
                            <span className={`text-[11px] px-1.5 py-0.5 rounded ${m.source === 'MTM' ? 'bg-canvas text-muted' : 'bg-canvas text-faint'}`}>{m.source}</span>
                          </td>
                          <td className="py-1.5 text-center">
                            <button onClick={() => handleDelete(m.id, `${code}/${m.process_name}`)} className="text-xs text-red-500 hover:underline">Sil</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-canvas border border-line-soft rounded-xl p-8 text-center">
          <p className="text-muted">Henüz SAM verisi eklenmemiş</p>
          <p className="text-sm text-faint mt-1">&quot;+ Yeni Model&quot; ile tüm süreçlerin SAM değerlerini tek seferde girin</p>
        </div>
      )}
    </div>
  )
}

// Model bazlı darboğaz bileşeni
function BottleneckBar({ code, bn, onSave }: { code: string; bn?: Bottleneck; onSave: () => void }) {
  const [editing, setEditing] = useState(false)
  const [operation, setOperation] = useState(bn?.bottleneck_operation ?? '')
  const [sec, setSec] = useState(bn?.bottleneck_sec ? Number(bn.bottleneck_sec) : 0)
  const [saving, setSaving] = useState(false)

  const maxDaily = sec > 0 ? Math.floor((9 * 3600) / sec) : 0

  async function save() {
    setSaving(true)
    await fetch('/api/pes/bottleneck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_code: code, bottleneck_operation: operation || null, bottleneck_sec: sec }),
    })
    setSaving(false)
    setEditing(false)
    onSave()
  }

  if (editing) {
    return (
      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[11px] text-amber-600 mb-0.5">Darboğaz Operasyonu</label>
            <input className="w-full px-2 py-1.5 border border-amber-300 rounded text-sm bg-white" value={operation} onChange={e => setOperation(e.target.value)} placeholder="Açık Pat Takma" />
          </div>
          <div className="w-28">
            <label className="block text-[11px] text-amber-600 mb-0.5">Çevrim Süresi (sn)</label>
            <input type="number" className="w-full px-2 py-1.5 border border-amber-300 rounded text-sm text-right bg-white" value={sec || ''} onChange={e => setSec(parseFloat(e.target.value) || 0)} step={0.1} />
          </div>
          <div className="w-28 text-center">
            <label className="block text-[11px] text-amber-600 mb-0.5">Maks Üretim</label>
            <p className="text-lg font-bold text-amber-900">{maxDaily > 0 ? maxDaily.toLocaleString('tr-TR') : '—'}</p>
          </div>
          <div className="flex gap-1 pt-3">
            <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg">Kaydet</button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 border border-line text-muted rounded-lg">İptal</button>
          </div>
        </div>
      </div>
    )
  }

  if (bn && Number(bn.bottleneck_sec) > 0) {
    const daily = Math.floor((9 * 3600) / Number(bn.bottleneck_sec))
    return (
      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors" onClick={() => { setOperation(bn.bottleneck_operation ?? ''); setSec(Number(bn.bottleneck_sec)); setEditing(true) }}>
        <div>
          <span className="text-xs text-amber-600">Darboğaz: </span>
          <span className="text-sm font-medium text-amber-800">{bn.bottleneck_operation ?? 'Belirtilmemiş'} ({Number(bn.bottleneck_sec)} sn)</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-amber-600">Maks Günlük Üretim: </span>
          <span className="text-lg font-bold text-amber-900">{daily.toLocaleString('tr-TR')} adet</span>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)} className="mb-3 w-full text-left bg-canvas border border-dashed border-line rounded-lg p-3 text-sm text-faint hover:bg-line-soft transition-colors">
      + Darboğaz bilgisi ekle (çevrim süresi → maks günlük üretim hesabı)
    </button>
  )
}
