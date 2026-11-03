import { Badge, Card } from '@/components/ui'
import type { SurecSatiri } from '@/lib/pes/olgunluk-denetim'

/* "HER SÜREÇTE NASILIM" — kategori ortalaması bunu saklıyordu.
   Üstte en zayıf süreçler (aksiyonun başladığı yer), altında tam liste
   kategori sırasıyla. İkinci kolon verilirse (atölye ekranı: kendi beyanı
   + denetim sonucu) süreç süreç fark okunur. Seviye view'dan gelir;
   burada hesap yok. */

const SEVIYE_TON = ['bad', 'warn', 'neutral', 'good'] as const

function Seviye({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="num text-faint">—</span>
  return <Badge tone={SEVIYE_TON[v] ?? 'neutral'}>{v}</Badge>
}

export default function SurecSeviyeListesi({
  surecler, etiket = 'Seviye', ikinci,
}: {
  surecler: SurecSatiri[]
  etiket?: string
  ikinci?: { etiket: string; surecler: SurecSatiri[] }
}) {
  const ikinciHarita = new Map(ikinci?.surecler.map((s) => [s.surec_id, s.seviye]) ?? [])
  const zayif = surecler
    .filter((s) => s.seviye !== null && s.seviye < 3)
    .sort((a, b) => a.seviye! - b.seviye!)
    .slice(0, 5)
  const degerlendirilen = surecler.filter((s) => s.seviye !== null).length

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-2.5">
        <span className="text-[13px] font-semibold text-ink">Süreç seviyeleri</span>
        <span className="num ml-2 text-[11px] text-faint">
          {degerlendirilen} / {surecler.length} süreç değerlendirildi · 0 kötü – 3 mükemmel
        </span>
      </div>

      {zayif.length > 0 && (
        <div className="border-b border-line-soft bg-canvas px-4 py-2.5">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.06em] text-faint">En zayıf süreçler</div>
          <div className="flex flex-wrap gap-2">
            {zayif.map((s) => (
              <span key={s.surec_id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-surface px-2 py-1 text-[12px]">
                <span className="num text-faint">{s.kod}</span>
                <span className="text-ink">{s.ad}</span>
                <Seviye v={s.seviye} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line-soft text-left">
              <th className="px-3 py-2 font-medium text-faint">Süreç</th>
              <th className="px-3 py-2 font-medium text-faint">Kategori</th>
              <th className="px-3 py-2 text-center font-medium text-faint">{etiket}</th>
              {ikinci && <th className="px-3 py-2 text-center font-medium text-faint">{ikinci.etiket}</th>}
            </tr>
          </thead>
          <tbody>
            {surecler.map((s) => (
              <tr key={s.surec_id} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-1.5">
                  <span className="num text-faint">{s.kod}</span>{' '}
                  <span className="text-ink">{s.ad}</span>
                </td>
                <td className="px-3 py-1.5 text-muted">
                  <span className="num">{s.kategori_kod}</span> · {s.kategori_adi}
                </td>
                <td className="px-3 py-1.5 text-center"><Seviye v={s.seviye} /></td>
                {ikinci && (
                  <td className="px-3 py-1.5 text-center"><Seviye v={ikinciHarita.get(s.surec_id)} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
