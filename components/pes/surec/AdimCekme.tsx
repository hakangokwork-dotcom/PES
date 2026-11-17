// components/pes/surec/AdimCekme.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { surumBasligi } from '@/lib/pes/giren'
import SurecGorselleri from './SurecGorselleri'
import type { Top } from './AdimKumas'

type Test = {
  id: number; tarih: string; top_id: number | null; top_no: string | null; yikama_sayisi: number | null
  boy_cekme_pct: string | null; en_cekme_pct: string | null; may_kaymasi_pct: string | null
  yikama_receti: string | null; hedef_renk: string | null; ton_degerlendirme: string | null
  sonuc: 'UYGUN' | 'RİSKLİ' | 'RED' | 'BEKLIYOR'; yapan: string | null; notlar: string | null
}
type Grup = { cekme_grubu: string; top_sayisi: number; cozgu_ort: string; cozgu_min: string; cozgu_max: string; atki_ort: string; atki_min: string; atki_max: string }

const SONUC_TON = { UYGUN: 'good', 'RİSKLİ': 'warn', RED: 'bad', BEKLIYOR: 'neutral' } as const
// Yerel gün; toISOString UTC verir ve gece yarısından sonra dünü yazardı. Her sıfırlamada yeniden hesaplanır.
const bos = () => ({ topId: '', tarih: new Date().toLocaleDateString('sv-SE'), yikamaReceti: '', hedefRenk: '', yikamaSayisi: '1', boyCekme: '', enCekme: '', mayKaymasi: '', tonDegerlendirme: '', sonuc: 'UYGUN', yapan: '', notlar: '' })
type Form = ReturnType<typeof bos>
type Grupla = { ton_grubu: string; cekme_grubu: string }

