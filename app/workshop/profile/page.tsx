'use client'

import React, { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Workshop {
  id: number; code: string; name: string; city: string; district: string; type: string
  total_staff: number; sewing_staff: number; ukp_staff: number; cutting_staff: number
  management: number; indirect: number; line_count: number; daily_target: number; net_hours_day: number
  bolge: number
}

interface Line {
  id: number; code: string; name: string; line_type: string; operator_count: number; daily_target: number; max_cycle_sec: number | null
}

const LINE_TYPES = [
  { value: 'Dikim', label: 'Dikim', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'Kesim', label: 'Kesim', color: 'bg-blue-100 text-blue-700' },
  { value: 'UKP', label: 'UKP', color: 'bg-amber-100 text-amber-700' },
  { value: 'Yikama', label: 'Yıkama', color: 'bg-purple-100 text-purple-700' },
]

function getLineTypeColor(lt: string) {
  return LINE_TYPES.find(t => t.value === lt)?.color ?? 'bg-gray-100 text-muted'
}

export default function ProfileWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><WorkshopProfilePage /></Suspense>
}

function WorkshopProfilePage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [w, setW] = useState<Workshop | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Bant ekleme
  const [showLineForm, setShowLineForm] = useState(false)
  const [lineForm, setLineForm] = useState({ code: '', name: '', line_type: 'Dikim', operator_count: 0, daily_target: 0, max_cycle_sec: '' as string | number })

  // Bant düzenleme
  const [editLineId, setEditLineId] = useState<number | null>(null)
  const [editLine, setEditLine] = useState({ name: '', line_type: 'Dikim', operator_count: 0, daily_target: 0, max_cycle_sec: '' as string | number })

  // Bant yetenek profili
  const [capLineId, setCapLineId] = useState<number | null>(null)
  const [capDimensions, setCapDimensions] = useState<{code: string; label: string; applies_to: string | null; values: {code: string; label: string}[]}[]>([])
  const [capSelected, setCapSelected] = useState<Set<string>>(new Set())
  const [capSaving, setCapSaving] = useState(false)
  const [capSummaries, setCapSummaries] = useState<Record<number, string>>({})

  const capKlasmans = Array.from(capSelected).filter(s => s.startsWith('klasman:')).map(s => s.split(':')[1])

  // Bantlardan otomatik hesaplanan değerler
  // Eski "Normal"/"Küçük" tiplerini "Dikim" olarak kabul et
  function effectiveType(lt: string) {
    if (['Dikim','Kesim','UKP','Yikama'].includes(lt)) return lt
    return 'Dikim' // Normal, Küçük → Dikim
  }

  const staffFromLines = useMemo(() => {
    const dikimOp = lines.filter(l => effectiveType(l.line_type) === 'Dikim').reduce((s, l) => s + l.operator_count, 0)
    const kesimOp = lines.filter(l => effectiveType(l.line_type) === 'Kesim').reduce((s, l) => s + l.operator_count, 0)
    const ukpOp = lines.filter(l => effectiveType(l.line_type) === 'UKP').reduce((s, l) => s + l.operator_count, 0)
    const yikamaOp = lines.filter(l => effectiveType(l.line_type) === 'Yikama').reduce((s, l) => s + l.operator_count, 0)
    const totalHedef = lines.filter(l => effectiveType(l.line_type) === 'Dikim').reduce((s, l) => s + l.daily_target, 0)
    return { dikimOp, kesimOp, ukpOp, yikamaOp, totalHedef, bantSayisi: lines.length }
  }, [lines])

  useEffect(() => {
    if (!wid) return
    loadData()
  }, [wid])

  // Bantlar değiştiğinde profili güncelle
  useEffect(() => {
    if (!w || lines.length === 0) return
    const mgmt = w.management + w.indirect
    const productive = staffFromLines.dikimOp + staffFromLines.kesimOp + staffFromLines.ukpOp + staffFromLines.yikamaOp
    setW(prev => prev ? {
      ...prev,
      sewing_staff: staffFromLines.dikimOp,
      cutting_staff: staffFromLines.kesimOp,
      ukp_staff: staffFromLines.ukpOp,
      total_staff: productive + mgmt,
      line_count: staffFromLines.bantSayisi,
      daily_target: staffFromLines.totalHedef,
    } : prev)
  }, [staffFromLines])

  async function loadData() {
    const wr = await fetch(`/api/pes/workshops/${wid}`).then(r => r.json())
    setW(wr.workshop)
    const lr = await fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json())
    setLines(lr.lines ?? [])
    setLineForm(p => ({ ...p, code: `${wr.workshop?.code}-B${(lr.lines?.length ?? 0) + 1}`, name: `Bant ${(lr.lines?.length ?? 0) + 1}` }))

    try {
      const dr = await fetch('/api/pes/capabilities?action=dimensions').then(r => r.json())
      setCapDimensions(dr.dimensions ?? [])
    } catch { /* */ }

    const sums: Record<number, string> = {}
    for (const l of (lr.lines ?? [])) {
      try {
        const sr = await fetch(`/api/pes/capabilities?action=summary&line_id=${l.id}`).then(r => r.json())
        const parts = (sr.summary ?? []).map((s: {boyut: string; degerler: string}) => `${s.boyut}: ${s.degerler}`)
        sums[l.id as number] = parts.join(' | ')
      } catch { /* */ }
    }
    setCapSummaries(sums)
  }

  function updateW(key: string, value: string | number) {
    if (!w) return
    setW({ ...w, [key]: value } as Workshop)
  }

  async function saveAll() {
    if (!w) return
    setLoading(true); setError(''); setMessage('')

    // Önce tüm bantları kaydet (düzenlenen varsa)
    // Sonra profili kaydet
    const mgmt = w.management + w.indirect
    const productive = staffFromLines.dikimOp + staffFromLines.kesimOp + staffFromLines.ukpOp + staffFromLines.yikamaOp

    const res = await fetch(`/api/pes/workshops/${w.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: w.name, city: w.city, district: w.district, type: w.type, bolge: w.bolge,
        total_staff: productive + mgmt,
        sewing_staff: staffFromLines.dikimOp,
        ukp_staff: staffFromLines.ukpOp,
        cutting_staff: staffFromLines.kesimOp,
        management: w.management, indirect: w.indirect,
        line_count: staffFromLines.bantSayisi,
        daily_target: staffFromLines.totalHedef,
        net_hours_day: w.net_hours_day,
      }),
    })
    setLoading(false)
    if (res.ok) setMessage('Profil kaydedildi')
    else setError('Kayıt başarısız')
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/pes/lines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lineForm, workshop_id: parseInt(wid!), max_cycle_sec: lineForm.max_cycle_sec === '' ? null : Number(lineForm.max_cycle_sec) }),
    })
    if (res.ok) { setShowLineForm(false); loadData() }
  }

  async function saveLine(id: number) {
    await fetch(`/api/pes/lines/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editLine, max_cycle_sec: editLine.max_cycle_sec === '' ? null : Number(editLine.max_cycle_sec) }),
    })
    setEditLineId(null)
    await loadData()
  }

  async function openCapabilities(lineId: number) {
    if (capLineId === lineId) { setCapLineId(null); return }
    setCapLineId(lineId)
    try {
      const r = await fetch(`/api/pes/capabilities?action=line_profile&line_id=${lineId}`).then(r => r.json())
      const caps: {dimension_code: string; value_code: string}[] = r.capabilities ?? []
      setCapSelected(new Set(caps.map(c => `${c.dimension_code}:${c.value_code}`)))
    } catch { setCapSelected(new Set()) }
  }

  function toggleCap(dimCode: string, valCode: string) {
    const key = `${dimCode}:${valCode}`
    setCapSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  async function saveCapabilities() {
    if (!capLineId) return
    setCapSaving(true)
    const capabilities = Array.from(capSelected).map(k => { const [dimension_code, value_code] = k.split(':'); return { dimension_code, value_code } })
    await fetch('/api/pes/capabilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_id: capLineId, capabilities }) })
    try {
      const sr = await fetch(`/api/pes/capabilities?action=summary&line_id=${capLineId}`).then(r => r.json())
      const parts = (sr.summary ?? []).map((s: {boyut: string; degerler: string}) => `${s.boyut}: ${s.degerler}`)
      setCapSummaries(prev => ({ ...prev, [capLineId]: parts.join(' | ') }))
    } catch { /* */ }
    setCapSaving(false)
    setCapLineId(null)
    setMessage('Bant yetenekleri kaydedildi')
  }

  async function deleteLine(id: number, code: string) {
    if (!confirm(`${code} bantını silmek istediğinize emin misiniz?`)) return
    await fetch(`/api/pes/lines/${id}`, { method: 'DELETE' })
    loadData()
  }

  if (!wid) return <p>Atölye seçin</p>
  if (!w) return <p>Yükleniyor...</p>

  const ic = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
  const eic = 'px-2 py-1 border border-emerald-300 rounded text-sm bg-emerald-50 focus:outline-none focus:border-accent'

  // Hesaplanan değerler
  const productive = staffFromLines.dikimOp + staffFromLines.kesimOp + staffFromLines.ukpOp + staffFromLines.yikamaOp
  const mgmt = w.management + w.indirect
  const totalStaff = productive + mgmt
  const verimliOran = totalStaff > 0 ? ((productive / totalStaff) * 100).toFixed(1) : '0'
  const totalCapacityMin = staffFromLines.dikimOp * 22 * w.net_hours_day * 60

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-faint hover:text-gray-700">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-ink mt-2">Atölye Profili</h1>
        <p className="text-faint">{w.code} — Tüm atölye bilgilerini buradan yönetin</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {/* 1. Temel Bilgiler */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">1. Temel Bilgiler</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-muted mb-1">Atölye Kodu</label><input className={`${ic} bg-canvas`} value={w.code} disabled /></div>
          <div className="md:col-span-2"><label className="block text-xs font-medium text-muted mb-1">Atölye Adı</label><input className={ic} value={w.name} onChange={e => updateW('name', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Şehir</label><input className={ic} value={w.city ?? ''} onChange={e => updateW('city', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">İlçe</label><input className={ic} value={w.district ?? ''} onChange={e => updateW('district', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Uretim Tipi</label>
            <select className={ic} value={w.type} onChange={e => updateW('type', e.target.value)}>
              <option value="CMT">CMT — Kesim+Dikim+UKP</option>
              <option value="CM">CM — Kesim+Dikim</option>
              <option value="MT">MT — Dikim+UKP</option>
              <option value="M">M — Sadece Dikim</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-muted mb-1">Tesvik Bolgesi</label>
            <select className={ic} value={w.bolge ?? 1} onChange={e => updateW('bolge', Number(e.target.value))}>
              {[1,2,3,4,5,6].map(b => <option key={b} value={b}>{b}. Bolge</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-muted mb-1">Net Çalışma (saat/gün)</label><input type="number" className={ic} value={w.net_hours_day} onChange={e => updateW('net_hours_day', parseFloat(e.target.value)||9)} step={0.5} /></div>
        </div>
      </div>

      {/* 2. Bant Yapısı — ÖNCELİKLİ */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">2. Bant Profili ({lines.length})</h2>
            <p className="text-xs text-faint mt-0.5">Bantları ekleyin, çalışan profili otomatik hesaplanır</p>
          </div>
          <button onClick={() => setShowLineForm(!showLineForm)} className="text-sm px-3 py-1.5 bg-accent text-white rounded-lg">
            {showLineForm ? 'İptal' : '+ Bant Ekle'}
          </button>
        </div>

        {/* Bant ekleme formu */}
        {showLineForm && (
          <form onSubmit={addLine} className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-muted mb-1">Kod</label><input className={ic} value={lineForm.code} onChange={e => setLineForm(p => ({...p, code: e.target.value}))} required /></div>
            <div><label className="block text-xs font-medium text-muted mb-1">Ad</label><input className={ic} value={lineForm.name} onChange={e => setLineForm(p => ({...p, name: e.target.value}))} required /></div>
            <div><label className="block text-xs font-medium text-muted mb-1">Bant Tipi</label>
              <select className={ic} value={lineForm.line_type} onChange={e => setLineForm(p => ({...p, line_type: e.target.value}))}>
                {LINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-muted mb-1">Operatör</label><input type="number" className={ic} value={lineForm.operator_count} onChange={e => setLineForm(p => ({...p, operator_count: parseInt(e.target.value)||0}))} /></div>
            <div><label className="block text-xs font-medium text-muted mb-1">Günlük Hedef</label><input type="number" className={ic} value={lineForm.daily_target} onChange={e => setLineForm(p => ({...p, daily_target: parseInt(e.target.value)||0}))} /></div>
            <div><label className="block text-xs font-medium text-muted mb-1">Max Çevrim (sn)</label><input type="number" className={ic} value={lineForm.max_cycle_sec} onChange={e => setLineForm(p => ({...p, max_cycle_sec: e.target.value}))} step={0.01} placeholder="28" /></div>
            <div className="md:col-span-3"><button type="submit" className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">Bant Ekle</button></div>
          </form>
        )}

        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line-soft">
              <th className="py-2 text-left text-faint font-medium">Kod</th>
              <th className="py-2 text-left text-faint font-medium">Ad</th>
              <th className="py-2 text-left text-faint font-medium">Tip</th>
              <th className="py-2 text-right text-faint font-medium">Operatör</th>
              <th className="py-2 text-right text-faint font-medium">Hedef</th>
              <th className="py-2 text-right text-faint font-medium">Çevrim (sn)</th>
              <th className="py-2 text-center text-faint font-medium">İşlem</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map(l => (
                <React.Fragment key={l.id}>
                <tr className="hover:bg-canvas">
                  {editLineId === l.id ? (<>
                    <td className="py-2 text-accent font-medium">{l.code}</td>
                    <td className="py-2"><input className={eic} style={{width:100}} value={editLine.name} onChange={e => setEditLine(p => ({...p, name: e.target.value}))} /></td>
                    <td className="py-2">
                      <select className={eic} value={editLine.line_type} onChange={e => setEditLine(p => ({...p, line_type: e.target.value}))}>
                        {LINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2"><input type="number" className={eic} style={{width:50}} value={editLine.operator_count} onChange={e => setEditLine(p => ({...p, operator_count: parseInt(e.target.value)||0}))} /></td>
                    <td className="py-2"><input type="number" className={eic} style={{width:60}} value={editLine.daily_target} onChange={e => setEditLine(p => ({...p, daily_target: parseInt(e.target.value)||0}))} /></td>
                    <td className="py-2"><input type="number" className={eic} style={{width:50}} value={editLine.max_cycle_sec} onChange={e => setEditLine(p => ({...p, max_cycle_sec: e.target.value}))} step={0.01} /></td>
                    <td className="py-2 text-center space-x-1">
                      <button onClick={() => saveLine(l.id)} className="text-xs text-accent font-medium">Kaydet</button>
                      <button onClick={() => setEditLineId(null)} className="text-xs text-faint">İptal</button>
                    </td>
                  </>) : (<>
                    <td className="py-2 text-accent font-medium">{l.code}</td>
                    <td className="py-2 text-ink">{l.name}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getLineTypeColor(effectiveType(l.line_type))}`}>{effectiveType(l.line_type) === 'Yikama' ? 'Yıkama' : effectiveType(l.line_type)}</span></td>
                    <td className="py-2 text-right">{l.operator_count}</td>
                    <td className="py-2 text-right">{l.daily_target.toLocaleString('tr-TR')}</td>
                    <td className="py-2 text-right text-muted">{l.max_cycle_sec ?? '—'}</td>
                    <td className="py-2 text-center space-x-2">
                      <button onClick={() => { setEditLineId(l.id); setEditLine({ name: l.name, line_type: effectiveType(l.line_type), operator_count: l.operator_count, daily_target: l.daily_target, max_cycle_sec: l.max_cycle_sec ?? '' }) }} className="text-xs text-blue-600 hover:underline">Düzenle</button>
                      <button onClick={() => openCapabilities(l.id)} className={`text-xs ${capLineId === l.id ? 'text-emerald-700 font-medium' : 'text-emerald-600'} hover:underline`}>Yetenekler</button>
                      <button onClick={() => deleteLine(l.id, l.code)} className="text-xs text-red-500 hover:underline">Sil</button>
                    </td>
                  </>)}
                </tr>
                {capLineId !== l.id && capSummaries[l.id] && (
                  <tr><td colSpan={7} className="px-2 py-1 text-[10px] text-faint bg-canvas">{capSummaries[l.id]}</td></tr>
                )}
                {capLineId === l.id && (
                  <tr><td colSpan={7} className="p-0">
                    <div className="bg-emerald-50 border-t border-b border-emerald-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-emerald-800">{l.code} — Yetenek Profili</span>
                        <span className="text-[10px] text-emerald-600">{capSelected.size} yetenek secili</span>
                      </div>
                      {capDimensions.filter(dim => {
                        if (!dim.applies_to) return true
                        if (capKlasmans.length === 0) return true
                        return dim.applies_to.split(',').some((a: string) => capKlasmans.includes(a.trim()))
                      }).map(dim => (
                        <div key={dim.code}>
                          <p className="text-[10px] font-semibold text-muted mb-1">{dim.label}</p>
                          <div className="flex flex-wrap gap-1">
                            {dim.values.map(v => {
                              const key = `${dim.code}:${v.code}`
                              const isOn = capSelected.has(key)
                              return (
                                <button key={v.code} onClick={() => toggleCap(dim.code, v.code)}
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${isOn ? 'bg-emerald-500 text-white' : 'bg-white border border-line text-muted hover:bg-gray-100'}`}>
                                  {v.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveCapabilities} disabled={capSaving}
                          className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                          {capSaving ? 'Kaydediliyor...' : 'Yetenekleri Kaydet'}
                        </button>
                        <button onClick={() => setCapLineId(null)} className="px-4 py-1.5 border border-line rounded-lg text-xs text-muted">Kapat</button>
                      </div>
                    </div>
                  </td></tr>
                )}
                </React.Fragment>
              ))}
              {/* Toplam satırı */}
              <tr className="border-t-2 border-line bg-canvas font-semibold">
                <td className="py-2 text-gray-700" colSpan={3}>Toplam</td>
                <td className="py-2 text-right text-gray-700">{lines.reduce((s, l) => s + l.operator_count, 0)}</td>
                <td className="py-2 text-right text-gray-700">{lines.filter(l => effectiveType(l.line_type) === 'Dikim').reduce((s, l) => s + l.daily_target, 0).toLocaleString('tr-TR')}</td>
                <td className="py-2" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        )}

        {lines.length === 0 && !showLineForm && (
          <p className="text-sm text-faint text-center py-4">Henüz bant eklenmemiş. Bant ekleyerek çalışan profilini oluşturun.</p>
        )}
      </div>

      {/* 3. Çalışan Profili — Bantlardan otomatik hesaplanır */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-1">3. Çalışan Profili</h2>
        <p className="text-xs text-faint mb-4">Üretim personeli bantlardan otomatik hesaplanır</p>

        {/* Bantlardan gelen (read-only) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-emerald-600 font-medium">Dikim Operatörü</p>
            <p className="text-xl font-bold text-emerald-700">{staffFromLines.dikimOp}</p>
            <p className="text-[10px] text-emerald-400">{lines.filter(l => effectiveType(l.line_type) === 'Dikim').length} bant</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-blue-600 font-medium">Kesim Operatörü</p>
            <p className="text-xl font-bold text-blue-700">{staffFromLines.kesimOp}</p>
            <p className="text-[10px] text-blue-400">{lines.filter(l => effectiveType(l.line_type) === 'Kesim').length} bant</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-amber-600 font-medium">UKP Operatörü</p>
            <p className="text-xl font-bold text-amber-700">{staffFromLines.ukpOp}</p>
            <p className="text-[10px] text-amber-400">{lines.filter(l => effectiveType(l.line_type) === 'UKP').length} bant</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-purple-600 font-medium">Yıkama Operatörü</p>
            <p className="text-xl font-bold text-purple-700">{staffFromLines.yikamaOp}</p>
            <p className="text-[10px] text-purple-400">{lines.filter(l => effectiveType(l.line_type) === 'Yikama').length} bant</p>
          </div>
        </div>

        {/* Yönetim / Endirekt — manuel */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div><label className="block text-xs font-medium text-muted mb-1">Yönetim</label><input type="number" className={ic} value={w.management} onChange={e => updateW('management', parseInt(e.target.value)||0)} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Endirekt (şoför, aşçı vb.)</label><input type="number" className={ic} value={w.indirect} onChange={e => updateW('indirect', parseInt(e.target.value)||0)} /></div>
        </div>

        {/* Hesaplanan özet */}
        <div className="pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-emerald-50 rounded-lg px-4 py-2"><span className="text-xs text-emerald-600">Verimli Çalışan Oranı</span><p className="text-lg font-bold text-emerald-700">%{verimliOran}</p></div>
          <div className="bg-blue-50 rounded-lg px-4 py-2"><span className="text-xs text-blue-600">Üretim Personeli</span><p className="text-lg font-bold text-blue-700">{productive}</p></div>
          <div className="bg-canvas rounded-lg px-4 py-2"><span className="text-xs text-faint">Endirekt</span><p className="text-lg font-bold text-gray-700">{mgmt}</p></div>
          <div className="bg-canvas rounded-lg px-4 py-2"><span className="text-xs text-faint">Toplam Çalışan</span><p className="text-lg font-bold text-gray-700">{totalStaff}</p></div>
        </div>
      </div>

      {/* 4. Genel Parametreler */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-1">4. Kapasite Özeti</h2>
        <p className="text-xs text-faint mb-4">Bantlardan ve çalışan profilinden otomatik hesaplanır</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-canvas rounded-lg p-3"><p className="text-xs text-faint">Net Çalışma (dk/gün)</p><p className="text-lg font-bold text-gray-700">{(w.net_hours_day * 60).toFixed(0)} dk</p></div>
          <div className="bg-canvas rounded-lg p-3"><p className="text-xs text-faint">Bant Sayısı</p><p className="text-lg font-bold text-gray-700">{staffFromLines.bantSayisi}</p></div>
          <div className="bg-emerald-50 rounded-lg p-3"><p className="text-xs text-emerald-600">Günlük Hedef (toplam)</p><p className="text-lg font-bold text-emerald-700">{staffFromLines.totalHedef.toLocaleString('tr-TR')}</p></div>
          <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-blue-600">Aylık Kapasite (dk)</p><p className="text-lg font-bold text-blue-700">{totalCapacityMin.toLocaleString('tr-TR')}</p><p className="text-[10px] text-blue-400">{staffFromLines.dikimOp} op × 22 gün × {(w.net_hours_day * 60).toFixed(0)} dk</p></div>
        </div>
      </div>

      {/* Kaydet */}
      <button onClick={saveAll} disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium disabled:opacity-50 w-full">
        {loading ? 'Kaydediliyor...' : 'Tüm Profili Kaydet'}
      </button>
    </div>
  )
}
