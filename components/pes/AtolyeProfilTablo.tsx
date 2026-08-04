'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { AtolyeProfilSatiri, DenetimDurum } from '@/lib/pes/atolye-profil'

const DURUM_STIL: Record<DenetimDurum, string> = {
  SURESI_DOLMUS: 'bg-red-100 text-red-700',
  YAKLASIYOR: 'bg-amber-100 text-amber-700',
  GECERLI: 'bg-green-100 text-green-700',
  YOK: 'bg-gray-100 text-gray-500',
}
const DURUM_KISA: Record<DenetimDurum, string> = {
  SURESI_DOLMUS: 'Süresi dolmuş',
  YAKLASIYOR: 'Yaklaşıyor',
  GECERLI: 'Geçerli',
  YOK: 'Yok',
}

type DenetimTipi = 'hepsi' | 'wkys' | 'sosyal'

function tarihTR(s: string | null) {
  if (!s) return '—'
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}

function DurumRozet({ durum, kalan }: { durum: DenetimDurum; kalan: number | null }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DURUM_STIL[durum]}`}>
      {DURUM_KISA[durum]}
      {durum !== 'YOK' && kalan !== null && (
        <span className="ml-1 opacity-70">
          {kalan < 0 ? `${Math.abs(kalan)} gün geçti` : `${kalan} gün`}
        </span>
      )}
    </span>
  )
}

export default function AtolyeProfilTablo({
  satirlar,
  arsivDahil,
}: {
  satirlar: AtolyeProfilSatiri[]
  arsivDahil: boolean
}) {
  const [arama, setArama] = useState('')
  const [durumFiltre, setDurumFiltre] = useState<DenetimDurum | 'hepsi'>('hepsi')
  const [tip, setTip] = useState<DenetimTipi>('hepsi')
  const [tedarik, setTedarik] = useState('hepsi')

  const tedarikSecenekleri = useMemo(
    () => [...new Set(satirlar.map((s) => s.tedarik_mudurlugu).filter(Boolean))].sort() as string[],
    [satirlar]
  )

  /* Bir atölyenin "durumu" seçili denetim tipine göre değişir; hepsi
     seçiliyken en kötü durum baz alınır (rapor amacı en acili bulmak). */
  const durumlar = (s: AtolyeProfilSatiri): DenetimDurum[] =>
    tip === 'wkys' ? [s.wkys_durum] : tip === 'sosyal' ? [s.sosyal_durum] : [s.wkys_durum, s.sosyal_durum]

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    return satirlar.filter((s) => {
      if (q) {
        const alan = `${s.code} ${s.name} ${s.city ?? ''} ${s.fku ?? ''} ${s.teknik_mudur ?? ''} ${s.t_kod ?? ''}`
          .toLocaleLowerCase('tr-TR')
        if (!alan.includes(q)) return false
      }
      if (tedarik !== 'hepsi' && s.tedarik_mudurlugu !== tedarik) return false
      if (durumFiltre !== 'hepsi' && !durumlar(s).includes(durumFiltre)) return false
      return true
    })
  }, [satirlar, arama, durumFiltre, tip, tedarik])

  const sayim = useMemo(() => {
    const c: Record<DenetimDurum, number> = { SURESI_DOLMUS: 0, YAKLASIYOR: 0, GECERLI: 0, YOK: 0 }
    for (const s of satirlar) {
      const d = durumlar(s)
      // en kötü durum sayılır — bir atölye iki kutuda birden görünmez
      const enKotu: DenetimDurum =
        d.includes('SURESI_DOLMUS') ? 'SURESI_DOLMUS'
        : d.includes('YAKLASIYOR') ? 'YAKLASIYOR'
        : d.includes('YOK') ? 'YOK'
        : 'GECERLI'
      c[enKotu]++
    }
    return c
  }, [satirlar, tip])

  const kutular: { anahtar: DenetimDurum; etiket: string; renk: string }[] = [
    { anahtar: 'SURESI_DOLMUS', etiket: 'Süresi dolmuş', renk: 'text-red-600' },
    { anahtar: 'YAKLASIYOR', etiket: 'Yaklaşıyor (90 gün)', renk: 'text-amber-600' },
    { anahtar: 'YOK', etiket: 'Denetim kaydı yok', renk: 'text-gray-500' },
    { anahtar: 'GECERLI', etiket: 'Geçerli', renk: 'text-green-600' },
  ]

  const disaAktarUrl = `/api/pes/atolye-profil?format=xlsx${arsivDahil ? '&arsiv=1' : ''}`

  return (
    <div className="space-y-4">
      {/* Özet kutuları — tıklayınca filtre olur */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kutular.map((k) => (
          <button
            key={k.anahtar}
            onClick={() => setDurumFiltre(durumFiltre === k.anahtar ? 'hepsi' : k.anahtar)}
            className={`text-left bg-white border rounded-xl p-4 transition-colors ${
              durumFiltre === k.anahtar ? 'border-[#197A56] ring-1 ring-[#197A56]' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className={`text-2xl font-bold ${k.renk}`}>{sayim[k.anahtar]}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.etiket}</div>
          </button>
        ))}
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Atölye, kod, FKU, teknik müdür…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <select
          value={tip}
          onChange={(e) => setTip(e.target.value as DenetimTipi)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="hepsi">Her iki denetim</option>
          <option value="wkys">Yalnız WKYS</option>
          <option value="sosyal">Yalnız sosyal uygunluk</option>
        </select>
        <select
          value={tedarik}
          onChange={(e) => setTedarik(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white max-w-[220px]"
        >
          <option value="hepsi">Tüm tedarik müdürlükleri</option>
          {tedarikSecenekleri.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <a
          href={disaAktarUrl}
          className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors text-sm font-medium"
        >
          Excel indir
        </a>
      </div>

      <p className="text-sm text-gray-500">
        {filtreli.length} / {satirlar.length} atölye
        {durumFiltre !== 'hepsi' && ' · filtre açık'}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-gray-500 font-medium">Kod</th>
              <th className="px-4 py-3 text-left text-gray-500 font-medium">Atölye</th>
              <th className="px-4 py-3 text-left text-gray-500 font-medium">Tedarik müd.</th>
              <th className="px-4 py-3 text-left text-gray-500 font-medium">FKU</th>
              <th className="px-4 py-3 text-left text-gray-500 font-medium">WKYS</th>
              <th className="px-4 py-3 text-left text-gray-500 font-medium">Sosyal uygunluk</th>
              <th className="px-4 py-3 text-center text-gray-500 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtreli.map((s) => (
              <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${s.is_active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-3">
                  <Link href={`/pes/workshops/${s.id}`} className="text-[#197A56] font-medium hover:underline">
                    {s.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-900 max-w-[220px]">
                  <div className="truncate">{s.name}</div>
                  {!s.profil_var && (
                    <div className="text-xs text-gray-400">künye boş</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-[150px] truncate">
                  {s.tedarik_mudurlugu ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px] truncate">{s.fku ?? '—'}</td>

                <td className="px-4 py-3">
                  <DurumRozet durum={s.wkys_durum} kalan={s.wkys_kalan} />
                  {s.wkys_tarih && (
                    <div className="text-xs text-gray-500 mt-1">
                      {tarihTR(s.wkys_tarih)}
                      {s.wkys_puan && ` · ${s.wkys_puan}`}
                      {s.wkys_sinif && ` · ${s.wkys_sinif}`}
                      <span className="text-gray-400"> → {tarihTR(s.wkys_sonraki)}</span>
                    </div>
                  )}
                </td>

                <td className="px-4 py-3">
                  <DurumRozet durum={s.sosyal_durum} kalan={s.sosyal_kalan} />
                  {s.sosyal_tarih && (
                    <div className="text-xs text-gray-500 mt-1">
                      {tarihTR(s.sosyal_tarih)}
                      {s.sosyal_puan && ` · ${s.sosyal_puan}`}
                      {s.sosyal_sinif && ` · ${s.sosyal_sinif}`}
                      <span className="text-gray-400"> → {tarihTR(s.sosyal_sonraki)}</span>
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 text-center">
                  {s.risk_seviyesi ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.risk_seviyesi === 'YÜKSEK' ? 'bg-red-100 text-red-700'
                      : s.risk_seviyesi === 'ORTA' ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                    }`}>{s.risk_seviyesi}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtreli.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Filtreye uyan atölye yok.</p>
        )}
      </div>
    </div>
  )
}