export default function AdimCekme({ woId, onDegisti }: { woId: number; onDegisti: () => void }) {
  const [testler, setTestler] = useState<Test[]>([])
  const [toplar, setToplar] = useState<Top[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [yeni, setYeni] = useState(bos)
  const [hata, setHata] = useState<string | null>(null)
  // Gruplama ızgarası: top id → ekrandaki (kaydedilmemiş olabilir) değerler
  const [grup, setGrup] = useState<Record<number, Grupla>>({})

  const yukle = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/pes/work-orders/${woId}/cekme-testi`).then(r => r.json()),
      fetch(`/api/pes/work-orders/${woId}/toplar`).then(r => r.json()),
    ])
    const tl: Top[] = b.toplar ?? []
    setTestler(a.testler ?? []); setToplar(tl); setGruplar(b.gruplar ?? [])
    setGrup(Object.fromEntries(tl.map(t => [t.id, { ton_grubu: t.ton_grubu ?? '', cekme_grubu: t.cekme_grubu ?? '' }])))
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  async function ekle() {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/cekme-testi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return }
    setYeni({ ...bos(), tarih: yeni.tarih, yikamaReceti: yeni.yikamaReceti, hedefRenk: yeni.hedefRenk, yapan: yeni.yapan })
    await yukle(); onDegisti()
  }

  async function sil(id: number) {
    if (!confirm('Bu test kaydı silinsin mi?')) return
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/cekme-testi?testId=${id}`, { method: 'DELETE' })
    if (!r.ok) setHata((await r.json()).error ?? 'Silinemedi')
    await yukle(); onDegisti()
  }

  /* Ton ve çekme grubu tek istekte: iki ayrı yazım ikinci 409'a düşmesin. */
  async function grupKaydet(t: Top) {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...surumBasligi(t) }, body: JSON.stringify(grup[t.id]),
    })
    if (!r.ok) setHata((await r.json()).error ?? 'Kaydedilemedi')
    await yukle(); onDegisti()
  }
  const grupYaz = (id: number, alan: keyof Grupla, v: string) => setGrup(gs => ({ ...gs, [id]: { ...gs[id], [alan]: v } }))

  const g = (k: keyof Form, etiket: string, ek: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <Field label={etiket}><Input value={yeni[k]} onChange={e => setYeni({ ...yeni, [k]: e.target.value })} {...ek} /></Field>
  )

  return (
    <div className="space-y-5">
      <p className="text-xs text-faint">
        Topu kullanılacağı yıkama yolunda test edin; çözgü ve atkıyı ayrı yazın (küçülme negatif). Bir top birden çok renge gidecekse her yol için ayrı test girin.
      </p>
      <div className="grid gap-2 md:grid-cols-6">
        <Field label="Top">
          <Select value={yeni.topId} onChange={e => setYeni({ ...yeni, topId: e.target.value })}>
            <option value="">— iş emri geneli —</option>
            {toplar.map(t => <option key={t.id} value={t.id}>{t.tedarikci_lotu} · {t.top_no}</option>)}
          </Select>
        </Field>
        {g('tarih', 'Tarih', { type: 'date' })}
        {g('yikamaReceti', 'Yıkama reçetesi / rev.')}
        {g('hedefRenk', 'Hedef renk (C1…)')}
        {g('yikamaSayisi', 'Yıkama sayısı', { inputMode: 'numeric', align: 'right' })}
        {/* inputMode text: iOS'un ondalık klavyesinde eksi yok; çekme negatif yazılır. */}
        {g('boyCekme', 'Çözgü (boy) %', { inputMode: 'text', align: 'right' })}
        {g('enCekme', 'Atkı (en) %', { inputMode: 'text', align: 'right' })}
        {g('mayKaymasi', 'Dönme %', { inputMode: 'text', align: 'right' })}
        {g('tonDegerlendirme', 'Ton değerlendirmesi')}
        <Field label="Sonuç">
          <Select value={yeni.sonuc} onChange={e => setYeni({ ...yeni, sonuc: e.target.value })}>
            <option>UYGUN</option><option>RİSKLİ</option><option>RED</option><option>BEKLIYOR</option>
          </Select>
        </Field>
        {g('yapan', 'Yapan')}
        <div className="flex items-end"><Button onClick={ekle}>Testi ekle</Button></div>
      </div>
      {hata && <p className="text-sm text-danger">{hata}</p>}

      {testler.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr><th className="py-1">Tarih</th><th>Top</th><th>Reçete / renk</th><th className="text-right">Çözgü</th><th className="text-right">Atkı</th><th className="text-right">Dönme</th><th>Ton</th><th>Sonuç</th><th></th></tr>
            </thead>
            <tbody>
              {testler.map(t => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="py-1 num">{t.tarih}</td>
                  <td>{t.top_no ?? <span className="text-faint">geneli</span>}</td>
                  <td className="text-xs">{[t.yikama_receti, t.hedef_renk].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="num text-right">{t.boy_cekme_pct ?? '—'}</td>
                  <td className="num text-right">{t.en_cekme_pct ?? '—'}</td>
                  <td className="num text-right">{t.may_kaymasi_pct ?? '—'}</td>
                  <td className="text-xs">{t.ton_degerlendirme ?? '—'}</td>
                  <td><Badge tone={SONUC_TON[t.sonuc]}>{t.sonuc}</Badge></td>
                  <td>{t.top_id === null && <button onClick={() => sil(t.id)} className="text-xs text-danger hover:underline">Sil</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toplar.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-ink">Gruplama</h4>
          <p className="text-xs text-faint">Topları yıkama sonrası renk ve çekme davranışına göre gruplayın. İki lot aynı gruba girebilir, bir lot birkaç gruba ayrılabilir. Hem ortalamaya hem aralığa bakın.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint"><tr><th className="py-1">Lot · top</th><th>Durum</th><th>Ton grubu</th><th>Çekme grubu</th><th></th></tr></thead>
            <tbody>
              {toplar.map(t => {
                const v = grup[t.id] ?? { ton_grubu: '', cekme_grubu: '' }
                const degisti = v.ton_grubu.trim() !== (t.ton_grubu ?? '') || v.cekme_grubu.trim() !== (t.cekme_grubu ?? '')
                return (
                  <tr key={t.id} className="border-t border-line-soft">
                    <td className="py-1">{t.tedarikci_lotu} · {t.top_no}</td>
                    <td className="text-xs">{t.durum}</td>
                    <td><div className="w-24"><Input value={v.ton_grubu} onChange={e => grupYaz(t.id, 'ton_grubu', e.target.value)} /></div></td>
                    <td><div className="w-24"><Input value={v.cekme_grubu} onChange={e => grupYaz(t.id, 'cekme_grubu', e.target.value)} /></div></td>
                    <td><Button size="sm" variant="secondary" disabled={!degisti} onClick={() => grupKaydet(t)}>Kaydet</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {gruplar.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint"><tr><th className="py-1">Çekme grubu</th><th className="text-right">Top</th><th className="text-right">Çözgü ort. (min…max)</th><th className="text-right">Atkı ort. (min…max)</th></tr></thead>
              <tbody>
                {gruplar.map(gr => (
                  <tr key={gr.cekme_grubu} className="border-t border-line-soft">
                    <td className="py-1">{gr.cekme_grubu}</td>
                    <td className="num text-right">{gr.top_sayisi}</td>
                    <td className="num text-right">{gr.cozgu_ort ?? '—'} ({gr.cozgu_min ?? '—'}…{gr.cozgu_max ?? '—'})</td>
                    <td className="num text-right">{gr.atki_ort ?? '—'} ({gr.atki_min ?? '—'}…{gr.atki_max ?? '—'})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-faint">Renk battaniyesi / test numunesi fotoğrafları</p>
        <SurecGorselleri woId={woId} adim="CEKME" />
      </div>
    </div>
  )
}
