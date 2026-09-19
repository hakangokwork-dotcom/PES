'use client'

import { useEffect, useState } from 'react'
import { gunlukPlan } from '@/lib/pes/bant-doluluk'
import type { Atama, Asama, Malzeme, CekmeTesti } from './tipler'
import { TR_GUN, trTarih, yerelTarih, malzemeDurumu, testDurumu, type AtolyePaketi } from './hesap'

/* Beş sekmeli yan panel (tasarım §5.4). Merkez görünümünde günlük plan
   ve gerçekleşen OKUNUR — atölye girer (K3, §6). Giriş /workshop
   tarafında (Task 14). Burada girişe izin vermek, iki yerden yazılan
   planın zamanla birbirini tutmaması demekti. */

type Sekme = 'plan' | 'zincir' | 'malzeme' | 'test' | 'konular'
const nf = (n: number) => Math.round(n).toLocaleString('tr-TR')

/** postgres.js DATE'i Date nesnesine çevirir; journal ucu ::text kullanmıyor. */
function isoTarih(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v ?? '')
}

type JournalKaydi = {
  id: number; tip: string; kategori: string | null; baslik: string | null
  aciklama: string; oneri: string | null; yazan: string | null; tarih: unknown; stage_name: string | null
}

type Props = {
  atama: Atama
  paket: AtolyePaketi
  asamalar: Asama[]
  malzemeler: Malzeme[]
  test: CekmeTesti | null
  atolyeId: number
  atolyeAdi: string
  bantAdi: string
  bugun: string
  onKapat: () => void
}

