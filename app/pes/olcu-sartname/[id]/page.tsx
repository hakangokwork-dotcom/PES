// app/pes/olcu-sartname/[id]/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, CardBody, Badge, Button, Field, Input } from '@/components/ui'
import { kabulAraligi, sartnameYapistir, DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'

type Deger = { nominal: number; tol_eksi: number; tol_arti: number }
type Nokta = { kod: string; ad: string; musteri_adi: string | null; yontem: string | null; kritik: boolean; degerler: Record<string, Deger> }
type Sartname = GirenAlanlari & {
  id: number; kumas_kategorisi: string; asama: string; revizyon: number; durum: string
  onaylayan: string | null; onay_tarihi: string | null; notlar: string | null
}

const sayiOku = (s: string) => Number(s.replace(',', '.'))
const cm = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function OlcuSartnameDetay() {
  const id = Number(useParams<{ id: string }>().id)
  const router = useRouter()
  const [s, setS] = useState<Sartname | null>(null)
  const [noktalar, setNoktalar] = useState<Nokta[]>([])
  const [bedenler, setBedenler] = useState<string[]>([])
  const [mesaj, setMesaj] = useState<{ tur: 'iyi' | 'kotu'; metin: string } | null>(null)
  const [yapistir, setYapistir] = useState({ beden: '', metin: '' })
  const [onay, setOnay] = useState({ onaylayan: '', onay_tarihi: new Date().toISOString().slice(0, 10) })

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/olcu-sartname/${id}`).then(r => r.json())
    setS(d.sartname)
    const n: Nokta[] = (d.noktalar ?? []).map((x: Nokta) => ({ ...x, degerler: Object.fromEntries(
      Object.entries(x.degerler).map(([b, v]) => [b, { nominal: Number(v.nominal), tol_eksi: Number(v.tol_eksi), tol_arti: Number(v.tol_arti) }])) }))
    setNoktalar(n)
    setBedenler([...new Set(n.flatMap(x => Object.keys(x.degerler)))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })))
  }, [id])
  useEffect(() => { yukle() }, [yukle])

  const duzenlenebilir = s?.durum === 'Önerilen'

  function degerYaz(i: number, beden: string, alan: keyof Deger, v: string) {
    setNoktalar(ns => ns.map((n, j) => j !== i ? n : {
      ...n, degerler: { ...n.degerler, [beden]: { ...(n.degerler[beden] ?? { nominal: 0, tol_eksi: 0, tol_arti: 0 }), [alan]: sayiOku(v) } },
    }))
  }

  function yapistirUygula() {
    const beden = yapistir.beden.trim()
    if (!beden) { setMesaj({ tur: 'kotu', metin: 'Yapıştırılan tablonun bedenini yazın (ör. 32)' }); return }
    const r = sartnameYapistir(yapistir.metin)
    setNoktalar(ns => {
      const sonuc = [...ns]
      for (const y of r.satirlar) {
        const i = sonuc.findIndex(n => n.ad === y.ad)
        const deger = { nominal: y.nominal, tol_eksi: y.tol_eksi, tol_arti: y.tol_arti }
        if (i >= 0) sonuc[i] = { ...sonuc[i], degerler: { ...sonuc[i].degerler, [beden]: deger } }
        else sonuc.push({ kod: `P${String(sonuc.length + 1).padStart(2, '0')}`, ad: y.ad, musteri_adi: y.musteri_adi, yontem: null, kritik: false, degerler: { [beden]: deger } })
      }
      return sonuc
    })
    setBedenler(bs => bs.includes(beden) ? bs : [...bs, beden])
    setMesaj(r.hatalar.length
      ? { tur: 'kotu', metin: `${r.satirlar.length} satır alındı. Uyarılar: ${r.hatalar.join(' · ')}` }
      : { tur: 'iyi', metin: `${r.satirlar.length} ölçü noktası ${beden} bedenine işlendi. Kaydetmeyi unutmayın.` })
  }

  async function istek(url: string, method: string, body?: unknown, basliklar: Record<string, string> = {}) {
    setMesaj(null)
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...basliklar }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json()
    if (!r.ok) { setMesaj({ tur: 'kotu', metin: d.error ?? 'İşlem yapılamadı' }); return null }
    return d
  }

  async function kaydet() {
    const d = await istek(`/api/pes/olcu-sartname/${id}`, 'PUT', { notlar: s?.notlar, noktalar }, surumBasligi(s))
    if (d) { setMesaj({ tur: 'iyi', metin: 'Kaydedildi' }); await yukle() }
  }
  async function onayla() {
    if (await istek(`/api/pes/olcu-sartname/${id}/onayla`, 'POST', onay)) await yukle()
  }
  async function revizyon() {
    const d = await istek(`/api/pes/olcu-sartname/${id}/revizyon`, 'POST')
    if (d) router.push(`/pes/olcu-sartname/${d.id}`)
  }

  function yeniBeden() {
    const b = prompt('Beden')?.trim()
    if (b && !bedenler.includes(b)) setBedenler([...bedenler, b])
  }

  if (!s) return <div className="p-6 text-faint">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      <Link href="/pes/olcu-sartname" className="text-xs text-faint hover:text-ink">← Şartnameler</Link>
      <PageHeader
        title={`${s.kumas_kategorisi} · ${ASAMA_ETIKET[s.asama]} · Rev. ${s.revizyon}`}
        context={girenMetni(s)}
      />
      <div className="flex items-center gap-3">
        <Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge>
        {s.durum === 'Önerilen' && <span className="text-xs text-faint">Önerilen sınırlar sevkiyat kabul kriteri değildir; müşteri onayından sonra geçerlidir.</span>}
        {s.durum !== 'Önerilen' && <Button variant="secondary" onClick={revizyon}>Yeni revizyon aç</Button>}
      </div>

      {mesaj && <p className={mesaj.tur === 'iyi' ? 'text-sm text-ok-ink' : 'text-sm text-danger'}>{mesaj.metin}</p>}

      {duzenlenebilir && (
        <Card>
          <CardBody className="grid gap-3 md:grid-cols-[120px_1fr_auto] items-end">
            <Field label="Beden"><Input value={yapistir.beden} onChange={e => setYapistir({ ...yapistir, beden: e.target.value })} placeholder="32" /></Field>
            <Field label="Excel'den yapıştır (ölçü · nominal · −/+ tolerans · kabul aralığı)">
              <textarea className="min-h-24 rounded-lg border border-line bg-surface p-2 text-sm"
                value={yapistir.metin} onChange={e => setYapistir({ ...yapistir, metin: e.target.value })} />
            </Field>
            <Button variant="secondary" onClick={yapistirUygula}>Tabloya işle</Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr>
                <th className="p-2">Kod</th><th>Ölçü noktası</th><th>Ölçüm yöntemi</th><th>Kritik</th>
                {bedenler.map(b => <th key={b} className="p-2 text-center">{b}<div className="font-normal">nominal · −tol · +tol</div></th>)}
                {duzenlenebilir && <th><Button size="sm" variant="ghost" onClick={yeniBeden}>+ beden</Button></th>}
              </tr>
            </thead>
            <tbody>
              {noktalar.map((n, i) => (
                <tr key={i} className="border-t border-line-soft align-top">
                  <td className="p-2 num">{n.kod}</td>
                  <td className="p-2">
                    {duzenlenebilir
                      ? <Input value={n.ad} onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, ad: e.target.value } : x))} />
                      : n.ad}
                    {n.musteri_adi && <div className="text-xs text-faint">{n.musteri_adi}</div>}
                  </td>
                  <td className="p-2 min-w-56">
                    {duzenlenebilir
                      ? <textarea className="w-full rounded-lg border border-line bg-surface p-1 text-xs" value={n.yontem ?? ''}
                          placeholder="Düğme kapalı, düz zemin, kemer dahil, serbest halde…"
                          onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, yontem: e.target.value } : x))} />
                      : <span className="text-xs">{n.yontem ?? '—'}</span>}
                  </td>
                  <td className="p-2">
                    <input type="checkbox" checked={n.kritik} disabled={!duzenlenebilir}
                      onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, kritik: e.target.checked } : x))} />
                  </td>
                  {bedenler.map(b => {
                    const d = n.degerler[b]
                    const k = d ? kabulAraligi(d.nominal, d.tol_eksi, d.tol_arti) : null
                    return (
                      <td key={b} className="p-2">
                        {duzenlenebilir ? (
                          <div className="flex gap-1">
                            {(['nominal', 'tol_eksi', 'tol_arti'] as const).map(a => (
                              <div key={`${a}-${d?.[a] ?? ''}`} className="w-16"><Input align="right" inputMode="decimal"
                                defaultValue={d ? String(d[a]).replace('.', ',') : ''}
                                onBlur={e => degerYaz(i, b, a, e.target.value)} /></div>
                            ))}
                          </div>
                        ) : d ? (
                          <span className="num">{cm(d.nominal)} <span className="text-faint">−{cm(d.tol_eksi)} / +{cm(d.tol_arti)}</span></span>
                        ) : '—'}
                        {k && <div className="text-xs text-faint num">{cm(k.alt)}–{cm(k.ust)}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {duzenlenebilir && (
          <CardBody className="flex gap-2">
            <Button variant="ghost" onClick={() => setNoktalar(ns => [...ns, { kod: `P${String(ns.length + 1).padStart(2, '0')}`, ad: '', musteri_adi: null, yontem: null, kritik: false, degerler: {} }])}>+ ölçü noktası</Button>
            <Button onClick={kaydet}>Kaydet</Button>
          </CardBody>
        )}
      </Card>

      {duzenlenebilir && (
        <Card>
          <CardBody className="grid gap-3 md:grid-cols-3 items-end">
            <Field label="Onaylayan (müşteri)"><Input value={onay.onaylayan} onChange={e => setOnay({ ...onay, onaylayan: e.target.value })} /></Field>
            <Field label="Onay tarihi"><Input type="date" value={onay.onay_tarihi} onChange={e => setOnay({ ...onay, onay_tarihi: e.target.value })} /></Field>
            <Button onClick={onayla} disabled={!onay.onaylayan.trim()}>Müşteri onaylı yap</Button>
            <p className="md:col-span-3 text-xs text-faint">Onaylanınca değiştirilemez; aynı model × kategori × aşamadaki önceki onaylı revizyon geçersiz olur.</p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
