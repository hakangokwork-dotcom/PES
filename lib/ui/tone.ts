/* Eşik ve durum rengi — TEK kaynak.
   Bu eşikler daha önce app/pes/page.tsx, compare, reports ve scoring içinde
   ayrı ayrı gömülüydü; biri değiştiğinde diğerleri sessizce yanlış kalıyordu. */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad'

export const EFF_GOOD = 90
export const EFF_WARN = 75

/** Verimlilik / skor yüzdesi → durum tonu */
export function effTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value)) return 'neutral'
  if (value >= EFF_GOOD) return 'good'
  if (value >= EFF_WARN) return 'warn'
  return 'bad'
}

export const FPQ_GOOD = 97
export const FPQ_WARN = 93

/** Kalite oranı (FPQ, ilk geçiş) — verimlilikten farklı eşik istersen burada tut. */
export function fpqTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value)) return 'neutral'
  if (value >= FPQ_GOOD) return 'good'
  if (value >= FPQ_WARN) return 'warn'
  return 'bad'
}

/** İşgücü devir oranı (%) — düşük iyi. Eşikler metrics-ontology isgucu_devir ile aynı. */
export function devirTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value)) return 'neutral'
  if (value < 5) return 'good'
  if (value < 10) return 'warn'
  return 'bad'
}

/** A/B/C/D kademesi → durum tonu */
export function tierTone(tier: string | null | undefined): Tone {
  switch (tier) {
    case 'A': return 'good'
    case 'B': return 'warn'
    case 'C':
    case 'D': return 'bad'
    default: return 'neutral'
  }
}

/** Rozet zemin + metin */
export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted',
  good: 'bg-ok-soft text-ok-ink',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-danger-soft text-danger',
}

/** Sadece metin rengi — tablo hücrelerindeki sayılar için */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-ok-ink font-medium',
  warn: 'text-warn font-medium',
  bad: 'text-danger font-semibold',
}

/** Dolu çubuk (yatay bar) zemini */
export const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-line',
  good: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-danger',
}

/** Rengin yanında yazılan kelime — durum yalnız renkle anlatılmasın. */
export const TONE_ETIKET: Record<Tone, string> = {
  neutral: '',
  good: 'İyi',
  warn: 'Uyarı',
  bad: 'Kritik',
}

/* GRAFİK RENKLERİ — recharts sınıf değil, somut renk dizesi istiyor;
   CSS değişkeni SSR'da çözülmüyor. Bu yüzden token'ların hex karşılığı
   BURADA, tek yerde durur. app/ ve components/ altında elle yazılmış
   marka hex'i kalmadı; değişiklik gerekirse globals.css ile birlikte
   burası güncellenir. */
export const GRAFIK_RENK: Record<Tone, string> = {
  neutral: '#6E6C66',
  good: '#2E7550',
  warn: '#8F5E14',
  bad: '#A32B2B',
}

/** Grafiklerde marka rengi (çizgi, alan, bar) — globals.css --color-accent. */
export const GRAFIK_AKSAN = '#B5532F'

/* Grafik kromu — ızgara ve eksen etiketi. globals.css'teki --color-line ve
   --color-faint'in hex karşılığı; recharts CSS değişkeni kabul etmiyor.
   Elle #f0f0f0 / #9ca3af yazmak yerine buradan alınır. */
export const GRAFIK_IZGARA = '#DAD7CC'
export const GRAFIK_ETIKET = '#6E6C66'

/** Satır işareti — satırın tamamı boyanmaz, ince bir sol şerit gelir */
export const TONE_ROW: Record<Tone, string> = {
  neutral: '',
  good: '',
  warn: '',
  bad: 'bg-danger-soft/25 shadow-[inset_2px_0_0_var(--color-danger)]',
}
