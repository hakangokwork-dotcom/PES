'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export type TahminOzet = { id: number; departman: string; ad: string; kumas: string | null; durum: string; toplam: number }
export type KalemDetay = {
  id: number; ad: string; adet: number; samDk: number | null; samKaynak: string | null
  urunTipiId: number | null; profil: number[]
  klasman_kodu: string | null; kumas_turu_kodu: string | null
  kumas_grubu_kodu: string | null; cinsiyet_yas_kodu: string | null
  tuketilen: number; tahsisli: number
}
import type { KapasiteKaynagi } from '@/lib/pes/yillik-plan'

const KAYNAK_ETIKET: Record<KapasiteKaynagi, string | null> = {
  operator: null, calisan: 'kişi', hedef: 'hedef≈', yok: 'veri yok',
}
const KAYNAK_ACIKLAMA: Record<KapasiteKaynagi, string> = {
  operator: 'Kapasite: hatlardaki operatör sayısından',
  calisan: 'Kapasite: toplam çalışan sayısından, dikim payıyla tahmin',
  hedef: "Kapasite: günlük hat hedefi × bu kalemin SAM'ı (kaba tahmin)",
  yok: 'Kapasite verisi yok; öneriye girmez',
}

export type IzgaraSatiri = {
  workshopId: number; kod: string; ad: string
  kaynak: KapasiteKaynagi
  yuzde: (number | null)[]
  uyum: 'uygun' | 'uyumsuz' | 'bilinmiyor' | null
  neden: string | null
  hucre: ({ adet: number; kaynak: 'oneri' | 'elle' } | null)[]
}

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const tr = new Intl.NumberFormat('tr-TR')

function renk(y: number | null): string {
  if (y === null) return 'bg-slate-100 text-slate-400'
  if (y > 100) return 'bg-red-100 text-red-700'
  if (y > 85) return 'bg-amber-100 text-amber-800'
  return 'bg-emerald-50 text-emerald-800'
}

