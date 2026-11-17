// components/pes/surec/AdimKumas.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'
import SurecGorselleri from './SurecGorselleri'

export type Top = GirenAlanlari & {
  id: number; tedarikci: string | null; artikel: string | null; kompozisyon: string | null
  tedarikci_lotu: string; parti_no: string | null; top_no: string; metre: string | null
  kullanilabilir_en_cm: string | null; irsaliye_no: string | null; gelis_tarihi: string
  durum: 'Karantina' | 'Serbest' | 'Red'; ton_grubu: string | null; cekme_grubu: string | null; notlar: string | null
  son_test: { sonuc: string; boy_cekme_pct: string | null; en_cekme_pct: string | null } | null
}

const TON = { Karantina: 'warn', Serbest: 'good', Red: 'bad' } as const
const BOS = { tedarikci: '', artikel: '', kompozisyon: '', tedarikci_lotu: '', parti_no: '', top_no: '', metre: '', kullanilabilir_en_cm: '', irsaliye_no: '' }

export default function AdimKumas({ woId, onDegisti }: { woId: number; onDegisti: () => void }) {
  const [toplar, setToplar] = useState<Top[]>([])
  const [yeni, setYeni] = useState(BOS)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/work-orders/${woId}/toplar`).then(r => r.json())
    setToplar(d.toplar ?? [])
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  async function ekle() {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return }
    // Aynı irsaliyeden sıradaki top: lot, tedarikçi, artikel kalır; top no ve metre boşalır.
    setYeni({ ...yeni, top_no: '', metre: '' })
    await yukle(); onDegisti()
  }

  async function durumYaz(t: Top, durum: Top['durum']) {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...surumBasligi(t) }, body: JSON.stringify({ durum }),
    })
    if (!r.ok) setHata((await r.json()).error ?? 'Değiştirilemedi')
    await yukle(); onDegisti()
  }

  async function sil(t: Top) {
    if (!confirm(`${t.top_no} numaralı top silinsin mi? Testleri de silinir.`)) return
    await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, { method: 'DELETE' })
    await yukle(); onDegisti()
  }

  const alan = (k: keyof typeof BOS, etiket: string, ek: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <Field label={etiket}><Input value={yeni[k]} onChange={e => setYeni({ ...yeni, [k]: e.target.value })} {...ek} /></Field>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-faint">Her top karantinada kabul edilir. Fiziksel kontrol, renk ve çekme testi sonrası serbest bırakılır; karantinadaki top kesime giremez.</p>
      <div className="grid gap-2 md:grid-cols-5">
        {alan('irsaliye_no', 'İrsaliye')}{alan('tedarikci', 'Tedarikçi')}{alan('artikel', 'Artikel')}
        {alan('kompozisyon', 'Kompozisyon')}{alan('tedarikci_lotu', 'Tedarikçi lotu *')}
        {alan('parti_no', 'Parti')}{alan('top_no', 'Top no *')}
        {alan('metre', 'Metre', { inputMode: 'decimal', align: 'right' })}
        {alan('kullanilabilir_en_cm', 'Kullanılabilir en (cm)', { inputMode: 'decimal', align: 'right' })}
        <div className="flex items-end"><Button onClick={ekle} disabled={!yeni.tedarikci_lotu || !yeni.top_no}>Topu ekle</Button></div>
      </div>
      {hata && <p className="text-sm text-danger">{hata}</p>}

      {toplar.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr><th className="py-1">Lot / parti</th><th>Top</th><th className="text-right">Metre</th><th className="text-right">En</th><th>Artikel</th><th>Son test</th><th>Durum</th><th></th></tr>
            </thead>
            <tbody>
              {toplar.map(t => (
                <tr key={t.id} className="border-t border-line-soft" title={girenMetni(t)}>
                  <td className="py-1">{t.tedarikci_lotu}{t.parti_no ? ` · ${t.parti_no}` : ''}</td>
                  <td>{t.top_no}</td>
                  <td className="num text-right">{t.metre ?? '—'}</td>
                  <td className="num text-right">{t.kullanilabilir_en_cm ?? '—'}</td>
                  <td>{t.artikel ?? '—'}</td>
                  <td className="text-xs">{t.son_test ? `${t.son_test.sonuc} · çözgü ${t.son_test.boy_cekme_pct ?? '—'} / atkı ${t.son_test.en_cekme_pct ?? '—'}` : '—'}</td>
                  <td>
                    <Select value={t.durum} onChange={e => durumYaz(t, e.target.value as Top['durum'])} className="w-32">
                      <option>Karantina</option><option>Serbest</option><option>Red</option>
                    </Select>
                    <Badge tone={TON[t.durum]} className="ml-1">{t.durum}</Badge>
                  </td>
                  <td><button onClick={() => sil(t)} className="text-xs text-danger hover:underline">Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-faint">İrsaliye, top etiketi, hasar fotoğrafları</p>
        <SurecGorselleri woId={woId} adim="KUMAS" />
      </div>
    </div>
  )
}
