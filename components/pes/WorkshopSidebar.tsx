'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Factory, ClipboardList, CalendarDays,
  Boxes, Shapes, Droplets, Gauge, Waypoints, ClipboardCheck,
  CircleCheck, CirclePause, Lightbulb,
  Users, Wallet, Calculator,
  ChartColumn, Upload, Search, ArrowLeft, MapPin,
} from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import {
  NavGroupBlock, SidebarIdentity, type NavGroup,
} from '@/components/pes/SidebarParts'

/* Merkez paneliyle AYNI tipi, aynı satır bileşenini ve aynı kimlik bloğunu
   kullanır (SidebarParts). Eskiden ikisi kendi kopyasını taşıyordu ve biri
   düzeltilince diğeri geride kalıyordu. */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'genel',
    title: 'Atölye Yönetimi',
    items: [
      { label: 'Dashboard', href: '/workshop',         icon: LayoutDashboard },
      { label: 'Profil',    href: '/workshop/profile', icon: Factory },
    ],
  },
  {
    id: 'siparis',
    title: 'Sipariş & Plan',
    items: [
      { label: 'İş Emri',      href: '/workshop/is-emri', icon: ClipboardList },
      { label: 'Bant Takvimi', href: '/workshop/takvim',  icon: CalendarDays },
    ],
  },
  {
    id: 'uretim',
    title: 'Üretim',
    items: [
      { label: 'Günlük Üretim', href: '/workshop/gunluk-uretim', icon: ClipboardCheck },
      { label: 'Üretim',       href: '/workshop/production', icon: Boxes },
      { label: 'Modeller',     href: '/workshop/models',     icon: Shapes },
      { label: 'Yıkama / UKP', href: '/workshop/yikama-ukp', icon: Droplets },
      { label: 'Yetenek',      href: '/workshop/yetenek',    icon: Gauge },
      { label: 'VSM Analiz',   href: '/workshop/vsm',        icon: Waypoints },
    ],
  },
  {
    id: 'verimlilik',
    title: 'Verimlilik & Kalite',
    items: [
      { label: 'Kalite', href: '/workshop/quality',  icon: CircleCheck },
      { label: 'Duruş',  href: '/workshop/downtime', icon: CirclePause },
      { label: 'Kaizen', href: '/workshop/kaizen',   icon: Lightbulb },
    ],
  },
  {
    id: 'ik_maliyet',
    title: 'İK & Maliyet',
    items: [
      { label: 'İşgücü',       href: '/workshop/workforce',    icon: Users },
      { label: 'Maliyet',      href: '/workshop/costs',        icon: Wallet },
      { label: 'Eder Maliyet', href: '/workshop/eder-maliyet', icon: Calculator },
    ],
  },
  {
    id: 'veri',
    title: 'Analiz & Veri',
    items: [
      { label: 'Analiz',     href: '/workshop/analysis',   icon: ChartColumn },
      { label: 'Veri Yükle', href: '/workshop/veri-yukle', icon: Upload },
    ],
  },
]

interface WsItem { id: number; code: string; name: string }

export default function WorkshopSidebar({
  eposta = null, tenantAdi = null,
}: { eposta?: string | null; tenantAdi?: string | null }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const wid = searchParams.get('wid') ?? ''

  const [workshops, setWorkshops] = useState<WsItem[]>([])
  const [arama, setArama] = useState('')

  useEffect(() => {
    fetch('/api/pes/workshops')
      .then(r => r.json())
      .then(d => setWorkshops((d.workshops ?? []).map((w: Record<string, unknown>) => ({
        id: w.id as number, code: w.code as string, name: w.name as string,
      }))))
      .catch(() => {})
  }, [])

  const currentWs = workshops.find(w => w.id === Number(wid)) ?? null

  function switchWorkshop(newWid: string) {
    if (!newWid) { router.push('/workshop'); return }
    router.push(`${pathname}?wid=${newWid}`)
  }

  /* Seçili atölye her bağlantıda taşınır; aksi halde sayfa değişince
     kullanıcı hangi atölyeye baktığını kaybediyor. */
  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    return NAV_GROUPS
      .map(g => ({
        ...g,
        items: g.items
          .filter(i => !q || i.label.toLocaleLowerCase('tr-TR').includes(q))
          .map(i => (wid ? { ...i, href: `${i.href}?wid=${wid}` } : i)),
      }))
      .filter(g => g.items.length > 0)
  }, [arama, wid])

  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-line-soft bg-surface">
      <div className="flex h-14 shrink-0 items-center border-b border-line-soft px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-[11px] font-bold tracking-wider text-white">
            PES
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-ink">Atölye Paneli</span>
            <span className="block text-[11px] leading-tight tracking-wide text-faint">Verimlilik Sistemi</span>
          </span>
        </div>
      </div>

      <div className="shrink-0 border-b border-line-soft px-3 py-3">
        <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
          Aktif Atölye
        </label>
        <select
          value={wid}
          onChange={e => switchWorkshop(e.target.value)}
          className="w-full truncate rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Atölye seçin…</option>
          {workshops.map(w => (
            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
          ))}
        </select>
        {currentWs && (
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] font-medium text-faint">
            <MapPin className="size-3" strokeWidth={1.8} />
            <span className="truncate">{currentWs.name}</span>
          </p>
        )}
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
          <NavGroupBlock key={g.id} group={g} pathname={pathname} kokRota="/workshop" ilk={i === 0} />
        ))}
        {gruplar.length === 0 && (
          <p className="px-3 py-4 text-center text-xs italic text-faint">
            “{arama}” için sonuç yok
          </p>
        )}
      </nav>

      <div className="shrink-0 border-t border-line-soft px-3 py-2">
        <Link
          href="/pes"
          className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Merkez Paneli
        </Link>
      </div>

      <SidebarIdentity eposta={eposta} tenantAdi={tenantAdi} />

      <div className="shrink-0 px-3 pb-2 text-[11px] text-faint">{APP_VERSION}</div>
    </aside>
  )
}
