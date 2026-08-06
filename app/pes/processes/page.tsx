'use client'

import { useState, useEffect } from 'react'
import { Badge, Button, DataTable, EmptyState, useToast, type Column } from '@/components/ui'

interface ProcessRow {
  id: number; code: string; name: string; group_type: string; description: string | null; sort_order: number
}

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

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

    const res = await fetch('/api/pes/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setLoading(false)
    if (res.ok) {
      toast.success('Süreç eklendi')
      setShowForm(false)
      setForm({ code: '', name: '', group_type: 'Her ikisi', description: '', sort_order: 0 })
      loadData()
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'İşlem başarısız')
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
      toast.success('Süreç güncellendi')
      loadData()
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" sürecini silmek istediğinize emin misiniz? Bağlı SAM kayıtları da silinir.`)) return
    const res = await fetch(`/api/pes/processes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Süreç silindi')
      loadData()
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'İşlem başarısız')
    }
  }

  /* Satır-içi düzenleme korundu: render fonksiyonları editingId ve
     editForm üzerine kapanıyor, düzenlenen satır input basıyor.
     DataTable'ın kendisi bunu bilmiyor — sadece hücreyi çiziyor. */
  const kolonlar: Column<ProcessRow>[] = [
    {
      key: 'sort_order', label: 'Sıra', numeric: true, width: '72px',
      render: p => editingId === p.id
        ? <input type="number" className={editInputClass} style={{ width: 48 }} value={editForm.sort_order}
            onChange={e => setEditForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
        : <span className="text-faint">{p.sort_order}</span>,
    },
    {
      key: 'code', label: 'Kod', width: '104px',
      render: p => editingId === p.id
        ? <input className={editInputClass} style={{ width: 72 }} value={editForm.code}
            onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} />
        : <span className="font-medium text-accent">{p.code}</span>,
    },
    {
      key: 'name', label: 'Ad',
      render: p => editingId === p.id
        ? <input className={editInputClass} style={{ width: 160 }} value={editForm.name}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
        : <span className="text-ink">{p.name}</span>,
    },
    {
      key: 'group_type', label: 'Grup', align: 'center', width: '120px',
      render: p => editingId === p.id
        ? <select className={editInputClass} value={editForm.group_type}
            onChange={e => setEditForm(f => ({ ...f, group_type: e.target.value }))}>
            <option value="Alt">Alt</option>
            <option value="Üst">Üst</option>
            <option value="Her ikisi">Her ikisi</option>
          </select>
        : <Badge>{p.group_type}</Badge>,
    },
    {
      key: 'description', label: 'Açıklama',
      render: p => editingId === p.id
        ? <input className={editInputClass} style={{ width: 240 }} value={editForm.description}
            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
        : <span className="text-muted">{p.description ?? '—'}</span>,
    },
    {
      key: 'actions', label: 'İşlem', align: 'right', sortable: false, width: '148px',
      render: p => editingId === p.id ? (
        <span className="flex justify-end gap-2 whitespace-nowrap">
          <button onClick={() => handleEdit(p.id)} disabled={loading}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-40">Kaydet</button>
          <button onClick={() => setEditingId(null)}
            className="text-xs text-faint hover:underline">İptal</button>
        </span>
      ) : (
        <span className="flex justify-end gap-2 whitespace-nowrap">
          <button onClick={() => startEdit(p)} className="text-xs text-accent hover:underline">Düzenle</button>
          <button onClick={() => handleDelete(p.id, p.name)} className="text-xs text-danger hover:underline">Sil</button>
        </span>
      ),
    },
  ]

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const editInputClass = 'px-2 py-1 border border-emerald-300 rounded text-sm focus:outline-none focus:border-accent bg-emerald-50'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Süreç Kataloğu</h1>
          <p className="text-faint mt-1">Ana süreç tanımları (HAZ, ONB, ARB, MON, UKP...)</p>
        </div>
        <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'İptal' : 'Yeni süreç'}
        </Button>
      </div>


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

      <DataTable
        columns={kolonlar}
        rows={processes}
        rowKey={p => p.id}
        initialSort={{ key: 'sort_order', dir: 'asc' }}
        empty={<EmptyState title="Süreç tanımı yok" description="Ana süreçleri ekleyerek başlayın (HAZ, ONB, ARB, MON, UKP…)." />}
        footer={<span className="num">{processes.length} süreç</span>}
      />
    </div>
  )
}
