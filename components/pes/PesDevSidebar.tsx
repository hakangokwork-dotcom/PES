'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Factory, ShieldCheck, CalendarDays,
  Boxes, CircleCheck, CirclePause, RefreshCw, Users, Wallet, Upload,
  Star, ArrowLeftRight, Gauge, ClipboardList, Search, CircleCheckBig,
  Shapes, Workflow, Waypoints, Calculator,
  BookOpen, Table2, TrendingUp, History, ChartColumn,
  ArrowRight,
} from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import {
  NavGroupBlock, SidebarIdentity, type NavGroup,
} from '@/components/pes/SidebarParts'

/* GRUPLAMA — iş akışına göre, konu başlığına göre değil.
   Eskiden "Performans & Karşılaştırma" 10 madde taşıyordu ve içine ait
   olmayanları (Gider Yükle, Sözlük, Beyan Geçmişi) almıştı; kullanıcı
   aradığını orada bulamıyordu. Yeni ayrım kullanıcının ne YAPTIĞINA göre:
   günlük operasyon / veri girme / analiz etme / modelleme / başvurma. */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'operasyon',
    title: 'Operasyon',
    items: [
      { label: 'Dashboard',        href: '/pes',               icon: LayoutDashboard },
      { label: 'Atölyeler',        href: '/pes/workshops',     icon: Factory },
      { label: 'Profil & Denetim', href: '/pes/atolye-profil', icon: ShieldCheck },
      { label: 'Atölye Takvimleri', href: '/pes/takvim',       icon: CalendarDays },
    ],
  },
  {
    id: 'veri_girisi',
    title: 'Veri girişi',
    items: [
      { label: 'Üretim',      href: '/pes/production',      icon: Boxes },
      { label: 'Kalite',      href: '/pes/quality',         icon: CircleCheck },
      { label: 'Duruş',       href: '/pes/downtime',        icon: CirclePause },
      { label: 'Changeover',  href: '/pes/changeover',      icon: RefreshCw },
      { label: 'İşgücü',      href: '/pes/workforce',       icon: Users },
      { label: 'Maliyet',     href: '/pes/costs',           icon: Wallet },
      { label: 'Gider Yükle', href: '/pes/expenses/import', icon: Upload },
    ],
  },
  {
    id: 'analiz',
    title: 'Analiz',
    items: [
      { label: 'Skorlama',       href: '/pes/scoring',       icon: Star },
      { label: 'Karşılaştırma',  href: '/pes/compare',       icon: ArrowLeftRight },
      { label: 'Benchmark',      href: '/pes/benchmark',     icon: Gauge },
      { label: 'Yetenek Raporu', href: '/pes/yetenek-rapor', icon: ClipboardList },
      { label: 'Yetenek Arama',  href: '/pes/yetenek-arama', icon: Search },
      { label: 'Veri Kalitesi',  href: '/pes/veri-kalitesi', icon: CircleCheckBig },
    ],
  },
  {
    id: 'modelleme',
    title: 'Modelleme',
    items: [
      { label: 'Modeller',         href: '/pes/models',            icon: Shapes },
      { label: 'Süreçler',         href: '/pes/processes',         icon: Workflow },
      { label: 'VSM / Simülasyon', href: '/pes/uretim-simulasyon', icon: Waypoints },
      { label: 'Atölye Fiyatlama', href: '/pes/eder-maliyet',      icon: Calculator },
    ],
  },
  {
    id: 'referans',
    title: 'Referans',
    items: [
      { label: 'Sözlük',           href: '/pes/sozluk',             icon: BookOpen },
      { label: 'Referans',         href: '/pes/referans',           icon: Table2 },
      { label: 'Fiyat Endeksleri', href: '/pes/endeks',             icon: TrendingUp },
      { label: 'Beyan Geçmişi',    href: '/pes/expenses/revisions', icon: History },
      { label: 'Raporlar',         href: '/pes/reports',            icon: ChartColumn },
    ],
  },
]

export default function PesDevSidebar({
  eposta = null, tenantAdi = null,
}: { eposta?: string | null; tenantAdi?: string | null }) {
  const pathname = usePathname()
  const [arama, setArama] = useState('')

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    if (!q) return NAV_GROUPS
    return NAV_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLocaleLowerCase('tr-TR').includes(q)) }))
      .filter(g => g.items.length > 0)
  }, [arama])

  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-line-soft bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-line-soft px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-[10px] font-bold tracking-wider text-white">
            PES
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-ink">Merkez Paneli</span>
            <span className="block text-[10px] leading-tight tracking-wide text-faint">Verimlilik Sistemi</span>
          </span>
        </div>
      </div>

      <div className="shrink-0 border-b border-line-soft px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" strokeWidth={1.8} />
          <input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Sayfa ara"
            className="w-full rounded-md border border-line-soft bg-canvas py-1.5 pl-7 pr-2.5 text-xs text-ink placeholder:text-faint focus:border-line focus:bg-surface focus:outline-none"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {gruplar.map((g, i) => (
          <NavGroupBlock key={g.id} group={g} pathname={pathname} kokRota="/pes" ilk={i === 0} />
        ))}
        {gruplar.length === 0 && (
          <p className="px-3 py-4 text-center text-xs italic text-faint">
            “{arama}” için sonuç yok
          </p>
        )}
      </nav>

      <div className="shrink-0 border-t border-line-soft px-3 py-2">
        <Link
          href="/workshop"
          className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <ArrowRight className="size-3.5" strokeWidth={1.8} />
          Atölye Paneli
        </Link>
      </div>

      <SidebarIdentity eposta={eposta} tenantAdi={tenantAdi} />

      <div className="shrink-0 px-3 pb-2 text-[10px] text-faint">
        {/* Dev Mode rozeti üretimde görünmemeli — kullanıcıya bir şey söylemiyor. */}
        {process.env.NODE_ENV !== 'production' && (
          <span className="mr-2 font-medium text-warn">Dev Mode</span>
        )}
        {APP_VERSION}
      </div>
    </aside>
  )
}