export default function PoPaneli({
  atama, paket, asamalar, malzemeler, test, atolyeId, atolyeAdi, bantAdi, bugun, onKapat,
}: Props) {
  const [sekme, setSekme] = useState<Sekme>('plan')
  const [journal, setJournal] = useState<JournalKaydi[] | null>(null)

  useEffect(() => {
    const kapat = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat() }
    window.addEventListener('keydown', kapat)
    return () => window.removeEventListener('keydown', kapat)
  }, [onKapat])

  useEffect(() => {
    if (sekme !== 'konular' || journal !== null) return
    fetch(`/api/pes/work-orders/${atama.work_order_id}/journal`)
      .then(r => (r.ok ? r.json() : { journal: [] }))
      .then(d => setJournal(d.journal ?? []))
      .catch(() => setJournal([]))
  }, [sekme, journal, atama.work_order_id])

  const tanim = paket.atamalar.find(a => a.atamaId === atama.id)
  const plan = tanim ? gunlukPlan(tanim, paket.ctx) : []
  const gercekler = paket.gercekler[atama.id] ?? {}
  const bitis = paket.bitisler.get(atama.id) ?? atama.plan_bitis
  const gecikme = !!atama.teslim_tarihi && bitis > atama.teslim_tarihi
  const tPlan = plan.reduce((s, x) => s + x.adet, 0)
  const tGercek = plan.reduce((s, x) => s + (gercekler[x.tarih] ?? 0), 0)
  const md = malzemeDurumu(malzemeler, bugun)
  const kapasite = paket.ctx.bantlar.filter(b => b.aktif).reduce((s, b) => s + b.dailyTarget, 0)
  const blokaj = (journal ?? []).filter(j => j.tip === 'BLOKAJ')

  const SEKMELER: { k: Sekme; et: string }[] = [
    { k: 'plan', et: 'Günlük plan' },
    { k: 'zincir', et: 'Zincir' },
    { k: 'malzeme', et: `Malzeme${md.sinif === 'bad' || md.sinif === 'wait' ? ' ⚠' : ''}` },
    { k: 'test', et: 'Çekme testi' },
    { k: 'konular', et: `Konular${journal?.length ? ` (${journal.length})` : ''}` },
  ]

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-ink/30" onClick={onKapat} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-[61] flex w-[min(470px,100vw)] flex-col border-l border-line bg-surface shadow-2xl"
        role="dialog" aria-label={`${atama.is_emri_no} sipariş paneli`}>
        <div className="flex items-start gap-2.5 border-b border-line-soft px-4 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{atama.is_emri_no} · {atama.model_adi}</h2>
            <p className="mt-0.5 text-[11.5px] text-faint">{atama.musteri ?? '—'} · {atolyeAdi} / {bantAdi}</p>
          </div>
          <button type="button" onClick={onKapat} aria-label="Kapat"
            className="ml-auto h-7 w-7 shrink-0 rounded-lg border border-line text-[15px] leading-none text-muted hover:bg-canvas hover:text-ink">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          {blokaj.length > 0 && <Kutu ton="dan"><b>Blokaj.</b> {blokaj[0].baslik} — {blokaj[0].aciklama}</Kutu>}
          {gecikme && <Kutu ton="dan"><b>Teslim riski.</b> Planlanan bitiş {trTarih(bitis)}, teslim {trTarih(atama.teslim_tarihi!)}.</Kutu>}
          {test?.sonuc === 'RİSKLİ' && <Kutu ton="wrn"><b>Çekme testi riskli.</b> Boy %{test.boy_cekme_pct} · en %{test.en_cekme_pct} · eğrilik %{test.may_kaymasi_pct}. Kalıp büyütme ya da ön yıkama değerlendirilmeli.</Kutu>}
          <Kutu ton="wrn"><b>Risk dökümanı yok.</b> Kumaş kalite görselleri ve risk parametreleri girilmemiş. <em>(Ayrı proje.)</em></Kutu>

          <dl className="mb-3.5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-xs">
            <dt className="text-faint">Sipariş adedi</dt><dd className="text-right font-mono font-medium text-ink">{nf(atama.adet)}</dd>
            <dt className="text-faint">Atölye kapasitesi</dt><dd className="text-right font-mono font-medium text-ink">{nf(kapasite)} /gün (ortak)</dd>
            <dt className="text-faint">Planlanan bitiş</dt><dd className={`text-right font-mono font-medium ${gecikme ? 'text-danger' : 'text-ink'}`}>{trTarih(bitis)}</dd>
            <dt className="text-faint">Teslim tarihi</dt><dd className="text-right font-mono font-medium text-ink">{atama.teslim_tarihi ? trTarih(atama.teslim_tarihi) : '—'}</dd>
          </dl>

          <div className="mb-3.5 flex gap-px overflow-x-auto border-b border-line" role="tablist">
            {SEKMELER.map(s => (
              <button key={s.k} type="button" role="tab" aria-selected={sekme === s.k} onClick={() => setSekme(s.k)}
                className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs ${sekme === s.k ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                {s.et}
              </button>
            ))}
          </div>

          {sekme === 'plan' && (
            <>
              <Baslik etiket="Günlük plan ve gerçekleşen" sahip="atölye girer" />
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-faint">
                Bandın varsayılan payı {tanim ? nf(plan[0]?.pay ?? 0) : '—'} adet/gün. Atölye gün gün ezebilir; bu ekranda okunur.
                Bitiş tarihi plandan türetilir.
              </p>
              <table className="w-full border-collapse text-xs">
                <thead><tr className="border-b border-line text-[10.5px] uppercase tracking-wide text-faint">
                  <th className="pb-1.5 text-left font-semibold">Gün</th>
                  <th className="pb-1.5 text-right font-semibold">Plan</th>
                  <th className="pb-1.5 text-right font-semibold">Gerçek</th>
                  <th className="pb-1.5 text-right font-semibold">Fark</th>
                </tr></thead>
                <tbody>
                  {plan.map(g => {
                    const ger = gercekler[g.tarih]
                    const fark = ger != null ? ger - g.adet : null
                    return (
                      <tr key={g.tarih} className={`border-b border-line-soft ${g.tarih <= bugun ? 'bg-accent-soft/30' : ''}`}>
                        <td className="py-1 font-mono text-body">{trTarih(g.tarih)} <span className="text-faint">{TR_GUN[yerelTarih(g.tarih).getDay()]}</span>
                          {g.elle && <span className="ml-1.5 rounded bg-accent-soft px-1 text-[9.5px] font-semibold text-accent-ink">elle</span>}</td>
                        <td className={`py-1 text-right font-mono tabular-nums ${g.elle ? 'font-semibold text-ink' : 'text-body'}`}>{nf(g.adet)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-body">{ger != null ? nf(ger) : '—'}</td>
                        <td className={`py-1 text-right font-mono tabular-nums ${fark == null ? 'text-faint' : fark < 0 ? 'text-danger' : 'text-accent-ink'}`}>
                          {fark == null ? '—' : `${fark > 0 ? '+' : ''}${nf(fark)}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {sekme === 'zincir' && (
            <>
              <Baslik etiket="Aşama zinciri" sahip="work_order_stage" />
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-faint">
                Kesim → hazırlık → dikim → UKP zorunlu; aradaki yıkama / baskı / nakış ürüne göre değişir, dış atölyede yapılabilir.
              </p>
              <table className="w-full border-collapse text-[11.5px]">
                <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                  <th className="pb-1.5 text-left font-semibold">Aşama</th><th className="pb-1.5 text-left font-semibold">Plan</th>
                  <th className="pb-1.5 text-left font-semibold">Gerçek</th><th className="pb-1.5 text-left font-semibold">Durum</th>
                </tr></thead>
                <tbody>
                  {[...asamalar].sort((a, b) => a.sira_no - b.sira_no).map(a => {
                    const dis = a.workshop_id != null && a.workshop_id !== atolyeId
                    const bitti = !!a.gercek_bitis || a.durum === 'Tamamlandi'
                    const basladi = !!a.gercek_baslangic || a.durum === 'Devam'
                    const gec = !basladi && !!a.plan_baslangic && a.plan_baslangic < bugun
                    return (
                      <tr key={a.id} className="border-b border-line-soft align-top">
                        <td className="py-1.5 pr-2"><b className="text-ink">{a.name}</b>
                          {!a.zorunlu && <Etiket ton="wait">opsiyonel</Etiket>}{dis && <Etiket ton="wait">dış atölye</Etiket>}</td>
                        <td className="py-1.5 pr-2 font-mono text-body">{a.plan_baslangic ? `${trTarih(a.plan_baslangic)} → ${a.plan_bitis ? trTarih(a.plan_bitis) : '?'}` : '—'}</td>
                        <td className="py-1.5 pr-2 font-mono text-body">{a.gercek_baslangic ? `${trTarih(a.gercek_baslangic)}${a.gercek_bitis ? ` → ${trTarih(a.gercek_bitis)}` : ' →'}` : '—'}</td>
                        <td className="py-1.5"><Etiket ton={bitti ? 'ok' : basladi ? 'wait' : gec ? 'bad' : 'wait'}>
                          {bitti ? 'Tamamlandı' : basladi ? 'Devam' : gec ? 'Gecikti' : 'Beklemede'}</Etiket></td>
                      </tr>
                    )
                  })}
                  {asamalar.length === 0 && <tr><td colSpan={4} className="py-3 text-faint">Bu sipariş için aşama zinciri kurulmamış.</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {sekme === 'malzeme' && (
            <>
              <Baslik etiket="Malzeme" sahip="geliş tarihini atölye girer" />
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-faint">
                Beklenen tarih planlamadan gelir; gelen tarih ve <b>gelen miktar</b> atölyenindir. Sipariş ile gelen arasındaki fark eldeki eksik kumaşı gösterir.
              </p>
              {malzemeler.length === 0 ? <p className="text-[11.5px] text-faint">Bu sipariş için malzeme kaydı yok.</p> : (
                <table className="w-full border-collapse text-[11.5px]">
                  <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                    <th className="pb-1.5 text-left font-semibold">Malzeme</th><th className="pb-1.5 text-right font-semibold">Beklenen</th>
                    <th className="pb-1.5 text-right font-semibold">Geldi</th><th className="pb-1.5 text-right font-semibold">Sipariş</th><th className="pb-1.5 text-right font-semibold">Gelen</th>
                  </tr></thead>
                  <tbody>
                    {malzemeler.map((m, i) => {
                      const gec = !m.gelis_tarihi && !!m.beklenen_tarih && m.beklenen_tarih < bugun
                      const eksik = !!m.gelis_tarihi && m.gelen_miktar != null && m.miktar != null && m.gelen_miktar < m.miktar
                      return (
                        <tr key={i} className="border-b border-line-soft align-top">
                          <td className="py-1.5 pr-2"><b className="text-ink">{m.tip}</b> · {m.ad}
                            <div className="text-[10.5px] text-faint">{[m.kod, m.tedarikci].filter(Boolean).join(' · ')}</div>
                            <Etiket ton={m.durum === 'Geldi' ? 'ok' : m.durum === 'Eksik' || gec ? 'bad' : 'wait'}>{m.durum}{gec ? ' · gecikti' : ''}</Etiket></td>
                          <td className="py-1.5 text-right font-mono">{m.beklenen_tarih ? trTarih(m.beklenen_tarih) : '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.gelis_tarihi ? trTarih(m.gelis_tarihi) : '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.miktar != null ? `${nf(m.miktar)} ${m.birim ?? ''}` : '—'}</td>
                          <td className={`py-1.5 text-right font-mono ${eksik ? 'font-semibold text-danger' : ''}`}>
                            {m.gelen_miktar != null ? `${nf(m.gelen_miktar)} ${m.birim ?? ''}` : '—'}
                            {eksik && <div className="text-[10px]">−{nf(m.miktar! - m.gelen_miktar!)}</div>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {sekme === 'test' && (
            <>
              <Baslik etiket="Çekme testi" sahip="atölye girer" />
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-faint">
                Kumaş geldikten sonra, kesim planlanmadan önce yapılır. Sonuç riskliyse kalıp büyütme ya da ön yıkama kararı gerekir.
              </p>
              {!test || test.sonuc === 'BEKLIYOR'
                ? <Kutu ton="wrn">Test yapılmamış. Kesim bu test girilmeden planlanmamalı.</Kutu>
                : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-xs">
                    <dt className="text-faint">Test tarihi</dt><dd className="text-right font-mono text-ink">{trTarih(test.tarih)}</dd>
                    <dt className="text-faint">Yıkama sayısı</dt><dd className="text-right font-mono text-ink">{test.yikama_sayisi ?? '—'}</dd>
                    <dt className="text-faint">En çekmesi</dt><dd className="text-right font-mono text-ink">%{test.en_cekme_pct ?? '—'}</dd>
                    <dt className="text-faint">Boy çekmesi</dt><dd className={`text-right font-mono ${(test.boy_cekme_pct ?? 0) < -5 ? 'text-danger' : 'text-ink'}`}>%{test.boy_cekme_pct ?? '—'}</dd>
                    <dt className="text-faint">May kayması</dt><dd className={`text-right font-mono ${(test.may_kaymasi_pct ?? 0) > 3 ? 'text-danger' : 'text-ink'}`}>%{test.may_kaymasi_pct ?? '—'}</dd>
                    <dt className="text-faint">Sonuç</dt><dd className="text-right"><Etiket ton={testDurumu(test).sinif === 'ok' ? 'ok' : 'bad'}>{test.sonuc}</Etiket></dd>
                    <dt className="text-faint">Yapan</dt><dd className="text-right text-ink">{test.yapan ?? '—'}</dd>
                  </dl>
                )}
            </>
          )}

          {sekme === 'konular' && (
            <>
              <Baslik etiket="PO'ya özel konular" sahip="work_order_journal" />
              {journal === null ? <p className="text-[11.5px] text-faint">Yükleniyor…</p>
                : journal.length === 0 ? <p className="text-[11.5px] text-faint">Bu sipariş için kayıt yok.</p>
                : journal.map(j => (
                  <div key={j.id} className={`mb-2.5 border-l-[3px] py-1 pl-2.5 ${
                    j.tip === 'PROBLEM' || j.tip === 'BLOKAJ' ? 'border-danger' : j.tip === 'UYARI' ? 'border-warn' : j.tip === 'KAIZEN' ? 'border-accent' : 'border-line'}`}>
                    {j.baslik && <h4 className="text-xs font-semibold text-ink">{j.baslik}</h4>}
                    <p className="text-[11.5px] leading-relaxed text-body">{j.aciklama}</p>
                    <div className="mt-0.5 font-mono text-[10.5px] text-faint">{j.tip} · {trTarih(isoTarih(j.tarih))}{j.stage_name ? ` · ${j.stage_name}` : ''}{j.yazan ? ` · ${j.yazan}` : ''}</div>
                  </div>
                ))}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft bg-canvas px-4 py-2.5 text-[11.5px] text-faint">
          Plan <b className="font-mono text-ink">{nf(tPlan)}</b> · Gerçek <b className="font-mono text-ink">{nf(tGercek)}</b> · <b className="font-mono text-ink">{plan.length}</b> iş günü
        </div>
      </aside>
    </>
  )
}

function Baslik({ etiket, sahip }: { etiket: string; sahip: string }) {
  return (
    <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
      {etiket} <span className="rounded bg-accent-soft px-1.5 py-px text-[9.5px] font-semibold normal-case tracking-normal text-accent-ink">{sahip}</span>
    </p>
  )
}

function Kutu({ ton, children }: { ton: 'dan' | 'wrn'; children: React.ReactNode }) {
  return (
    <div className={`mb-3 rounded-lg border px-2.5 py-2 text-[11.5px] leading-relaxed ${
      ton === 'dan' ? 'border-danger-line bg-danger-soft text-danger' : 'border-warn-line bg-warn-soft text-warn'}`}>{children}</div>
  )
}

function Etiket({ ton, children }: { ton: 'ok' | 'wait' | 'bad'; children: React.ReactNode }) {
  return (
    <span className={`ml-1 inline-block rounded px-1.5 text-[9.5px] font-semibold ${
      ton === 'ok' ? 'bg-accent-soft text-accent-ink' : ton === 'bad' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}>{children}</span>
  )
}
