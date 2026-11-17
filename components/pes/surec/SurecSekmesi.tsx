// components/pes/surec/SurecSekmesi.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button } from '@/components/ui'
import AdimSartname, { type SartnameOzet } from './AdimSartname'
import AdimKumas from './AdimKumas'
import AdimCekme from './AdimCekme'

export type AdimDurumu = 'Bekliyor' | 'Devam' | 'Tamam' | 'Sorunlu'
export type SurecDurumu = {
  model_bulten_id: number | null
  adim0: AdimDurumu; adim1: AdimDurumu; adim2: AdimDurumu
  top_sayisi: number; karantina: number; serbest: number; red: number; grupsuz_serbest: number
  toplam_metre: string; test_sayisi: number; sorunlu_test: number; final_onayli: number
}

const TON: Record<AdimDurumu, 'neutral' | 'warn' | 'good' | 'bad'> = { Bekliyor: 'neutral', Devam: 'warn', Tamam: 'good', Sorunlu: 'bad' }

/* Sürüm 1: adım 0–2 çalışır; 3–8 listede görünür ama kapalı (sürüm 2–3). */
const SONRAKI = ['Pastal / kesim', 'Kesim ve dikim kontrol', 'Yıkamaya sevk', 'Yıkama (yıkamacı)', 'Dönüş kabulü', 'Ütü / final / paket']

export default function SurecSekmesi({ woId }: { woId: number }) {
  const [d, setD] = useState<{ durum: SurecDurumu; sartnameler: SartnameOzet[] } | null>(null)
  const [acik, setAcik] = useState<number | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    setHata(null)
    try {
      const r = await fetch(`/api/pes/work-orders/${woId}/surec`)
      if (r.ok) { setD(await r.json()); return }
      setHata((await r.json().catch(() => null))?.error ?? 'Süreç bilgisi alınamadı')
    } catch {
      setHata('Sunucuya ulaşılamadı')
    }
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  if (hata && !d) return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-danger">{hata}</span>
      <Button size="sm" variant="secondary" onClick={yukle}>Tekrar dene</Button>
    </div>
  )
  if (!d) return <div className="text-faint text-sm">Yükleniyor…</div>
  const { durum } = d

  const adimlar: { baslik: string; durum: AdimDurumu; ozet: string; icerik: React.ReactNode }[] = [
    { baslik: 'Ölçü şartnamesi', durum: durum.adim0,
      ozet: durum.model_bulten_id ? `${d.sartnameler.length} şartname${durum.final_onayli ? '' : ' · final onaysız'}` : 'İş emrine model bülteni bağlı değil',
      icerik: <AdimSartname sartnameler={d.sartnameler} modelVar={!!durum.model_bulten_id} /> },
    { baslik: 'Kumaş kabul', durum: durum.adim1,
      ozet: `${durum.top_sayisi} top · ${Number(durum.toplam_metre).toLocaleString('tr-TR')} m · ${durum.karantina} karantinada`,
      icerik: <AdimKumas woId={woId} onDegisti={yukle} /> },
    { baslik: 'Çekme testi ve gruplama', durum: durum.adim2,
      ozet: `${durum.test_sayisi} test · ${durum.grupsuz_serbest} serbest top grupsuz${durum.sorunlu_test ? ` · ${durum.sorunlu_test} riskli/red` : ''}`,
      icerik: <AdimCekme woId={woId} onDegisti={yukle} /> },
  ]

  return (
    <ol className="space-y-2">
      {adimlar.map((a, i) => (
        <li key={i} className="rounded-xl border border-line-soft bg-surface">
          <button onClick={() => setAcik(acik === i ? null : i)} className="flex w-full items-center gap-3 p-3 text-left">
            <span className="num w-6 text-faint">{i}</span>
            <span className="font-medium text-ink">{a.baslik}</span>
            <Badge tone={TON[a.durum]}>{a.durum}</Badge>
            <span className="ml-auto text-xs text-faint">{a.ozet}</span>
          </button>
          {acik === i && <div className="border-t border-line-soft p-3">{a.icerik}</div>}
        </li>
      ))}
      {SONRAKI.map((b, j) => (
        <li key={b} className="flex items-center gap-3 rounded-xl border border-dashed border-line-soft p-3 text-faint">
          <span className="num w-6">{j + 3}</span><span>{b}</span>
          <span className="ml-auto text-xs">Sonraki sürümde</span>
        </li>
      ))}
    </ol>
  )
}
