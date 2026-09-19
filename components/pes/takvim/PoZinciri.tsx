'use client'

import { pazarMi } from '@/lib/pes/bant-doluluk'
import type { Atama, Asama, Malzeme, CekmeTesti } from './tipler'
import { trTarih, malzemeDurumu, testDurumu, type Rozet } from './hesap'

/* PO satırı (K8, K9): sol tarafta satır içi durum rozetleri, sağda malzeme
   kilometre taşları (1. grid satırı) ve aşama zinciri (2+. satırlar).

   İki PO'nun grift geçişi burada görünür — PO-B'nin kesim çubuğu, PO-A'nın
   dikim bloğu hâlâ sürerken başlar. Çubuklar work_order_stage'in KENDİ
   plan tarihlerinden çizilir; buradan türetme yapılmaz.

   Aşama sınıfı renk değil ÇİZGİ ile ayrılır: zorunlu düz, değişken kesik.
   Dört zorunlu (kesim, hazırlık, dikim, UKP) + ürüne göre biri: yıkama,
   baskı ya da nakış. */

const DEGISKEN = new Set(['YIKAMA', 'BASKI', 'NAKIS'])
const nf = (n: number) => Math.round(n).toLocaleString('tr-TR')

type Sinif = 'pre' | 'sew' | 'opt' | 'post'
function asamaSinifi(a: Asama): Sinif {
  if (a.code === 'DIKIM') return 'sew'
  if (DEGISKEN.has(a.code)) return 'opt'
  return a.sira_no < 20 ? 'pre' : 'post'
}

const STIL: Record<Sinif, React.CSSProperties> = {
  pre:  { background: '#EFF2F4', border: '1px solid var(--color-line)', color: 'var(--color-muted)' },
  sew:  { background: '#B6DCC9', border: '1px solid #4FA57F', color: 'var(--color-ink)' },
  opt:  { background: 'var(--color-surface)', border: '1px dashed #7280C4', color: '#5B6BAF' },
  post: { background: '#EFF2F4', border: '1px solid var(--color-line)', color: 'var(--color-muted)' },
}

const ROZET: Record<Rozet['sinif'], string> = {
  ok:   'bg-accent-soft text-accent-ink',
  wait: 'bg-warn-soft text-warn',
  bad:  'bg-danger-soft text-danger',
  neu:  'bg-canvas text-faint border border-line-soft',
}

type Props = {
  atama: Atama
  atolyeId: number
  asamalar: Asama[]
  malzemeler: Malzeme[]
  test: CekmeTesti | null
  gunler: string[]
  bugun: string
  sablon: string
  icSablon: string
  genis: boolean
  onAtamaSec?: (a: Atama) => void
}

