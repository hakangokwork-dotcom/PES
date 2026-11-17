'use client'
import { IZINLI_TURLER } from './form-dosya'

/* Fotoğraf 4 MB sınırına (Vercel gövde sınırı) sığsın ve kâğıt form okunur
   kalsın: uzun kenar 2400 px, JPEG %85. Çözülemeyen dosya olduğu gibi gider;
   sunucu türünü yine denetler. */
export async function resmiKucult(f: File): Promise<File> {
  if (!f.type.startsWith('image/') || (f.size < 1.5 * 1024 * 1024 && IZINLI_TURLER[f.type])) return f
  try {
    const bmp = await createImageBitmap(f)
    const oran = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * oran); c.height = Math.round(bmp.height * oran)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
  } catch {
    return f
  }
}
