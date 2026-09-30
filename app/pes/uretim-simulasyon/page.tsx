'use client'

/* Merkez panelinde VSIM — atölyeden bağımsız, marka tarafının kendi süreç tasarımı
   için tek bir çalışma alanı (atölye seçimi yok, dolayısıyla wid kapsamı da yok). */

import VsimEmbed from '@/components/pes/VsimEmbed'

export default function PesVsimPage() {
  /* kayitKapsami="merkez": atölyelerin sunucudaki hat/ürün grubu kayıtlarını görür ve açar (yazamaz). */
  return <VsimEmbed storageKey="provsm_studio_merkez_v1" kayitKapsami="merkez" />
}
