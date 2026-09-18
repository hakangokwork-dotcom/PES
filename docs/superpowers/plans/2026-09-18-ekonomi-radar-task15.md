# Task 15 (revised) — /pes/ekonomi Rasyo Radarı

**Bu doküman, `2026-09-15-atolye-ekonomi-e0.md`'nin Task 15 bölümünü değiştirir.**

Kullanıcı `Atolye_Rasyo_Radari.html` stilinde bir dashboard istedi. Sortable table yerine 5 bölümlü radar.

---

## Yapı

```
app/pes/ekonomi/
  page.tsx                    — server component, veri yükler
  RadarClient.tsx             — client wrapper, dönem + rasyo seçim state
  BolumTiles.tsx              — bölüm 1
  BolumGenelSiralama.tsx      — bölüm 2
  BolumRasyoGezgini.tsx       — bölüm 3
  BolumIsiHaritasi.tsx        — bölüm 4
  BolumAtolyeKarneleri.tsx    — bölüm 5

lib/pes/
  ekonomi-rasyo-meta.ts       — 36 rasyo metadatasi (grup, birim, yön, label, format)
  ekonomi-rasyo-meta.test.ts
  ekonomi-radar.ts            — sıralama, medyan, cv, en iyi/en kötü hesaplama
  ekonomi-radar.test.ts
```

---

## Bölüm 1 — Üst Kutucuklar (Tiles)

5 kart: **havuz kâr marjı** (∑karZarar ÷ ∑ciro), **zarar eden atölye sayısı** (marj < 0), **genel lider** (en düşük ortalama sıralamalı), **en ayrıştırıcı rasyo** (en yüksek CV), **en benzeştiren rasyo** (en düşük CV).

## Bölüm 2 — Genel Sıralama

Yatay bar grafik, her atölye için ortalama sıra. `sort by rank asc` (düşük = iyi). Grup ortalaması gri dikey çizgi olarak referans. Tıklanınca bölüm 5'teki atölye karnesine odaklanır.

## Bölüm 3 — Rasyo Gezgini

- Üstte 5 grup chip (Tümü, A/B/C/D/E) — filter.
- Sol tarafta rasyo listesi (sadece görünür gruptan).
- Sağ tarafta seçili rasyo detayı:
  - Başlık + badge (grup, birim, yön, CV)
  - `statstrip`: ortalama, havuz ort., medyan, mod, min, max, sd
  - Yatay bar (11 atölye), medyan + havuz ort. dikey çizgileri
  - En iyi / en kötü callout (yön nötr değilse)

## Bölüm 4 — Isı Haritası

Tablo — satır: rasyo, sütun: atölye. Hücre içeriği: sıra (1–N). Renk: 4 ton kova (1–3 en iyi, 4–6 orta, 7–8 kötü, 9–N en kötü). Hover: `<atölye> · <rasyo> · <değer> · Sıra: k/N`.

## Bölüm 5 — Atölye Karneleri

