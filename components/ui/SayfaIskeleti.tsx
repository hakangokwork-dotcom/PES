/* Sayfa yüklenirken gösterilen iskelet (app/{pes,workshop}/loading.tsx).
   Yoktu: menüde tıklayınca sunucu yanıt verene kadar eski sayfa duruyor,
   tıklama boşa gitmiş gibi görünüyordu. */
export function SayfaIskeleti() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-5xl animate-pulse space-y-6">
      <span className="sr-only">Yükleniyor…</span>
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-line-soft" />
        <div className="h-7 w-64 rounded bg-line-soft" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg border border-line-soft bg-surface" />)}
      </div>
      <div className="h-64 rounded-lg border border-line-soft bg-surface" />
    </div>
  )
}
