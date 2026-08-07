import { NextResponse } from 'next/server'
import postgres from 'postgres'

/**
 * Katalog yazma işlemlerinin ortak kapısı.
 *
 * 031'de yayındaki şablonu değiştirmeyi trigger da engelliyor; buradaki
 * kontrol onun yerine geçmez, önüne geçer: trigger'ın mesajı ham SQL
 * hatasıdır, kullanıcıya ne yapacağını söylemez.
 */
export async function taslakSablon(
  sql: postgres.TransactionSql,
  sablonId: number
): Promise<{ hata: NextResponse } | { sablonId: number }> {
  if (!Number.isInteger(sablonId)) {
    return { hata: NextResponse.json({ error: 'Geçersiz şablon' }, { status: 400 }) }
  }
  const [s] = await sql`SELECT id, kod, durum FROM olgunluk_sablon WHERE id = ${sablonId}`
  if (!s) {
    return { hata: NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 }) }
  }
  if (s.durum !== 'taslak') {
    return {
      hata: NextResponse.json({
        error: `"${s.kod}" sürümü ${s.durum === 'yayinda' ? 'yayında' : 'arşivde'}; ` +
               'katalog değiştirilemez. Yeni versiyon oluşturup taslakta düzenleyin.',
      }, { status: 409 }),
    }
  }
  return { sablonId: s.id as number }
}

/** Sıralama gövdesi: [id, id, ...] -> 1'den başlayan sıra numaraları. */
export function siraDogrula(body: Record<string, unknown>): number[] | null {
  const ham = body.sira
  if (!Array.isArray(ham) || ham.length === 0) return null
  const idler = ham.map((x) => Number(x))
  if (idler.some((n) => !Number.isInteger(n))) return null
  if (new Set(idler).size !== idler.length) return null
  return idler
}

/** postgres.js hata kodunu kullanıcı diline çevirir. */
export function dbHata(e: unknown): NextResponse {
  const kod = (e as { code?: string })?.code
  if (kod === '23505') {
    return NextResponse.json({ error: 'Bu kod bu sürümde zaten var' }, { status: 409 })
  }
  if (kod === '23503') {
    return NextResponse.json({
      error: 'Kayıt bir denetimde kullanılıyor; silinemez. Pasife alın.',
    }, { status: 409 })
  }
  console.error('[olgunluk]', e)
  const msg = e instanceof Error ? e.message : 'Sunucu hatası'
  return NextResponse.json({ error: msg }, { status: 500 })
}
