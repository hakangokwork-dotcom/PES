'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const EXPENSE_FIELDS = [
  { key: 'personnel', label: 'Personel Gideri' },
  { key: 'sgk', label: 'SGK Giderleri' },
  { key: 'food', label: 'Yemek Gideri' },
  { key: 'electricity', label: 'Elektrik' },
  { key: 'water', label: 'Su' },
  { key: 'gas', label: 'Doğalgaz' },
  { key: 'transport', label: 'Servis Ödemesi' },
  { key: 'vehicle', label: 'Araç Yakıt/Bakım' },
  { key: 'cargo', label: 'Kargo/Nakliye' },
  { key: 'machine_maint', label: 'Makina Yedek Parça' },
  { key: 'thread', label: 'İplik Alımları' },
  { key: 'other', label: 'Diğer Giderler' },
]

interface Workshop { id: number; code: string; name: string; sewing_staff: number }

export default function CostsPage() {
  const router = useRouter()
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [workshopId, setWorkshopId] = useState('')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [workDays, setWorkDays] = useState(22)
  const [targetRevenue, setTargetRevenue] = useState(0)
  const [expenses, setExpenses] = useState<Record<string, number>>(
    Object.fromEntries(EXPENSE_FIELDS.map(f => [f.key, 0]))
  )
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
  }, [])

  // Mevcut veriyi yükle
  useEffect(() => {
    if (!workshopId) return
    fetch(`/api/pes/expenses?workshop_id=${workshopId}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.expense) {
          setWorkDays(d.expense.work_days)
          setTargetRevenue(d.expense.target_revenue)
          const newExp: Record<string, number> = {}
          for (const f of EXPENSE_FIELDS) {
            newExp[f.key] = d.expense[f.key] ?? 0
          }
          setExpenses(newExp)
        }
      })
  }, [workshopId, year, month])

  const total = Object.values(expenses).reduce((a, b) => a + b, 0)
  const selectedWorkshop = workshops.find(w => w.id === parseInt(workshopId))
  const costPerMin = selectedWorkshop && selectedWorkshop.sewing_staff > 0
    ? total / (selectedWorkshop.sewing_staff * workDays * 540)
    : 0

  async function handleSave() {
    if (!workshopId) return
    setLoading(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/pes/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workshop_id: parseInt(workshopId),
        year, month, work_days: workDays,
        ...expenses,
        target_revenue: targetRevenue,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error)
    } else {
      setMessage('Gider kaydedildi')
      router.refresh()
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#197A56] focus:ring-1 focus:ring-[#197A56] text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aylık Gider Girişi</h1>
        <p className="text-gray-500 mt-1">Atölye bazlı aylık gider kalemlerini girin</p>
      </div>

      {/* Seçim */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Atölye</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={workshopId} onChange={e => setWorkshopId(e.target.value)}>
              <option value="">Seçin...</option>
              {workshops.map(w => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yıl</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ay</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {workshopId && (
        <>
          {/* Gider Kalemleri */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Gider Kalemleri</h2>
              <div className="text-right">
                <p className="text-xs text-gray-500">Çalışma Günü</p>
                <input type="number" className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" value={workDays} onChange={e => setWorkDays(parseInt(e.target.value) || 22)} min={15} max={28} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {EXPENSE_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={expenses[f.key]}
                    onChange={e => setExpenses(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                    min={0}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hedef Ciro (TL)</label>
                  <input type="number" className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right" value={targetRevenue} onChange={e => setTargetRevenue(parseInt(e.target.value) || 0)} min={0} />
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Toplam Gider</p>
                  <p className="text-2xl font-bold text-gray-900">{total.toLocaleString('tr-TR')} TL</p>
                  {costPerMin > 0 && (
                    <p className="text-sm text-emerald-600 font-medium">{costPerMin.toFixed(2)} TL/dk</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Kaydet */}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
          {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor...' : 'Giderleri Kaydet'}
          </button>
        </>
      )}
    </div>
  )
}