export default function YillikPlan(p: {
  yil: number; tahminler: TahminOzet[]; tahminId: number
  kalemler: KalemDetay[]; kalemId: number; ihtiyac: number[] | null
  izgara: IzgaraSatiri[]; samsizPo: number
  urunTipleri: Array<{ id: number; ad: string; grup: string | null }>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const git = (degis: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(degis)) v === null ? q.delete(k) : q.set(k, v)
    router.push(`/pes/yillik-plan?${q.toString()}`)
  }

  async function istek(yol: string, method: string, govde?: unknown) {
    setHata(null)
    const r = await fetch(yol, {
      method, headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setHata(j.error ?? `Hata ${r.status}`); return null }
    basla(() => router.refresh())
    return j
  }

  const secili = p.kalemler.find((k) => k.id === p.kalemId) ?? null
  const tahmin = p.tahminler.find((t) => t.id === p.tahminId) ?? null
  const kalemToplamAy = (m: number) => p.izgara.reduce((t, s) => t + (s.hucre[m]?.adet ?? 0), 0)

  async function tahminEkle(f: FormData) {
    const j = await istek('/api/pes/yillik-plan', 'POST', {
      yil: p.yil, departman: f.get('departman'), ad: f.get('ad'), kumas: f.get('kumas'),
    })
    if (j) git({ tahmin: String(j.id), kalem: null })
  }

  async function kalemEkle(f: FormData) {
    const j = await istek('/api/pes/yillik-plan/kalem', 'POST', {
      tahminId: p.tahminId, ad: f.get('ad'), adet: Number(f.get('adet')),
      urunTipiId: f.get('urunTipiId') || null, samDk: f.get('samDk') || null,
      klasman_kodu: f.get('klasman_kodu'), kumas_turu_kodu: f.get('kumas_turu_kodu'),
      kumas_grubu_kodu: f.get('kumas_grubu_kodu'), cinsiyet_yas_kodu: f.get('cinsiyet_yas_kodu'),
    })
    if (j) git({ kalem: String(j.id) })
  }

  async function profilKaydet(f: FormData) {
    const profil = AYLAR.map((_, i) => Number(f.get(`p${i}`)))
    await istek('/api/pes/yillik-plan/kalem', 'PATCH', { id: p.kalemId, aylikProfil: profil })
  }

  async function oner() {
    const j = await istek('/api/pes/yillik-plan/oneri', 'POST', { kalemId: p.kalemId })
    if (j) {
      const kalan = (j.tahsisEdilemeyen as number[]).reduce((a, b) => a + b, 0)
      setBilgi(kalan > 0 ? `Tahsis edilemeyen: ${tr.format(kalan)} adet` : 'Tümü tahsis edildi')
    }
  }

  async function hucreKaydet(workshopId: number, ay: number, deger: string) {
    const adet = Math.max(0, Math.floor(Number(deger) || 0))
    await istek('/api/pes/yillik-plan/tahsis', 'PUT', { kalemId: p.kalemId, workshopId, ay, adet })
  }

  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm w-full'
  const btn = 'rounded bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-50'

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Yıllık Talep Planı</h1>
        <select className="border rounded px-2 py-1 text-sm" value={p.yil}
          onChange={(e) => git({ yil: e.target.value, tahmin: null, kalem: null })}>
          {[p.yil - 1, p.yil, p.yil + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {p.samsizPo > 0 && (
          <span className="text-xs text-amber-700">{p.samsizPo} siparişte SAM yok — yüke katılmadı</span>
        )}
        {bekliyor && <span className="text-xs text-slate-500">Güncelleniyor…</span>}
      </header>
      {hata && <div className="rounded bg-red-50 text-red-700 text-sm px-3 py-2">{hata}</div>}
      {bilgi && <div className="rounded bg-slate-50 text-slate-700 text-sm px-3 py-2">{bilgi}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-600">Tahminler</h2>
            <ul className="space-y-1">
              {p.tahminler.map((t) => (
                <li key={t.id}>
                  <button onClick={() => git({ tahmin: String(t.id), kalem: null })}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm ${t.id === p.tahminId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                    <div className="font-medium">{t.departman} — {t.ad}</div>
                    <div className="text-xs opacity-75">{tr.format(t.toplam)} adet · {t.durum === 'Onayli' ? 'Onaylı' : 'Taslak'}</div>
                  </button>
                </li>
              ))}
            </ul>
            <form action={tahminEkle} className="space-y-1 border-t pt-2">
              <input name="departman" placeholder="Tedarikçi departmanı" className={inp} required />
              <input name="ad" placeholder="Tahmin adı (ör. Pantolon 2027)" className={inp} required />
              <input name="kumas" placeholder="Kumaş (isteğe bağlı)" className={inp} />
              <button className={btn} disabled={bekliyor}>Tahmin ekle</button>
            </form>
          </section>

          {tahmin && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-600">Kalemler</h2>
                <button className="text-xs underline" onClick={() => istek('/api/pes/yillik-plan', 'PATCH',
                  { id: tahmin.id, durum: tahmin.durum === 'Onayli' ? 'Taslak' : 'Onayli' })}>
                  {tahmin.durum === 'Onayli' ? 'Taslağa al' : 'Onayla'}
                </button>
              </div>
              <ul className="space-y-1">
                {p.kalemler.map((k) => (
                  <li key={k.id}>
                    <button onClick={() => git({ kalem: String(k.id) })}
                      className={`w-full text-left rounded px-2 py-1.5 text-sm ${k.id === p.kalemId ? 'bg-slate-200' : 'hover:bg-slate-100'}`}>
                      <div className="font-medium">{k.ad}</div>
                      <div className="text-xs text-slate-600">
                        {tr.format(k.adet)} adet · tahsisli {tr.format(k.tahsisli)} · PO {tr.format(k.tuketilen)}
                        {k.samDk === null ? <span className="text-red-600"> · SAM eksik</span>
                          : <> · {k.samDk.toFixed(1)} dk ({k.samKaynak})</>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <form action={kalemEkle} className="space-y-1 border-t pt-2">
                <input name="ad" placeholder="Kalem adı (ör. 5-cep denim)" className={inp} required />
                <input name="adet" type="number" min={1} placeholder="Adet" className={inp} required />
                <select name="urunTipiId" className={inp} defaultValue="">
                  <option value="">Ürün tipi (SAM referansı)</option>
                  {p.urunTipleri.map((u) => <option key={u.id} value={u.id}>{u.grup ? `${u.grup} / ` : ''}{u.ad}</option>)}
                </select>
                <input name="samDk" type="number" step="0.01" min={0} placeholder="SAM dk (boşsa referans)" className={inp} />
                <div className="grid grid-cols-2 gap-1">
                  <input name="klasman_kodu" placeholder="Klasman kodu" className={inp} />
                  <input name="kumas_turu_kodu" placeholder="Kumaş türü kodu" className={inp} />
                  <input name="kumas_grubu_kodu" placeholder="Kumaş grubu kodu" className={inp} />
                  <input name="cinsiyet_yas_kodu" placeholder="Cinsiyet/yaş kodu" className={inp} />
                </div>
                <button className={btn} disabled={bekliyor}>Kalem ekle</button>
              </form>
            </section>
          )}
        </aside>

        <main className="space-y-3 min-w-0">
          {secili && p.ihtiyac && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-medium">{secili.ad}</h2>
                <button className={btn} onClick={oner} disabled={bekliyor || secili.samDk === null}>Öner</button>
                <span className="text-xs text-slate-500">Öneri yalnız “öneri” hücrelerini yeniden yazar; elle girdikleriniz korunur.</span>
              </div>
              <form action={profilKaydet} className="flex flex-wrap items-end gap-1">
                {AYLAR.map((a, i) => (
                  <label key={a} className="text-[10px] text-slate-500 w-14">
                    {a} %
                    <input name={`p${i}`} type="number" step="0.01" min={0}
                      defaultValue={Number(secili.profil[i].toFixed(2))} className={inp} />
                  </label>
                ))}
                <button className="text-xs underline ml-2">Profili kaydet</button>
              </form>
            </section>
          )}

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 sticky left-0 bg-white">Atölye</th>
                  {AYLAR.map((a) => <th key={a} className="px-1 py-1 w-20">{a}</th>)}
                </tr>
                {p.ihtiyac && (
                  <tr className="text-slate-600">
                    <th className="text-left px-2 py-1 sticky left-0 bg-white font-normal">İhtiyaç / tahsisli</th>
                    {p.ihtiyac.map((n, m) => {
                      const t = kalemToplamAy(m)
                      return <td key={m} className={`px-1 text-center ${t < n ? 'text-red-600' : ''}`}>{tr.format(n)} / {tr.format(t)}</td>
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {p.izgara.map((s) => {
                  const gri = secili && s.uyum !== 'uygun'
                  return (
                    <tr key={s.workshopId} className={gri ? 'opacity-50' : ''} title={s.neden ?? undefined}>
                      <td className="px-2 py-1 sticky left-0 bg-white whitespace-nowrap">
                        <span className="font-medium">{s.kod}</span> {s.ad}
                        {KAYNAK_ETIKET[s.kaynak] && (
                          <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500"
                                title={KAYNAK_ACIKLAMA[s.kaynak]}>{KAYNAK_ETIKET[s.kaynak]}</span>
                        )}
                      </td>
                      {s.yuzde.map((y, m) => (
                        <td key={m} className={`px-1 py-1 text-center align-top ${renk(y)}`}>
                          <div>{y === null ? '—' : `%${Math.round(y)}`}</div>
                          {secili && (
                            <input key={`${s.workshopId}-${m}-${s.hucre[m]?.adet ?? 0}`}
                              defaultValue={s.hucre[m]?.adet ?? ''} inputMode="numeric"
                              className={`w-16 mt-0.5 rounded border text-right px-1 ${s.hucre[m]?.kaynak === 'elle' ? 'border-blue-500' : 'border-slate-300'}`}
                              onBlur={(e) => {
                                const eski = String(s.hucre[m]?.adet ?? '')
                                if (e.target.value !== eski) hucreKaydet(s.workshopId, m + 1, e.target.value)
                              }} />
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Yüzde = (gerçek PO + tüm tahsisler) dk ÷ kapasite dk. Mavi çerçeve: elle girilen. Soluk satır: yetenek uyumu yok ya da kontrol edilemedi (satırın üzerine gelin).
          </p>
        </main>
      </div>
    </div>
  )
}
