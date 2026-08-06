'use client'

/* DİKKAT — server/client sınırı:
   DataTable bir client component ve `columns` içindeki `render` birer
   fonksiyon. Fonksiyonlar server component'ten client component'e prop
   olarak GEÇEMEZ. Bu yüzden kalıp şu: server sayfası veriyi çeker ve düz
   satırları bu ince client sarmalayıcıya verir; kolon tanımları burada durur.
   Her liste ekranı için aynısını yap (~30 satır). */

import { useState } from 'react'
import Link from 'next/link'
import { Badge, DataTable, DensityToggle, EmptyState, Input, LinkButton, type Column } from '@/components/ui'
import AtolyeArsivDugmesi from '@/components/pes/AtolyeArsivDugmesi'
import { formatNumber } from '@/lib/utils'

export type WorkshopRow = {
  id: number
  code: string
  name: string
  city: string | null
  type: string
  total_staff: number
  line_count: number
  owner_email: string | null
  is_active: boolean
}

export default function WorkshopsTable({ rows }: { rows: WorkshopRow[] }) {
  const [q, setQ] = useState('')
  const [density, setDensity] = useState<'tight' | 'relaxed'>('tight')

  const filtered = rows.filter(r =>
    !q.trim() || `${r.code} ${r.name} ${r.city ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  const columns: Column<WorkshopRow>[] = [
    {
      key: 'code', label: 'Kod', width: '96px',
      render: r => (
        <Link href={`/pes/workshops/${r.id}`} className="font-medium text-accent hover:underline">
          {r.code}
        </Link>
      ),
    },
    { key: 'name', label: 'Ad', render: r => <span className="text-ink">{r.name}</span> },
    { key: 'city', label: 'Şehir', render: r => r.city ?? '—' },
    /* Tip bir SINIFLANDIRMA → nötr rozet. Eskiden mavi idi. */
    { key: 'type', label: 'Tip', render: r => <Badge>{r.type}</Badge> },
    { key: 'total_staff', label: 'Personel', numeric: true, render: r => formatNumber(r.total_staff) },
    { key: 'line_count', label: 'Bant', numeric: true, render: r => formatNumber(r.line_count) },
    {
      key: 'owner_email', label: 'Sahiplenen',
      render: r => r.owner_email ?? <span className="text-faint">havuzda</span>,
    },
    {
      key: 'is_active', label: 'Durum', align: 'right',
      render: r => <Badge tone={r.is_active ? 'good' : 'neutral'}>{r.is_active ? 'AKTİF' : 'PASİF'}</Badge>,
    },
    {
      key: 'actions', label: 'İşlem', align: 'right', sortable: false,
      render: r => <AtolyeArsivDugmesi id={r.id} aktif={r.is_active} />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={filtered}
      rowKey={r => r.id}
      initialSort={{ key: 'code', dir: 'asc' }}
      density={density}
      toolbar={
        <>
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Atölye veya kod ara"
            className="h-8 w-[220px]"
          />
          <div className="ml-auto">
            <DensityToggle value={density} onChange={setDensity} />
          </div>
        </>
      }
      empty={
        <EmptyState
          title="Henüz atölye eklenmemiş"
          description="Tek tek ekleyebilir veya mevcut listeyi CSV ile toplu yükleyebilirsin."
          action={<LinkButton variant="primary" size="sm" href="/pes/workshops/import">CSV ile yükle</LinkButton>}
        />
      }
      footer={<span className="num">{filtered.length} kayıt</span>}
    />
  )
}
