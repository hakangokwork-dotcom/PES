'use client'

import { useState } from 'react'
import { Button, Field, Input, Select, useToast } from '@/components/ui'
import { KUNYE_ALANLARI, ONCELIKLER, type Secenekler, type Siparis } from './tipler'

/* Havuza PO açma / düzenleme formu (spec K3, K4).

   Künye altı <select> — etiket gösterir, kod yazar; katalog seçenekleri
   üst bileşenden gelir (sayfa açılışında tek istek). Tümü isteğe bağlı:
   yarım künyeyle PO yazılabilir, sihirbaz eksiği gösterir. Sipariş no
   düzenlemede kilitli — iş emrinin kimliği, UNIQUE. */

type Taslak = {
  is_emri_no: string; musteri: string; model_adi: string; stil_kodu: string; sezon: string
  siparis_miktari: string; teslim_tarihi: string; oncelik: string; kumasci: string
  ana_grup_kodu: string; klasman_kodu: string; kumas_turu_kodu: string
  kumas_grubu_kodu: string; cinsiyet_yas_kodu: string; kalite_kodu: string
}

function taslakYap(m?: Siparis): Taslak {
  return {
    is_emri_no: m?.is_emri_no ?? '', musteri: m?.musteri ?? '', model_adi: m?.model_adi ?? '',
    stil_kodu: m?.stil_kodu ?? '', sezon: m?.sezon ?? '',
    siparis_miktari: m ? String(m.siparis_miktari) : '', teslim_tarihi: m?.teslim_tarihi ?? '',
    oncelik: m?.oncelik ?? 'Normal', kumasci: m?.kumasci ?? '',
    ana_grup_kodu: m?.ana_grup_kodu ?? '', klasman_kodu: m?.klasman_kodu ?? '',
    kumas_turu_kodu: m?.kumas_turu_kodu ?? '', kumas_grubu_kodu: m?.kumas_grubu_kodu ?? '',
    cinsiyet_yas_kodu: m?.cinsiyet_yas_kodu ?? '', kalite_kodu: m?.kalite_kodu ?? '',
  }
}

export default function SiparisFormu({ mevcut, secenekler, onKapat, onKaydedildi }: {
  mevcut?: Siparis; secenekler: Secenekler; onKapat: () => void; onKaydedildi: () => void
}) {
  const toast = useToast()
  const [t, setT] = useState<Taslak>(() => taslakYap(mevcut))
  const [hata, setHata] = useState<string | null>(null)
  const [bekliyor, setBekliyor] = useState(false)
  const set = (k: keyof Taslak) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setT(x => ({ ...x, [k]: e.target.value }))

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    setHata(null); setBekliyor(true)
    try {
      const r = await fetch(mevcut ? `/api/pes/siparisler/${mevcut.id}` : '/api/pes/siparisler', {
        method: mevcut ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(t),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setHata(d.error ?? `Kaydedilemedi (${r.status})`); return }
      toast.success(mevcut ? 'Sipariş güncellendi' : 'Sipariş havuza eklendi')
      onKaydedildi()
    } catch {
      setHata('Bağlantı hatası')
    } finally { setBekliyor(false) }
  }

  return (
    <form onSubmit={kaydet} className="space-y-4 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{mevcut ? `${mevcut.is_emri_no} düzenle` : 'Havuza sipariş ekle'}</h2>
        <span className="text-[11.5px] text-faint">Atölye bu ekranda seçilmez — yerleştirme sihirbazında.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Sipariş no"><Input id="sp-is-emri-no" value={t.is_emri_no} onChange={set('is_emri_no')} disabled={!!mevcut} required placeholder="PO-2026-0412" /></Field>
        <Field label="Müşteri"><Input id="sp-musteri" value={t.musteri} onChange={set('musteri')} /></Field>
        <Field label="Model adı"><Input id="sp-model" value={t.model_adi} onChange={set('model_adi')} required /></Field>
        <Field label="Stil kodu"><Input id="sp-stil" value={t.stil_kodu} onChange={set('stil_kodu')} /></Field>
        <Field label="Sezon"><Input id="sp-sezon" value={t.sezon} onChange={set('sezon')} placeholder="2027 İlkbahar" /></Field>
        <Field label="Adet"><Input id="sp-adet" type="number" min={1} align="right" value={t.siparis_miktari} onChange={set('siparis_miktari')} required /></Field>
        <Field label="Teslim tarihi"><Input id="sp-teslim" type="date" value={t.teslim_tarihi} onChange={set('teslim_tarihi')} /></Field>
        <Field label="Öncelik">
          <Select id="sp-oncelik" value={t.oncelik} onChange={set('oncelik')}>
            {ONCELIKLER.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Künye <span className="font-normal normal-case tracking-normal">— yetkinlik eşleşmesi buradan</span></p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {KUNYE_ALANLARI.map(a => (
            <Field key={a.kolon} label={a.etiket}>
              <Select id={`sp-${a.kolon}`} value={t[a.kolon]} onChange={set(a.kolon)}>
                <option value="">—</option>
                {(secenekler[a.boyut] ?? []).map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </Select>
            </Field>
          ))}
          <Field label="Ana kumaşçı"><Input id="sp-kumasci" value={t.kumasci} onChange={set('kumasci')} placeholder="Bossa" /></Field>
        </div>
      </div>

      {hata && <p className="rounded-lg border border-danger-line bg-danger-soft/40 px-3 py-2 text-[12.5px] text-danger">{hata}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onKapat}>Vazgeç</Button>
        <Button type="submit" loading={bekliyor}>{mevcut ? 'Kaydet' : 'Havuza ekle'}</Button>
      </div>
    </form>
  )
}