export default function PoSatiri({
  atama, atolyeId, asamalar, malzemeler, test, gunler, bugun, sablon, icSablon, genis, onAtamaSec,
}: Props) {
  const ilk = gunler[0], son = gunler[gunler.length - 1]
  const kolon = (t: string) => gunler.indexOf(t)
  const aralik = (bas: string, bit: string) => {
    if (bit < ilk || bas > son) return null
    const s = Math.max(0, gunler.findIndex(t => t >= bas))
    const eIdx = gunler.findIndex(t => t > bit)
    const e = eIdx < 0 ? gunler.length : eIdx
    return e > s ? { s, e } : null
  }

  const malzeme = malzemeDurumu(malzemeler, bugun)
  const cekme = testDurumu(test)
  const cizilecek = asamalar
    .filter(a => a.plan_baslangic && a.plan_bitis)
    .sort((x, y) => x.sira_no - y.sira_no)

  return (
    <div className="grid border-b border-line-soft bg-canvas/60" style={{ gridTemplateColumns: sablon }}>
      {/* Sol: PO künyesi ve satır içi durum */}
      <div className="sticky left-0 z-20 flex flex-col justify-center gap-1 border-r border-line bg-canvas/95 py-1.5 pl-14 pr-2.5">
        <button type="button" onClick={() => onAtamaSec?.(atama)} className="flex min-w-0 items-center gap-1.5 text-left">
          <span className="shrink-0 font-mono text-[11.5px] font-semibold text-ink">{atama.is_emri_no}</span>
          <span className="truncate text-[10.5px] text-faint">{atama.model_adi}</span>
        </button>
        <div className="flex flex-wrap gap-1">
          <Rozetcik r={malzeme} />
          <Rozetcik r={cekme} />
          {/* Risk dökümanı ayrı proje (K12); takvim yalnız eksiği işaretler. */}
          <span className={`rounded px-1 text-[9px] font-semibold ${ROZET.bad}`}>Risk dök. yok</span>
        </div>
      </div>

      {/* Sağ: kilometre taşları + zincir */}
      <div className="relative grid content-start" style={{ gridColumn: '2 / -1', gridTemplateColumns: icSablon, minHeight: 36 }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: icSablon }}>
          {gunler.map(t => (
            <div key={t} className={`border-r border-line-soft ${pazarMi(t) ? 'bg-canvas' : ''} ${t === bugun ? 'bg-accent-soft/50' : ''}`} />
          ))}
        </div>

        {/* 1. satır: malzeme kilometre taşları */}
        {malzemeler.map((m, i) => {
          const gun = m.gelis_tarihi ?? m.beklenen_tarih
          if (!gun) return null
          const k = kolon(gun); if (k < 0) return null
          const gec = !m.gelis_tarihi && m.beklenen_tarih != null && m.beklenen_tarih < bugun
          const eksik = m.durum === 'Eksik' || (m.gelis_tarihi && m.gelen_miktar != null && m.miktar != null && m.gelen_miktar < m.miktar)
          const renk = m.gelis_tarihi
            ? (eksik ? 'var(--color-danger)' : 'var(--color-accent)')
            : (gec ? 'var(--color-danger)' : 'var(--color-surface)')
          return (
            <span key={`m${i}`} className="relative z-[3] mx-auto mt-1 h-2.5 w-2.5 self-start rounded-[1px]"
              style={{ gridColumn: `${k + 1}`, gridRow: 1, background: renk, transform: 'rotate(45deg)',
                boxShadow: m.gelis_tarihi ? undefined : 'inset 0 0 0 2px var(--color-warn)' }}
              title={`${m.tip} · ${m.ad}\n${m.durum} · beklenen ${m.beklenen_tarih ? trTarih(m.beklenen_tarih) : '—'}${m.gelis_tarihi ? ` · geldi ${trTarih(m.gelis_tarihi)}` : ' · gelmedi'}${m.miktar != null ? `\nSipariş ${nf(m.miktar)} ${m.birim ?? ''} · gelen ${m.gelen_miktar != null ? nf(m.gelen_miktar) : '—'} ${m.birim ?? ''}` : ''}`} />
          )
        })}

        {/* 2+. satır: aşama zinciri */}
        {cizilecek.map((a, i) => {
          const sp = aralik(a.plan_baslangic!, a.plan_bitis!); if (!sp) return null
          const sinif = asamaSinifi(a)
          const dis = a.workshop_id != null && a.workshop_id !== atolyeId
          const bitti = !!a.gercek_bitis || a.durum === 'Tamamlandi'
          const basladi = !!a.gercek_baslangic || a.durum === 'Devam'
          const ilerleme = bitti ? 100 : basladi ? Math.max(8, a.ilerleme_pct ?? 50) : 0
          const geciken = !basladi && a.plan_baslangic! < bugun && a.durum !== 'İptal'
          const dar = sp.e - sp.s < 3
          return (
            <button key={a.id} type="button" onClick={() => onAtamaSec?.(atama)}
              className="relative z-[2] my-0.5 mx-px flex h-[15px] items-center overflow-hidden rounded-[3px] px-1.5 text-left text-[9px] font-semibold"
              style={{ ...STIL[sinif], gridColumn: `${sp.s + 1} / ${sp.e + 1}`, gridRow: i + 2,
                ...(geciken ? { borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}) }}
              title={`${a.name}${a.zorunlu ? '' : ' · opsiyonel'}${dis ? ' · dış atölye' : ''}\nPlan ${trTarih(a.plan_baslangic!)} → ${trTarih(a.plan_bitis!)}${a.gercek_baslangic ? `\nGerçek ${trTarih(a.gercek_baslangic)}${a.gercek_bitis ? ` → ${trTarih(a.gercek_bitis)}` : ' → sürüyor'}` : '\nHenüz başlamadı'}${geciken ? '\n⚠ Başlaması gerekiyordu' : ''}`}>
              <span className="absolute inset-y-0 left-0 opacity-30" style={{ width: `${ilerleme}%`, background: '#4FA57F' }} />
              <span className="relative z-[1] truncate">
                {dar ? a.name.slice(0, 3) : a.name}
                {!dar && dis && genis && <span className="ml-1 font-medium opacity-70">· dış</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Rozetcik({ r }: { r: Rozet }) {
  return <span className={`rounded px-1 text-[9px] font-semibold ${ROZET[r.sinif]}`}>{r.etiket}</span>
}
