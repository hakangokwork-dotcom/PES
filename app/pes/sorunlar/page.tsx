// app/pes/sorunlar/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader, Card, CardHeader, Badge, Field, Select, EmptyState } from '@/components/ui'

type Kayit = {
  id: number; work_order_id: number; is_emri_no: string | null; model_adi: string | null; stage_name: string | null
  ortak_unvan: string | null; tip: string; neden_ad: string | null; etki: string | null
  baslik: string | null; aciklama: string; tarih: string; cozuldu: boolean
}
type Ozet = { stage_name: string | null; ortak_unvan: string | null; neden_ad: string | null; acik: number; toplam: number }

export default function SorunPanosu() {
  const [durum, setDurum] = useState('acik')
  const [gun, setGun] = useState('90')
  const [kayitlar, setKayitlar] = useState<Kayit[]>([])
  const [ozet, setOzet] = useState<Ozet[]>([])

  useEffect(() => {
    fetch(`/api/pes/sorunlar?durum=${durum}&gun=${gun}`).then(r => r.json()).then(d => {
      setKayitlar(d.kayitlar ?? []); setOzet(d.ozet ?? [])
    })
  }, [durum, gun])

  return (
    <div className="space-y-5">
      <PageHeader title="Sorun Panosu" context="İş emri adımlarındaki problem ve blokaj kayıtları: hangi adımda, hangi firmada, hangi nedenle." />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Durum">
            <Select value={durum} onChange={e => setDurum(e.target.value)}>
              <option value="acik">Açık</option>
              <option value="hepsi">Hepsi</option>
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Dönem">
            <Select value={gun} onChange={e => setGun(e.target.value)}>
              <option value="30">Son 30 gün</option>
              <option value="90">Son 90 gün</option>
              <option value="365">Son 1 yıl</option>
            </Select>
          </Field>
        </div>
      </div>

      {ozet.length === 0 ? (
        <EmptyState title="Bu dönemde sorun kaydı yok" description="İş emrinin Günlük sekmesinde Problem ya da Blokaj tipinde kayıt girilince burada görünür." />
      ) : (
        <>
          <Card>
            <CardHeader title="Adım × firma × neden" />
            <table className="w-full text-sm">
              <thead className="text-left text-faint text-xs">
                <tr><th className="p-3">Adım</th><th>Firma</th><th>Neden</th><th className="text-right">Açık</th><th className="pr-3 text-right">Toplam</th></tr>
              </thead>
              <tbody>
                {ozet.map((o, i) => (
                  <tr key={i} className="border-t border-line-soft">
                    <td className="p-3">{o.stage_name ?? 'Adımsız'}</td>
                    <td>{o.ortak_unvan ?? '—'}</td>
                    <td>{o.neden_ad ?? 'Belirtilmedi'}</td>
                    <td className={`num text-right ${o.acik > 0 ? 'text-danger font-medium' : 'text-faint'}`}>{o.acik}</td>
                    <td className="num pr-3 text-right">{o.toplam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader title={`Kayıtlar (${kayitlar.length})`} />
            <table className="w-full text-sm">
              <thead className="text-left text-faint text-xs">
                <tr><th className="p-3">Tarih</th><th>İş emri</th><th>Adım</th><th>Firma</th><th>Neden</th><th>Etki</th><th>Sorun</th><th className="pr-3">Durum</th></tr>
              </thead>
              <tbody>
                {kayitlar.map(k => (
                  <tr key={k.id} className="border-t border-line-soft align-top">
                    <td className="p-3 num whitespace-nowrap">{k.tarih.split('-').reverse().join('.')}</td>
                    <td className="py-3">
                      <Link href={`/workshop/is-emri/${k.work_order_id}`} className="text-accent hover:underline">{k.is_emri_no ?? `#${k.work_order_id}`}</Link>
                      {k.model_adi && <span className="block text-xs text-faint">{k.model_adi}</span>}
                    </td>
                    <td className="py-3">{k.stage_name ?? '—'}</td>
                    <td className="py-3">{k.ortak_unvan ?? '—'}</td>
                    <td className="py-3">{k.neden_ad ?? '—'}</td>
                    <td className="py-3">{k.etki ? <Badge>{k.etki}</Badge> : '—'}</td>
                    <td className="py-3">
                      <Badge tone={k.tip === 'BLOKAJ' ? 'bad' : 'warn'}>{k.tip === 'BLOKAJ' ? 'Blokaj' : 'Problem'}</Badge>{' '}
                      {k.baslik ?? k.aciklama}
                    </td>
                    <td className="py-3 pr-3"><Badge tone={k.cozuldu ? 'good' : 'bad'}>{k.cozuldu ? 'Çözüldü' : 'Açık'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
