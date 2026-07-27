'use client'

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie, Area, AreaChart,
} from 'recharts'

const GREEN = '#197A56'
const AY = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

const effColor = (v: number) => (v >= 90 ? GREEN : v >= 75 ? '#d97706' : '#dc2626')

const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)' },
  labelStyle: { color: '#6b7280', fontWeight: 600 },
}

export function EffTrendChart({ data }: { data: { year: number; month: number; eff: number }[] }) {
  const rows = data.map(d => ({ ay: `${AY[d.month]} ${String(d.year).slice(2)}`, verim: Number(d.eff) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="ay" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip {...tooltipStyle} formatter={(v) => [`%${Number(v)}`, 'Verimlilik']} />
        <Area type="monotone" dataKey="verim" stroke={GREEN} strokeWidth={2.5} fill="url(#effGrad)" dot={{ r: 4, fill: GREEN }} activeDot={{ r: 6 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function WorkshopEffBar({ data }: { data: { code: string; eff: number }[] }) {
  const rows = data.map(d => ({ code: d.code, verim: Number(d.eff) }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="%" />
        <YAxis type="category" dataKey="code" tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} axisLine={false} tickLine={false} width={54} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f9fafb' }} formatter={(v) => [`%${Number(v)}`, 'Verimlilik']} />
        <Bar dataKey="verim" radius={[0, 6, 6, 0]} barSize={16} label={{ position: 'right', fontSize: 11, fill: '#6b7280', formatter: (v: unknown) => `%${Number(v)}` }}>
          {rows.map((r, i) => <Cell key={i} fill={effColor(r.verim)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const TIER_COLORS: Record<string, string> = {
  'Stratejik': GREEN, 'Gelişen': '#2563eb', 'İzlemede': '#d97706', 'Risk': '#ea580c', 'Kritik': '#dc2626',
}

export function TierDonut({ data }: { data: { tier: string; c: number }[] }) {
  const rows = data.map(d => ({ name: d.tier, value: Number(d.c), color: TIER_COLORS[d.tier] ?? '#9ca3af' }))
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={64} paddingAngle={2} stroke="none">
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v, n) => [`${Number(v)} atölye`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.name} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
            <span className="text-gray-600">{r.name}</span>
            <span className="text-gray-900 font-semibold ml-auto tabular-nums">{r.value}</span>
            <span className="text-gray-400 text-xs w-9 text-right">%{total ? Math.round(r.value / total * 100) : 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MiniSparkline({ data, color = GREEN }: { data: number[]; color?: string }) {
  const rows = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={rows} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
