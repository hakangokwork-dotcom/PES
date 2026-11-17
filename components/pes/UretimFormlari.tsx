'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, buttonClass, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, TabloSarmal } from '@/components/ui'
import {
  FORMLAR, FORM_GRUPLARI, bosFormVerisi, formTanimi,
  type Alan, type Deger, type FormTanimi, type FormVerisi, type Tablo,
} from '@/lib/pes/formlar'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'
import { IZINLI_TURLER, dosyaHatasi } from '@/lib/pes/form-dosya'

/* 059: üretim formları ekranı. İki panel aynı bileşeni kullanır:
   atölye panelinde atolyeId oturumdan gelir; merkezde null, atölye seçilir.
   Ortak kayıt: merkez de açar, düzeltir; kim girdi satırda yazılı. */

type Liste = GirenAlanlari & {
  id: number; workshop_id: number; work_order_id: number | null; form_kodu: string; tarih: string
  workshop_name: string; ek_sayisi: number; siparis_no: string | null; is_emri_no: string | null; model_adi: string | null; musteri: string | null
}
type Po = { id: number; is_emri_no: string; siparis_no: string | null; model_adi: string | null; musteri: string | null }
type Acik = {
  id: number | null; tanim: FormTanimi; workshop_id: number; work_order_id: number | null
  tarih: string; veri: FormVerisi; kayit: GirenAlanlari | null
}

const bugun = () => new Date().toISOString().slice(0, 10)
const trTarih = (t: string) => String(t).slice(0, 10).split('-').reverse().join('.')
const poEtiket = (p: { is_emri_no?: string | null; siparis_no?: string | null; model_adi?: string | null }) =>
  [p.siparis_no || p.is_emri_no, p.model_adi].filter(Boolean).join(' · ')

