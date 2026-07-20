'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const MAIN_FIELDS = [
  { key: 'personnel', label: 'Personel Gideri' },
  { key: 'sgk', label: 'SGK Giderleri' },
  { key: 'food', label: 'Yemek Giderleri' },
  { key: 'electricity', label: 'Elektrik Gideri' },
  { key: 'water', label: 'Su Gideri' },
  { key: 'gas', label: 'Doğalgaz' },
  { key: 'transport', label: 'Servis Ödemesi' },
  { key: 'vehicle', label: 'Araç Yakıt ve Bakım' },
  { key: 'cargo', label: 'Kargo ve Nakliye' },
  { key: 'machine_maint', label: 'Makina Yedek Parça ve Bakım' },
  { key: 'thread', label: 'İplik Alımları' },
  { key: 'other', label: 'Diğer Giderler (toplam)' },
]

const OTHER_DETAILS = [
  'Vergiler', 'İSG', 'Görünmeyen Giderler', 'Mali Müşavir', 'Sigorta',
  'Avukatlık', 'Ticaret Odası', 'Kırtasiye', 'Eczane', 'Telefon', 'Noter',
]

interface Workshop { id: number; code: string; name: string; type: string; sewing_staff: number; ukp_staff: number; cutting_staff: number; total_staff: number; daily_target: number; net_hours_day: number }

export default function WorkshopCostsWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}>
      <WorkshopCostsPage />
    </Suspense>
  )
}

interface DkMaliyetRef { bolge: number; dk_maliyet_tl: number }

