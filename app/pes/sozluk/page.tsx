import { METRICS, METRIC_CATEGORIES, type MetricDefinition } from '@/lib/pes/metrics-ontology'
import GlossaryBrowser from '@/components/pes/GlossaryBrowser'

export const metadata = { title: 'Hesaplama Sözlüğü' }

export default function SozlukPage() {
  // Ontoloji derleme zamanında sabit — sunucuda hazırlanıp gönderilir,
  // client tarafında filtreleme yapılır.
  const metrics: MetricDefinition[] = Object.values(METRICS)

  const byCategory = metrics.reduce<Record<string, MetricDefinition[]>>((acc, m) => {
    ;(acc[m.category] ??= []).push(m)
    return acc
  }, {})

  const categories = (Object.keys(METRIC_CATEGORIES) as MetricDefinition['category'][])
    .filter((c) => byCategory[c]?.length)
    .map((c) => ({ code: c, label: METRIC_CATEGORIES[c], count: byCategory[c].length }))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Hesaplama Sözlüğü</h1>
        <p className="text-faint mt-1 max-w-3xl">
          Sistemdeki her sayının ne anlama geldiği, hangi formülle hesaplandığı,
          hangi tablodan geldiği ve <strong>neden öyle tanımlandığı</strong>.
          Ekranlarda terimlerin üzerine geldiğinizde kısa tanım, tıkladığınızda
          tam açıklama çıkar — burası hepsinin toplu listesi.
        </p>
      </div>

      <GlossaryBrowser metrics={metrics} categories={categories} />
    </div>
  )
}
