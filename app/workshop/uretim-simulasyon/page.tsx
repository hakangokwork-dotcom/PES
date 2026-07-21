import { redirect } from 'next/navigation'

/* Üretim Simülasyon, VSM Analiz sayfasıyla birleşti — modülün ikisini de kapsayan
   tek sürümü (VSIM) /workshop/vsm altında çalışıyor. Bu rota eski yer imleri ve
   paylaşılmış bağlantılar için duruyor; atölye seçimi (wid) korunarak taşınır. */
export default async function UretimSimulasyonRedirect({
  searchParams,
}: {
  searchParams: Promise<{ wid?: string }>
}) {
  const { wid } = await searchParams
  redirect(wid ? `/workshop/vsm?wid=${encodeURIComponent(wid)}` : '/workshop/vsm')
}
