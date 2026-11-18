'use client'

import { Fragment, useEffect, useState } from 'react'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'
import { PLAN_GEREKCELERI } from '@/lib/pes/is-emri-adim'

/* 064: adım başına ilk plan / güncel plan / gerçek, kayma, gecikme, sorun
   (v_is_emri_adim). Satıra tıklayınca o adımın plan geçmişi açılır.
   Hesaplar görünümde; burada yalnız gösterilir. */

type Adim = {
  stage_kayit_id: number; stage_name: string; ortak_unvan: string | null
  ilk_plan_bitis: string | null; plan_bitis: string | null; gercek_bitis: string | null
  revizyon_sayisi: number; plan_kayma_gun: number | null; gecikme_gun: number | null
  acik_sorun: number; toplam_sorun: number
}
type Gecmis = {
  id: number; stage_kayit_id: number; plan_baslangic: string | null; plan_bitis: string | null
  ortak_unvan: string | null; gerekce_kodu: string | null; not_metni: string | null
  giren_eposta: string | null; created_at: string
}

const GEREKCE_AD: Record<string, string> = Object.fromEntries(PLAN_GEREKCELERI.map(g => [g.kod, g.ad]))
const tr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—')
const aralik = (b: string | null, s: string | null) => (b || s ? `${tr(b)} → ${tr(s)}` : '—')

export default function AdimPlanGecmisi({ woId }: { woId: number }) {
  const [adimlar, setAdimlar] = useState<Adim[] | null>(null)
  const [gecmis, setGecmis] = useState<Gecmis[]>([])
  const [acik, setAcik] = useState<number | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pes/work-orders/${woId}/adimlar`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? 'Adım planı okunamadı')
        setAdimlar(d.adimlar ?? []); setGecmis(d.gecmis ?? [])
      })
      .catch((e: Error) => setHata(e.message || 'Adım planı okunamadı'))
  }, [woId])

  const ac = (id: number) => setAcik(acik === id ? null : id)

  if (hata) return <div role="alert" className="text-sm text-danger">{hata}</div>
  if (adimlar === null) return <div className="text-sm text-faint">Yükleniyor…</div>
  if (adimlar.length === 0) return <EmptyState title="Adım yok" description="Aşamalar sekmesinden adım ekleyin ya da rota uygulayın." />

  return (
    <Card>
      <CardHeader title="Adım planı: ilk / güncel / gerçek" aside="Satıra tıklayınca plan geçmişi açılır" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-faint">
            <tr>
              <th className="p-3">Adım</th><th>Firma</th><th>İlk plan bitiş</th><th>Güncel plan bitiş</th>
              <th>Gerçek bitiş</th><th className="text-right">Gecikme</th><th className="text-right">Revizyon</th><th className="pr-3 text-right">Açık sorun</th>
            </tr>
          </thead>
          <tbody>
            {adimlar.map(a => {
              const satirlar = gecmis.filter(g => g.stage_kayit_id === a.stage_kayit_id)
              // İlk plan = tarihi olan ilk satır (firma-only satırlar ilk plan değildir; bkz. v_is_emri_adim).
              const ilkId = satirlar.find(g => g.plan_baslangic || g.plan_bitis)?.id
              const kayma = a.plan_kayma_gun ?? 0
              const gecikme = a.gecikme_gun ?? 0
              return (
                <Fragment key={a.stage_kayit_id}>
                  <tr className="cursor-pointer border-t border-line-soft hover:bg-canvas" aria-expanded={acik === a.stage_kayit_id}
                    tabIndex={0} onClick={() => ac(a.stage_kayit_id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ac(a.stage_kayit_id) } }}>
                    <td className="p-3 font-medium text-ink">{a.stage_name}</td>
                    <td>{a.ortak_unvan ?? '—'}</td>
                    <td className="num">{tr(a.ilk_plan_bitis)}</td>
                    <td className="num">
                      {tr(a.plan_bitis)}
                      {kayma !== 0 && <> <Badge tone={kayma > 0 ? 'warn' : 'good'}>{kayma > 0 ? `+${kayma}` : kayma} gün</Badge></>}
                    </td>
                    <td className="num">{tr(a.gercek_bitis)}</td>
                    <td className={`num text-right ${gecikme > 0 ? 'font-medium text-danger' : 'text-faint'}`}>{gecikme > 0 ? `${gecikme} gün` : '—'}</td>
                    <td className="num text-right">{a.revizyon_sayisi}</td>
                    <td className="pr-3 text-right">
                      {a.acik_sorun > 0 ? <Badge tone="bad">{a.acik_sorun} / {a.toplam_sorun}</Badge> : <span className="text-faint">{a.toplam_sorun || '—'}</span>}
                    </td>
                  </tr>
                  {acik === a.stage_kayit_id && (
                    <tr className="bg-canvas">
                      <td colSpan={8} className="px-3 pb-3">
                        {satirlar.length === 0 ? (
                          <p className="py-2 text-xs text-faint">Plan geçmişi yok.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-left text-faint">
                              <tr><th className="py-1.5">Kayıt</th><th>Plan</th><th>Firma</th><th>Gerekçe</th><th>Not</th><th>Kim</th></tr>
                            </thead>
                            <tbody>
                              {satirlar.map(g => (
                                <tr key={g.id} className="border-t border-line-soft">
                                  <td className="py-1.5 num">{new Date(g.created_at).toLocaleDateString('tr-TR')}{g.id === ilkId && <span className="ml-1 text-faint">(ilk)</span>}</td>
                                  <td className="num">{aralik(g.plan_baslangic, g.plan_bitis)}</td>
                                  <td>{g.ortak_unvan ?? '—'}</td>
                                  <td>{g.gerekce_kodu ? GEREKCE_AD[g.gerekce_kodu] ?? g.gerekce_kodu : <span className="text-faint">Belirtilmedi</span>}</td>
                                  <td>{g.not_metni ?? '—'}</td>
                                  <td className="text-faint">{g.giren_eposta ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
