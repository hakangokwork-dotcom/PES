import { PageHeader } from '@/components/ui'
import TakvimSayfasi from '@/components/pes/takvim/TakvimSayfasi'

export const dynamic = 'force-dynamic'

/* İnce sunucu sayfası. Veri istemciden tek uçla (/api/pes/takvim/doluluk)
   çekilir; dönem ve filtre değiştikçe yeniden yüklenir. */
export default function PesTakvimPage() {
  return (
    <div data-yogun className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Bant kapasite takvimi' }]}
        title="Bant kapasite takvimi"
        context="Kapasite atölyenin ve bantlar arasında ortak; bant satırı siparişin nerede durduğunu gösterir"
      />
      <TakvimSayfasi />
    </div>
  )
}
