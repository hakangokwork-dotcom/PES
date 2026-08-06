'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Workshop, ProductionLine } from '@/types/pes'

interface Props {
  workshop: Workshop
  lines: ProductionLine[]
}

export default function LineManager({ workshop, lines }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    code: `${workshop.code}-B${lines.length + 1}`,
    name: `Bant ${lines.length + 1}`,
    line_type: 'Normal' as 'Normal' | 'Küçük',
    operator_count: 0,
    daily_target: 0,
    max_cycle_sec: '' as string | number,
  })

  const [editForm, setEditForm] = useState({
    name: '',
    line_type: 'Normal' as 'Normal' | 'Küçük',
    operator_count: 0,
    daily_target: 0,
    max_cycle_sec: '' as string | number,
  })

  function startEdit(line: ProductionLine) {
    setEditingId(line.id)
    setEditForm({
      name: line.name,
      line_type: line.line_type,
      operator_count: line.operator_count,
      daily_target: line.daily_target,
      max_cycle_sec: line.max_cycle_sec ?? '',
    })
  }

  async function handleEdit(lineId: number) {
    setLoading(true)
    const res = await fetch(`/api/pes/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        max_cycle_sec: editForm.max_cycle_sec === '' ? null : Number(editForm.max_cycle_sec),
      }),
    })
    setLoading(false)
    if (res.ok) {
      setEditingId(null)
      router.refresh()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Güncelleme başarısız')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/pes/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          workshop_id: workshop.id,
          max_cycle_sec: form.max_cycle_sec === '' ? null : Number(form.max_cycle_sec),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Hata oluştu')
        setLoading(false)
        return
      }

      setShowForm(false)
      setForm({
        code: `${workshop.code}-B${lines.length + 2}`,
        name: `Bant ${lines.length + 2}`,
        line_type: 'Normal',
        operator_count: 0,
        daily_target: 0,
        max_cycle_sec: '',
      })
      setLoading(false)
      router.refresh()
    } catch {
      setError('Sunucu hatası')
      setLoading(false)
    }
  }

  async function handleDelete(line: ProductionLine) {
    if (!confirm(`${line.code} bantını silmek istediğinize emin misiniz?`)) return
    await fetch(`/api/pes/lines/${line.id}`, { method: 'DELETE' })
    router.refresh()
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const editInputClass = 'px-2 py-1 border border-emerald-300 rounded text-sm focus:outline-none focus:border-accent bg-emerald-50'

  return (
    <div className="bg-white border border-line-soft rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink">Bantlar ({lines.length})</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          {showForm ? 'İptal' : '+ Bant Ekle'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg mb-4">{error}</div>
      )}

      {lines.length > 0 ? (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-line-soft">
              <th className="py-2 text-left text-faint font-medium">Kod</th>
              <th className="py-2 text-left text-faint font-medium">Ad</th>
              <th className="py-2 text-left text-faint font-medium">Tip</th>
              <th className="py-2 text-right text-faint font-medium">Operatör</th>
              <th className="py-2 text-right text-faint font-medium">Hedef</th>
              <th className="py-2 text-right text-faint font-medium">Çevrim (sn)</th>
              <th className="py-2 text-center text-faint font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-canvas">
                {editingId === line.id ? (
                  <>
                    <td className="py-2 text-accent font-medium">{line.code}</td>
                    <td className="py-2"><input className={editInputClass} style={{width:100}} value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))} /></td>
                    <td className="py-2">
                      <select className={editInputClass} value={editForm.line_type} onChange={e => setEditForm(p => ({...p, line_type: e.target.value as 'Normal'|'Küçük'}))}>
                        <option value="Normal">Normal</option>
                        <option value="Küçük">Küçük</option>
                      </select>
                    </td>
                    <td className="py-2"><input type="number" className={editInputClass} style={{width:60}} value={editForm.operator_count} onChange={e => setEditForm(p => ({...p, operator_count: parseInt(e.target.value)||0}))} /></td>
                    <td className="py-2"><input type="number" className={editInputClass} style={{width:70}} value={editForm.daily_target} onChange={e => setEditForm(p => ({...p, daily_target: parseInt(e.target.value)||0}))} /></td>
                    <td className="py-2"><input type="number" className={editInputClass} style={{width:60}} value={editForm.max_cycle_sec} onChange={e => setEditForm(p => ({...p, max_cycle_sec: e.target.value}))} step={0.01} /></td>
                    <td className="py-2 text-center space-x-2">
                      <button onClick={() => handleEdit(line.id)} disabled={loading} className="text-xs text-accent font-medium hover:underline">Kaydet</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-faint hover:underline">İptal</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 text-accent font-medium">{line.code}</td>
                    <td className="py-2 text-ink">{line.name}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${line.line_type === 'Küçük' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-muted'}`}>
                        {line.line_type}
                      </span>
                    </td>
                    <td className="py-2 text-right text-ink">{line.operator_count}</td>
                    <td className="py-2 text-right text-ink">{line.daily_target.toLocaleString('tr-TR')}</td>
                    <td className="py-2 text-right text-muted">{line.max_cycle_sec ?? '—'}</td>
                    <td className="py-2 text-center space-x-2">
                      <button onClick={() => startEdit(line)} className="text-xs text-accent hover:underline">Düzenle</button>
                      <button onClick={() => handleDelete(line)} className="text-xs text-red-500 hover:underline">Sil</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-faint mb-4">Henüz bant eklenmemiş</p>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="border-t border-line-soft pt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kod</label>
              <input className={inputClass} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Ad</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Tip</label>
              <select className={inputClass} value={form.line_type} onChange={e => setForm(p => ({ ...p, line_type: e.target.value as 'Normal' | 'Küçük' }))}>
                <option value="Normal">Normal</option>
                <option value="Küçük">Küçük</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Operatör Sayısı</label>
              <input type="number" className={inputClass} value={form.operator_count} onChange={e => setForm(p => ({ ...p, operator_count: parseInt(e.target.value) || 0 }))} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Günlük Hedef</label>
              <input type="number" className={inputClass} value={form.daily_target} onChange={e => setForm(p => ({ ...p, daily_target: parseInt(e.target.value) || 0 }))} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Max Çevrim (sn)</label>
              <input type="number" className={inputClass} value={form.max_cycle_sec} onChange={e => setForm(p => ({ ...p, max_cycle_sec: e.target.value }))} min={0} step={0.01} placeholder="28" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50">
            {loading ? 'Ekleniyor...' : 'Bant Ekle'}
          </button>
        </form>
      )}
    </div>
  )
}
