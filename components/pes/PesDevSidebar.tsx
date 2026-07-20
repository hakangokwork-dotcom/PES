'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
      { label: 'Atölye Takvimleri', href: '/pes/takvim',    icon: '🗓' },
    ],
  },
  {
    id: 'siparis_uretim',
    title: 'Sipariş & Üretim',
    items: [
      { label: 'Üretim',           href: '/pes/production',    icon: '⊞' },
      { label: 'Atölye Fiyatlama', href: '/pes/eder-maliyet',  icon: '⊕' },
      { label: 'Üretim Simülasyon', href: '/pes/uretim-simulasyon', icon: '▶' },
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
    <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-[#197A56] to-[#125a40] rounded-md flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-[10px] tracking-wider">PES</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900 text-sm block leading-tight">Merkez Paneli</span>
            <span className="text-[10px] text-gray-400 leading-tight tracking-wide">Verimlilik Sistemi</span>
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
          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:border-gray-400 focus:bg-white"
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
                className="w-full flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-gray-400 hover:text-gray-600 transition-colors"
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
                            ? 'bg-emerald-50 text-[#197A56] font-medium border-l-2 border-[#197A56] pl-[10px]'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
          <div className="px-3 py-4 text-xs text-gray-400 italic text-center">
            "{search}" için sonuç yok
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-2.5 flex-shrink-0 space-y-0.5">
        <Link href="/workshop"
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-3 py-1.5 rounded transition-colors">
          <span>→</span>
          <span>Atölye Paneli</span>
        </Link>
        <p className="text-[9px] text-amber-600 font-medium px-3 py-0.5">Dev Mode</p>
      </div>
    </aside>
  )
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/pes') return false
  return pathname.startsWith(href + '/')
}
