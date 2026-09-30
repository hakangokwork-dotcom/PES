import { redirect } from 'next/navigation'

/* VSM Analiz PES'ten çıkarıldı (2026-09-30) — ayrı ürün ProVSM (provsm.vercel.app).
   Rota eski yer imleri için duruyor; atölye seçimi (wid) korunarak panele döner.
   Geri eklemek için: <VsimEmbed storageKey={`provsm_studio_w${wid}_v1`} kayitKapsami="atolye" />
   (components/pes/VsimEmbed.tsx; çekirdek kopyası, API ve 048 tabloları yerinde). */
export default async function VsmPage({ searchParams }: { searchParams: Promise<{ wid?: string }> }) {
  const { wid } = await searchParams
  redirect(wid ? `/workshop?wid=${encodeURIComponent(wid)}` : '/workshop')
}
