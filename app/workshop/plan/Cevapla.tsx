'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  GEREKCE_ETIKET, GEREKCE_KODLARI, cevapDogrula,
  type GerekceKodu, type TeklifDurumu,
} from '@/lib/pes/plan-onay'

export type TeklifKalemGorunum = {
  id: number
  workOrderId: number
  isEmriNo: string
  modelAdi: string
  musteri: string
  bantAdi: string
  baslangic: string
  bitis: string
  adet: number
  teslim: string | null
  karsiBaslangic: string | null
  karsiAdet: number | null
  karsiNot: string | null
}

export type TeklifGorunum = {
  id: number
  turNo: number
  durum: TeklifDurumu
  taslakAdi: string
  gonderildi: string
  cevapTarihi: string | null
  gerekceKodu: GerekceKodu | null
  cevapNotu: string | null
  kalemler: TeklifKalemGorunum[]
}

const tr = new Intl.NumberFormat('tr-TR')

/**
 * Atölyenin cevap formu.
 *
 * Revizyon seçilince kalem kalem yeni tarih/adet girilebilir. Girilmeyen
 * kalem "itirazım yok" demektir — boş bırakmak sıfır kaydırma DEĞİL.
 */
export default function Cevapla({ teklif }: { teklif: TeklifGorunum }) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [durum, setDurum] = useState<'kabul' | 'revizyon' | 'ret' | null>(null)
  const [gerekce, setGerekce] = useState<GerekceKodu | ''>('')
  const [not, setNot] = useState('')
  const [karsi, setKarsi] = useState<Record<number, { baslangic: string; adet: string }>>({})
  const [hata, setHata] = useState<string | null>(null)

  const onHata = durum
    ? cevapDogrula({ durum, gerekceKodu: gerekce || null, not: not || null })
    : []

  async function gonder() {
    if (!durum) return
    setHata(null)
    const govde: Record<string, unknown> = {
      teklif_id: teklif.id, durum,
      gerekce_kodu: gerekce || null,
      not: not || null,
    }
    if (durum === 'revizyon') {
      govde.kalemler = teklif.kalemler.map((k) => {
        const g = karsi[k.id]
        return {
          id: k.id,
          /* Boş alan null gider: "itirazım yok". */
          karsi_baslangic: g?.baslangic || null,
          karsi_adet: g?.adet ? Number(g.adet) : null,
        }
      })
    }

    const c = await fetch('/api/workshop/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    })
    if (!c.ok) {
      const g = await c.json().catch(() => ({}))
      setHata(g.error ?? `Gönderilemedi (${c.status})`)
      return
    }
    basla(() => router.refresh())
  }

  return (
    <section className="rounded border border-slate-900 p-4 space-y-4">
      <header className="flex justify-between gap-3 flex-wrap items-baseline">
        <div>
          <h2 className="font-semibold">{teklif.taslakAdi}</h2>
          <p className="text-xs text-slate-500">
            {teklif.turNo}. tur · gönderildi {teklif.gonderildi} · {teklif.kalemler.length} iş
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-white">Cevap bekliyor</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3">İş emri</th>
              <th className="py-1 pr-3">Bant</th>
              <th className="py-1 pr-3">Adet</th>
              <th className="py-1 pr-3">Planlanan</th>
              <th className="py-1 pr-3">Teslim</th>
              {durum === 'revizyon' && <th className="py-1 pr-3">Sizin öneriniz</th>}
            </tr>
          </thead>
          <tbody>
            {teklif.kalemler.map((k) => (
              <tr key={k.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-3">
                  <div className="font-medium">{k.isEmriNo}</div>
                  <div className="text-xs text-slate-400">{k.modelAdi}</div>
                </td>
                <td className="py-1.5 pr-3 text-slate-600">{k.bantAdi}</td>
                <td className="py-1.5 pr-3 tabular-nums">{tr.format(k.adet)}</td>
                <td className="py-1.5 pr-3 text-slate-600">{k.baslangic} → {k.bitis}</td>
                <td className="py-1.5 pr-3">
                  {k.teslim ?? '—'}
                  {k.teslim && k.bitis > k.teslim && (
                    <span className="ml-1 text-xs px-1 py-0.5 rounded bg-red-100 text-red-800">
                      aşıyor
                    </span>
                  )}
                </td>
                {durum === 'revizyon' && (
                  <td className="py-1.5 pr-3">
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={karsi[k.id]?.baslangic ?? ''}
                        onChange={(e) => setKarsi((s) => ({
                          ...s, [k.id]: { baslangic: e.target.value, adet: s[k.id]?.adet ?? '' },
                        }))}
                        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                      />
                      <input
                        type="number" min={1} placeholder="adet"
                        value={karsi[k.id]?.adet ?? ''}
                        onChange={(e) => setKarsi((s) => ({
                          ...s, [k.id]: { baslangic: s[k.id]?.baslangic ?? '', adet: e.target.value },
                        }))}
                        className="w-20 rounded border border-slate-300 px-1 py-0.5 text-xs tabular-nums"
                      />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {durum === 'revizyon' && (
          <p className="mt-1 text-xs text-slate-500">
            Boş bıraktığınız satıra itirazınız yok sayılır.
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {([
          ['kabul', 'Kabul ediyorum', 'bg-emerald-600'],
          ['revizyon', 'Revizyon öneriyorum', 'bg-amber-600'],
          ['ret', 'Karşılayamıyorum', 'bg-red-600'],
        ] as const).map(([d, etiket, renk]) => (
          <button
            key={d}
            onClick={() => { setDurum(d); setHata(null) }}
            className={`px-3 py-1.5 rounded text-sm text-white ${renk} ${
              durum === d ? 'ring-2 ring-offset-1 ring-slate-900' : 'opacity-80 hover:opacity-100'}`}>
            {etiket}
          </button>
        ))}
      </div>

      {durum && durum !== 'kabul' && (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="block text-xs text-slate-600">Gerekçe (zorunlu)</span>
            <select
              value={gerekce}
              onChange={(e) => setGerekce(e.target.value as GerekceKodu | '')}
              className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="">— seçin —</option>
              {GEREKCE_KODLARI.map((k) => (
                <option key={k} value={k}>{GEREKCE_ETIKET[k]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-slate-600">
              Açıklama{gerekce === 'DIGER' ? ' (zorunlu)' : ''}
            </span>
            <textarea
              value={not} onChange={(e) => setNot(e.target.value)} rows={2}
              className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Planlamacının ne yapacağını bilmesi için kısa bir not" />
          </label>
        </div>
      )}

      {onHata.length > 0 && (
        <p className="text-sm text-amber-700">{onHata[0].mesaj}</p>
      )}
      {hata && <p className="text-sm text-red-600">{hata}</p>}

      <button
        onClick={gonder}
        disabled={!durum || onHata.length > 0 || bekliyor}
        className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-40">
        {bekliyor ? 'Gönderiliyor…' : 'Cevabı gönder'}
      </button>
    </section>
  )
}
