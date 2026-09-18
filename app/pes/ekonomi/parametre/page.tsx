import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { paramCoz } from '@/lib/pes/ekonomi-sorgu'
import Form, { type ParamTanim } from './Form'

export const dynamic = 'force-dynamic'

const TANIMLAR: ParamTanim[] = [
  { anahtar: 'min_wage_gross', etiket: 'Brüt asgari ücret (TL/ay)', aciklama: 'ÇSGB tablosu.' },
  { anahtar: 'min_wage_net', etiket: 'Net asgari ücret (TL/ay)', aciklama: 'Maaş/kişi kıyaslamasında referans.' },
  { anahtar: 'employer_cost', etiket: 'İşveren maliyeti (TL/ay)', aciklama: 'İmalat, 5 puan SGK indirimi.' },
  { anahtar: 'wage_support', etiket: 'Asgari ücret desteği (TL/ay)', aciklama: 'İşveren maliyetinden düşülür.' },
  { anahtar: 'minutes_per_day', etiket: 'Günlük çalışma dakikası', aciklama: '9 saat × 60; molalar hariç.' },
  { anahtar: 'nominal_days', etiket: 'Nominal çalışma günü', aciklama: '52 hafta × 5 gün ÷ 12. Benchmark cetveli.' },
  { anahtar: 'effective_days', etiket: 'Efektif çalışma günü', aciklama: 'Tatil, izin, devamsızlık sonrası. Fiyatlama kararında bu kullanılır.' },
  { anahtar: 'eff_cutting', etiket: 'Kesim verimliliği', aciklama: 'MTM ÷ verimlilik = gerçek dakika.' },
  { anahtar: 'eff_sewing', etiket: 'Dikim verimliliği', aciklama: 'Tipik Türk bandı %50-70; iyi dengelenmiş bant %75-85.' },
  { anahtar: 'eff_ukp', etiket: 'UKP verimliliği', aciklama: 'Ütü-kontrol-paket.' },
  { anahtar: 'target_margin', etiket: 'Hedef tedarikçi marjı', aciklama: 'Adil fiyat = başabaş × (1 + hedef marj).' },
  { anahtar: 'weight_cutting', etiket: 'Kesim maaş ağırlığı', aciklama: '1 = ortalama maaş. Üçü eşitken bölüm dakika maliyetleri aynı çıkar.' },
  { anahtar: 'weight_sewing', etiket: 'Dikim maaş ağırlığı', aciklama: 'Bölüm maaşları toplandığında güncellenir.' },
  { anahtar: 'weight_ukp', etiket: 'UKP maaş ağırlığı', aciklama: '' },
  { anahtar: 'revenue_adj_on', etiket: 'Boş gün ciro düzeltmesi', aciklama: '1 = açık, 0 = kapalı. Dışarı geçen günleri kapasiteye geri ekler.' },
  { anahtar: 'revenue_adj_divisor', etiket: 'Boş gün düzeltme paydası', aciklama: 'Ciro × (1 + boş gün ÷ bu sayı).' },
]

export default async function ParametreSayfasi({
  searchParams,
}: { searchParams: Promise<{ donem?: string }> }) {
  const sp = await searchParams
  const simdi = new Date()
  const donem = sp.donem && /^\d{4}-\d{2}$/.test(sp.donem)
    ? sp.donem
    : `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}`

  const data = await withServerTenant(async (sql) => {
    const etkin = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>

    const donemler = await sql`
      SELECT donem, count(*)::int AS adet FROM economy_param
      GROUP BY donem ORDER BY donem DESC
    ` as Array<{ donem: string; adet: number }>

    return { mevcut: paramCoz(etkin) as unknown as Record<string, number>, donemler }
  })

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ekonomi parametreleri</h1>
        <p className="text-sm text-slate-500">
          {donem} için geçerli değerler ·{' '}
          <Link href="/pes/ekonomi" className="underline">panoya dön</Link>
        </p>
      </header>

      <p className="text-sm bg-slate-50 border rounded px-3 py-2 max-w-3xl">
        Parametreler dönem versiyonludur. Bir ay hesaplanırken <strong>o aydan küçük veya
        eşit en yakın dönemin</strong> değerleri kullanılır — yani asgari ücret değiştiğinde
        yeni bir dönem eklersiniz, geçmiş aylar bozulmaz.
        {' '}Bölge 3D dakika maliyeti burada değil: <code>dk_maliyet</code> tablosundan okunur.
      </p>

      <Form tanimlar={TANIMLAR} donem={donem} mevcut={data.mevcut} />

      <section className="text-sm">
        <h2 className="font-medium mb-2">Kayıtlı dönemler</h2>
        <ul className="flex flex-wrap gap-2">
          {data.donemler.map(d => (
            <li key={d.donem}>
              <Link href={`/pes/ekonomi/parametre?donem=${d.donem}`}
                    className={`px-2 py-1 rounded border ${d.donem === donem ? 'bg-slate-900 text-white' : ''}`}>
                {d.donem} <span className="text-xs opacity-70">({d.adet})</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
