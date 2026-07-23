'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Bant yetenek profili editörü.
 *
 * Klasman panelindeki chip deneyiminin PES karşılığı: boyut boyut terimler,
 * tıklayarak seç/kaldır, listede yoksa "+ yeni terim".
 *
 * SEVİYE: seçili bir chip'e tekrar tıklamak seviyeyi çevirmez — kaldırır.
 * Seviye ayrı bir kontrolle değişir (chip üzerindeki 1/2/3), yoksa
 * "kaldırmak istedim, seviyesi değişti" hatası kaçınılmaz olurdu.
 */

const SEVIYE_ETIKET: Record<number, string> = {
  0: 'Yapamaz',
  1: 'Yapabilir',
  2: 'İyi',
  3: 'Uzman',
}

interface Deger { code: string; label: string; sort_order: number; tenant_id: string | null }
interface Boyut { code: string; label: string; sort_order: number; applies_to: string | null; values: Deger[] }
interface Secim { dimension_code: string; value_code: string; proficiency: number }

export default function YetenekEditoru({
  lineId,
  lineAdi,
}: {
  lineId: number
  lineAdi: string
}) {
  const [boyutlar, setBoyutlar] = useState<Boyut[]>([])
  const [secimler, setSecimler] = useState<Map<string, number>>(new Map())
  const [ilkHal, setIlkHal] = useState<string>('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'hata'; metin: string } | null>(null)
  const [yeniTerim, setYeniTerim] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()
  const router = useRouter()

  const anahtar = (d: string, v: string) => `${d}|${v}`

  useEffect(() => {
    let iptal = false
    ;(async () => {
      setYukleniyor(true)
      try {
        const [dRes, pRes] = await Promise.all([
          fetch('/api/pes/capabilities?action=dimensions'),
          fetch(`/api/pes/capabilities?action=line_profile&line_id=${lineId}`),
        ])
        if (!dRes.ok || !pRes.ok) throw new Error('Yüklenemedi')
        const d = await dRes.json()
        const p = await pRes.json()
        if (iptal) return

        const m = new Map<string, number>()
        for (const c of (p.capabilities ?? []) as Secim[]) {
          m.set(anahtar(c.dimension_code, c.value_code), c.proficiency ?? 1)
        }
        setBoyutlar(d.dimensions ?? [])
        setSecimler(m)
        setIlkHal(seriye(m))
      } catch {
        if (!iptal) setMesaj({ tip: 'hata', metin: 'Yetenek listesi yüklenemedi.' })
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    })()
    return () => { iptal = true }
  }, [lineId])

  /* Değişiklik var mı? Kaydet butonunu boşuna aktif tutmamak için. */
  const seriye = (m: Map<string, number>) =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')
  const degisti = useMemo(() => seriye(secimler) !== ilkHal, [secimler, ilkHal])

  function cevir(dim: string, val: string) {
    setSecimler((onceki) => {
      const m = new Map(onceki)
      const k = anahtar(dim, val)
      if (m.has(k)) m.delete(k)
      else m.set(k, 1)
      return m
    })
  }

  function seviyeAyarla(dim: string, val: string, seviye: number) {
    setSecimler((onceki) => {
      const m = new Map(onceki)
      m.set(anahtar(dim, val), seviye)
      return m
    })
  }

  async function terimEkle(dim: string) {
    const label = (yeniTerim[dim] ?? '').trim()
    if (!label) return
    setMesaj(null)
    try {
      const r = await fetch('/api/pes/capabilities/deger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension_code: dim, label }),
      })
      const d = await r.json()
      if (!r.ok) { setMesaj({ tip: 'hata', metin: d.error ?? 'Terim eklenemedi' }); return }

      /* Listeye ekle ve hemen seçili yap — kullanıcı zaten kullanmak için ekledi. */
      setBoyutlar((onceki) => onceki.map((b) => b.code !== dim || b.values.some((v) => v.code === d.value.code)
        ? b
        : { ...b, values: [...b.values, { ...d.value, sort_order: 999, tenant_id: 'yerel' }] }))
      setSecimler((onceki) => new Map(onceki).set(anahtar(dim, d.value.code), 1))
      setYeniTerim((o) => ({ ...o, [dim]: '' }))
      if (d.zatenVardi) setMesaj({ tip: 'ok', metin: `"${d.value.label}" katalogda zaten vardı, işaretlendi.` })
    } catch {
      setMesaj({ tip: 'hata', metin: 'Bağlantı hatası' })
    }
  }

  async function kaydet() {
    setKaydediliyor(true)
    setMesaj(null)
    try {
      const capabilities = [...secimler.entries()].map(([k, proficiency]) => {
        const [dimension_code, value_code] = k.split('|')
        return { dimension_code, value_code, proficiency }
      })
      const r = await fetch('/api/pes/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: lineId, capabilities }),
      })
      const d = await r.json()
      if (!r.ok) { setMesaj({ tip: 'hata', metin: d.error ?? 'Kaydedilemedi' }); return }
      setIlkHal(seriye(secimler))
      setMesaj({ tip: 'ok', metin: `${d.saved} yetenek kaydedildi.` })
      /* Sunucudan gelen özetler bu kayıtla eskiyor: bant sekmelerindeki yetenek
         sayaçları ve atölye detayındaki "N bant" özeti. Tazele. */
      startTransition(() => router.refresh())
    } catch {
      setMesaj({ tip: 'hata', metin: 'Bağlantı hatası' })
    } finally {
      setKaydediliyor(false)
    }
  }

  if (yukleniyor) return <p className="text-gray-400 text-sm">Yetenekler yükleniyor…</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 sticky top-0 bg-gray-50 py-3 z-10">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{lineAdi} — Yetenek Profili</h2>
          <p className="text-sm text-gray-500">{secimler.size} yetenek işaretli</p>
        </div>
        <button
          onClick={kaydet}
          disabled={!degisti || kaydediliyor}
          className="shrink-0 px-5 py-2 bg-[#197A56] text-white rounded-lg text-sm font-medium hover:bg-[#0E3E1B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {kaydediliyor ? 'Kaydediliyor…' : degisti ? 'Kaydet' : 'Kaydedildi'}
        </button>
      </div>

      {mesaj && (
        <div className={`text-sm px-4 py-2 rounded-lg border ${
          mesaj.tip === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-700'}`}>
          {mesaj.metin}
        </div>
      )}

      {boyutlar.map((b) => (
        <section key={b.code} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="font-semibold text-gray-900">{b.label}</h3>
            {b.applies_to && (
              <span className="text-xs text-gray-400">yalnız: {b.applies_to.replaceAll(',', ', ')}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {b.values.filter((v) => v?.code).map((v) => {
              const k = anahtar(b.code, v.code)
              const secili = secimler.has(k)
              const seviye = secimler.get(k) ?? 1
              return (
                <span key={v.code} className="inline-flex items-stretch rounded-full overflow-hidden border transition-colors"
                  style={{ borderColor: secili ? '#197A56' : '#e5e7eb' }}>
                  <button
                    onClick={() => cevir(b.code, v.code)}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      secili ? 'bg-[#197A56] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {v.label}
                  </button>
                  {secili && (
                    <select
                      value={seviye}
                      onChange={(e) => seviyeAyarla(b.code, v.code, Number(e.target.value))}
                      title="Yetkinlik seviyesi"
                      className="bg-emerald-50 text-emerald-900 text-xs px-1.5 border-l border-[#197A56] focus:outline-none cursor-pointer"
                    >
                      {[0, 1, 2, 3].map((s) => (
                        <option key={s} value={s}>{s} · {SEVIYE_ETIKET[s]}</option>
                      ))}
                    </select>
                  )}
                </span>
              )
            })}
          </div>

          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <input
              value={yeniTerim[b.code] ?? ''}
              onChange={(e) => setYeniTerim((o) => ({ ...o, [b.code]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); terimEkle(b.code) } }}
              placeholder={`Listede yoksa yeni ${b.label.toLocaleLowerCase('tr')} ekle…`}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#197A56]/20 focus:border-[#197A56]"
            />
            <button
              onClick={() => terimEkle(b.code)}
              disabled={!(yeniTerim[b.code] ?? '').trim()}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Ekle
            </button>
          </div>
        </section>
      ))}
    </div>
  )
}
