'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BOLGELER, degisimOrani, gecerlilikAraligi, type DonemSatiri } from '@/lib/pes/dk-maliyet'

const tl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const yuzde = (v: number | null) =>
  v === null ? '' : `${v >= 0 ? '+' : ''}${(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`

export default function Yonetim({ donemler, buAy }: { donemler: DonemSatiri[]; buAy: string }) {
  const router = useRouter()
  const enYeni = donemler[0]
  const [donem, setDonem] = useState(buAy)
  const [degerler, setDegerler] = useState<Record<number, string>>(() =>
    Object.fromEntries(BOLGELER.map((b) => [b, enYeni?.degerler[b]?.toString().replace('.', ',') ?? ''])))
  const [aciklama, setAciklama] = useState('')
  const [durum, setDurum] = useState<{ tur: 'hazir' | 'gonderiliyor' | 'ok' | 'hata'; metin?: string }>({ tur: 'hazir' })

  const tumDonemler = donemler.map((d) => d.donem)
  const varMi = tumDonemler.includes(donem)
  const aralik = /^\d{4}-\d{2}$/.test(donem) ? gecerlilikAraligi(tumDonemler, donem) : null
  // Bugün hangi dönem geçerli: bu aydan küçük/eşit en yakın dönem.
  const gecerliDonem = useMemo(() => tumDonemler.filter((d) => d <= buAy).sort().at(-1) ?? null, [tumDonemler, buAy])

  function duzenle(d: DonemSatiri) {
    setDonem(d.donem)
    setDegerler(Object.fromEntries(BOLGELER.map((b) => [b, d.degerler[b]?.toString().replace('.', ',') ?? ''])))
    setAciklama('')
    setDurum({ tur: 'hazir' })
    document.getElementById('dk-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    setDurum({ tur: 'gonderiliyor' })
    const r = await fetch('/api/pes/dk-maliyet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ donem, degerler, aciklama }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setDurum({ tur: 'hata', metin: j.error ?? 'Kaydedilemedi' }); return }
    const kapsam = aralik?.bitis ? `${aralik.baslangic} – ${aralik.bitis} arası` : `${donem} ve sonrası`
    setDurum({
      tur: 'ok',
      metin: j.eklenen + j.guncellenen === 0
        ? 'Değerler zaten aynıydı; değişiklik yok.'
        : `Kaydedildi (${j.eklenen} eklendi, ${j.guncellenen} güncellendi). ${kapsam} bütün hesaplar artık bu değerleri kullanıyor.`,
    })
    setAciklama('')
    router.refresh()
  }

  async function sil(d: string) {
    const neden = window.prompt(`${d} dönemi silinecek. Bu aylar bir önceki dönemin değerleriyle hesaplanacak.\n\nSilme nedeni (geçmişe yazılır):`)
    if (neden === null) return
    const r = await fetch('/api/pes/dk-maliyet', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ donem: d, aciklama: neden }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { window.alert(j.error ?? 'Silinemedi'); return }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Dönem</th>
              <th className="text-left px-3 py-2">Geçerli olduğu aylar</th>
              {BOLGELER.map((b) => <th key={b} className="text-right px-3 py-2">{b}. Bölge</th>)}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {donemler.map((d, i) => {
              const onceki = donemler[i + 1]
              const a = gecerlilikAraligi(tumDonemler, d.donem)
              const gecerli = d.donem === gecerliDonem
              return (
                <tr key={d.donem} className={`border-t ${gecerli ? 'bg-emerald-50' : ''}`}>
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {d.donem}
                    {gecerli && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-600 text-white">bugün geçerli</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{a.bitis ? `${a.baslangic} – ${a.bitis}` : `${a.baslangic} ve sonrası`}</td>
                  {BOLGELER.map((b) => {
                    const o = degisimOrani(d.degerler[b], onceki?.degerler[b] ?? null)
                    return (
                      <td key={b} className="px-3 py-2 text-right tabular-nums">
                        {tl(d.degerler[b])}
                        {o !== null && o !== 0 && (
                          <span className={`block text-xs ${o > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{yuzde(o)}</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => duzenle(d)} className="underline mr-3">düzenle</button>
                    <button type="button" onClick={() => sil(d.donem)} className="underline text-rose-700">sil</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form id="dk-form" onSubmit={kaydet} className="border rounded p-4 space-y-3 max-w-4xl">
        <h2 className="font-medium">{varMi ? `${donem} dönemini düzelt` : 'Yeni dönem ekle'}</h2>
        <label className="block">
          <span className="text-sm text-slate-600">Dönem (geçerlilik başlangıcı)</span>
          <input type="month" value={donem} onChange={(e) => { setDonem(e.target.value); setDurum({ tur: 'hazir' }) }}
            required className="block border rounded px-2 py-1 tabular-nums" />
          {aralik && (
            <span className="text-xs text-slate-500">
              {varMi ? 'Bu dönem zaten var; kaydetmek değerlerini düzeltir. ' : ''}
              Etkilenecek aylar: <b>{aralik.bitis ? `${aralik.baslangic} – ${aralik.bitis}` : `${aralik.baslangic} ve sonrası`}</b>.
              {' '}Önceki aylar kendi dönemlerinin değerleriyle kalır.
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {BOLGELER.map((b) => (
            <label key={b} className="block">
              <span className="text-sm text-slate-600">{b}. Bölge (TL/dk)</span>
              <input inputMode="decimal" value={degerler[b]} required
                onChange={(e) => setDegerler({ ...degerler, [b]: e.target.value })}
                className="block w-full border rounded px-2 py-1 text-right tabular-nums" />
            </label>
          ))}
        </div>
        <label className="block">
          <span className="text-sm text-slate-600">Açıklama (geçmişe yazılır)</span>
          <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={500}
            placeholder="ör. 2026 Eylül 3D tablosu"
            className="block w-full border rounded px-2 py-1" />
        </label>
        <button type="submit" disabled={durum.tur === 'gonderiliyor'}
          className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
          {durum.tur === 'gonderiliyor' ? 'Kaydediliyor…' : `${donem} için kaydet`}
        </button>
        {durum.tur === 'ok' && <p className="text-sm text-emerald-700">{durum.metin}</p>}
        {durum.tur === 'hata' && <p className="text-sm text-rose-700">{durum.metin}</p>}
      </form>
    </div>
  )
}
