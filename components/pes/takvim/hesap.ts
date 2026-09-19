/* DTO → hesap bağlamı köprüsü ve tarih yardımcıları.

   Oran hesabı BURADA DEĞİL: lib/pes/bant-doluluk'ta. Bu dosya yalnız
   API'nin ham satırlarını o modülün beklediği şekle sokar. Sayfa ve satır
   bileşenleri aynı köprüden geçer ki iki farklı gerçek oluşmasın. */

import { gunEkle } from '@/lib/pes/yerlestirme'
import {
  gunlukDoluluk, planBitisi,
  type BantTanim, type BlokTanim, type AtamaTanim,
  type HesapBaglami, type GercekHaritasi,
} from '@/lib/pes/bant-doluluk'
import type { TakvimVerisi, Atama, Blok, Malzeme, CekmeTesti } from './tipler'

/* ---------- tarih ---------- */
export const TR_AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const TR_GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

const iki = (n: number) => String(n).padStart(2, '0')

export function bugunIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

/** 'YYYY-MM-DD' → yerel Date (saat dilimi kaymasız). */
export function yerelTarih(iso: string): Date {
  const [y, a, g] = iso.split('-').map(Number)
  return new Date(y, a - 1, g)
}

export function trTarih(iso: string): string {
  const [, a, g] = iso.split('-')
  return `${g}.${a}`
}

export function ayAraligi(y: number, m0: number) {
  const son = new Date(y, m0 + 1, 0).getDate()
  return { baslangic: `${y}-${iki(m0 + 1)}-01`, bitis: `${y}-${iki(m0 + 1)}-${iki(son)}` }
}

/** Verilen günü kapsayan Pazartesi–Pazar haftası. */
export function haftaAraligi(iso: string) {
  const d = yerelTarih(iso)
  const ofset = (d.getDay() + 6) % 7
  const pzt = gunEkle(iso, -ofset)
  return { baslangic: pzt, bitis: gunEkle(pzt, 6) }
}

export function gunListesi(baslangic: string, bitis: string): string[] {
  const out: string[] = []
  for (let t = baslangic; t <= bitis; t = gunEkle(t, 1)) out.push(t)
  return out
}

/* ---------- DTO → bağlam ---------- */

/** Bir atölyenin hesap bağlamı. Atölye başına kurulur — kapasite atölyenindir. */
export function atolyeBaglami(veri: TakvimVerisi, atolyeId: number): HesapBaglami {
  const bantlar: BantTanim[] = veri.bantlar
    .filter(b => b.workshop_id === atolyeId)
    .map(b => ({ lineId: b.id, dailyTarget: b.daily_target, aktif: b.is_active }))

  const bantIdleri = new Set(bantlar.map(b => b.lineId))
  const bloklar: BlokTanim[] = veri.bloklar
    .filter(b => bantIdleri.has(b.line_id))
    .map(b => ({
      lineId: b.line_id,
      tip: b.tip as BlokTanim['tip'],
      adet: b.adet,
      baslangic: b.baslangic_tarihi,
      bitis: b.bitis_tarihi,
    }))

  /* Gün başına O(1) arama — 131 atölye × 31 gün için doğrusal tarama pahalı. */
  const override = new Map<string, number>()
  for (const k of veri.kapasiteGun) {
    if (k.workshop_id === atolyeId) override.set(k.tarih, k.gunluk_kapasite)
  }

  return { bantlar, bloklar, override: t => override.get(t) ?? null }
}

/** plan_adet dolu satırlar elle giriştir; adet dolu satırlar gerçekleşendir. */
export function gunlukHaritalari(veri: TakvimVerisi) {
  const elle: Record<number, Record<string, number>> = {}
  const gercekler: GercekHaritasi = {}
  for (const g of veri.gunluk) {
    if (g.plan_adet != null) (elle[g.atama_id] ??= {})[g.tarih] = g.plan_adet
    /* adet NULL = GİRİLMEDİ. 0 yazmak duran bandı sıfır üretimle
       karıştırırdı — plan-gercek.ts ile aynı kural. */
    if (g.adet != null) (gercekler[g.atama_id] ??= {})[g.tarih] = g.adet
  }
  return { elle, gercekler }
}

export function atamaTanimi(
  a: Atama, elle: Record<number, Record<string, number>>,
): AtamaTanim {
  return {
    atamaId: a.id,
    lineId: a.line_id,
    adet: a.adet,
    planBaslangic: a.plan_baslangic,
    elleplan: elle[a.id] ?? {},
  }
}

