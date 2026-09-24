import { withTenant } from '@/lib/supabase/tenant-db'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from './ekonomi-sorgu'
import { hesapla } from './ekonomi-hesap'
import type { EkonomiRasyo } from './ekonomi-tipler'

/**
 * Akran değerlerini toplar — atölye panelinin kıyas verisi.
 *
 * BİLİNÇLİ YETKİ YÜKSELTMESİ. Atölye kullanıcısı RLS yüzünden yalnız kendi
 * satırını görür, yani medyanı hesaplayamaz. Bu fonksiyon aynı kiracı
 * içinde `workshopId: null` bağlamı açar ve bütün satırları okur.
 *
 * YÜKSELTME TEK YERDE VE ÇIKIŞI SAYIDIR. Fonksiyon yalnız
 * `Record<alan, Array<number|null>>` döndürür: atölye kimliği, adı, kodu
 * ya da satırı hiç dışarı çıkmaz. Dönüş tipi bunu yapısal olarak garanti
 * eder — sızıntı için tipin değişmesi gerekir, ki o da gözden kaçmaz.
 *
 * Değerler KARIŞTIRILIR. Dizinin sırası atölye sırasıyla aynı kalsaydı,
 * iki farklı göstergenin dizileri yan yana konarak tek tek atölyelerin
 * profili geri kurulabilirdi. Sıralama bağı koparılıyor.
 */
export type AkranDegerleri = Record<string, Array<number | null>>

/** Fisher-Yates; dizideki değerlerin atölye eşleşmesini koparır. */
function karistir<T>(dizi: T[]): T[] {
  const d = [...dizi]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

export async function akranDegerleri(
  tenantId: string,
  donem: string,
  alanlar: ReadonlyArray<keyof EkonomiRasyo>,
): Promise<AkranDegerleri> {
  const [yil, ay] = donem.split('-').map(Number)

  const rasyolar = await withTenant(tenantId, async (sql) => {
    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as unknown as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])
    return (ham as unknown as Array<Record<string, unknown>>).map((r) =>
      hesapla(dbSatiriCoz(r as never, param)))
  }, { workshopId: null })

  const cikti: AkranDegerleri = {}
  for (const alan of alanlar) {
    cikti[alan as string] = karistir(
      rasyolar
        .map((r) => r[alan] as number | null)
        /* Hiç verisi olmayan atölyeler örnekleme girmemeli: n'i şişirir ve
           küçük örneklem korumasını yanıltır. */
        .filter((v) => v !== null),
    )
  }
  return cikti
}
