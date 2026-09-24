/**
 * Katalog sürüklenme testleri.
 *
 * Katalog, ekonomi-hesap.ts'in yaptığı işi SÖZLE tekrar eder. Tekrar eden her
 * belge sapar. Buradaki dört test sapmayı sessiz bırakmaz:
 *
 *   1. id'ler tekil ve 54 giriş duruyor
 *   2. alan dolu her giriş gerçek bir hesapla() çıktısına işaret ediyor
 *   3. kod dolu her giriş gerçekten dışa aktarılmış bir fonksiyona işaret ediyor
 *   4. sıralanabilir her rasyonun bir katalog girişi var
 *
 * Dördüncüsü asıl koruma: yeni bir rasyo eklenip formülü yazılmazsa test kırılır.
 */
import { describe, it, expect } from 'vitest'
import { FORMUL_KATALOGU, formulBul, alanFormulu } from './formul-katalogu'
import { RASYO_META } from './ekonomi-rasyo-meta'
import { hesapla } from './ekonomi-hesap'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'

/* hesapla() çıktısının alan adları + iki geç hesaplanan alan. */
const bosGirdi = {
  gider: { incentive_amount: null },
  ekonomi: {
    revenue_declared: null, idle_days: null, qty_declared: null,
    nominal_days: null, actual_days: null, hours_per_day: null,
    cutting_staff: null, sewing_staff: null, ukp_staff: null, office_staff: null,
    area_m: null, source: 'beyan' as const,
  },
  param: VARSAYILAN_PARAM,
  dkMaliyet3D: null,
  qtyActual: null,
}

const GECERLI_ALANLAR = new Set([
  ...Object.keys(hesapla(bosGirdi)),
  /* ikinci geçişte, örneklem gerektirdiği için hesapla() dışında doldurulur */
  'marjSirasi',
  'fiyatEndeksi',
])

describe('formül kataloğu', () => {
  it('54 giriş taşıyor ve id\'ler tekil', () => {
    expect(FORMUL_KATALOGU).toHaveLength(54)
    const idler = FORMUL_KATALOGU.map((f) => f.id)
    expect(new Set(idler).size).toBe(54)
  })

  it('her girişin sözel formülü ve okuma notu dolu', () => {
    const bos = FORMUL_KATALOGU.filter((f) => !f.sozel.trim() || !f.okuma.trim())
    expect(bos.map((f) => f.id)).toEqual([])
  })

  it('bildirilen her alan gerçek bir rasyo alanına işaret ediyor', () => {
    const hayalet = FORMUL_KATALOGU
      .flatMap((f) => f.alanlar.map((a) => ({ id: f.id, a })))
      .filter(({ a }) => !GECERLI_ALANLAR.has(a))
      .map(({ id, a }) => `${id} → ${a}`)
    expect(hayalet).toEqual([])
  })

  it('bir rasyo alanı en fazla bir girişe bağlı', () => {
    const alanlar = FORMUL_KATALOGU.flatMap((f) => f.alanlar)
    expect(new Set(alanlar).size).toBe(alanlar.length)
  })

  it('bölüm dk maliyeti tek satırda üç alan hesaplıyor', () => {
    /* Excel'de tek satır: "KESİM / DİKİM / UKP dk maliyeti". Yalnız dikime
       bağlansaydı kesim ve UKP formülsüz kalırdı — ilk yazımda öyle olmuştu. */
    expect(formulBul('hesap.bolum-dk-maliyet')?.alanlar)
      .toEqual(['kesimDkMaliyet', 'dikimDkMaliyet', 'ukpDkMaliyet'])
  })

  it('kod dolu her giriş dışa aktarılmış bir fonksiyona işaret ediyor', async () => {
    const moduller: Record<string, Record<string, unknown>> = {
      'lib/pes/ekonomi-hesap.ts': await import('./ekonomi-hesap'),
      'lib/pes/ekonomi-akran.ts': await import('./ekonomi-akran'),
      'lib/pes/model-fiyat.ts': await import('./model-fiyat'),
    }

    const kirik: string[] = []
    for (const f of FORMUL_KATALOGU) {
      if (!f.kod) continue
      const [dosya, ad] = f.kod.split('#')
      const mod = moduller[dosya]
      if (!mod) { kirik.push(`${f.id} → bilinmeyen dosya ${dosya}`); continue }
      if (typeof mod[ad] !== 'function') kirik.push(`${f.id} → ${f.kod} yok`)
    }
    expect(kirik).toEqual([])
  })

  it('sıralanabilir her rasyonun bir katalog girişi var', () => {
    const eksik = RASYO_META
      .filter((m) => m.yon !== 'notr')
      .filter((m) => alanFormulu(m.alan as string) === null)
      .map((m) => `${m.alan} (${m.etiket})`)
    expect(eksik).toEqual([])
  })

  it('formulBul id ile bulur, olmayana null döner', () => {
    expect(formulBul('hesap.marj')?.etiket).toBe('Marj %')
    expect(formulBul('yok.boyle.bir.sey')).toBeNull()
  })

  it('aynı gösterge iki sayfada geçse bile ayrı giriş — Marj %', () => {
    /* FORMULLER'da "Marj %" hem HESAP hem MODEL_HESAP satırında var.
       Eşleme sayfa|gösterge çiftine bakmasaydı biri sessizce düşerdi. */
    expect(formulBul('hesap.marj')?.kaynak).toBe('HESAP')
    expect(formulBul('model.marj')?.kaynak).toBe('MODEL_HESAP')
  })
})