/* ---------- atölye başına hazır paket ---------- */
export type AtolyePaketi = {
  ctx: HesapBaglami
  atamalar: AtamaTanim[]
  atamaKaynak: Map<number, Atama>
  gercekler: GercekHaritasi
  /** atamaId → türetilmiş bitiş (K4) */
  bitisler: Map<number, string>
}

export function atolyePaketleri(veri: TakvimVerisi): Map<number, AtolyePaketi> {
  const { elle, gercekler } = gunlukHaritalari(veri)
  const out = new Map<number, AtolyePaketi>()
  for (const w of veri.atolyeler) {
    const ctx = atolyeBaglami(veri, w.id)
    const bantIdleri = new Set(ctx.bantlar.map(b => b.lineId))
    const kaynak = veri.atamalar.filter(a => bantIdleri.has(a.line_id))
    const atamalar = kaynak.map(a => atamaTanimi(a, elle))
    const bitisler = new Map(atamalar.map(a => [a.atamaId, planBitisi(a, ctx)]))
    out.set(w.id, {
      ctx, atamalar, gercekler, bitisler,
      atamaKaynak: new Map(kaynak.map(a => [a.id, a])),
    })
  }
  return out
}

/* ---------- uyarılar ---------- */
export type Uyarilar = {
  /** 'atolyeId|tarih' */
  asim: Set<string>
  eskimisRezerve: Blok[]
  teslimRiski: Atama[]
}

export function uyarilariHesapla(
  veri: TakvimVerisi, paketler: Map<number, AtolyePaketi>, gunler: string[], bugun: string,
): Uyarilar {
  const asim = new Set<string>()
  const teslimRiski: Atama[] = []
  for (const [wsId, p] of paketler) {
    for (const t of gunler) {
      if (gunlukDoluluk(t, p.atamalar, p.ctx, p.gercekler).asim) asim.add(`${wsId}|${t}`)
    }
    for (const a of p.atamaKaynak.values()) {
      const bitis = p.bitisler.get(a.id)
      if (a.teslim_tarihi && bitis && bitis > a.teslim_tarihi) teslimRiski.push(a)
    }
  }
  const eskimisRezerve = veri.bloklar.filter(
    b => b.tip === 'REZERVE' && b.gecerlilik_bitis != null && b.gecerlilik_bitis < bugun)
  return { asim, eskimisRezerve, teslimRiski }
}

/* ---------- PO satırı rozetleri ---------- */

export type Rozet = { sinif: 'ok' | 'wait' | 'bad' | 'neu'; etiket: string }

/** Malzeme durumu: eksik geldi > gecikti > bekleniyor > tam. */
export function malzemeDurumu(malzemeler: Malzeme[], bugun: string): Rozet {
  if (!malzemeler.length) return { sinif: 'neu', etiket: 'Malzeme kaydı yok' }
  const eksik = malzemeler.filter(m =>
    m.durum === 'Eksik' || (m.gelis_tarihi && m.gelen_miktar != null && m.miktar != null && m.gelen_miktar < m.miktar))
  if (eksik.length) return { sinif: 'bad', etiket: eksik.some(m => m.tip === 'KUMAŞ') ? 'Kumaş eksik' : 'Malzeme eksik' }
  const gelmeyen = malzemeler.filter(m => !m.gelis_tarihi && m.durum !== 'Geldi')
  if (gelmeyen.length) {
    const gec = gelmeyen.some(m => m.beklenen_tarih != null && m.beklenen_tarih < bugun)
    return gec
      ? { sinif: 'bad', etiket: `${gelmeyen.length} malzeme gecikti` }
      : { sinif: 'wait', etiket: `${gelmeyen.length} malzeme bekleniyor` }
  }
  return { sinif: 'ok', etiket: 'Malzeme tam' }
}

export function testDurumu(test: CekmeTesti | null): Rozet {
  if (!test) return { sinif: 'neu', etiket: 'Çekme testi yok' }
  if (test.sonuc === 'UYGUN') return { sinif: 'ok', etiket: 'Çekme ✓' }
  if (test.sonuc === 'RİSKLİ') return { sinif: 'bad', etiket: 'Çekme riskli' }
  if (test.sonuc === 'RED') return { sinif: 'bad', etiket: 'Çekme RED' }
  return { sinif: 'wait', etiket: 'Çekme bekliyor' }
}
