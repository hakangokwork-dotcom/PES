'use client'

import { useState, useTransition, type ComponentType } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/* İki kenar çubuğunun (merkez ve atölye) ORTAK parçaları.
   Daha önce ikisi de kendi satır bileşenini, kendi aktiflik kuralını ve
   kendi arama kutusunu taşıyordu; biri düzeltilince diğeri geride
   kalıyordu. Tip, satır ve kimlik bloğu artık tek yerde. */

/** İkon artık string değil lucide bileşeni — emoji/unicode karışımı bitti. */
export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>
export type NavItem = { label: string; href: string; icon: NavIcon }
export type NavGroup = { id: string; title: string; items: NavItem[] }

/** Dashboard yalnız tam eşleşmede aktif; alt rotaları yoktur.
    Atölye panelinde bağlantılar `?wid=` taşıyor — karşılaştırmadan önce
    sorgu dizesi atılır, yoksa hiçbir satır aktif görünmez. */
export function isItemActive(pathname: string, href: string, kokRota: string): boolean {
  const yol = href.split('?')[0]
  if (pathname === yol) return true
  if (yol === kokRota) return false
  return pathname.startsWith(yol + '/')
}

export function NavLink({
  item, active,
}: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'border-l-2 border-accent bg-accent-soft pl-[10px] font-medium text-accent'
          : 'text-muted hover:bg-canvas hover:text-ink',
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function NavGroupBlock({
  group, pathname, kokRota, ilk,
}: { group: NavGroup; pathname: string; kokRota: string; ilk: boolean }) {
  const [kapali, setKapali] = useState(false)
  const aktifVar = group.items.some(i => isItemActive(pathname, i.href, kokRota))

  return (
    <div className={ilk ? '' : 'mt-3'}>
      <button
        onClick={() => setKapali(k => !k)}
        className="flex w-full items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-muted"
      >
        <span>{group.title}</span>
        <ChevronDown className={cn('size-3 transition-transform', kapali && '-rotate-90')} strokeWidth={2} />
      </button>

      {!kapali ? (
        <div className="mt-0.5 space-y-px">
          {group.items.map(item => (
            <NavLink key={item.href} item={item} active={isItemActive(pathname, item.href, kokRota)} />
          ))}
        </div>
      ) : aktifVar && (
        /* Grup kapalıyken içinde aktif sayfa varsa kaybolmasın. */
        <p className="px-3 text-[11px] italic text-accent">açık sayfa burada</p>
      )}
    </div>
  )
}

/** Kullanıcı kim, hangi tenant'ta ve nasıl çıkacak.
    Eskiden hiçbiri görünmüyordu. */
export function SidebarIdentity({
  eposta, tenantAdi,
}: { eposta: string | null; tenantAdi: string | null }) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()

  function cikis() {
    basla(async () => {
      await createClient().auth.signOut()
      router.push('/login')
      router.refresh()
    })
  }

  const bas = (eposta ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className="border-t border-line-soft px-3 py-2.5">
      <div className="flex items-center gap-2.5 px-3 py-1.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-white">
          {bas}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] text-ink">{eposta ?? 'Oturum'}</span>
          {tenantAdi && <span className="block truncate text-[11px] text-faint">{tenantAdi}</span>}
        </span>
      </div>
      <button
        onClick={cikis}
        disabled={bekliyor}
        className="mt-0.5 flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs text-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
      >
        <LogOut className="size-3.5" strokeWidth={1.8} />
        {bekliyor ? 'Çıkılıyor…' : 'Çıkış yap'}
      </button>
    </div>
  )
}
