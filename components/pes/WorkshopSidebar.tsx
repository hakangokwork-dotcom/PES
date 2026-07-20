'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

type NavItem = { label: string; href: string; icon: string }
type NavGroup = { id: string; title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'genel',
    title: 'Atölye Yönetimi',
    items: [
      { label: 'Dashboard', href: '/workshop',         icon: '▦' },
      { label: 'Profil',    href: '/workshop/profile', icon: '⚙' },
    ],
  },
  {
    id: 'siparis',
    title: 'Sipariş & Plan',
    items: [
      { label: 'İş Emri',     href: '/workshop/is-emri', icon: '▣' },
      { label: 'Bant Takvimi', href: '/workshop/takvim', icon: '🗓' },
    ],
  },
  {
    id: 'uretim',
    title: 'Üretim',
    items: [
      { label: 'Üretim',      href: '/workshop/production', icon: '⊞' },
      { label: 'Modeller',    href: '/workshop/models',     icon: '◫' },
      { label: 'Yıkama / UKP', href: '/workshop/yikama-ukp', icon: '♨' },
      { label: 'VSM Analiz',  href: '/workshop/vsm',        icon: '⊿' },
      { label: 'Üretim Simülasyon', href: '/workshop/uretim-simulasyon', icon: '▶' },
    ],
  },
  {
    id: 'verimlilik',
    title: 'Verimlilik & Kalite',
    items: [
      { label: 'Kalite',  href: '/workshop/quality',  icon: '◎' },
      { label: 'Duruş',   href: '/workshop/downtime', icon: '⏸' },
      { label: 'Kaizen',  href: '/workshop/kaizen',   icon: '↻' },
    ],
  },
  {
    id: 'ik_maliyet',
    title: 'İK & Maliyet',
    items: [
      { label: 'İşgücü',  href: '/workshop/workforce', icon: '👥' },
      { label: 'Maliyet', href: '/workshop/costs',     icon: '₺' },
      { label: 'Eder Maliyet', href: '/workshop/eder-maliyet', icon: '⊕' },
    ],
  },
  {
    id: 'veri',
    title: 'Analiz & Veri',
    items: [
      { label: 'Analiz',     href: '/workshop/analysis',  icon: '📊' },
      { label: 'Veri Yükle', href: '/workshop/veri-yukle', icon: '↑' },
    ],
  },
]

interface WsItem { id: number; code: string; name: string }

export default function WorkshopSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const wid = searchParams.get('wid') ?? ''

  const [workshops, setWorkshops] = useState<WsItem[]>([])
  const [currentWs, setCurrentWs] = useState<WsItem | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/pes/workshops')
      .then(r => r.json())
      .then(d => {
        const list: WsItem[] = (d.workshops ?? []).map((w: Record<string, unknown>) => ({
          id: w.id as number, code: w.code as string, name: w.name as string,
        }))
        setWorkshops(list)
        if (wid) setCurrentWs(list.find(w => w.id === Number(wid)) ?? null)
      })
      .catch(() => {})
  }, [wid])

  function switchWorkshop(newWid: string) {
    if (!newWid) { router.push('/workshop'); return }
    const target = pathname === '/workshop' ? '/workshop' : pathname
    router.push(`${target}?wid=${newWid}`)
  }

  function buildHref(base: string) {
    return wid ? `${base}?wid=${wid}` : base
  }

  function toggleGroup(id: string) {
    setCollapsed(c => ({ ...c, [id]: !c[id] }))
  }

  // Search filter
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
      <div className="h-14 flex items-center px-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-[#197A56] to-[#125a40] rounded-md flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-[10px] tracking-wider">PES</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900 text-sm block leading-tight">Atölye Paneli</span>
            <span className="text-[10px] text-gray-400 leading-tight tracking-wide">Verimlilik Sistemi</span>
          </div>
        </div>
      </div>

      {/* Atölye Seçici */}
      <div className="px-3 py-3 border-b border-gray-100 flex-shrink-0">
        <label className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block px-1">
          Aktif Atölye
        </label>
        <select
          value={wid}
          onChange={e => switchWorkshop(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-[#197A56] focus:ring-1 focus:ring-[#197A56] truncate"
        >
          <option value="">Atölye seçin...</option>
          {workshops.map(w => (
            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
          ))}
        </select>
        {currentWs && (
          <p className="text-[10px] text-gray-500 mt-1.5 px-1 truncate font-medium">📍 {currentWs.name}</p>
        )}
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
              {/* Group header */}
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
                        href={buildHref(item.href)}
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
      <div className="border-t border-gray-200 px-3 py-2.5 flex-shrink-0">
        <Link href="/pes"
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-3 py-1.5 rounded transition-colors">
          <span>←</span>
          <span>Merkez Paneli</span>
        </Link>
      </div>
    </aside>
  )
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/workshop') return false   // dashboard'u sadece tam eşleşmede aktif say
  return pathname.startsWith(href + '/')
}
