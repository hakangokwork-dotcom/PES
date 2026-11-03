/* 054: kaydı kim girdi. Kolonları tetikleyici doldurur; burada yalnız okunur. */
export type GirenAlanlari = {
  giren_taraf?: 'atolye' | 'merkez' | null
  giren_eposta?: string | null
  girildi_at?: string | null
}

export const TARAF_ETIKET = { atolye: 'Atölye beyanı', merkez: 'Merkez kaydı' } as const

/** "Atölye beyanı · ali@x · 03.11.2026" — eski kayıtta "Kaynak bilinmiyor". */
export function girenMetni(k: GirenAlanlari | null | undefined): string {
  if (!k?.giren_taraf) return 'Kaynak bilinmiyor (eski kayıt)'
  const parcalar: string[] = [TARAF_ETIKET[k.giren_taraf]]
  if (k.giren_eposta) parcalar.push(k.giren_eposta)
  if (k.girildi_at) parcalar.push(String(k.girildi_at).slice(0, 10).split('-').reverse().join('.'))
  return parcalar.join(' · ')
}

/** 055: kaydı açarken görülen sürüm. Yazma isteğine eklenir; kayıt bu arada
 *  diğer panelden değiştiyse sunucu 409 döner, sessizce üzerine yazılmaz. */
export function surumBasligi(k: GirenAlanlari | null | undefined): Record<string, string> {
  return { 'x-kayit-surum': !k ? 'yok' : k.girildi_at ? String(k.girildi_at) : 'eski' }
}
