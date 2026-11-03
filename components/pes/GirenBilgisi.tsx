import { girenMetni, type GirenAlanlari } from '@/lib/pes/giren'

/* Merkez bir atölyenin dönem kaydını açtığında: kayıt var mı, kim girdi,
   kaydederse ne olur. Atölye beyanının üzerine sessizce yazılmasın. */
export default function GirenBilgisi({
  kayit, uzerineYazar = true,
}: {
  kayit: GirenAlanlari | null | undefined
  uzerineYazar?: boolean
}) {
  if (!kayit) {
    return <p className="text-xs text-faint">Bu dönem için kayıt yok; kaydettiğinizde merkez kaydı olarak girilir.</p>
  }
  const atolyeden = kayit.giren_taraf === 'atolye'
  return (
    <p className={`rounded-md px-3 py-2 text-xs ${atolyeden ? 'bg-warn-soft text-body' : 'bg-canvas text-muted'}`}>
      <span className="font-medium">Mevcut kayıt:</span> {girenMetni(kayit)}
      {uzerineYazar && atolyeden && ' — kaydederseniz atölyenin beyanının üzerine merkez kaydı olarak yazılır.'}
      {!uzerineYazar && ' — kaydetmek yeni bir kayıt ekler.'}
    </p>
  )
}
