import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemYaz } from '@/lib/pes/donem'
import { referansTablosu, varsayilanDonem } from '@/lib/pes/referans-sorgu'
import type { Guven } from '@/lib/pes/referans-model'
import { GUVEN_RENK, GUVEN_ACIKLAMA } from './guven'

/**
 * /pes/model/referans — MTM kütüphanesindeki 117 ürün tipi için referans
 * süre ve bölgesel referans fiyat. YALNIZ MERKEZ: /pes layout'u atölye
 * rolünü kendi paneline yönlendirir.
 *
 * Dikim süresi MTM'den "ortalama model" olarak kurulur; kesim ve UKP
 * MTM'de yoktur, personel oranıyla TAHMİN edilir ve ayrı sütunda durur.
 */
export const dynamic = 'force-dynamic'

const dk = (sn: number | null) => (sn === null ? '—' : (sn / 60).toFixed(2))
const tl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function ReferansModeller({
  searchParams,
}: { searchParams: Promise<{ donem?: string; bolge?: string; grup?: string; guven?: string }> }) {
  const sp = await searchParams
  const d = donemCoz(sp.donem)
  const donem = d ? donemYaz(d) : varsayilanDonem()
  const bolge = Math.min(6, Math.max(1, Number(sp.bolge) || 1))
  const grupSec = sp.grup ?? ''
  const guvenSec = (sp.guven ?? '') as Guven | ''

  const data = await withServerTenant((sql) => referansTablosu(sql, donem))
  if (!data) redirect('/login')

  const gruplar = [...new Set(data.satirlar.map((s) => s.urunGrubu ?? '—'))].sort((a, b) => a.localeCompare(b, 'tr'))
  const satirlar = data.satirlar.filter((s) =>
    (!grupSec || (s.urunGrubu ?? '—') === grupSec) && (!guvenSec || s.guven === guvenSec))
  const bolgeler = Object.keys(data.dkMaliyet).map(Number).sort()

  const bag = (p: Record<string, string | number>) => {
    const u = new URLSearchParams({ donem, bolge: String(bolge), grup: grupSec, guven: guvenSec })
    for (const [k, v] of Object.entries(p)) u.set(k, String(v))
    for (const k of [...u.keys()]) if (!u.get(k)) u.delete(k)
    return `/pes/model/referans?${u.toString()}`
  }
  const csv = `/api/pes/model/referans?donem=${donem}&format=csv`

  return (
    <main className="p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Referans Model Fiyatları</h1>
        <p className="text-sm text-slate-500 max-w-4xl">
          MTM kütüphanesindeki {data.satirlar.length}{' '}ürün tipi için ortalama model süresi ×
          bölgesel 3D dakika maliyeti. Dikim MTM&apos;den; <b>kesim ve UKP MTM&apos;de yok</b>,
          atölye personel oranından tahmin edilir (kesim ÷ dikim {data.oranlar.kesim.toLocaleString('tr-TR')},
          UKP ÷ dikim {data.oranlar.ukp.toLocaleString('tr-TR')} —{' '}
          <Link href={`/pes/ekonomi/parametre?donem=${donem}`} className="underline">parametreler</Link>).
          {' '}3D dönemi <b>{data.dkDonem ?? 'yok'}</b>, parametre dönemi {data.paramDonem ?? 'varsayılan'}.
        </p>
      </header>

      <nav className="flex flex-wrap gap-4 items-center text-sm">
        <span className="flex gap-1 items-center">
          <span className="text-slate-500 mr-1">Teşvik bölgesi</span>
          {bolgeler.map((b) => (
            <Link key={b} href={bag({ bolge: b })}
              className={`px-2 py-0.5 rounded border ${b === bolge ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}>
              {b} <span className="opacity-70">({data.dkMaliyet[b].toLocaleString('tr-TR')} TL/dk)</span>
            </Link>
          ))}
        </span>
        <span className="flex gap-1 items-center flex-wrap">
          <span className="text-slate-500 mr-1">Ürün grubu</span>
          <Link href={bag({ grup: '' })} className={`px-2 py-0.5 rounded border ${!grupSec ? 'bg-slate-800 text-white' : ''}`}>Tümü</Link>
          {gruplar.map((g) => (
            <Link key={g} href={bag({ grup: g })}
              className={`px-2 py-0.5 rounded border ${g === grupSec ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}>{g}</Link>
          ))}
        </span>
        <span className="flex gap-1 items-center">
          <span className="text-slate-500 mr-1">Güven</span>
          <Link href={bag({ guven: '' })} className={`px-2 py-0.5 rounded border ${!guvenSec ? 'bg-slate-800 text-white' : ''}`}>Tümü</Link>
          {(Object.keys(GUVEN_RENK) as Guven[]).map((g) => (
            <Link key={g} href={bag({ guven: g })} title={GUVEN_ACIKLAMA[g]}
              className={`px-2 py-0.5 rounded ${GUVEN_RENK[g]} ${g === guvenSec ? 'ring-2 ring-slate-800' : ''}`}>{g}</Link>
          ))}
        </span>
        <a href={csv} className="ml-auto underline">CSV indir (6 bölge)</a>
      </nav>

      {!data.dkDonem ? (
        <p className="border rounded p-6 text-slate-500">Bu dönem için 3D dakika maliyeti yok.</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2" rowSpan={2}>Ürün tipi</th>
                <th className="text-left px-3 py-2" rowSpan={2}>Grup</th>
                <th className="text-left px-3 py-2" rowSpan={2}>Güven</th>
                <th className="text-center px-3 py-1 border-l" colSpan={4}>Standart dakika</th>
                <th className="text-center px-3 py-1 border-l" colSpan={4}>Referans fiyat, bölge {bolge} (TL/adet)</th>
              </tr>
              <tr className="text-xs text-slate-600">
                <th className="text-right px-3 py-1 border-l">Kesim*</th>
                <th className="text-right px-3 py-1">Dikim</th>
                <th className="text-right px-3 py-1">UKP*</th>
                <th className="text-right px-3 py-1">Toplam</th>
                <th className="text-right px-3 py-1 border-l">Kesim*</th>
                <th className="text-right px-3 py-1">Dikim</th>
                <th className="text-right px-3 py-1">UKP*</th>
                <th className="text-right px-3 py-1">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => {
                const f = s.fiyat[bolge]
                const top = s.sure.kesimSn === null || s.sure.ukpSn === null
                  ? null : s.sure.kesimSn + s.sure.dikimSn + s.sure.ukpSn
                return (
                  <tr key={s.urunTipiId} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <Link href={`/pes/model/referans/${s.urunTipiId}?donem=${donem}`} className="underline">
                        {s.klasman}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{s.urunGrubu ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${GUVEN_RENK[s.guven]}`}
                        title={`${s.modelSayisi} model tahmini · ${s.parcaSayisi} parça`}>
                        {s.guven} · {s.modelSayisi}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums border-l text-slate-500">{dk(s.sure.kesimSn)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dk(s.sure.dikimSn)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{dk(s.sure.ukpSn)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{dk(top)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums border-l text-slate-500">{tl(f?.kesimTl ?? null)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{tl(f?.dikimTl ?? null)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{tl(f?.ukpTl ?? null)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{tl(f?.toplamTl ?? null)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="text-xs text-slate-500 space-y-1 max-w-4xl">
        <p>* Kesim ve UKP tahminidir: dikim sn × personel oranı × (bölüm verimliliği ÷ dikim verimliliği).</p>
        <p>
          Fiyat = standart dakika × 3D dakika maliyeti; verimlilik düzeltmesi ve marj yok (3D verimlilik
          kaybını zaten içerir — FORMULLER!E51). Güven, referansın kaç modelin parçalarından
          türetildiğini gösterir; ZAYIF satırlar tek modelin toplamıdır.
        </p>
      </footer>
    </main>
  )
}
