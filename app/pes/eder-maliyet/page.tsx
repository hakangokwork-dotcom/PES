'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, Fragment } from 'react'

/* ───────── Types ───────── */
interface KV3Urun {
  id: number
  kumas: string
  urun: string
  ozellik: string | null
  parca_sayisi: number
  islem_sayisi: number
}
interface EModelV3 {
  model_id: number
  model_adi: string
  plm_id: string | null
  siparis_adedi: number
  bolge: number
  donem: string
  gunluk_calisma_sn: number
  hedef_sure_sn: number
  kv3_urun_id: number
  kumas: string
  urun: string
  ozellik: string | null
  toplam_sure_sn: number
  toplam_sure_dk: number
  toplam_teorik_sn: number
  secili_parca_sayisi: number
  secili_islem_sayisi: number
  dk_maliyet_tl: number | null
  eder_maliyet_tl: number
}
interface Islem {
  id: number
  ana_grup: string | null
  parca: string | null
  grup: string | null
  islem_adi: string
  makine_tipi: string | null
  mtm_sn: number | null
  cevrim_sn: number | null
  kisi_sayisi: number
  sira_no: number
  aktif: boolean
  notlar: string | null
}
interface AnaGrupOzet {
  ana_grup: string
  islem_sayisi: number
  toplam_sure_sn: number
  toplam_teorik_sn: number
}
interface DkMaliyet { bolge: number; dk_maliyet_tl: number; donem: string }

const BOLGE_NAMES: Record<number, string> = {
  1: '1. Bölge', 2: '2. Bölge', 3: '3. Bölge', 4: '4. Bölge', 5: '5. Bölge', 6: '6. Bölge',
}

const ANA_GRUP_SIRA = ['Ön Bant', 'Arka Bant', 'Montaj', 'UKP', 'Yıkama', 'Son Montaj']
const ANA_GRUP_RENK: Record<string, string> = {
  'Ön Bant':    'bg-canvas    border-line   text-muted',
  'Arka Bant':  'bg-canvas  border-line text-muted',
  'Montaj':     'bg-emerald-50 border-emerald-200 text-emerald-900',
  'UKP':        'bg-amber-50   border-amber-200  text-amber-900',
  'Yıkama':     'bg-canvas    border-line   text-muted',
  'Son Montaj': 'bg-rose-50    border-rose-200   text-rose-900',
}

/* ───────── Wrapper ───────── */
export default function EderMaliyetWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}>
      <EderMaliyetPage />
    </Suspense>
  )
}

