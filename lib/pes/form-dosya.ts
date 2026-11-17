/* 060: üretim formu ekleri — sunucu ve istemcinin ortak kuralları. */

export const DOSYA_KOVASI = 'uretim-formlari'

/** Vercel istek gövdesi sınırı 4,5 MB; fotoğraflar istemcide küçültülerek gelir. */
export const DOSYA_SINIRI = 4 * 1024 * 1024

export const IZINLI_TURLER: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

export function dosyaHatasi(tur: string, boyut: number): string | null {
  if (!IZINLI_TURLER[tur]) return 'Yalnız fotoğraf (JPEG, PNG, WebP) ya da PDF yüklenebilir'
  if (boyut <= 0) return 'Dosya boş'
  if (boyut > DOSYA_SINIRI) return 'Dosya 4 MB’tan büyük'
  return null
}

/** Depo yolu: <tenant>/<atölye>/<form>/<uuid>.<uzantı>. Kullanıcının dosya adı yola girmez. */
export function dosyaYolu(tenantId: string, workshopId: number, formId: number, uuid: string, tur: string): string {
  return `${tenantId}/${workshopId}/${formId}/${uuid}.${IZINLI_TURLER[tur]}`
}
