import { WifiOff } from 'lucide-react'

/* Service worker gezinme isteği ağa ulaşamayınca bunu gösterir (public/sw.js).
   Statik ve oturumsuz: /workshop layout'u dışında durur ki önbellekteki kopya
   kimseye ait bilgi taşımasın. */
export const dynamic = 'force-static'

export default function CevrimdisiSayfasi() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <WifiOff className="size-7" strokeWidth={1.8} />
      </span>
      <h1 className="text-lg font-semibold text-ink">Bağlantı yok</h1>
      <p className="max-w-[320px] text-sm text-muted">
        Sayfa açılamadı. Wi-Fi bağlanınca aşağıdaki düğmeyle devam edin.
        Girdiğiniz kayıtlar bu ekrana düşmez; formda kalır.
      </p>
      <a
        href="/workshop"
        className="inline-flex h-11 items-center rounded-md bg-accent px-[18px] text-sm font-medium text-white"
      >
        Yeniden dene
      </a>
    </main>
  )
}
