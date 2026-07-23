'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

/* Yetenek arama sol paneli: boyut → sayaçlı değer listesi, checkbox.
 *
 * Durum URL'de (?klasman=GOMLEK,ELBISE&kumas_turu=KETEN) — sayfa server
 * component kalsın, kombinasyon paylaşılabilsin. Seçim değişince URL güncellenir,
 * server yeniden çalışır ve yeni sayaçlarla döner.
 *
 * Sayaç mantığı (faceted): her değerin yanındaki sayı, "o değeri de seçersem
 * kaç bant kalır" — o boyut HARİÇ diğer filtreler uygulanmış hali. Sıfıra
 * götüren seçim tıklanmadan görülür. */

export type DegerSayac = { code: string; label: string; adet: number }
export type BoyutBlok = { code: string; label: string; degerler: DegerSayac[] }

export default function YetenekFiltrePaneli({
  bloklar,
  secili,
}: {
  bloklar: BoyutBlok[]
  secili: Record<string, string[]>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bekliyor, startTransition] = useTransition()

  function degistir(boyut: string, code: string, isaretli: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    const mevcut = new Set((params.get(boyut) ?? '').split(',').filter(Boolean))
    if (isaretli) mevcut.add(code)
    else mevcut.delete(code)
    if (mevcut.size) params.set(boyut, [...mevcut].join(','))
    else params.delete(boyut)
    startTransition(() => router.push(`/pes/yetenek-arama?${params.toString()}`))
  }

  function temizle() {
    startTransition(() => router.push('/pes/yetenek-arama'))
  }

  const seciliSayisi = Object.values(secili).reduce((t, v) => t + v.length, 0)

  return (
    <div className={`space-y-4 ${bekliyor ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Yetenek Filtreleri</h2>
        {seciliSayisi > 0 && (
          <button onClick={temizle} className="text-xs text-gray-500 hover:text-gray-800 underline">
            Temizle ({seciliSayisi})
          </button>
        )}
      </div>

      {bloklar.map((b) => {
        const seciliDegerler = new Set(secili[b.code] ?? [])
        return (
          <div key={b.code} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 border-b border-gray-200">
              {b.label}
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {b.degerler.map((d) => {
                const isaretli = seciliDegerler.has(d.code)
                const kapali = d.adet === 0 && !isaretli
                return (
                  <label
                    key={d.code}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-[13px] cursor-pointer transition-colors ${
                      isaretli ? 'bg-emerald-50' : kapali ? 'opacity-40' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isaretli}
                      disabled={kapali}
                      onChange={(e) => degistir(b.code, d.code, e.target.checked)}
                      className="accent-[#197A56]"
                    />
                    <span className="flex-1 text-gray-700 truncate">{d.label}</span>
                    <span className={`text-[11px] tabular-nums ${isaretli ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                      {d.adet}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