function EderMaliyetPage() {
  // State
  const [urunler, setUrunler] = useState<KV3Urun[]>([])
  const [kumaslar, setKumaslar] = useState<string[]>([])
  const [models, setModels] = useState<EModelV3[]>([])
  const [selectedModel, setSelectedModel] = useState<EModelV3 | null>(null)
  const [islemler, setIslemler] = useState<Islem[]>([])
  const [anaGruplar, setAnaGruplar] = useState<AnaGrupOzet[]>([])
  const [dkMaliyetler, setDkMaliyetler] = useState<DkMaliyet[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const [newForm, setNewForm] = useState({
    model_adi: '', plm_id: '', siparis_adedi: 0, bolge: 3, donem: '2026-04',
    gunluk_calisma_sn: 32400, hedef_sure_sn: 30, kumas: '', urun: '', ozellik: '',
  })
  const [addForm, setAddForm] = useState({
    ana_grup: 'Montaj', islem_adi: '', makine_tipi: '', cevrim_sn: 0, kisi_sayisi: 1,
  })

  /* ───────── Loaders ───────── */
  const loadUrunler = useCallback(async () => {
    const r = await fetch('/api/pes/kv3/urunler')
    const d = await r.json()
    setUrunler(d.urunler || []); setKumaslar(d.kumaslar || [])
  }, [])
  const loadModels = useCallback(async () => {
    const r = await fetch('/api/pes/eder/v3')
    const d = await r.json()
    setModels(d.models || [])
  }, [])
  const loadDkMaliyet = useCallback(async (donem: string) => {
    const r = await fetch(`/api/pes/eder/dk-maliyet?donem=${donem}`)
    const d = await r.json()
    setDkMaliyetler(d.maliyetler || [])
  }, [])
  const loadIslemler = useCallback(async (modelId: number) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/pes/eder/v3/${modelId}/islemler`)
      const d = await r.json()
      setIslemler(d.islemler || [])
      setAnaGruplar(d.anaGruplar || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadUrunler(); loadModels(); loadDkMaliyet('2026-04')
  }, [loadUrunler, loadModels, loadDkMaliyet])

  useEffect(() => {
    if (selectedModel) {
      loadIslemler(selectedModel.model_id)
      loadDkMaliyet(selectedModel.donem)
    }
  }, [selectedModel, loadIslemler, loadDkMaliyet])

  /* ───────── Derived ───────── */
  const filteredUrunler = useMemo(() => {
    if (!newForm.kumas) return urunler
    return urunler.filter(u => u.kumas === newForm.kumas)
  }, [urunler, newForm.kumas])

  const dkMaliyet = useMemo(() => {
    if (!selectedModel) return 0
    return dkMaliyetler.find(d => d.bolge === selectedModel.bolge)?.dk_maliyet_tl ?? 0
  }, [dkMaliyetler, selectedModel])

  // Group islemler by ana_grup
  const grouped = useMemo(() => {
    const m = new Map<string, Islem[]>()
    for (const g of ANA_GRUP_SIRA) m.set(g, [])
    for (const i of islemler) {
      const key = i.ana_grup && ANA_GRUP_SIRA.includes(i.ana_grup) ? i.ana_grup : 'Montaj'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(i)
    }
    return m
  }, [islemler])

  const totalSn = useMemo(() =>
    islemler.filter(i => i.aktif).reduce((s, i) => s + (Number(i.cevrim_sn) || 0), 0),
  [islemler])

  /* ───────── Actions ───────── */
  async function createModel() {
    if (!newForm.model_adi.trim() || !newForm.urun) { alert('Model adı ve ürün zorunlu'); return }
    const urun = urunler.find(u =>
      u.kumas === newForm.kumas && u.urun === newForm.urun && (u.ozellik || '') === newForm.ozellik
    )
    if (!urun) { alert('Ürün seçimi geçersiz'); return }

    setSaving(true)
    try {
      const r = await fetch('/api/pes/eder/v3', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_adi: newForm.model_adi,
          plm_id: newForm.plm_id || null,
          siparis_adedi: newForm.siparis_adedi,
          bolge: newForm.bolge,
          donem: newForm.donem,
          gunluk_calisma_sn: newForm.gunluk_calisma_sn,
          hedef_sure_sn: newForm.hedef_sure_sn,
          kv3_urun_id: urun.id,
          selected_parcalar: [],
        }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Hata')
      setShowNew(false)
      setNewForm({ ...newForm, model_adi: '', plm_id: '', siparis_adedi: 0, kumas: '', urun: '', ozellik: '' })
      await loadModels()
    } catch (e) { alert(`Hata: ${(e as Error).message}`) }
    finally { setSaving(false) }
  }

  async function patchIslem(id: number, patch: Partial<Islem>) {
    setSaving(true)
    try {
      await fetch('/api/pes/eder/v3/islem', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      if (selectedModel) {
        await loadIslemler(selectedModel.model_id)
        await loadModels()
      }
    } finally { setSaving(false) }
  }

  async function deleteIslem(id: number) {
    if (!confirm('Operasyon silinsin mi?')) return
    await fetch(`/api/pes/eder/v3/islem?id=${id}`, { method: 'DELETE' })
    if (selectedModel) { await loadIslemler(selectedModel.model_id); await loadModels() }
  }

  async function addIslem() {
    if (!selectedModel || !addForm.islem_adi.trim()) { alert('İşlem adı gerekli'); return }
    setSaving(true)
    try {
      await fetch(`/api/pes/eder/v3/${selectedModel.model_id}/islemler`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ana_grup: addForm.ana_grup,
          islem_adi: addForm.islem_adi,
          makine_tipi: addForm.makine_tipi || null,
          mtm_sn: addForm.cevrim_sn,
          cevrim_sn: addForm.cevrim_sn,
          kisi_sayisi: addForm.kisi_sayisi,
        }),
      })
      setAddForm({ ana_grup: 'Montaj', islem_adi: '', makine_tipi: '', cevrim_sn: 0, kisi_sayisi: 1 })
      setShowAdd(false)
      await loadIslemler(selectedModel.model_id)
      await loadModels()
    } finally { setSaving(false) }
  }

  async function deleteModel(id: number) {
    if (!confirm('Model silinsin mi?')) return
    await fetch(`/api/pes/eder/v3?id=${id}`, { method: 'DELETE' })
    if (selectedModel?.model_id === id) setSelectedModel(null)
    await loadModels()
  }

  /* ───────── Helpers ───────── */
  function calcDakikaAdet(cevrim_sn: number | null): string {
    if (!cevrim_sn || cevrim_sn <= 0) return '—'
    return (60 / Number(cevrim_sn)).toFixed(2)
  }
  function calcGunlukAdet(cevrim_sn: number | null, gunlukDk = 540): string {
    if (!cevrim_sn || cevrim_sn <= 0) return '—'
    return Math.floor((gunlukDk * 60) / Number(cevrim_sn)).toString()
  }

  /* ───────── UI ───────── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Atölye Fiyatlama (Eder Maliyet)</h1>
          <p className="text-sm text-faint mt-1">
            konfeksiyon_v3 · Kumaş › Ürün › Özellik · Ana Grup: Ön Bant / Arka Bant / Montaj / UKP / Son Montaj
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover">
          {showNew ? 'İptal' : '+ Yeni Model'}
        </button>
      </div>

      {/* New Model Form */}
      {showNew && (
        <div className="bg-white border border-line-soft rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-ink">Yeni Model</h3>
          <p className="text-xs text-faint">
            Kaydettiğinizde seçilen ürünün tüm operasyonları (konfeksiyon_v3 kataloğundan) otomatik olarak modele kopyalanır. Sonra tek tek düzenleyebilir/silebilirsiniz.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Model Adı *">
              <input className="input" value={newForm.model_adi}
                onChange={e => setNewForm({ ...newForm, model_adi: e.target.value })} />
            </Field>
            <Field label="PLM ID">
              <input className="input" value={newForm.plm_id}
                onChange={e => setNewForm({ ...newForm, plm_id: e.target.value })} />
            </Field>
            <Field label="Sipariş Adedi">
              <input type="number" className="input" value={newForm.siparis_adedi}
                onChange={e => setNewForm({ ...newForm, siparis_adedi: Number(e.target.value) })} />
            </Field>
            <Field label="Bölge">
              <select className="input" value={newForm.bolge}
                onChange={e => setNewForm({ ...newForm, bolge: Number(e.target.value) })}>
                {Object.entries(BOLGE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Dönem">
              <input className="input" value={newForm.donem}
                onChange={e => setNewForm({ ...newForm, donem: e.target.value })} placeholder="2026-04" />
            </Field>
            <Field label="Günlük Çalışma (sn)">
              <input type="number" className="input" value={newForm.gunluk_calisma_sn}
                onChange={e => setNewForm({ ...newForm, gunluk_calisma_sn: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-faint mb-3">ÜRÜN SEÇİMİ</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Kumaş">
                <select className="input" value={newForm.kumas}
                  onChange={e => setNewForm({ ...newForm, kumas: e.target.value, urun: '', ozellik: '' })}>
                  <option value="">Seçin...</option>
                  {kumaslar.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="Ürün">
                <select className="input" value={newForm.urun} disabled={!newForm.kumas}
                  onChange={e => setNewForm({ ...newForm, urun: e.target.value, ozellik: '' })}>
                  <option value="">Seçin...</option>
                  {[...new Set(filteredUrunler.map(u => u.urun))].map(u =>
                    <option key={u} value={u}>{u}</option>
                  )}
                </select>
              </Field>
              <Field label="Özellik">
                <select className="input" value={newForm.ozellik} disabled={!newForm.urun}
                  onChange={e => setNewForm({ ...newForm, ozellik: e.target.value })}>
                  <option value="">(varsayılan)</option>
                  {filteredUrunler
                    .filter(u => u.urun === newForm.urun && u.ozellik)
                    .map(u => <option key={u.id} value={u.ozellik!}>{u.ozellik}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <button disabled={saving} onClick={createModel}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
            {saving ? 'Kaydediliyor...' : 'Modeli Oluştur'}
          </button>
        </div>
      )}

      {/* Main */}
      <div className="grid grid-cols-12 gap-5">
        {/* Models list */}
        <div className="col-span-12 lg:col-span-3 bg-white border border-line-soft rounded-xl">
          <div className="px-4 py-3 border-b border-line-soft">
            <h3 className="font-semibold text-sm text-ink">Modeller ({models.length})</h3>
          </div>
          <div className="max-h-[800px] overflow-auto">
            {models.length === 0 && <div className="p-4 text-xs text-faint">Henüz model yok</div>}
            {models.map(m => (
              <button key={m.model_id} onClick={() => setSelectedModel(m)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                  selectedModel?.model_id === m.model_id ? 'bg-emerald-50' : 'hover:bg-canvas'
                }`}>
                <div className="font-medium text-sm text-ink truncate">{m.model_adi}</div>
                <div className="text-[11px] text-faint mt-0.5 truncate">
                  {m.kumas} · {m.urun}{m.ozellik ? ` · ${m.ozellik}` : ''}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px]">
                  <span className="text-muted">{Number(m.toplam_sure_dk).toFixed(1)} dk</span>
                  <span className="font-medium text-accent">{Number(m.eder_maliyet_tl).toFixed(2)} TL</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="col-span-12 lg:col-span-9 space-y-5">
          {!selectedModel && (
            <div className="bg-white border border-line-soft rounded-xl p-10 text-center text-faint">
              Bir model seçin veya yeni model oluşturun
            </div>
          )}
          {selectedModel && (
            <>
              {/* Model Header */}
              <div className="bg-white border border-line-soft rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{selectedModel.model_adi}</h2>
                    <p className="text-sm text-faint mt-1">
                      {selectedModel.kumas} › {selectedModel.urun}{selectedModel.ozellik ? ` › ${selectedModel.ozellik}` : ''}
                      {selectedModel.plm_id && <span className="ml-2 text-faint">PLM: {selectedModel.plm_id}</span>}
                    </p>
                  </div>
                  <button onClick={() => deleteModel(selectedModel.model_id)}
                    className="text-xs text-red-600 hover:text-red-800">Modeli Sil</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-4 border-t border-gray-100">
                  <Stat label="Operasyon" value={`${selectedModel.secili_islem_sayisi}`} sub={`${islemler.length} toplam`} />
                  <Stat label="Toplam Süre (teorik)" value={`${(Number(selectedModel.toplam_teorik_sn) / 60).toFixed(2)} dk`} />
                  <Stat label="Toplam Süre (pratik)" value={`${(totalSn / 60).toFixed(2)} dk`} highlight />
                  <Stat label="TL/dk" value={Number(dkMaliyet).toFixed(2)} sub={BOLGE_NAMES[selectedModel.bolge]} />
                  <Stat label="Eder Maliyet" value={`${((totalSn / 60) * Number(dkMaliyet)).toFixed(2)} TL`} highlight />
                </div>
              </div>

              {/* Operasyon Tablosu */}
              <div className="bg-white border border-line-soft rounded-xl">
                <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-ink">
                    Operasyon Kırılımı — Ana Gruplar
                  </h3>
                  <button onClick={() => setShowAdd(!showAdd)}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                    {showAdd ? 'İptal' : '+ Operasyon Ekle'}
                  </button>
                </div>

                {/* Add op form */}
                {showAdd && (
                  <div className="px-5 py-4 bg-canvas border-b border-line-soft">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <Field label="Ana Grup">
                        <select className="input" value={addForm.ana_grup}
                          onChange={e => setAddForm({ ...addForm, ana_grup: e.target.value })}>
                          {ANA_GRUP_SIRA.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </Field>
                      <Field label="İşlem Adı *">
                        <input className="input" value={addForm.islem_adi}
                          onChange={e => setAddForm({ ...addForm, islem_adi: e.target.value })}
                          placeholder="Örn: Cep dikiş" />
                      </Field>
                      <Field label="Makine Tipi">
                        <input className="input" value={addForm.makine_tipi}
                          onChange={e => setAddForm({ ...addForm, makine_tipi: e.target.value })} />
                      </Field>
                      <Field label="Çevrim (sn)">
                        <input type="number" step="0.01" className="input" value={addForm.cevrim_sn}
                          onChange={e => setAddForm({ ...addForm, cevrim_sn: Number(e.target.value) })} />
                      </Field>
                      <Field label="Kişi">
                        <input type="number" step="0.5" className="input" value={addForm.kisi_sayisi}
                          onChange={e => setAddForm({ ...addForm, kisi_sayisi: Number(e.target.value) })} />
                      </Field>
                      <button onClick={addIslem} disabled={saving}
                        className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                        Ekle
                      </button>
                    </div>
                  </div>
                )}

                {loading && <div className="p-4 text-xs text-faint">Yükleniyor...</div>}
                {!loading && islemler.length === 0 && (
                  <div className="p-8 text-center text-faint text-sm">
                    Bu model için operasyon yok. Yeni model oluşturduğunda katalog otomatik yüklenir.
                  </div>
                )}
                {!loading && islemler.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-canvas text-faint uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium w-[14%]">Ana Grup</th>
                          <th className="px-3 py-2 text-left font-medium">Operasyon Adı</th>
                          <th className="px-3 py-2 text-left font-medium w-[10%]">Makine</th>
                          <th className="px-3 py-2 text-right font-medium w-[8%]">MTM (sn)</th>
                          <th className="px-3 py-2 text-right font-medium w-[10%]">Çevrim (sn)</th>
                          <th className="px-3 py-2 text-right font-medium w-[8%]">Dk/adet</th>
                          <th className="px-3 py-2 text-right font-medium w-[10%]">Günlük (540 dk)</th>
                          <th className="px-3 py-2 text-center font-medium w-[6%]">Aktif</th>
                          <th className="px-3 py-2 w-[5%]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ANA_GRUP_SIRA.map(grup => {
                          const list = grouped.get(grup) || []
                          if (list.length === 0) return null
                          const ozet = anaGruplar.find(a => a.ana_grup === grup)
                          const renk = ANA_GRUP_RENK[grup] || 'bg-canvas border-line-soft'
                          return (
                            <Fragment key={grup}>
                              {/* Ana grup başlık satırı */}
                              <tr className={`${renk} border-t border-b font-semibold`}>
                                <td colSpan={9} className="px-3 py-1.5 text-[11px] uppercase tracking-wide">
                                  {grup}
                                  <span className="ml-3 font-normal text-[11px] opacity-70">
                                    {list.filter(i => i.aktif).length} aktif / {list.length} toplam
                                  </span>
                                </td>
                              </tr>
                              {list.map(i => (
                                <IslemRow key={i.id} islem={i}
                                  onPatch={p => patchIslem(i.id, p)}
                                  onDelete={() => deleteIslem(i.id)}
                                  calcDakikaAdet={calcDakikaAdet}
                                  calcGunlukAdet={calcGunlukAdet}
                                  saving={saving}
                                />
                              ))}
                              {/* Kontrol / özet satırı */}
                              {ozet && (
                                <tr className="bg-yellow-50 border-y-2 border-yellow-200 font-medium">
                                  <td className="px-3 py-2 text-[11px] text-yellow-900">
                                    {grup === 'Ön Bant' ? 'Ön Kontrol' :
                                     grup === 'Arka Bant' ? 'Arka Kontrol' :
                                     grup === 'Montaj' ? 'İç Kontrol' :
                                     grup === 'Son Montaj' ? 'Son Kontrol' :
                                     `${grup} Toplam`}
                                  </td>
                                  <td></td><td></td>
                                  <td className="px-3 py-2 text-right text-yellow-900 font-mono">
                                    {(Number(ozet.toplam_teorik_sn) / 60).toFixed(2)} dk
                                  </td>
                                  <td className="px-3 py-2 text-right text-yellow-900 font-mono">
                                    {(Number(ozet.toplam_sure_sn) / 60).toFixed(2)} dk
                                  </td>
                                  <td colSpan={4}></td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                        {/* Genel toplam */}
                        <tr className="bg-emerald-100 border-y-2 border-emerald-300 font-bold">
                          <td colSpan={3} className="px-3 py-2.5 text-emerald-900 uppercase text-[11px]">
                            Toplam (Eder Maliyet)
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-900 font-mono">
                            {(Number(selectedModel.toplam_teorik_sn) / 60).toFixed(2)} dk
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-900 font-mono">
                            {(totalSn / 60).toFixed(2)} dk
                          </td>
                          <td colSpan={3} className="px-3 py-2.5 text-right text-emerald-900 font-mono">
                            {((totalSn / 60) * Number(dkMaliyet)).toFixed(2)} TL
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 2px rgba(25, 122, 86, 0.15);
        }
        .input-sm {
          width: 100%;
          padding: 2px 6px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          font-size: 11px;
          text-align: right;
          font-family: ui-monospace, monospace;
        }
        .input-sm:focus {
          outline: none;
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  )
}

/* ───────── Row Component ───────── */
function IslemRow({ islem, onPatch, onDelete, calcDakikaAdet, calcGunlukAdet, saving }: {
  islem: Islem
  onPatch: (p: Partial<Islem>) => void
  onDelete: () => void
  calcDakikaAdet: (cevrim_sn: number | null) => string
  calcGunlukAdet: (cevrim_sn: number | null) => string
  saving: boolean
}) {
  const [local, setLocal] = useState({
    cevrim_sn: islem.cevrim_sn?.toString() ?? '',
    kisi_sayisi: islem.kisi_sayisi?.toString() ?? '1',
    ana_grup: islem.ana_grup || 'Montaj',
  })
  useEffect(() => {
    setLocal({
      cevrim_sn: islem.cevrim_sn?.toString() ?? '',
      kisi_sayisi: islem.kisi_sayisi?.toString() ?? '1',
      ana_grup: islem.ana_grup || 'Montaj',
    })
  }, [islem.id, islem.cevrim_sn, islem.kisi_sayisi, islem.ana_grup])

  function commitCevrim() {
    const v = Number(local.cevrim_sn)
    if (isNaN(v)) return
    if (v === Number(islem.cevrim_sn)) return
    onPatch({ cevrim_sn: v })
  }

  return (
    <tr className={`border-b border-gray-100 hover:bg-canvas ${!islem.aktif ? 'opacity-40' : ''}`}>
      <td className="px-3 py-1.5">
        <select className="text-[11px] px-1 py-0.5 bg-transparent border border-line-soft rounded w-full"
          value={local.ana_grup}
          onChange={e => { setLocal({ ...local, ana_grup: e.target.value }); onPatch({ ana_grup: e.target.value }) }}
          disabled={saving}>
          {['Ön Bant', 'Arka Bant', 'Montaj', 'UKP', 'Yıkama', 'Son Montaj'].map(g =>
            <option key={g} value={g}>{g}</option>
          )}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <div className="text-ink truncate max-w-[320px]" title={islem.islem_adi}>{islem.islem_adi}</div>
        {islem.parca && <div className="text-[11px] text-faint truncate max-w-[320px]" title={islem.parca}>{islem.parca}</div>}
      </td>
      <td className="px-3 py-1.5 text-muted text-[11px]">
        {islem.makine_tipi || '—'}
      </td>
      <td className="px-3 py-1.5 text-right text-gray-700 font-mono">
        {islem.mtm_sn != null ? Number(islem.mtm_sn).toFixed(2) : '—'}
      </td>
      <td className="px-3 py-1.5">
        <input type="number" step="0.01" className="input-sm" value={local.cevrim_sn}
          onChange={e => setLocal({ ...local, cevrim_sn: e.target.value })}
          onBlur={commitCevrim}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          disabled={saving || !islem.aktif}
        />
      </td>
      <td className="px-3 py-1.5 text-right text-ink font-mono">
        {calcDakikaAdet(islem.cevrim_sn)}
      </td>
      <td className="px-3 py-1.5 text-right text-ink font-mono">
        {calcGunlukAdet(islem.cevrim_sn)}
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={islem.aktif}
          onChange={e => onPatch({ aktif: e.target.checked })}
          disabled={saving} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <button onClick={onDelete} className="text-red-500 hover:text-red-700 text-xs" disabled={saving}>×</button>
      </td>
    </tr>
  )
}

/* ───────── Primitives ───────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-faint mb-1">{label}</label>
      {children}
    </div>
  )
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${highlight ? 'text-accent' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  )
}
