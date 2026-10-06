import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { BOLGELER, donemleriOku, gecmisiGrupla, gecmisiOku } from '@/lib/pes/dk-maliyet'
import Yonetim from './Yonetim'

/**
 * /pes/ekonomi/dk-maliyet — Bölgesel 3D dakika maliyeti yönetimi. YALNIZ
 * MERKEZ (/pes layout'u + API 403 + RLS 052).
 *
 * Kaydedilen değer bütün canlı hesaplara bir sonraki açılışta yansır;
 * ayrıca "yeniden hesapla" yoktur. Geçmiş tetikleyiciyle tutulur.
 */
export const dynamic = 'force-dynamic'

const KULLANAN = [
  { ad: 'Atölye Ekonomi', yol: '/pes/ekonomi', ne: '3D referans fiyat ve "3D dakika maliyeti oranı" rasyosu' },
  { ad: 'Referans Model Fiyatları', yol: '/pes/model/referans', ne: '117 ürün tipinin bölgesel referans fiyatı' },
  { ad: 'Model Fiyatlama', yol: '/pes/model', ne: 'yeni hesaplanan fiyatlarda 3D referans (saklanmış eski fiyatlar değişmez)' },
  { ad: 'Eder Maliyet', yol: '/pes/eder-maliyet', ne: 'eder maliyet TL/dk' },
  { ad: 'Atölye Maliyet (atölye paneli)', yol: null, ne: 'sektör referans dakika maliyeti' },
]

const ISLEM: Record<string, { ad: string; renk: string }> = {
  ekle: { ad: 'eklendi', renk: 'bg-emerald-100 text-emerald-800' },
  guncelle: { ad: 'güncellendi', renk: 'bg-amber-100 text-amber-800' },
  sil: { ad: 'silindi', renk: 'bg-rose-100 text-rose-800' },
}

const tl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function DkMaliyetSayfasi() {
  const data = await withServerTenant(async (sql) => ({
    donemler: await donemleriOku(sql),
    gecmis: await gecmisiOku(sql),
  }))
  if (!data) redirect('/login')
  const d = new Date()
  const buAy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-2 max-w-4xl">
        <h1 className="text-xl font-semibold">Bölgesel Dakika Maliyetleri (3D)</h1>
        <p className="text-sm text-slate-600">
          Değerler <b>dönem versiyonludur</b>: her ay, kendisinden önceki en yakın dönemin değerleriyle hesaplanır.
          Yeni dönem eklemek geçmiş ayları değiştirmez; var olan bir dönemi düzeltmek yalnız o dönemin geçerli
          olduğu ayları değiştirir. Kaydettiğiniz anda aşağıdaki bütün hesaplar yeni değeri kullanır — ayrıca bir
          yeniden hesaplama adımı yok.
        </p>
        <details className="text-sm border rounded px-3 py-2">
          <summary className="cursor-pointer text-slate-700">Bu değerleri kullanan hesaplar ({KULLANAN.length})</summary>
          <ul className="mt-2 space-y-1">
            {KULLANAN.map((k) => (
              <li key={k.ad}>
                {k.yol ? <Link href={k.yol} className="underline">{k.ad}</Link> : <span>{k.ad}</span>}
                <span className="text-slate-500"> — {k.ne}</span>
              </li>
            ))}
          </ul>
        </details>
      </header>

      <Yonetim donemler={data.donemler} buAy={buAy} />

      <section className="space-y-2">
        <h2 className="font-medium">Değişiklik geçmişi</h2>
        <p className="text-sm text-slate-500">Her ekleme, düzeltme ve silme; ekran dışından yapılanlar dahil.</p>
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Tarih</th>
                <th className="text-left px-3 py-2">Dönem</th>
                <th className="text-left px-3 py-2">İşlem</th>
                {BOLGELER.map((b) => <th key={b} className="text-right px-3 py-2">{b}. Bölge</th>)}
                <th className="text-left px-3 py-2">Kim</th>
                <th className="text-left px-3 py-2">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {gecmisiGrupla(data.gecmis).map((g) => (
                <tr key={g.anahtar} className="border-t align-top">
                  <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-slate-500">
                    {new Date(g.degisti_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{g.donem}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${ISLEM[g.islem]?.renk ?? ''}`}>{ISLEM[g.islem]?.ad ?? g.islem}</span>
                  </td>
                  {BOLGELER.map((b) => {
                    const v = g.bolgeler[b]
                    return (
                      <td key={b} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {!v ? <span className="text-slate-300">·</span>
                          : g.islem === 'guncelle'
                            ? <><span className="text-slate-400 line-through">{tl(v.eski)}</span> {tl(v.yeni)}</>
                            : g.islem === 'sil' ? <span className="text-slate-400 line-through">{tl(v.eski)}</span>
                            : tl(v.yeni)}
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-slate-600">{g.degistiren}</td>
                  <td className="px-3 py-1.5 text-slate-600">{g.aciklama ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
