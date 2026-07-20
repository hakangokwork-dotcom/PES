'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { PesRole } from '@/types/pes'

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/pes',            icon: '▦' },
  { label: 'Atölyeler',  href: '/pes/workshops',  icon: '⚙' },
  { label: 'Üretim',     href: '/pes/production', icon: '⊞' },
  { label: 'Maliyet',    href: '/pes/costs',      icon: '₺' },
  { label: 'Modeller',   href: '/pes/models',     icon: '◫' },
  { label: 'Skorlama',   href: '/pes/scoring',    icon: '★' },
  { label: 'Kalite',     href: '/pes/quality',    icon: '◎' },
  { label: 'Raporlar',   href: '/pes/reports',    icon: '📊' },
]

const ROLE_LABELS: Record<PesRole, string> = {
  pes_admin: 'Admin',
  yonetim: 'Yönetim',
  analist: 'Analist',
  operator: 'Operatör',
  izleyici: 'İzleyici',
}

export default function PesSidebar({ user, role }: { user: User; role: PesRole }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = user.user_metadata?.full_name ?? user.email ?? 'Kullanıcı'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#197A56] rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-[10px]">PES</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900 text-sm block leading-tight">PES</span>
            <span className="text-[10px] text-gray-400 leading-tight">Verimlilik Sistemi</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isExact = pathname === item.href
          const isNested = item.href !== '/pes' && pathname.startsWith(item.href + '/')
          const active = isExact || isNested

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-emerald-50 text-[#197A56] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-[#197A56] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-medium">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
            <p className="text-[10px] text-emerald-600 font-medium">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