export default function UretimFormlari({ atolyeId }: { atolyeId: number | null }) {
  const merkez = atolyeId == null
  const arama = useSearchParams()
  const [atolyeler, setAtolyeler] = useState<{ id: number; code: string; name: string }[]>([])
  const [secAtolye, setSecAtolye] = useState<number | null>(atolyeId)
  const [poFiltre, setPoFiltre] = useState<number | null>(Number(arama.get('wo')) || null)
  const [formFiltre, setFormFiltre] = useState('')
  const [poler, setPoler] = useState<Po[]>([])
  const [liste, setListe] = useState<Liste[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [acik, setAcik] = useState<Acik | null>(null)

  useEffect(() => { if (atolyeId != null) setSecAtolye(atolyeId) }, [atolyeId])
  useEffect(() => {
    if (merkez) fetch('/api/pes/workshops').then(r => r.json()).then(d => setAtolyeler(d.workshops ?? [])).catch(() => {})
  }, [merkez])
  useEffect(() => {
    if (!secAtolye) { setPoler([]); return }
    fetch(`/api/pes/work-orders?workshop_id=${secAtolye}`).then(r => r.json()).then(d => setPoler(d.orders ?? [])).catch(() => {})
  }, [secAtolye])

  const listeyiYukle = useCallback(async () => {
    setYukleniyor(true)
    const q = new URLSearchParams()
    if (secAtolye) q.set('workshop_id', String(secAtolye))
    if (poFiltre) q.set('work_order_id', String(poFiltre))
    if (formFiltre) q.set('form_kodu', formFiltre)
    const d = await fetch(`/api/pes/formlar?${q}`).then(r => r.json()).catch(() => ({}))
    setListe(d.formlar ?? [])
    setYukleniyor(false)
  }, [secAtolye, poFiltre, formFiltre])
  useEffect(() => { listeyiYukle() }, [listeyiYukle])

  function yeniForm(kod: string) {
    const tanim = formTanimi(kod)
    if (!tanim || !secAtolye) return
    setAcik({ id: null, tanim, workshop_id: secAtolye, work_order_id: tanim.po ? poFiltre : null, tarih: bugun(), veri: bosFormVerisi(tanim), kayit: null })
  }

  async function formuAc(id: number) {
    const d = await fetch(`/api/pes/formlar/${id}`).then(r => r.json())
    const tanim: FormTanimi | undefined = d.form ? formTanimi(d.form.form_kodu) : undefined
    if (!tanim) return
    // Tanım sonradan değiştiyse eksik alan/satır boş gelsin.
    const bos = bosFormVerisi(tanim)
    const veri: FormVerisi = {
      alanlar: { ...bos.alanlar, ...d.form.veri?.alanlar },
      tablolar: Object.fromEntries(tanim.tablolar.map(t => {
        const kayitli = d.form.veri?.tablolar?.[t.ad] ?? []
        return [t.ad, t.satirlar ? bos.tablolar[t.ad].map((r, i) => ({ ...r, ...kayitli[i] })) : (kayitli.length ? kayitli : bos.tablolar[t.ad])]
      })),
    }
    setAcik({ id, tanim, workshop_id: d.form.workshop_id, work_order_id: d.form.work_order_id, tarih: String(d.form.tarih).slice(0, 10), veri, kayit: d.form })
  }

  if (acik) {
    return (
      <FormDuzenle
        acik={acik} setAcik={setAcik} poler={acik.workshop_id === secAtolye ? poler : []}
        kapat={() => { setAcik(null); listeyiYukle() }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Üretim Formları"
        context={merkez ? 'Atölyelerin doldurduğu kontrol formları — sipariş bazlı ya da süreç kaydı' : 'Sipariş bazlı ya da sürecinize ait kontrol formları'}
      />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-4">
          {merkez && (
            <Field label="Atölye">
              <Select value={secAtolye ?? ''} onChange={e => { setSecAtolye(Number(e.target.value) || null); setPoFiltre(null) }}>
                <option value="">Tüm atölyeler</option>
                {atolyeler.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Sipariş (PO)">
            <Select value={poFiltre ?? ''} onChange={e => setPoFiltre(Number(e.target.value) || null)} disabled={!secAtolye}>
              <option value="">{secAtolye ? 'Tümü' : 'Önce atölye seçin'}</option>
              {poler.map(p => <option key={p.id} value={p.id}>{poEtiket(p)}</option>)}
            </Select>
          </Field>
          <Field label="Form">
            <Select value={formFiltre} onChange={e => setFormFiltre(e.target.value)}>
              <option value="">Tüm formlar</option>
              <FormSecenekleri />
            </Select>
          </Field>
          <Field label="Yeni form" hint={secAtolye ? undefined : 'Yeni form için atölye seçin'}>
            <Select value="" onChange={e => yeniForm(e.target.value)} disabled={!secAtolye}>
              <option value="">+ Form doldur…</option>
              <FormSecenekleri />
            </Select>
          </Field>
        </CardBody>
      </Card>

      {yukleniyor ? (
        <p className="text-sm text-faint">Yükleniyor…</p>
      ) : liste.length === 0 ? (
        <EmptyState
          title="Bu filtrede form yok"
          description={secAtolye ? '"Yeni form" listesinden bir form seçip doldurmaya başlayın.' : 'Atölye seçin ya da filtreyi genişletin.'}
        />
      ) : (
        <Card>
          <TabloSarmal>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                <tr className="border-b border-line-soft">
                  <th className="px-4 py-2.5 font-medium">Tarih</th>
                  <th className="px-4 py-2.5 font-medium">Form</th>
                  <th className="px-4 py-2.5 font-medium">Sipariş</th>
                  {merkez && <th className="px-4 py-2.5 font-medium">Atölye</th>}
                  <th className="px-4 py-2.5 font-medium">Giren</th>
                </tr>
              </thead>
              <tbody>
                {liste.map(f => (
                  <tr key={f.id} onClick={() => formuAc(f.id)} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-canvas">
                    <td className="num px-4 py-2.5 text-muted">{trTarih(f.tarih)}</td>
                    <td className="px-4 py-2.5 text-ink">
                      <button type="button" className="text-left hover:underline" onClick={e => { e.stopPropagation(); formuAc(f.id) }}>
                        {formTanimi(f.form_kodu)?.ad ?? f.form_kodu}
                      </button>
                      {f.ek_sayisi > 0 && <span className="ml-2 text-xs text-faint">· {f.ek_sayisi} ek</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{f.work_order_id ? poEtiket(f) : <span className="text-faint">Süreç kaydı</span>}</td>
                    {merkez && <td className="px-4 py-2.5 text-muted">{f.workshop_name}</td>}
                    <td className="px-4 py-2.5 text-xs text-faint">{girenMetni(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabloSarmal>
        </Card>
      )}
    </div>
  )
}

function FormSecenekleri() {
  return <>{FORM_GRUPLARI.map(g => (
    <optgroup key={g} label={g}>
      {FORMLAR.filter(f => f.grup === g).map(f => <option key={f.kod} value={f.kod}>{f.ad}</option>)}
    </optgroup>
  ))}</>
}

function FormDuzenle({ acik, setAcik, poler, kapat }: {
  acik: Acik; setAcik: (a: Acik) => void; poler: Po[]; kapat: () => void
}) {
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const { tanim, veri } = acik

  const alanDegis = (ad: string, v: Deger) => setAcik({ ...acik, veri: { ...veri, alanlar: { ...veri.alanlar, [ad]: v } } })
  const tabloDegis = (ad: string, satirlar: Record<string, Deger>[]) =>
    setAcik({ ...acik, veri: { ...veri, tablolar: { ...veri.tablolar, [ad]: satirlar } } })

  /** Kaydı yazar, açık kalır; güncel hâli döner. Hata varsa null. */
  async function yaz(): Promise<Acik | null> {
    setKaydediliyor(true); setHata(null)
    const govde = { form_kodu: tanim.kod, workshop_id: acik.workshop_id, work_order_id: acik.work_order_id, tarih: acik.tarih, veri }
    const r = await fetch(acik.id ? `/api/pes/formlar/${acik.id}` : '/api/pes/formlar', {
      method: acik.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(acik.id ? surumBasligi(acik.kayit) : {}) },
      body: JSON.stringify(govde),
    })
    const d = await r.json().catch(() => ({}))
    setKaydediliyor(false)
    if (r.status === 409) { setHata('Bu form siz açtıktan sonra başka biri tarafından değiştirildi. Kapatıp yeniden açın.'); return null }
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return null }
    const yeni = { ...acik, id: d.form.id, kayit: d.form }
    setAcik(yeni)
    return yeni
  }

  async function kaydet() {
    if (await yaz()) kapat()
  }

  /* Ek yüklemek kayıt ister: yeni formda önce sessizce kaydedilir,
     böylece yalnız kâğıt formun fotoğrafıyla kayıt açılabilir. */
  async function kayitIdsi(): Promise<number | null> {
    return acik.id ?? (await yaz())?.id ?? null
  }

  async function sil() {
    if (!acik.id) return
    setKaydediliyor(true)
    await fetch(`/api/pes/formlar/${acik.id}`, { method: 'DELETE' })
    kapat()
  }

  const secilenPo = poler.find(p => p.id === acik.work_order_id)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        crumbs={[{ label: 'Üretim Formları' }, { label: tanim.grup }]}
        title={tanim.ad}
        context={[tanim.belge, acik.kayit ? girenMetni(acik.kayit) : 'Yeni kayıt'].filter(Boolean).join(' · ')}
        actions={<>
          <Button variant="ghost" onClick={kapat}>Vazgeç</Button>
          {acik.id && <Button variant="danger" onClick={sil} disabled={kaydediliyor}>Sil</Button>}
          <Button onClick={kaydet} loading={kaydediliyor}>Kaydet</Button>
        </>}
      />
      {hata && <p role="alert" className="text-sm text-danger">{hata}</p>}

      <FormEkleri formId={acik.id} kayitIdsi={kayitIdsi} />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-3">
          <Field label="Tarih">
            <Input type="date" value={acik.tarih} onChange={e => setAcik({ ...acik, tarih: e.target.value })} />
          </Field>
          <Field label="Sipariş (PO)" hint={secilenPo?.musteri ? `Müşteri: ${secilenPo.musteri}` : tanim.po ? 'Bu form siparişe bağlı tutulur' : 'Boş bırakılırsa süreç kaydı'}>
            <Select value={acik.work_order_id ?? ''} onChange={e => setAcik({ ...acik, work_order_id: Number(e.target.value) || null })}>
              <option value="">— Süreç kaydı (siparişsiz) —</option>
              {poler.map(p => <option key={p.id} value={p.id}>{poEtiket(p)}</option>)}
            </Select>
          </Field>
          {tanim.alanlar.map(a => (
            <Field key={a.ad} label={a.etiket} className={a.tip === 'uzun' ? 'md:col-span-3' : undefined}>
              <Hucre alan={a} deger={veri.alanlar[a.ad]} onChange={v => alanDegis(a.ad, v)} />
            </Field>
          ))}
        </CardBody>
      </Card>

      {tanim.tablolar.map(t => (
        <FormTablosu key={t.ad} tablo={t} satirlar={veri.tablolar[t.ad] ?? []} onChange={s => tabloDegis(t.ad, s)} />
      ))}
    </div>
  )
}

type Ek = GirenAlanlari & { id: number; ad: string; tur: string; boyut: number; aciklama: string | null; url: string | null }

/* Fotoğraf 4 MB sınırına (Vercel gövde sınırı) sığsın ve kâğıt form okunur
   kalsın: uzun kenar 2400 px, JPEG %85. Çözülemeyen dosya olduğu gibi gider;
   sunucu türünü yine denetler. */
async function resmiKucult(f: File): Promise<File> {
  if (!f.type.startsWith('image/') || (f.size < 1.5 * 1024 * 1024 && IZINLI_TURLER[f.type])) return f
  try {
    const bmp = await createImageBitmap(f)
    const oran = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * oran); c.height = Math.round(bmp.height * oran)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
  } catch {
    return f
  }
}

function FormEkleri({ formId, kayitIdsi }: { formId: number | null; kayitIdsi: () => Promise<number | null> }) {
  const [ekler, setEkler] = useState<Ek[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const yenile = useCallback(async (id: number) => {
    const d = await fetch(`/api/pes/formlar/${id}/dosyalar`).then(r => r.json()).catch(() => ({}))
    setEkler(d.dosyalar ?? [])
  }, [])
  useEffect(() => { if (formId) yenile(formId) }, [formId, yenile])

  async function yukle(dosyalar: File[]) {
    if (!dosyalar.length) return
    setHata(null); setYukleniyor(true)
    const id = await kayitIdsi()
    if (!id) { setYukleniyor(false); return }
    for (const ham of dosyalar) {
      const f = await resmiKucult(ham)
      const sorun = dosyaHatasi(f.type, f.size)
      if (sorun) { setHata(`${ham.name}: ${sorun}`); continue }
      const fd = new FormData(); fd.append('dosya', f)
      const r = await fetch(`/api/pes/formlar/${id}/dosyalar`, { method: 'POST', body: fd })
      if (!r.ok) setHata(`${ham.name}: ${(await r.json().catch(() => ({}))).error ?? 'yüklenemedi'}`)
    }
    await yenile(id)
    setYukleniyor(false)
  }

  async function ekSil(ek: Ek) {
    if (!formId) return
    await fetch(`/api/pes/formlar/${formId}/dosyalar?dosya=${ek.id}`, { method: 'DELETE' })
    yenile(formId)
  }

  return (
    <Card>
      <CardHeader title="Fotoğraf ve ekler" aside={ekler.length ? `${ekler.length} dosya` : undefined} />
      <CardBody className="space-y-3">
        <p className="text-[13px] text-muted">
          Kâğıt formu doldurduysanız fotoğrafını eklemeniz yeterli; alanları doldurmak zorunlu değil.
          Model resmi, iğne paketi gibi görseller de buraya. Fotoğraf ya da PDF, en çok 4 MB (büyük fotoğraf otomatik küçültülür).
        </p>
        <label className={buttonClass('secondary', 'md', yukleniyor ? 'pointer-events-none opacity-45' : 'cursor-pointer')}>
          {yukleniyor ? 'Yükleniyor…' : '+ Fotoğraf çek / dosya ekle'}
          <input type="file" accept="image/*,application/pdf" multiple className="sr-only" disabled={yukleniyor}
            onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; yukle(f) }} />
        </label>
        {hata && <p role="alert" className="text-sm text-danger">{hata}</p>}
        {ekler.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ekler.map(ek => (
              <li key={ek.id} className="overflow-hidden rounded-lg border border-line-soft">
                <a href={ek.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-canvas">
                  {ek.tur.startsWith('image/') && ek.url
                    ? <img src={ek.url} alt={ek.ad} className="size-full object-cover" />
                    : <span className="flex size-full items-center justify-center text-sm text-muted">PDF</span>}
                </a>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs text-faint" title={`${ek.ad} · ${girenMetni(ek)}`}>{ek.ad}</span>
                  <button type="button" aria-label={`${ek.ad} sil`} onClick={() => ekSil(ek)}
                    className="rounded px-1.5 text-faint hover:bg-danger-soft hover:text-danger">×</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function FormTablosu({ tablo, satirlar, onChange }: {
  tablo: Tablo; satirlar: Record<string, Deger>[]; onChange: (s: Record<string, Deger>[]) => void
}) {
  const serbest = !tablo.satirlar
  const toplamlar = useMemo(() => tablo.toplam
    ? Object.fromEntries(tablo.sutunlar.filter(s => s.tip === 'sayi').map(s => [s.ad, satirlar.reduce((t, r) => t + (Number(r[s.ad]) || 0), 0)]))
    : null, [tablo, satirlar])
  const hucreDegis = (i: number, ad: string, v: Deger) => onChange(satirlar.map((r, j) => (j === i ? { ...r, [ad]: v } : r)))
  const satirEkle = () => onChange([...satirlar, Object.fromEntries(tablo.sutunlar.map(s => [s.ad, null]))])

  return (
    <Card>
      <CardHeader title={tablo.etiket} aside={serbest ? `${satirlar.length} satır` : undefined} />
      <TabloSarmal>
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] text-faint">
            <tr className="border-b border-line-soft">
              {tablo.satirlar && <th className="sticky left-0 bg-surface px-3 py-2 font-medium">{tablo.satirBasligi ?? ''}</th>}
              {tablo.sutunlar.map(s => <th key={s.ad} className="whitespace-nowrap px-2 py-2 font-medium">{s.etiket}</th>)}
              {serbest && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((r, i) => (
              <tr key={i} className="border-b border-line-soft last:border-0">
                {tablo.satirlar && <th scope="row" className="sticky left-0 min-w-48 bg-surface px-3 py-1 text-left font-normal text-ink">{tablo.satirlar[i]}</th>}
                {tablo.sutunlar.map(s => (
                  <td key={s.ad} className="px-1 py-1">
                    <Hucre alan={s} deger={r[s.ad]} onChange={v => hucreDegis(i, s.ad, v)} kompakt
                      etiket={`${tablo.satirlar?.[i] ?? `${i + 1}. satır`} — ${s.etiket}`} />
                  </td>
                ))}
                {serbest && (
                  <td className="px-1">
                    <button type="button" aria-label={`${i + 1}. satırı sil`} onClick={() => onChange(satirlar.filter((_, j) => j !== i))}
                      className="rounded px-1.5 text-faint hover:bg-danger-soft hover:text-danger">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {toplamlar && (
            <tfoot>
              <tr className="border-t border-line text-ink">
                {tablo.satirlar && <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">Toplam</th>}
                {tablo.sutunlar.map((s, k) => (
                  <td key={s.ad} className="num px-2 py-2 text-right font-medium">
                    {s.ad in toplamlar ? toplamlar[s.ad] : (!tablo.satirlar && k === 0 ? 'Toplam' : '')}
                  </td>
                ))}
                {serbest && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </TabloSarmal>
      {serbest && (
        <div className="border-t border-line-soft px-4 py-2.5">
          <Button variant="secondary" size="sm" onClick={satirEkle}>+ Satır ekle</Button>
        </div>
      )}
    </Card>
  )
}

const HUCRE = 'h-8 w-full min-w-20 rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-accent'

function Hucre({ alan, deger, onChange, kompakt, etiket }: {
  alan: Alan; deger: Deger | undefined; onChange: (v: Deger) => void; kompakt?: boolean; etiket?: string
}) {
  const v = deger == null ? '' : String(deger)
  const aria = kompakt ? { 'aria-label': etiket ?? alan.etiket } : {}
  switch (alan.tip) {
    case 'onay':
      return <input type="checkbox" {...aria} checked={deger === true} onChange={e => onChange(e.target.checked)} className="size-4" />
    case 'evet_hayir':
    case 'secim': {
      const secenekler = alan.tip === 'evet_hayir' ? [['evet', 'Evet'], ['hayir', 'Hayır']] : (alan.secenekler ?? []).map(x => [x, x])
      return kompakt
        ? <select {...aria} className={HUCRE} value={v} onChange={e => onChange(e.target.value || null)}>
            <option value="">—</option>{secenekler.map(([d, e]) => <option key={d} value={d}>{e}</option>)}
          </select>
        : <Select value={v} onChange={e => onChange(e.target.value || null)}>
            <option value="">—</option>{secenekler.map(([d, e]) => <option key={d} value={d}>{e}</option>)}
          </Select>
    }
    case 'uzun':
      return <textarea {...aria} rows={kompakt ? 1 : 3} value={v} onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent" />
    default: {
      const type = alan.tip === 'sayi' ? 'number' : alan.tip === 'tarih' ? 'date' : alan.tip === 'saat' ? 'time' : 'text'
      return kompakt
        ? <input {...aria} type={type} step={type === 'number' ? 'any' : undefined} inputMode={type === 'number' ? 'decimal' : undefined}
            value={v} onChange={e => onChange(e.target.value)} className={`${HUCRE} ${type === 'number' ? 'num text-right' : ''}`} />
        : <Input type={type} step={type === 'number' ? 'any' : undefined} value={v} onChange={e => onChange(e.target.value)} />
    }
  }
}
