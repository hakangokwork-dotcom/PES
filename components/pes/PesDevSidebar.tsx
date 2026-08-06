'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_VERSION } from '@/lib/version'

type NavItem = { label: string; href: string; icon: string }
type NavGroup = { id: string; title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'genel',
    title: 'Genel',
    items: [
      { label: 'Dashboard', href: '/pes', icon: '▦' },
    ],
  },
  {
    id: 'atolyeler',
    title: 'Atölyeler & Plan',
    items: [
      { label: 'Atölyeler',         href: '/pes/workshops', icon: '⚙' },
      { label: 'Profil & Denetim',  href: '/pes/atolye-profil', icon: '🛡' },
      { label: 'Atölye Takvimleri', href: '/pes/takvim',    icon: '🗓' },
    ],
  },
  {
    id: 'siparis_uretim',
    title: 'Sipariş & Üretim',
    items: [
      { label: 'Üretim',           href: '/pes/production',    icon: '⊞' },
      { label: 'Atölye Fiyatlama', href: '/pes/eder-maliyet',  icon: '⊕' },
      { label: 'VSM / Simülasyon', href: '/pes/uretim-simulasyon', icon: '⊿' },
    ],
  },
  {
    id: 'modelleme',
    title: 'Modelleme',
    items: [
      { label: 'Modeller',  href: '/pes/models',    icon: '◫' },
      { label: 'Süreçler',  href: '/pes/processes', icon: '⇄' },
    ],
  },
  {
    id: 'verimlilik',
    title: 'Verimlilik & Kalite',
    items: [
      { label: 'Kalite',     href: '/pes/quality',    icon: '◎' },
      { label: 'Duruş',      href: '/pes/downtime',   icon: '⏸' },
      { label: 'Changeover', href: '/pes/changeover', icon: '↻' },
    ],
  },
  {
    id: 'ik_maliyet',
    title: 'İK & Maliyet',
    items: [
      { label: 'İşgücü',  href: '/pes/workforce', icon: '👥' },
      { label: 'Maliyet', href: '/pes/costs',     icon: '₺' },
    ],
  },
  {
    id: 'performans',
    title: 'Performans & Karşılaştırma',
    items: [
      { label: 'Skorlama',        href: '/pes/scoring',       icon: '★' },
      { label: 'Karşılaştırma',   href: '/pes/compare',       icon: '⇔' },
      { label: 'Benchmark',       href: '/pes/benchmark',     icon: '◈' },
      { label: 'Yetenek Raporu',  href: '/pes/yetenek-rapor', icon: '◇' },
      { label: 'Yetenek Arama',   href: '/pes/yetenek-arama', icon: '⌕' },
      { label: 'Veri Kalitesi',   href: '/pes/veri-kalitesi', icon: '✓' },
      { label: 'Gider Yükle',     href: '/pes/expenses/import', icon: '↑' },
      { label: 'Beyan Geçmişi',   href: '/pes/expenses/revisions', icon: '⟲' },
      { label: 'Fiyat Endeksleri', href: '/pes/endeks',        icon: '₺' },
      { label: 'Sözlük',          href: '/pes/sozluk',        icon: '?' },
    ],
  },
  {
    id: 'referans_rapor',
    title: 'Referans & Raporlar',
    items: [
      { label: 'Referans',  href: '/pes/referans', icon: '▤' },
      { label: 'Raporlar',  href: '/pes/reports',  icon: '📊' },
    ],
  },
]

export default function PesDevSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  function toggleGroup(id: string) {
    setCollapsed(c => ({ ...c, [id]: !c[id] }))
  }

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return NAV_GROUPS
    const q = search.toLowerCase()
    return NAV_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0)
  }, [search])

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-line-soft flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-line-soft flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-hover rounded-md flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-[10px] tracking-wider">PES</span>
          </div>
          <div>
            <span className="font-semibold text-ink text-sm block leading-tight">Merkez Paneli</span>
            <span className="text-[10px] text-faint leading-tight tracking-wide">Verimlilik Sistemi</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Sayfa ara..."
          className="w-full px-2.5 py-1.5 text-xs border border-line-soft rounded-md bg-canvas focus:outline-none focus:border-gray-400 focus:bg-white"
        />
      </div>

      {/* Navigation — Grouped */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {filteredGroups.map((group, gi) => {
          const isCollapsed = collapsed[group.id]
          const hasActive = group.items.some(i => isItemActive(pathname, i.href))
          return (
            <div key={group.id} className={gi > 0 ? 'mt-3' : ''}>
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-faint hover:text-muted transition-colors"
              >
                <span>{group.title}</span>
                <span className={`text-[8px] transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▼</span>
              </button>
              {!isCollapsed && (
                <div className="space-y-px mt-0.5">
                  {group.items.map(item => {
                    const active = isItemActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                          active
                            ? 'bg-emerald-50 text-accent font-medium border-l-2 border-accent pl-[10px]'
                            : 'text-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <span className="text-sm w-4 inline-block text-center">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
              {isCollapsed && hasActive && (
                <div className="text-[9px] text-emerald-600 px-3 italic">aktif sayfa</div>
              )}
            </div>
          )
        })}
        {filteredGroups.length === 0 && (
          <div className="px-3 py-4 text-xs text-faint italic text-center">
            "{search}" için sonuç yok
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-line-soft px-3 py-2.5 flex-shrink-0 space-y-0.5">
        <Link href="/workshop"
          className="flex items-center gap-2 text-xs text-faint hover:text-ink hover:bg-canvas px-3 py-1.5 rounded transition-colors">
          <span>→</span>
          <span>Atölye Paneli</span>
        </Link>
        <p className="text-[9px] text-amber-600 font-medium px-3 py-0.5">Dev Mode</p>
        <p className="text-[10px] text-faint px-3 pt-0.5">{APP_VERSION}</p>
      </div>
    </aside>
  )
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/pes') return false
  return pathname.startsWith(href + '/')
}
