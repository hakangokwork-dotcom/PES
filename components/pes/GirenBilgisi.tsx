import { girenMetni, TARAF_ETIKET, type GirenAlanlari } from '@/lib/pes/giren'

/* Bir dönem kaydı açıldığında: kayıt var mı, kim girdi, kaydederse ne olur.
   İki panelde de kullanılır (055: ortak kayıt, onay yok). Diğer tarafın
   girdiği değerin üzerine sessizce yazılmasın. */
export default function GirenBilgisi({
  kayit, uzerineYazar = true, ben = 'merkez',
}: {
  kayit: GirenAlanlari | null | undefined
  uzerineYazar?: boolean
  ben?: 'atolye' | 'merkez'
}) {
  if (!kayit) {
    return <p className="text-xs text-faint">Bu dönem için kayıt yok; kaydettiğinizde {TARAF_ETIKET[ben].toLocaleLowerCase('tr')} olarak girilir.</p>
  }
  const digerTaraftan = !!kayit.giren_taraf && kayit.giren_taraf !== ben
  return (
    <p className={`rounded-md px-3 py-2 text-xs ${digerTaraftan ? 'bg-warn-soft text-body' : 'bg-canvas text-muted'}`}>
      <span className="font-medium">Mevcut kayıt:</span> {girenMetni(kayit)}
      {uzerineYazar && digerTaraftan &&
        ` — kaydederseniz ${ben === 'merkez' ? 'atölyenin' : 'merkezin'} girdiği değerin üzerine yazılır; değişiklik iki panelde de görünür.`}
      {!uzerineYazar && ' — kaydetmek yeni bir kayıt ekler.'}
    </p>
  )
}