Genel sıralama ile sıralı kartlar. Her kart:
- Başlık: atölye adı + genel sıralama (`3.`)
- Ortalama sıra + ilk 3'e girdiği + son 3'te kaldığı rasyo sayısı
- **Güçlü olduğu**: en iyi 3 rasyo (sıra 1–3'te olanları)
- **Zayıf olduğu**: en kötü 3 rasyo (en yüksek sıra numaralılar)

Karta tıklanınca `/pes/ekonomi/[workshopId]` (Task 16) açılır.

---

## Veri kaynağı

`page.tsx`:

```tsx
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { marjSirasi, akranGrubu } from '@/lib/pes/ekonomi-akran'

// Sorgu parametresi: donem = 'YYYY-MM' (URL search param, default = son ay)
// Her aktif atölye için satır dönmeli — veri yoksa veri_var = false.
// Sonuçları hesapla() ile 36 rasyoya çevir; marjSirasi'yi ekle → 37 alan.
// Client'a sadece hesaplanmış rasyolar + isim + id geç, ham gider yok.
```

Server component `donem` URL search paramını okur, `postgres.js` bağlantısıyla `EKONOMI_SORGUSU` çalıştırır, her satırı `dbSatiriCoz` + `hesapla` ile 36 rasyoya çevirir. Bunlar `RadarClient`'a props geçer.

## Rasyo metadata

`lib/pes/ekonomi-rasyo-meta.ts`:

```ts
export type Yon = 'yuksek-iyi' | 'dusuk-iyi' | 'notr'
export type Grup = 'karlilik' | 'isgucu' | 'gider-yapisi' | 'birim-maliyet' | 'kadro'

export type RasyoMeta = {
  alan: keyof EkonomiRasyo | 'marjSirasi'
  etiket: string        // "Kâr/Zarar Marjı"
  birim: string         // "%", "TL/dk", "TL/adet", "kişi", "adet", "-"
  yon: Yon
  grup: Grup
  onemAciklama: string  // "Marj sırası atölyenin kârlılığındaki genel yerini gösterir"
}

export const RASYO_META: RasyoMeta[] = [
  // ... 36 alan + marjSirasi
]
```

Sıralanan (yön ≠ 'notr') 32 rasyo → genel sıralama, karne, ısı haritası içine girer.
'Notr' 4 rasyo (referans3D, aylikAdet, tesvik gibi passthrough) yalnız rasyo gezgininde görünür.

## Hesap katmanı

`lib/pes/ekonomi-radar.ts`:

```ts
export type AtolyeRasyolari = {
  workshopId: number
  ad: string
  code: string
  bolge: number | null
  veri_var: boolean
  rasyolar: EkonomiRasyo & { marjSirasi: number | null }
}

export type RasyoIstatistik = {
  alan: string; ort: number | null; havuzOrt: number | null; medyan: number | null
  min: number | null; max: number | null; sd: number | null; cv: number | null
  enIyi: string | null; enKotu: string | null
}

export type AtolyeSira = {
  workshopId: number; ad: string
  ortalamaSira: number | null
  ilk3Sayisi: number; son3Sayisi: number
  genelSira: number  // ortalama sıraya göre 1..n
  guclu3: Array<{ alan: string; sira: number }>
  zayif3: Array<{ alan: string; sira: number }>
}

export function siralamaHesapla(veri: AtolyeRasyolari[]): AtolyeSira[]
export function rasyoIstatistik(veri: AtolyeRasyolari[]): Record<string, RasyoIstatistik>
export function rasyoSiralari(veri: AtolyeRasyolari[]): Record<string, number[]>  // alan → sıra[]
```

## Testler

- `ekonomi-rasyo-meta.test.ts`: 36 + 1 = 37 kayıt olmalı; her `alan` benzersiz; yön kombinasyonları geçerli
- `ekonomi-radar.test.ts`: küçük örnekle sıralama doğrulaması, CV hesap, nullların atlanması, tie-breaking

## Stil

`Atolye_Rasyo_Radari.html` CSS değişkenleri kullanılabilir — Tailwind ile eşdeğer sınıflara dönüştür (mesela `var(--surface)` yerine `bg-neutral-50 dark:bg-neutral-900`). Renk skalası hex → Tailwind palet karşılığı.

---

## Commit stratejisi

Üç commit:
1. `feat(ekonomi): rasyo metadata + radar hesap katmani` — meta + radar hesap + testler
2. `feat(ekonomi): /pes/ekonomi rasyo radar dashboard` — 5 blok + page.tsx + RadarClient
3. (Task 16) `feat(ekonomi): /pes/ekonomi/[id] atolye karnesi` — sonraki görev

Her commit içindeki testler geçmeli. Tam paket dev sunucusunda çalışmalı: `npm run dev` sonrası `/pes/ekonomi?donem=2026-01` açılınca 11 pilot ile radar dolar.
