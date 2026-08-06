'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Workshop } from '@/types/pes'

interface Props {
  workshop?: Workshop
}

export default function WorkshopForm({ workshop }: Props) {
  const router = useRouter()
  const isEdit = !!workshop

  const [form, setForm] = useState({
    code: workshop?.code ?? '',
    name: workshop?.name ?? '',
    city: workshop?.city ?? '',
    district: workshop?.district ?? '',
    type: workshop?.type ?? 'CMT',
    total_staff: workshop?.total_staff ?? 0,
    sewing_staff: workshop?.sewing_staff ?? 0,
    ukp_staff: workshop?.ukp_staff ?? 0,
    cutting_staff: workshop?.cutting_staff ?? 0,
    management: workshop?.management ?? 0,
    indirect: workshop?.indirect ?? 0,
    line_count: workshop?.line_count ?? 1,
    daily_target: workshop?.daily_target ?? 0,
    net_hours_day: workshop?.net_hours_day ?? 9,
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(key: string, value: string | number) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateNumber(key: string, raw: string) {
    const val = raw === '' ? 0 : parseInt(raw)
    if (!isNaN(val)) updateField(key, val)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const url = isEdit ? `/api/pes/workshops/${workshop.id}` : '/api/pes/workshops'
    const method = isEdit ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Bir hata oluştu')
        setLoading(false)
        return
      }

      router.push(`/pes/workshops/${data.workshop.id}`)
      router.refresh()
    } catch {
      setError('Sunucu hatası')
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const labelClass = 'block text-sm font-medium text-body mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Temel Bilgiler */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Temel Bilgiler</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Atölye Kodu *</label>
            <input className={inputClass} value={form.code} onChange={e => updateField('code', e.target.value)} placeholder="ATL-0042" required disabled={isEdit} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Atölye Adı *</label>
            <input className={inputClass} value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Tuba Tekstil" required />
          </div>
          <div>
            <label className={labelClass}>Şehir</label>
            <input className={inputClass} value={form.city} onChange={e => updateField('city', e.target.value)} placeholder="İstanbul" />
          </div>
          <div>
            <label className={labelClass}>İlçe</label>
            <input className={inputClass} value={form.district} onChange={e => updateField('district', e.target.value)} placeholder="Bağcılar" />
          </div>
          <div>
            <label className={labelClass}>Tip *</label>
            <select className={inputClass} value={form.type} onChange={e => updateField('type', e.target.value)}>
              <option value="CMT">CMT — Kesim + Dikim + UKP</option>
              <option value="CM">CM — Kesim + Dikim</option>
              <option value="MT">MT — Dikim + UKP</option>
              <option value="M">M — Sadece Dikim</option>
            </select>
          </div>
        </div>
      </div>

      {/* Çalışan Bilgileri */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Çalışan Profili</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Dikim Operatörü</label>
            <input type="number" className={inputClass} value={form.sewing_staff} onChange={e => updateNumber('sewing_staff', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>UKP Operatörü</label>
            <input type="number" className={inputClass} value={form.ukp_staff} onChange={e => updateNumber('ukp_staff', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>Kesim Operatörü</label>
            <input type="number" className={inputClass} value={form.cutting_staff} onChange={e => updateNumber('cutting_staff', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>Yönetim</label>
            <input type="number" className={inputClass} value={form.management} onChange={e => updateNumber('management', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>Endirekt</label>
            <input type="number" className={inputClass} value={form.indirect} onChange={e => updateNumber('indirect', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>Toplam Çalışan</label>
            <input type="number" className={inputClass} value={form.total_staff} onChange={e => updateNumber('total_staff', e.target.value)} min={0} />
          </div>
        </div>
      </div>

      {/* Üretim Bilgileri */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Üretim Bilgileri</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Bant Sayısı</label>
            <input type="number" className={inputClass} value={form.line_count} onChange={e => updateNumber('line_count', e.target.value)} min={1} max={10} />
          </div>
          <div>
            <label className={labelClass}>Günlük Hedef (adet)</label>
            <input type="number" className={inputClass} value={form.daily_target} onChange={e => updateNumber('daily_target', e.target.value)} min={0} />
          </div>
          <div>
            <label className={labelClass}>Net Çalışma (saat/gün)</label>
            <input type="number" className={inputClass} value={form.net_hours_day} onChange={e => updateField('net_hours_day', parseFloat(e.target.value) || 9)} min={1} max={24} step={0.5} />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Kaydediliyor...' : isEdit ? 'Güncelle' : 'Atölye Oluştur'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 border border-line text-body rounded-lg hover:bg-canvas transition-colors text-sm"
        >
          İptal
        </button>
      </div>
    </form>
  )
}
