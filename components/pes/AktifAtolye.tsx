'use client'

import { createContext, useContext } from 'react'
import { useSearchParams } from 'next/navigation'

/* AKTİF ATÖLYE — "hangi atölyedeyim" sorusunun tek cevabı.
 *
 * Panel bu soruyu URL'den (`?wid=12`) cevaplıyordu. Atölyeye bağlı bir
 * kullanıcı için bu hem gereksiz hem yanlış: kendi atölyesini her bağlantıda
 * taşımak zorunda kalıyor, doğrudan bir adrese girince "Atölye seçin"
 * ekranıyla karşılaşıyordu.
 *
 * NEDEN wid TAMAMEN KALDIRILMADI: 033 ile kısıt RLS'e taşındı, yani wid
 * artık bir GÜVENLİK sınırı değil — atölye kullanıcısı elle başka bir id
 * yazsa da veritabanı boş döner. Geriye yalnız bir arayüz kolaylığı kalıyor
 * ve merkez kullanıcısının atölye değiştirmesi hâlâ ona dayanıyor. On yedi
 * ekranı yeniden yazmak yerine kaynağı düzeltmek yeterli.
 *
 * Sıra: URL'deki wid > oturumdaki atölye. Merkez kullanıcısında sabit
 * atölye null'dır ve davranış aynen eskisi gibi kalır.
 */

const Ctx = createContext<number | null>(null)

export function AktifAtolyeSaglayici({
  sabitAtolyeId, children,
}: {
  sabitAtolyeId: number | null
  children: React.ReactNode
}) {
  return <Ctx.Provider value={sabitAtolyeId}>{children}</Ctx.Provider>
}

/** Kullanıcı bir atölyeye bağlı mı (bağlıysa id'si). */
export function useSabitAtolyeId(): number | null {
  return useContext(Ctx)
}

/**
 * Ekranların kullanacağı değer. Eskiden `searchParams.get('wid')` yazan
 * yerlerin yerine geçer; dönüş tipi aynı (string | null) ki çağıran
 * kodun geri kalanı değişmesin.
 */
export function useAktifAtolyeId(): string | null {
  const sabit = useContext(Ctx)
  const wid = useSearchParams().get('wid')
  if (wid) return wid
  return sabit != null ? String(sabit) : null
}
