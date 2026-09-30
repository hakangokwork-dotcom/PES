import { redirect } from 'next/navigation'

/* Eski Üretim Simülasyon rotası. Simülasyon PES'ten çıkarıldı (2026-09-30, ayrı ürün
   ProVSM); eski yer imleri atölye seçimi (wid) korunarak panele döner. */
export default async function UretimSimulasyonRedirect({
  searchParams,
}: {
  searchParams: Promise<{ wid?: string }>
}) {
  const { wid } = await searchParams
  redirect(wid ? `/workshop?wid=${encodeURIComponent(wid)}` : '/workshop')
}