function WorkshopCostsPage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [w, setW] = useState<Workshop | null>(null)
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [workDays, setWorkDays] = useState(22)
  const [targetRevenue, setTargetRevenue] = useState(0)
  const [expenses, setExpenses] = useState<Record<string, number>>(Object.fromEntries(MAIN_FIELDS.map(f => [f.key, 0])))
  const [otherDetails, setOtherDetails] = useState<Record<string, number>>(Object.fromEntries(OTHER_DETAILS.map(d => [d, 0])))
  const [showOtherDetails, setShowOtherDetails] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sektorDkMaliyetler, setSektorDkMaliyetler] = useState<DkMaliyetRef[]>([])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setW(d.workshop))
  }, [wid])

  // Sektör referans DK maliyet verisi
  useEffect(() => {
    const donem = `${year}-${String(month).padStart(2, '0')}`
    fetch(`/api/pes/eder/dk-maliyet?donem=${donem}`)
      .then(r => r.ok ? r.json() : { maliyetler: [] })
      .then(d => setSektorDkMaliyetler(d.maliyetler ?? []))
      .catch(() => setSektorDkMaliyetler([]))
  }, [year, month])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/expenses?workshop_id=${wid}&year=${year}&month=${month}`)
      .then(r => r.json()).then(d => {
        if (d.expense) {
          setWorkDays(Number(d.expense.work_days) || 22)
          setTargetRevenue(Number(d.expense.target_revenue) || 0)
          const e: Record<string, number> = {}
          for (const f of MAIN_FIELDS) e[f.key] = Number(d.expense[f.key]) || 0
          setExpenses(e)
        }
      })
  }, [wid, year, month])

  // Diğer giderler alt toplamı
  const otherTotal = Object.values(otherDetails).reduce((a, b) => a + b, 0)

  // Ana hesaplamalar
  const total = Object.values(expenses).reduce((a, b) => a + b, 0)
  const dailyExpense = workDays > 0 ? Math.round(total / workDays) : 0
  const perPersonExpense = w && w.total_staff > 0 ? Math.round(total / w.total_staff) : 0

  // Atölye tipine göre verimli operatör sayısı
  const productiveStaff = w ? (
    w.type === 'CMT' ? w.sewing_staff + w.cutting_staff + w.ukp_staff :
    w.type === 'CM' ? w.sewing_staff + w.cutting_staff :
    w.type === 'MT' ? w.sewing_staff + w.ukp_staff :
    w.sewing_staff
  ) : 0

  // Maliyet hesapları
  const totalCapacityMin = productiveStaff * workDays * (w?.net_hours_day ?? 9) * 60
  const costPerMin = totalCapacityMin > 0 ? (total / totalCapacityMin) : 0
  const personnelPct = total > 0 ? ((expenses.personnel + expenses.sgk) / total * 100) : 0

  // Hedef ciro analizi
  const dailyRevenue = workDays > 0 && targetRevenue > 0 ? Math.round(targetRevenue / workDays) : 0
  const netMargin = targetRevenue - total
  const marginPct = targetRevenue > 0 ? (netMargin / targetRevenue * 100) : 0
  const dailyTarget = w?.daily_target ?? 0
  const costPerPiece = dailyTarget > 0 && workDays > 0 ? Math.round(total / (dailyTarget * workDays)) : 0
  const revenuePerPiece = dailyTarget > 0 && workDays > 0 && targetRevenue > 0 ? Math.round(targetRevenue / (dailyTarget * workDays)) : 0

  async function handleSave() {
    if (!wid) return
    setLoading(true); setError(''); setMessage('')
    const res = await fetch('/api/pes/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: parseInt(wid), year, month, work_days: workDays, ...expenses, target_revenue: targetRevenue }),
    })
    setLoading(false)
    if (res.ok) setMessage('Gider kaydedildi')
    else { const d = await res.json(); setError(d.error) }
  }

  if (!wid) return <p>Atölye seçin</p>
  const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#197A56] focus:ring-1 focus:ring-[#197A56] text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{w?.name ?? ''} — Maliyet Yönetimi</h1>
      </div>

      {/* Dönem seçimi */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4 items-end">
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Yıl</label><select className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}><option value={2025}>2025</option><option value={2026}>2026</option></select></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Ay</label><select className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Çalışma Günü</label><input type="number" className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center" value={workDays} onChange={e => setWorkDays(parseInt(e.target.value)||22)} /></div>
      </div>

      {/* Ana Gider Kalemleri */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Gider Kalemleri</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {MAIN_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <input type="number" className={ic} value={expenses[f.key]} onChange={e => setExpenses(p => ({...p, [f.key]: parseInt(e.target.value)||0}))} />
            </div>
          ))}
        </div>

        {/* Diğer Giderler Alt Kalemleri */}
        <div className="mt-4">
          <button onClick={() => setShowOtherDetails(!showOtherDetails)} className="text-xs text-blue-600 hover:underline">
            {showOtherDetails ? '▾ Diğer gider detaylarını gizle' : '▸ Diğer giderlerin alt kalemlerini göster'}
          </button>
          {showOtherDetails && (
            <div className="mt-3 bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">&quot;Diğer Giderler&quot; kaleminin alt dağılımı (bilgi amaçlı)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {OTHER_DETAILS.map(d => (
                  <div key={d}>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{d}</label>
                    <input type="number" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right" value={otherDetails[d]} onChange={e => setOtherDetails(p => ({...p, [d]: parseInt(e.target.value)||0}))} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Alt kalem toplamı: {otherTotal.toLocaleString('tr-TR')} TL</p>
            </div>
          )}
        </div>
      </div>

      {/* Hedef Ciro */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hedef Ciro</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aylık Hedef Ciro (TL)</label>
            <input type="number" className={ic} value={targetRevenue} onChange={e => setTargetRevenue(parseInt(e.target.value)||0)} />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Günlük Hedef Kazanç</p>
            <p className="text-lg font-bold text-gray-900">{dailyRevenue > 0 ? dailyRevenue.toLocaleString('tr-TR') : '—'} TL</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Günlük Toplam Gider</p>
            <p className="text-lg font-bold text-gray-900">{dailyExpense.toLocaleString('tr-TR')} TL</p>
          </div>
        </div>
      </div>

      {/* Hesaplanan Metrikler */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hesaplanan Metrikler</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500">Toplam Gider</p>
            <p className="text-xl font-bold text-gray-900">{(total / 1000000).toFixed(2)}M TL</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4 text-center">
            <p className="text-xs text-emerald-600">Dakika Başı Maliyet</p>
            <p className="text-xl font-bold text-[#197A56]">{costPerMin.toFixed(2)} TL/dk</p>
            <p className="text-[10px] text-emerald-400">{productiveStaff} op × {workDays} gün × {((w?.net_hours_day ?? 9) * 60).toFixed(0)} dk</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-blue-600">Kişi Başı Aylık Gider</p>
            <p className="text-xl font-bold text-blue-700">{perPersonExpense.toLocaleString('tr-TR')} TL</p>
          </div>
          <div className={`rounded-lg p-4 text-center ${netMargin >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500">Net Marj</p>
            <p className={`text-xl font-bold ${netMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {targetRevenue > 0 ? `%${marginPct.toFixed(1)}` : '—'}
            </p>
            {targetRevenue > 0 && <p className="text-[10px] text-gray-400">{(netMargin / 1000).toFixed(0)}K TL</p>}
          </div>
        </div>

        {/* Gerçek vs Sektör Referans TL/dk Karşılaştırma */}
        {costPerMin > 0 && sektorDkMaliyetler.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Gerçek Maliyet vs Sektör Referans (TL/dk)</h3>
            <div className="grid grid-cols-7 gap-2">
              <div className="bg-emerald-100 border-2 border-emerald-500 rounded-lg p-3 text-center">
                <p className="text-[10px] font-semibold text-emerald-700">GERÇEK</p>
                <p className="text-xl font-bold text-emerald-800">{costPerMin.toFixed(2)}</p>
                <p className="text-[9px] text-emerald-600">TL/dk</p>
              </div>
              {[1, 2, 3, 4, 5, 6].map(bolge => {
                const ref = sektorDkMaliyetler.find(d => d.bolge === bolge)
                const refVal = ref ? Number(ref.dk_maliyet_tl) : 0
                const diff = refVal > 0 ? costPerMin - refVal : 0
                const diffPct = refVal > 0 ? (diff / refVal) * 100 : 0
                const isLower = diff < 0
                return (
                  <div key={bolge} className={`rounded-lg p-3 text-center border ${isLower ? 'bg-green-50 border-green-200' : diff === 0 ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-[10px] text-gray-500">{bolge}. Bölge</p>
                    <p className="text-lg font-bold text-gray-800">{refVal > 0 ? refVal.toFixed(2) : '—'}</p>
                    {refVal > 0 && (
                      <p className={`text-[10px] font-medium ${isLower ? 'text-green-600' : 'text-red-600'}`}>
                        {diff > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Sektör referansı bölgesel DK maliyet tablosundan alınmaktadır. Yeşil = sizin maliyetiniz sektörden düşük.
            </p>
          </div>
        )}

        {/* Adet Bazlı Analiz */}
        {dailyTarget > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Adet Bazlı Analiz ({dailyTarget.toLocaleString('tr-TR')} adet/gün hedefle)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-600">Adet Başı Gider</p>
                <p className="text-lg font-bold text-amber-700">{costPerPiece.toLocaleString('tr-TR')} TL</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600">Adet Başı Ciro</p>
                <p className="text-lg font-bold text-blue-700">{revenuePerPiece > 0 ? revenuePerPiece.toLocaleString('tr-TR') : '—'} TL</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${revenuePerPiece > costPerPiece ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-xs text-gray-500">Adet Kârı</p>
                <p className={`text-lg font-bold ${revenuePerPiece > costPerPiece ? 'text-green-600' : 'text-red-600'}`}>
                  {revenuePerPiece > 0 ? (revenuePerPiece - costPerPiece).toLocaleString('tr-TR') : '—'} TL
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Aylık Üretim Hedefi</p>
                <p className="text-lg font-bold text-gray-700">{(dailyTarget * workDays).toLocaleString('tr-TR')} adet</p>
              </div>
            </div>
          </div>
        )}

        {/* Gider Dağılımı */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Gider Dağılımı</h3>
          <div className="space-y-2">
            {MAIN_FIELDS.filter(f => expenses[f.key] > 0).sort((a, b) => expenses[b.key] - expenses[a.key]).map(f => {
              const pct = total > 0 ? (expenses[f.key] / total * 100) : 0
              return (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-36 text-right">{f.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div className="h-3 rounded-full bg-[#197A56]" style={{ width: `${pct}%`, opacity: 0.4 + (pct / 100) * 0.6 }}></div>
                  </div>
                  <span className="text-xs text-gray-700 w-20 text-right">{(expenses[f.key] / 1000).toFixed(0)}K</span>
                  <span className="text-xs text-gray-400 w-12 text-right">%{pct.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-amber-600 mt-2">Personel + SGK: %{personnelPct.toFixed(1)}</p>
        </div>

        {/* Atölye Tipine Göre Kapsam */}
        {w && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Maliyet Kapsamı (Tip {w.type})</h3>
            <p className="text-xs text-gray-500">
              {w.type === 'CMT' && `Dikim (${w.sewing_staff}) + Kesim (${w.cutting_staff}) + UKP (${w.ukp_staff}) = ${productiveStaff} verimli operatör`}
              {w.type === 'CM' && `Dikim (${w.sewing_staff}) + Kesim (${w.cutting_staff}) = ${productiveStaff} verimli operatör`}
              {w.type === 'MT' && `Dikim (${w.sewing_staff}) + UKP (${w.ukp_staff}) = ${productiveStaff} verimli operatör`}
              {w.type === 'M' && `Yalnızca Dikim: ${productiveStaff} operatör`}
            </p>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] text-sm font-medium disabled:opacity-50">
        {loading ? 'Kaydediliyor...' : 'Giderleri Kaydet'}
      </button>
    </div>
  )
}
