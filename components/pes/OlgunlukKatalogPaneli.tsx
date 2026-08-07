'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Plus, Trash2, Copy, Send, EyeOff, Eye } from 'lucide-react'
import { Button, Field, Input, Select, Badge, Card, CardHeader, CardBody, useToast } from '@/components/ui'
import {
  SEVIYE_ETIKET, SABLON_DURUM_ETIKET, duzenlenebilir,
  type Katalog, type Sablon, type Surec, type Kriter,
} from '@/lib/pes/olgunluk'

/* PANELİN TEK KURALI: yalnız TASLAK sürüm düzenlenir.
   Yayındaki sürüm kilitli (031 trigger) — burada da bütün kontroller
   kapanır, "kaydet"e basıp sunucudan hata almak yerine düğme hiç
   tıklanabilir olmaz. Düzenlemenin yolu yeni versiyon açmak. */

const SEVIYELER = [1, 2, 3] as const

export default function OlgunlukKatalogPaneli({
  katalog, sablonlar,
}: {
  katalog: Katalog
  sablonlar: Sablon[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [veri, setVeri] = useState(katalog)
  const [secili, setSecili] = useState<number | null>(veri.surecler[0]?.id ?? null)
  const [bekliyor, setBekliyor] = useState(false)

  const acik = duzenlenebilir(veri.sablon)

  const yenile = useCallback(async (sablonId = veri.sablon.id) => {
    const r = await fetch(`/api/pes/olgunluk/sablon?id=${sablonId}`)
    if (r.ok) setVeri(await r.json())
  }, [veri.sablon.id])

  /** Tek kapı: hata mesajı sunucudan gelir, toast'a olduğu gibi düşer. */
  const istek = useCallback(async (
    yol: string, method: string, govde?: unknown, basari?: string,
  ): Promise<boolean> => {
    setBekliyor(true)
    try {
      const r = await fetch(yol, {
        method,
        headers: govde ? { 'Content-Type': 'application/json' } : undefined,
        body: govde ? JSON.stringify(govde) : undefined,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'İşlem başarısız'); return false }
      if (basari) toast.success(basari)
      return true
    } catch {
      toast.error('Bağlantı hatası')
      return false
    } finally {
      setBekliyor(false)
    }
  }, [toast])

  const surecler = useMemo(
    () => [...veri.surecler].sort((a, b) => a.sira - b.sira),
    [veri.surecler])
  const kategoriler = useMemo(
    () => [...veri.kategoriler].sort((a, b) => a.sira - b.sira),
    [veri.kategoriler])
  const seciliSurec = surecler.find((s) => s.id === secili) ?? null

  /* ---------- Sürüm işlemleri ---------- */

  async function versiyonAc() {
    const kod = window.prompt('Yeni sürüm kodu (ör. v5):')?.trim()
    if (!kod) return
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/sablon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: 'klonla', sablon_id: veri.sablon.id, kod }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Kopyalanamadı'); return }
      toast.success(`${kod} oluşturuldu — düzenlemeye açık`)
      router.push(`/pes/olgunluk/katalog?sablon=${j.sablon_id}`)
      router.refresh()
    } finally {
      setBekliyor(false)
    }
  }

  async function yayinla() {
    const yayindaki = sablonlar.find((s) => s.durum === 'yayinda' && s.id !== veri.sablon.id)
    const uyari = yayindaki
      ? `"${veri.sablon.kod}" yayına alınacak, "${yayindaki.kod}" arşive düşecek. ` +
        'Yayınlanan sürüm bir daha düzenlenemez. Devam?'
      : `"${veri.sablon.kod}" yayına alınacak ve bir daha düzenlenemez. Devam?`
    if (!window.confirm(uyari)) return
    const ok = await istek('/api/pes/olgunluk/sablon', 'POST',
      { islem: 'yayinla', sablon_id: veri.sablon.id }, 'Sürüm yayınlandı')
    if (ok) router.refresh()
  }

  /* ---------- Sıralama ---------- */

  function tasinmis<T extends { id: number }>(liste: T[], i: number, yon: -1 | 1): number[] | null {
    const j = i + yon
    if (j < 0 || j >= liste.length) return null
    const kopya = [...liste]
    ;[kopya[i], kopya[j]] = [kopya[j], kopya[i]]
    return kopya.map((x) => x.id)
  }

  async function surecTasi(kategoriIci: Surec[], i: number, yon: -1 | 1) {
    const yeniIci = tasinmis(kategoriIci, i, yon)
    if (!yeniIci) return
    // Kategori içinde yer değiştirdi; global sıra listesine geri yazılır ki
    // ağaçtaki görünüm ile veritabanındaki sıra ayrışmasın.
    const setIci = new Set(kategoriIci.map((s) => s.id))
    let k = 0
    const tumSira = surecler.map((s) => (setIci.has(s.id) ? yeniIci[k++] : s.id))
    if (await istek('/api/pes/olgunluk/surec', 'PUT',
      { sablon_id: veri.sablon.id, sira: tumSira })) await yenile()
  }

  async function kriterTasi(liste: Kriter[], i: number, yon: -1 | 1, seviye: number) {
    const yeni = tasinmis(liste, i, yon)
    if (!yeni || !seciliSurec) return
    if (await istek('/api/pes/olgunluk/kriter', 'PUT',
      { surec_id: seciliSurec.id, seviye, sira: yeni })) await yenile()
  }

  /* ---------- Ekle / sil ---------- */

  async function surecEkle(kategoriId: number) {
    const kod = window.prompt('Süreç kodu (ör. 3.5):')?.trim()
    if (!kod) return
    const ad = window.prompt('Süreç adı:')?.trim()
    if (!ad) return
    if (await istek('/api/pes/olgunluk/surec', 'POST',
      { sablon_id: veri.sablon.id, kategori_id: kategoriId, kod, ad }, 'Süreç eklendi')) {
      await yenile()
    }
  }

  async function kategoriEkle() {
    const kod = window.prompt('Kategori kodu (ör. K11):')?.trim()
    if (!kod) return
    const ad = window.prompt('Kategori adı:')?.trim()
    if (!ad) return
    if (await istek('/api/pes/olgunluk/kategori', 'POST',
      { sablon_id: veri.sablon.id, kod, ad }, 'Kategori eklendi')) await yenile()
  }

  async function surecSil(s: Surec) {
    if (!window.confirm(`"${s.kod} ${s.ad}" silinecek. Maddeleri de gider. Emin misiniz?`)) return
    if (await istek(`/api/pes/olgunluk/surec?id=${s.id}`, 'DELETE', undefined, 'Süreç silindi')) {
      if (secili === s.id) setSecili(null)
      await yenile()
    }
  }

  async function kriterEkle(seviye: number) {
    if (!seciliSurec) return
    const metin = window.prompt(`Seviye ${seviye} — yeni madde:`)?.trim()
    if (!metin) return
    if (await istek('/api/pes/olgunluk/kriter', 'POST',
      { surec_id: seciliSurec.id, seviye, metin }, 'Madde eklendi')) await yenile()
  }

  async function kriterSil(k: Kriter) {
    if (k.cevap_adedi > 0) {
      toast.error(`Bu madde ${k.cevap_adedi} denetimde cevaplanmış; silinemez. Pasife alın.`)
      return
    }
    if (!window.confirm('Madde silinecek. Emin misiniz?')) return
    if (await istek(`/api/pes/olgunluk/kriter?id=${k.id}`, 'DELETE', undefined, 'Madde silindi')) {
      await yenile()
    }
  }

  async function kriterYaz(k: Kriter, alanlar: Record<string, unknown>, basari?: string) {
    if (await istek('/api/pes/olgunluk/kriter', 'PATCH', { id: k.id, ...alanlar }, basari)) {
      await yenile()
    }
  }

  /* ---------- Görünüm ---------- */

  const toplamMadde = veri.kriterler.filter((k) => k.aktif).length

  return (
    <div className="space-y-4">
      {/* Sürüm şeridi */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <Select
          className="w-56"
          value={veri.sablon.id}
          onChange={(e) => {
            router.push(`/pes/olgunluk/katalog?sablon=${e.target.value}`)
            router.refresh()
          }}
        >
          {sablonlar.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kod} — {SABLON_DURUM_ETIKET[s.durum]}
            </option>
          ))}
        </Select>

        <Badge tone={veri.sablon.durum === 'yayinda' ? 'good' : 'neutral'}>
          {SABLON_DURUM_ETIKET[veri.sablon.durum]}
        </Badge>

        <span className="num text-[13px] text-muted">
          {kategoriler.length} kategori · {surecler.length} süreç · {toplamMadde} madde
          {veri.sablon.denetim_adedi > 0 && ` · ${veri.sablon.denetim_adedi} denetim`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />}
                  onClick={versiyonAc} loading={bekliyor}>
            Yeni versiyon
          </Button>
          {acik && (
            <Button size="sm" icon={<Send className="size-3.5" />}
                    onClick={yayinla} loading={bekliyor}>
              Yayınla
            </Button>
          )}
        </div>
      </div>

      {!acik && (
        <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
          Bu sürüm {veri.sablon.durum === 'yayinda' ? 'yayında' : 'arşivde'} ve salt okunur.
          Denetimler bu soruları kullanıyor; değiştirmek geçmiş denetimlerin skorunu
          anlamsız kılardı. Düzenlemek için <strong>Yeni versiyon</strong> oluşturun.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr] items-start">
        {/* Sol: kategori -> süreç ağacı */}
        <Card>
          <CardHeader title="Kategoriler ve süreçler" aside={`${surecler.length} süreç`} />
          <CardBody className="space-y-4 p-3">
            {kategoriler.map((kat) => {
              const ici = surecler.filter((s) => s.kategori_id === kat.id)
              return (
                <div key={kat.id}>
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                      {kat.kod} · {kat.ad}
                    </span>
                    <span className="num text-[11px] text-faint">{ici.length}</span>
                    {acik && (
                      <button
                        onClick={() => surecEkle(kat.id)}
                        className="ml-auto text-faint hover:text-ink"
                        title="Bu kategoriye süreç ekle"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <ul className="space-y-px">
                    {ici.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-1">
                        <button
                          onClick={() => setSecili(s.id)}
                          className={
                            'flex-1 truncate rounded px-2 py-1.5 text-left text-[13px] transition-colors ' +
                            (s.id === secili
                              ? 'bg-canvas font-medium text-ink'
                              : 'text-body hover:bg-canvas')
                          }
                        >
                          <span className="num text-faint">{s.kod}</span>{' '}
                          <span className={s.aktif ? '' : 'line-through text-faint'}>{s.ad}</span>
                        </button>
                        <span
                          className={
                            'num shrink-0 text-[11px] ' +
                            (s.kriter_adedi === 0 ? 'text-danger' : 'text-faint')
                          }
                          title={s.kriter_adedi === 0
                            ? 'Maddesi yok — denetimde değerlendirilemez'
                            : `${s.kriter_adedi} madde`}
                        >
                          {s.kriter_adedi}
                        </span>
                        {acik && (
                          <span className="flex shrink-0">
                            <button onClick={() => surecTasi(ici, i, -1)} disabled={i === 0}
                                    className="text-faint hover:text-ink disabled:opacity-30" title="Yukarı">
                              <ChevronUp className="size-3.5" />
                            </button>
                            <button onClick={() => surecTasi(ici, i, 1)} disabled={i === ici.length - 1}
                                    className="text-faint hover:text-ink disabled:opacity-30" title="Aşağı">
                              <ChevronDown className="size-3.5" />
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}

            {acik && (
              <button onClick={kategoriEkle}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-canvas hover:text-ink">
                <Plus className="size-3.5" /> Kategori ekle
              </button>
            )}
          </CardBody>
        </Card>

        {/* Sağ: seçili sürecin maddeleri */}
        {seciliSurec ? (
          <SurecDetay
            key={seciliSurec.id}
            surec={seciliSurec}
            kategoriler={kategoriler}
            kriterler={veri.kriterler.filter((k) => k.surec_id === seciliSurec.id)}
            acik={acik}
            bekliyor={bekliyor}
            onKaydet={async (alanlar) => {
              if (await istek('/api/pes/olgunluk/surec', 'PATCH',
                { id: seciliSurec.id, ...alanlar }, 'Süreç güncellendi')) await yenile()
            }}
            onSil={() => surecSil(seciliSurec)}
            onKriterEkle={kriterEkle}
            onKriterSil={kriterSil}
            onKriterYaz={kriterYaz}
            onKriterTasi={kriterTasi}
          />
        ) : (
          <Card>
            <CardBody>
              <p className="text-[13px] text-faint">Soldan bir süreç seçin.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function SurecDetay({
  surec, kategoriler, kriterler, acik, bekliyor,
  onKaydet, onSil, onKriterEkle, onKriterSil, onKriterYaz, onKriterTasi,
}: {
  surec: Surec
  kategoriler: { id: number; kod: string; ad: string }[]
  kriterler: Kriter[]
  acik: boolean
  bekliyor: boolean
  onKaydet: (alanlar: Record<string, unknown>) => Promise<void>
  onSil: () => void
  onKriterEkle: (seviye: number) => void
  onKriterSil: (k: Kriter) => void
  onKriterYaz: (k: Kriter, alanlar: Record<string, unknown>, basari?: string) => Promise<void>
  onKriterTasi: (liste: Kriter[], i: number, yon: -1 | 1, seviye: number) => void
}) {
  const [kod, setKod] = useState(surec.kod)
  const [ad, setAd] = useState(surec.ad)
  const [kategoriId, setKategoriId] = useState(surec.kategori_id)
  const [agirlik, setAgirlik] = useState(surec.agirlik)

  const degisti = kod !== surec.kod || ad !== surec.ad
    || kategoriId !== surec.kategori_id || agirlik !== surec.agirlik

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`${surec.kod} · ${surec.ad}`}
          aside={surec.aktif ? undefined : 'Pasif'}
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[100px_1fr_90px]">
            <Field label="Kod">
              <Input value={kod} disabled={!acik} onChange={(e) => setKod(e.target.value)} />
            </Field>
            <Field label="Ad">
              <Input value={ad} disabled={!acik} onChange={(e) => setAd(e.target.value)} />
            </Field>
            <Field label="Ağırlık" hint="1 = eşit">
              <Input value={agirlik} align="right" disabled={!acik}
                     onChange={(e) => setAgirlik(e.target.value)} />
            </Field>
          </div>

          <Field label="Kategori (radar ekseni)">
            <Select value={kategoriId} disabled={!acik}
                    onChange={(e) => setKategoriId(Number(e.target.value))}>
              {kategoriler.map((k) => (
                <option key={k.id} value={k.id}>{k.kod} — {k.ad}</option>
              ))}
            </Select>
          </Field>

          {acik && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" loading={bekliyor} disabled={!degisti}
                      onClick={() => onKaydet({ kod, ad, kategori_id: kategoriId, agirlik })}>
                Kaydet
              </Button>
              <Button size="sm" variant="secondary" loading={bekliyor}
                      icon={surec.aktif ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      onClick={() => onKaydet({ aktif: !surec.aktif })}>
                {surec.aktif ? 'Pasife al' : 'Aktife al'}
              </Button>
              <Button size="sm" variant="danger" className="ml-auto"
                      icon={<Trash2 className="size-3.5" />} onClick={onSil}>
                Sil
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {SEVIYELER.map((seviye) => {
        const liste = kriterler
          .filter((k) => k.seviye === seviye)
          .sort((a, b) => a.sira - b.sira)
        return (
          <Card key={seviye}>
            <CardHeader
              title={`Seviye ${seviye} — ${SEVIYE_ETIKET[seviye]}`}
              aside={`${liste.filter((k) => k.aktif).length} madde`}
            />
            <CardBody className="space-y-2 p-3">
              {liste.length === 0 && (
                <p className="px-1 text-[13px] text-faint">
                  Madde yok. Tanımsız seviye denetimde kendiliğinden geçer —
                  bir üst seviyenin şartları belirleyici olur.
                </p>
              )}

              {liste.map((k, i) => (
                <KriterSatiri
                  key={`${k.id}-${k.metin}`}
                  kriter={k} acik={acik}
                  ilk={i === 0} son={i === liste.length - 1}
                  onTasi={(yon) => onKriterTasi(liste, i, yon, seviye)}
                  onYaz={(alanlar, basari) => onKriterYaz(k, alanlar, basari)}
                  onSil={() => onKriterSil(k)}
                />
              ))}

              {acik && (
                <button onClick={() => onKriterEkle(seviye)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-canvas hover:text-ink">
                  <Plus className="size-3.5" /> Madde ekle
                </button>
              )}
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function KriterSatiri({
  kriter, acik, ilk, son, onTasi, onYaz, onSil,
}: {
  kriter: Kriter
  acik: boolean
  ilk: boolean
  son: boolean
  onTasi: (yon: -1 | 1) => void
  onYaz: (alanlar: Record<string, unknown>, basari?: string) => Promise<void>
  onSil: () => void
}) {
  const marka = kriter.taraf === 'MARKA'
  return (
    <div className={
      'flex items-start gap-2 rounded border border-line-soft px-2 py-1.5 ' +
      (kriter.aktif ? 'bg-surface' : 'bg-canvas')
    }>
      {acik && (
        <span className="flex shrink-0 flex-col pt-0.5">
          <button onClick={() => onTasi(-1)} disabled={ilk}
                  className="text-faint hover:text-ink disabled:opacity-30" title="Yukarı">
            <ChevronUp className="size-3.5" />
          </button>
          <button onClick={() => onTasi(1)} disabled={son}
                  className="text-faint hover:text-ink disabled:opacity-30" title="Aşağı">
            <ChevronDown className="size-3.5" />
          </button>
        </span>
      )}

      <textarea
        defaultValue={kriter.metin}
        readOnly={!acik}
        rows={Math.min(4, Math.ceil(kriter.metin.length / 78) || 1)}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (acik && v && v !== kriter.metin) onYaz({ metin: v }, 'Madde güncellendi')
        }}
        className={
          'min-w-0 flex-1 resize-y rounded border-0 bg-transparent px-1 py-0.5 text-[13px] leading-snug outline-none ' +
          'focus:bg-canvas ' + (kriter.aktif ? 'text-ink' : 'text-faint line-through')
        }
      />

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Marka maddeleri atölye puanına girmez — kaynak metinlerdeki "X" öneki. */}
        <button
          disabled={!acik}
          onClick={() => onYaz({ taraf: marka ? 'ATOLYE' : 'MARKA' })}
          title={marka
            ? 'Marka/tedarik sorumluluğu — atölye puanına girmez'
            : 'Atölye sorumluluğu — puana girer'}
          className="disabled:pointer-events-none"
        >
          <Badge tone="neutral">{marka ? 'MARKA' : 'ATÖLYE'}</Badge>
        </button>

        {!kriter.zorunlu && (
          <button disabled={!acik} onClick={() => onYaz({ zorunlu: true })}
                  title="Bilgi amaçlı — seviyeyi bloklamaz" className="disabled:pointer-events-none">
            <Badge tone="neutral">BİLGİ</Badge>
          </button>
        )}

        {acik && (
          <>
            {kriter.zorunlu && (
              <button onClick={() => onYaz({ zorunlu: false })}
                      className="text-[11px] text-faint hover:text-ink" title="Bilgi amaçlı yap">
                zorunlu
              </button>
            )}
            <button onClick={() => onYaz({ aktif: !kriter.aktif })}
                    className="text-faint hover:text-ink"
                    title={kriter.aktif ? 'Pasife al' : 'Aktife al'}>
              {kriter.aktif ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button onClick={onSil} className="text-faint hover:text-danger"
                    title={kriter.cevap_adedi > 0 ? 'Cevaplanmış — silinemez' : 'Sil'}>
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
