'use client'

import { useState, useEffect } from 'react'

interface ProcessRow {
  id: number; code: string; name: string; group_type: string; description: string | null; sort_order: number
}

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({ code: '', name: '', group_type: 'Her ikisi', description: '', sort_order: 0 })
  const [editForm, setEditForm] = useState({ code: '', name: '', group_type: 'Her ikisi', description: '', sort_order: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const r = await fetch('/api/pes/processes').then(r => r.json())
    setProcesses(r.processes ?? [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/pes/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setLoading(false)
    if (res.ok) {
      setMessage('Süreç eklendi')
      setShowForm(false)
      setForm({ code: '', name: '', group_type: 'Her ikisi', description: '', sort_order: 0 })
      loadData()
    } else {
      const d = await res.json()
      setError(d.error)
    }
  }

  function startEdit(p: ProcessRow) {
    setEditingId(p.id)
    setEditForm({ code: p.code, name: p.name, group_type: p.group_type, description: p.description ?? '', sort_order: p.sort_order })
  }

  async function handleEdit(id: number) {
    setLoading(true)
    const res = await fetch(`/api/pes/processes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setLoading(false)
    if (res.ok) {
      setEditingId(null)
      setMessage('Süreç güncellendi')
      loadData()
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" sürecini silmek istediğinize emin misiniz? Bağlı SAM kayıtları da silinir.`)) return
    const res = await fetch(`/api/pes/processes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage('Süreç silindi')
      loadData()
    } else {
      const d = await res.json()
      setError(d.error)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const editInputClass = 'px-2 py-1 border border-emerald-300 rounded text-sm focus:outline-none focus:border-accent bg-emerald-50'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Süreç Kataloğu</h1>
          <p className="text-faint mt-1">Ana süreç tanımları (HAZ, ONB, ARB, MON, UKP...)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
          {showForm ? 'İptal' : '+ Yeni Süreç'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line-soft rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kod</label>
              <input className={inputClass} value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} placeholder="HAZ" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Ad</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Hazırlık" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Grup</label>
              <select className={inputClass} value={form.group_type} onChange={e => setForm(p => ({...p, group_type: e.target.value}))}>
                <option value="Alt">Alt Grup</option>
                <option value="Üst">Üst Grup</option>
                <option value="Her ikisi">Her ikisi</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Sıra No</label>
              <input type="number" className={inputClass} value={form.sort_order} onChange={e => setForm(p => ({...p, sort_order: parseInt(e.target.value)||0}))} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Açıklama</label>
              <input className={inputClass} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Parça hazırlama, ara işlemler" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </form>
      )}

      <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line-soft">
              <th className="px-4 py-3 text-center text-faint font-medium w-12">Sıra</th>
              <th className="px-4 py-3 text-left text-faint font-medium">Kod</th>
              <th className="px-4 py-3 text-left text-faint font-medium">Ad</th>
              <th className="px-4 py-3 text-center text-faint font-medium">Grup</th>
              <th className="px-4 py-3 text-left text-faint font-medium">Açıklama</th>
              <th className="px-4 py-3 text-center text-faint font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {processes.map(p => (
              <tr key={p.id} className="hover:bg-canvas">
                {editingId === p.id ? (
                  <>
                    <td className="px-4 py-3 text-center">
                      <input type="number" className={editInputClass} style={{width:40}} value={editForm.sort_order} onChange={e => setEditForm(f => ({...f, sort_order: parseInt(e.target.value)||0}))} />
                    </td>
                    <td className="px-4 py-3">
                      <input className={editInputClass} style={{width:60}} value={editForm.code} onChange={e => setEditForm(f => ({...f, code: e.target.value}))} />
                    </td>
                    <td className="px-4 py-3">
                      <input className={editInputClass} style={{width:120}} value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select className={editInputClass} value={editForm.group_type} onChange={e => setEditForm(f => ({...f, group_type: e.target.value}))}>
                        <option value="Alt">Alt</option>
                        <option value="Üst">Üst</option>
                        <option value="Her ikisi">Her ikisi</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input className={editInputClass} style={{width:200}} value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} />
                    </td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => handleEdit(p.id)} disabled={loading} className="text-xs text-accent font-medium hover:underline">Kaydet</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-faint hover:underline">İptal</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-center text-faint">{p.sort_order}</td>
                    <td className="px-4 py-3 text-accent font-bold">{p.code}</td>
                    <td className="px-4 py-3 text-ink font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.group_type === 'Alt' ? 'bg-canvas text-muted' :
                        p.group_type === 'Üst' ? 'bg-canvas text-muted' :
                        'bg-gray-100 text-muted'
                      }`}>{p.group_type}</span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{p.description ?? '—'}</td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => startEdit(p)} className="text-xs text-accent hover:underline">Düzenle</button>
                      <button onClick={() => handleDelete(p.id, p.name)} className="text-xs text-red-500 hover:underline">Sil</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
