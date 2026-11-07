/* İş emri ve aşama durumları veritabanında ASCII saklanıyor (CHECK listesi,
   bkz. lib/pes/yerlestir-kaydet.ts). Anahtar değişmez; ekranda doğru Türkçe
   yazılır. */
const ETIKET: Record<string, string> = {
  Planlandi: 'Planlandı',
  Duraklatildi: 'Duraklatıldı',
  Tamamlandi: 'Tamamlandı',
}

export function durumEtiket(durum: string | null | undefined): string {
  return durum ? ETIKET[durum] ?? durum : ''
}
