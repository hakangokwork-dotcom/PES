import { describe, expect, test } from 'vitest'
import { enumCoz, enumHata, sayiAraliginda } from './import-dogrula'

/* Bu testler gerçek hatalardan türedi: Furkan'ın "value too long for type
   character(1)" hatası ve şablonların Türkçe karakter uyumsuzluğu. */

const DURUS = ['Planlı', 'Plansız', 'Organizasyonel', 'Tedarik'] as const
const BANT = ['Normal', 'Küçük'] as const
const URETIM = ['CMT', 'CMT+Yıkama', 'Dikim', 'Kesim & Dikim'] as const

describe('enumCoz — kullanıcı yazımını veritabanı değerine çevirir', () => {
  test('tam eşleşme aynen döner', () => {
    expect(enumCoz('Plansız', DURUS)).toBe('Plansız')
    expect(enumCoz('Normal', BANT)).toBe('Normal')
  })

  test('Türkçe karakter kaybı tolere edilir (şablonun asıl hatası)', () => {
    expect(enumCoz('Plansiz', DURUS)).toBe('Plansız')
    expect(enumCoz('Planli', DURUS)).toBe('Planlı')
    expect(enumCoz('Kucuk', BANT)).toBe('Küçük')
    expect(enumCoz('CMT+Yikama', URETIM)).toBe('CMT+Yıkama')
  })

  test('büyük/küçük harf farkı tolere edilir', () => {
    expect(enumCoz('plansiz', DURUS)).toBe('Plansız')
    expect(enumCoz('KÜÇÜK', BANT)).toBe('Küçük')
    expect(enumCoz('cmt', URETIM)).toBe('CMT')
  })

  test('baştaki/sondaki boşluk tolere edilir', () => {
    expect(enumCoz('  Tedarik  ', DURUS)).toBe('Tedarik')
  })

  test('ayraç farkı tolere edilir — "Kesim & Dikim" vs "Kesim ve Dikim"', () => {
    expect(enumCoz('Kesim ve Dikim', URETIM)).toBe('Kesim & Dikim')
    expect(enumCoz('Kesim&Dikim', URETIM)).toBe('Kesim & Dikim')
  })

  test('boş değer null döner — çağıran varsayılana karar verir', () => {
    expect(enumCoz('', DURUS)).toBeNull()
    expect(enumCoz(null, DURUS)).toBeNull()
    expect(enumCoz(undefined, DURUS)).toBeNull()
  })

  test('tanınmayan değer null döner — sessizce yanlış değere düşmez', () => {
    expect(enumCoz('Saçmalık', DURUS)).toBeNull()
    /* KRİTİK: 'CMT' bir bant tipi DEĞİL. Eskiden bu değer workshop.type'a
       yazılıp CHAR(1) taşmasına yol açıyordu. */
    expect(enumCoz('CMT', BANT)).toBeNull()
  })
})

describe('enumHata — kullanıcıya ne yapacağını söyler', () => {
  test('geçersiz değeri ve geçerli seçenekleri birlikte verir', () => {
    const m = enumHata('tip', 'Saçmalık', DURUS, 5)
    expect(m).toContain('satır 5')
    expect(m).toContain('tip')
    expect(m).toContain('Saçmalık')
    expect(m).toContain('Plansız')
  })

  test('satır numarası verilmezse satırdan bahsetmez', () => {
    expect(enumHata('tip', 'X', DURUS)).not.toContain('satır')
  })
})

describe('sayiAraliginda — aralık dışı sayıyı yakalar', () => {
  test('aralıktaki değer geçer', () => {
    expect(sayiAraliginda('6', 1, 6)).toBe(6)
    expect(sayiAraliginda('1', 1, 6)).toBe(1)
  })

  test('aralık dışı ve sayı olmayan null döner', () => {
    expect(sayiAraliginda('7', 1, 6)).toBeNull()
    expect(sayiAraliginda('0', 1, 6)).toBeNull()
    expect(sayiAraliginda('abc', 1, 6)).toBeNull()
    expect(sayiAraliginda('', 1, 6)).toBeNull()
  })
})
