'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yukleniyor...</div>}><YikamaUkpPage /></Suspense>
}

function YikamaUkpPage() {
  const wid = useSearchParams().get('wid')
  const [tab, setTab] = useState<'yikama' | 'ukp'>('yikama')
  const [yikamaRecords, setYikamaRecords] = useState<Record<string, unknown>[]>([])
  const [ukpRecords, setUkpRecords] = useState<Record<string, unknown>[]>([])
  const [saving, setSaving] = useState(false)
  const [yForm, setYForm] = useState({ tarih: new Date().toISOString().split('T')[0], giren_adet: 0, cikan_adet: 0, hatali_adet: 0, cevrim_sayisi: 0, cevrim_sure_dk: 85, enerji_kwh: '', su_litre: '' })
  const [uForm, setUForm] = useState({ tarih: new Date().toISOString().split('T')[0], utu_adet: 0, kontrol_adet: 0, paket_adet: 0, hatali_adet: 0, personel_sayisi: 0, calisma_dk: 540 })

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/yikama?workshop_id=${wid}`).then(r => r.json()).then(d => setYikamaRecords(d.records ?? [])).catch(() => {})
    fetch(`/api/pes/ukp?workshop_id=${wid}`).then(r => r.json()).then(d => setUkpRecords(d.records ?? [])).catch(() => {})
  }, [wid])

  async function saveYikama() {
    if (!wid) return
    setSaving(true)
    await fetch('/api/pes/yikama', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...yForm, workshop_id: Number(wid), enerji_kwh: Number(yForm.enerji_kwh) || null, su_litre: Number(yForm.su_litre) || null }) })
    const r = await fetch(`/api/pes/yikama?workshop_id=${wid}`).then(r => r.json())
    setYikamaRecords(r.records ?? [])
    setSaving(false)
  }

  async function saveUkp() {
    if (!wid) return
    setSaving(true)
    await fetch('/api/pes/ukp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...uForm, workshop_id: Number(wid) }) })
    const r = await fetch(`/api/pes/ukp?workshop_id=${wid}`).then(r => r.json())
    setUkpRecords(r.records ?? [])
    setSaving(false)
  }

  const fmt = (n: number) => n.toLocaleString('tr-TR')
  const ic = 'w-full border border-line rounded-lg px-3 py-2 text-sm'

  if (!wid) return <div className="p-6 text-faint">Atolye secin</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-ink">Yikama & UKP Takibi</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('yikama')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'yikama' ? 'bg-white text-ink shadow-sm' : 'text-faint'}`}>Yikama</button>
        <button onClick={() => setTab('ukp')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'ukp' ? 'bg-white text-ink shadow-sm' : 'text-faint'}`}>UKP</button>
      </div>

      {tab === 'yikama' && (
        <div className="space-y-4">
          <div className="bg-white border border-line-soft rounded-xl p-6">
            <h2 className="font-semibold text-ink mb-3">Yikama Kaydi Ekle</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="block text-xs text-muted mb-1">Tarih</label><input type="date" className={ic} value={yForm.tarih} onChange={e => setYForm(p => ({...p, tarih: e.target.value}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Giren Adet</label><input type="number" className={ic} value={yForm.giren_adet || ''} onChange={e => setYForm(p => ({...p, giren_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Cikan Adet</label><input type="number" className={ic} value={yForm.cikan_adet || ''} onChange={e => setYForm(p => ({...p, cikan_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Hatali</label><input type="number" className={ic} value={yForm.hatali_adet || ''} onChange={e => setYForm(p => ({...p, hatali_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Cevrim Sayisi</label><input type="number" className={ic} value={yForm.cevrim_sayisi || ''} onChange={e => setYForm(p => ({...p, cevrim_sayisi: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Cevrim Sure (dk)</label><input type="number" className={ic} value={yForm.cevrim_sure_dk || ''} onChange={e => setYForm(p => ({...p, cevrim_sure_dk: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Enerji (kWh)</label><input type="number" className={ic} value={yForm.enerji_kwh} onChange={e => setYForm(p => ({...p, enerji_kwh: e.target.value}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Su (litre)</label><input type="number" className={ic} value={yForm.su_litre} onChange={e => setYForm(p => ({...p, su_litre: e.target.value}))} /></div>
            </div>
            <button onClick={saveYikama} disabled={saving} className="mt-3 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>

          {yikamaRecords.length > 0 && (
            <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-faint border-b bg-canvas">
                  <th className="text-left px-3 py-2">Tarih</th><th className="text-right px-2 py-2">Giren</th><th className="text-right px-2 py-2">Cikan</th><th className="text-right px-2 py-2">Hata</th><th className="text-right px-2 py-2">Verim%</th><th className="text-right px-2 py-2">Cevrim</th>
                </tr></thead>
                <tbody>{yikamaRecords.map((r, i) => {
                  const verim = Number(r.giren_adet) > 0 ? (Number(r.cikan_adet) / Number(r.giren_adet) * 100).toFixed(1) : '---'
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-canvas">
                      <td className="px-3 py-2">{String(r.tarih ?? '').split('T')[0]}</td>
                      <td className="text-right px-2 py-2 font-mono">{fmt(Number(r.giren_adet))}</td>
                      <td className="text-right px-2 py-2 font-mono">{fmt(Number(r.cikan_adet))}</td>
                      <td className="text-right px-2 py-2 font-mono text-red-600">{Number(r.hatali_adet)}</td>
                      <td className="text-right px-2 py-2 font-mono">{verim}%</td>
                      <td className="text-right px-2 py-2 font-mono">{Number(r.cevrim_sayisi)}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ukp' && (
        <div className="space-y-4">
          <div className="bg-white border border-line-soft rounded-xl p-6">
            <h2 className="font-semibold text-ink mb-3">UKP Kaydi Ekle</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="block text-xs text-muted mb-1">Tarih</label><input type="date" className={ic} value={uForm.tarih} onChange={e => setUForm(p => ({...p, tarih: e.target.value}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Utu Adet</label><input type="number" className={ic} value={uForm.utu_adet || ''} onChange={e => setUForm(p => ({...p, utu_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Kontrol Adet</label><input type="number" className={ic} value={uForm.kontrol_adet || ''} onChange={e => setUForm(p => ({...p, kontrol_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Paket Adet</label><input type="number" className={ic} value={uForm.paket_adet || ''} onChange={e => setUForm(p => ({...p, paket_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Hatali</label><input type="number" className={ic} value={uForm.hatali_adet || ''} onChange={e => setUForm(p => ({...p, hatali_adet: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Personel</label><input type="number" className={ic} value={uForm.personel_sayisi || ''} onChange={e => setUForm(p => ({...p, personel_sayisi: Number(e.target.value)}))} /></div>
              <div><label className="block text-xs text-muted mb-1">Calisma (dk)</label><input type="number" className={ic} value={uForm.calisma_dk || ''} onChange={e => setUForm(p => ({...p, calisma_dk: Number(e.target.value)}))} /></div>
            </div>
            {/* UKP Verimlilik hesabi */}
            {uForm.personel_sayisi > 0 && uForm.paket_adet > 0 && (
              <div className="mt-3 bg-blue-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-xs text-blue-600">Kisi Basi Gunluk</span><p className="font-bold">{Math.round(uForm.paket_adet / uForm.personel_sayisi)} adet</p></div>
                <div><span className="text-xs text-blue-600">Adet Basi Sure</span><p className="font-bold">{(uForm.calisma_dk / uForm.paket_adet).toFixed(1)} dk</p></div>
                <div><span className="text-xs text-blue-600">Hata Orani</span><p className={`font-bold ${uForm.hatali_adet / uForm.kontrol_adet > 0.03 ? 'text-red-600' : 'text-green-600'}`}>{uForm.kontrol_adet > 0 ? (uForm.hatali_adet / uForm.kontrol_adet * 100).toFixed(1) : '0'}%</p></div>
              </div>
            )}
            <button onClick={saveUkp} disabled={saving} className="mt-3 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>

          {ukpRecords.length > 0 && (
            <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-faint border-b bg-canvas">
                  <th className="text-left px-3 py-2">Tarih</th><th className="text-right px-2 py-2">Utu</th><th className="text-right px-2 py-2">Kontrol</th><th className="text-right px-2 py-2">Paket</th><th className="text-right px-2 py-2">Hata</th><th className="text-right px-2 py-2">Personel</th>
                </tr></thead>
                <tbody>{ukpRecords.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-canvas">
                    <td className="px-3 py-2">{String(r.tarih ?? '').split('T')[0]}</td>
                    <td className="text-right px-2 py-2 font-mono">{fmt(Number(r.utu_adet))}</td>
                    <td className="text-right px-2 py-2 font-mono">{fmt(Number(r.kontrol_adet))}</td>
                    <td className="text-right px-2 py-2 font-mono">{fmt(Number(r.paket_adet))}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-600">{Number(r.hatali_adet)}</td>
                    <td className="text-right px-2 py-2 font-mono">{Number(r.personel_sayisi)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
