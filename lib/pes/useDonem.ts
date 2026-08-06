'use client'

import { useSearchParams } from 'next/navigation'
import { donemCoz, type Donem } from '@/lib/pes/donem'

/**
 * İstemci ekranları için etkin dönem.
 *
 * URL'de `?donem` yoksa içinde bulunulan aya düşer — bu yalnız ilk
 * açılış içindir; DonemBar sayfa yüklenince URL'i zaten dolduruyor.
 * Ekranlar kendi yıl/ay state'ini TUTMAMALI; tek kaynak URL.
 */
export function useDonem(): Donem {
  const params = useSearchParams()
  const cozulen = donemCoz(params.get('donem'))
  if (cozulen) return cozulen
  const simdi = new Date()
  return { yil: simdi.getFullYear(), ay: simdi.getMonth() + 1 }
}
