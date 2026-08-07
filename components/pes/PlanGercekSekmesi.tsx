'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { Badge, EmptyState } from '@/components/ui'
import { GRAFIK_AKSAN, GRAFIK_RENK } from '@/lib/ui/tone'
import type { PlanGercek } from '@/lib/pes/plan-gercek'

/* Plan / gerçek karşılaştırması (tasarım K6, §6.2).

   İKİ ÇÖZÜNÜRLÜK BİR ARADA:
     · Aşama tablosu — her siparişte vardır, kabadır.
     · Gün eğrisi — yalnız günlük üretim girildiyse çıkar.

   Veri yoksa uydurma çizgi çizmiyoruz; "girilmemiş" açıkça yazılıyor.
   Boş bir grafik, üretimin durduğu izlenimi verirdi. */

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function kisaTarih(iso: string): string {
  const [, a, g] = iso.split('-')
  return `${Number(g)} ${AY[Number(a) - 1]}`
}

const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)' },
  labelStyle: { color: '#6b7280', fontWeight: 600 },
}

export default function PlanGercekSekmesi({ workOrderId }: { workOrderId: number }) {
  const [veri, setVeri] = useState<PlanGercek | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    let iptal = false
    fetch(`/api/pes/work-orders/${workOrderId}/plan-gercek`)
      .then(r => r.json())
      .then(d => {
        if (iptal) return
        if (d.error) setHata(d.error); else setVeri(d.planGercek)
      })
      .catch(() => { if (!iptal) setHata('Plan/gerçek verisi yüklenemedi') })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [workOrderId])

  if (yukleniyor) return <p className="text-[13px] text-faint">Yükleniyor…</p>
  if (hata) return <p className="text-[13px] text-danger">{hata}</p>
  if (!veri) return null

  const egriVar = veri.egri.some(p => p.gercek !== null)
  const grafik = veri.egri.map(p => ({ gun: kisaTarih(p.tarih), plan: p.plan, gercek: p.gercek }))

  return (
    <div className="flex flex-col gap-5">
      {/* Gün eğrisi */}
      <section>
        <h4 className="text-[13px] font-medium text-ink">Kümülatif üretim</h4>
        {veri.bantlar.length === 0 ? (
          <p className="mt-1 text-[13px] text-faint">
            Bu siparişte bant tahsisi yok — eğri bant tahsisinden çıkar.
          </p>
        ) : !egriVar ? (
          <div className="mt-2">
            <EmptyState
              title="Günlük üretim girilmemiş"
              description="Plan çizgisi var ama gerçekleşen yok. Atölye panelindeki “Günlük Üretim” ekranından bant bant adet girildiğinde iki çizgi burada karşılaştırılır."
            />
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-line-soft bg-surface p-3">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={grafik} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="gun" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [Number(v).toLocaleString('tr-TR'), n === 'plan' ? 'Plan' : 'Gerçek']} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => (v === 'plan' ? 'Plan' : 'Gerçek')} />
                <Line type="monotone" dataKey="plan" stroke={GRAFIK_RENK.neutral} strokeWidth={2}
                  strokeDasharray="5 4" dot={false} />
                {/* connectNulls=false: veri bittiği yerde çizgi de biter */}
                <Line type="monotone" dataKey="gercek" stroke={GRAFIK_AKSAN} strokeWidth={2.5}
                  dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Aşama karşılaştırması */}
      <section>
        <h4 className="text-[13px] font-medium text-ink">Aşamalar</h4>
        <div className="mt-2 overflow-x-auto rounded-xl border border-line-soft bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                <th className="px-3 py-2 font-medium">Aşama</th>
                <th className="px-3 py-2 font-medium">Atölye</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Gerçek</th>
                <th className="px-3 py-2 text-right font-medium">Sapma</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {veri.asamalar.map(a => (
                <tr key={a.stageRowId} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-2 text-ink">{a.ad}</td>
                  <td className="px-3 py-2 text-muted">
                    {a.atolyeKodu ?? '—'}
                    {a.disAtolye && <Badge className="ml-1.5">dış atölye</Badge>}
                  </td>
                  <td className="px-3 py-2 num text-muted">
                    {a.planBaslangic
                      ? `${kisaTarih(a.planBaslangic)} → ${kisaTarih(a.planBitis!)}`
                      : <span className="text-faint">tarih girilmedi</span>}
                  </td>
                  <td className="px-3 py-2 num text-muted">
                    {a.gercekBaslangic
                      ? `${kisaTarih(a.gercekBaslangic)}${a.gercekBitis ? ` → ${kisaTarih(a.gercekBitis)}` : ' → sürüyor'}`
                      : <span className="text-faint">başlamadı</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.sapmaGun === null ? (
                      <span className="text-faint">—</span>
                    ) : a.sapmaGun > 0 ? (
                      <Badge tone="bad">{a.sapmaGun} gün geç</Badge>
                    ) : a.sapmaGun < 0 ? (
                      <Badge tone="good">{Math.abs(a.sapmaGun)} gün erken</Badge>
                    ) : (
                      <Badge tone="good">gününde</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{a.durum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bant özeti */}
      {veri.bantlar.length > 0 && (
        <section>
          <h4 className="text-[13px] font-medium text-ink">Bantlar</h4>
          <div className="mt-2 overflow-x-auto rounded-xl border border-line-soft bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                  <th className="px-3 py-2 font-medium">Bant</th>
                  <th className="px-3 py-2 font-medium">Plan penceresi</th>
                  <th className="px-3 py-2 text-right font-medium">Tahsis</th>
                  <th className="px-3 py-2 text-right font-medium">Girilen</th>
                  <th className="px-3 py-2 text-right font-medium">Hatalı</th>
                  <th className="px-3 py-2 text-right font-medium">Giriş günü</th>
                </tr>
              </thead>
              <tbody>
                {veri.bantlar.map(b => (
                  <tr key={b.atamaId} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2 text-ink">{b.lineKodu} <span className="text-faint">{b.lineAdi}</span></td>
                    <td className="px-3 py-2 num text-muted">
                      {kisaTarih(b.planBaslangic)} → {kisaTarih(b.planBitis)}
                      <span className="text-faint"> · {b.gunlukHedef.toLocaleString('tr-TR')}/gün</span>
                    </td>
                    <td className="px-3 py-2 num text-right text-muted">{b.tahsisAdet.toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-2 num text-right text-ink">
                      {b.girisGunSayisi === 0
                        ? <span className="text-faint">—</span>
                        : b.girilenToplam.toLocaleString('tr-TR')}
                    </td>
                    <td className="px-3 py-2 num text-right text-muted">
                      {b.hataliToplam > 0 ? b.hataliToplam.toLocaleString('tr-TR') : '—'}
                    </td>
                    <td className="px-3 py-2 num text-right text-faint">
                      {b.girisGunSayisi === 0 ? 'giriş yok' : `${b.girisGunSayisi} gün`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
