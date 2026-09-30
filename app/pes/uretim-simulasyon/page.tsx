import { redirect } from 'next/navigation'

/* VSM / simülasyon PES'ten çıkarıldı (2026-09-30) — ayrı ürün ProVSM (provsm.vercel.app).
   Rota eski yer imleri için duruyor. Geri eklemek için: <VsimEmbed storageKey=… kayitKapsami="merkez" />
   (components/pes/VsimEmbed.tsx; çekirdek kopyası, API ve 048 tabloları yerinde). */
export default function PesVsimPage() {
  redirect('/pes')
}
