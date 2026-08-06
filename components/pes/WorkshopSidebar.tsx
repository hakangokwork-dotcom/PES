'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { APP_VERSION } from '@/lib/version'

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
      { label: 'Yetenek',     href: '/workshop/yetenek',    icon: '◈' },
      { label: 'VSM Analiz',  href: '/workshop/vsm',        icon: '⊿' },
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
    <aside className="w-64 min-h-screen bg-white border-r border-line-soft flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-line-soft flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-hover rounded-md flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-[10px] tracking-wider">PES</span>
          </div>
          <div>
            <span className="font-semibold text-ink text-sm block leading-tight">Atölye Paneli</span>
            <span className="text-[10px] text-faint leading-tight tracking-wide">Verimlilik Sistemi</span>
          </div>
        </div>
      </div>

      {/* Atölye Seçici */}
      <div className="px-3 py-3 border-b border-gray-100 flex-shrink-0">
        <label className="text-[9px] uppercase tracking-wider text-faint font-semibold mb-1 block px-1">
          Aktif Atölye
        </label>
        <select
          value={wid}
          onChange={e => switchWorkshop(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-line rounded-lg bg-canvas focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent truncate"
        >
          <option value="">Atölye seçin...</option>
          {workshops.map(w => (
            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
          ))}
        </select>
        {currentWs && (
          <p className="text-[10px] text-faint mt-1.5 px-1 truncate font-medium">📍 {currentWs.name}</p>
        )}
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
              {/* Group header */}
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
                        href={buildHref(item.href)}
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
      <div className="border-t border-line-soft px-3 py-2.5 flex-shrink-0">
        <Link href="/pes"
          className="flex items-center gap-2 text-xs text-faint hover:text-ink hover:bg-canvas px-3 py-1.5 rounded transition-colors">
          <span>←</span>
          <span>Merkez Paneli</span>
        </Link>
        <p className="text-[10px] text-faint px-3 pt-1">{APP_VERSION}</p>
      </div>
    </aside>
  )
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/workshop') return false   // dashboard'u sadece tam eşleşmede aktif say
  return pathname.startsWith(href + '/')
}
