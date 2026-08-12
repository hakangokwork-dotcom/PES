'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronUp, ChevronDown, Plus, Trash2, Copy, Send, EyeOff, Eye, PencilLine, History,
} from 'lucide-react'
import { Button, Field, Input, Select, Badge, Card, CardHeader, CardBody, useToast } from '@/components/ui'
import {
  SEVIYE_ETIKET, SABLON_DURUM_ETIKET, REVIZYON_ALAN_ETIKET, duzenlenebilir,
  type Katalog, type Sablon, type Surec, type Kriter, type Revizyon,
} from '@/lib/pes/olgunluk'

/* PANELİN TEK KURALI: yalnız TASLAK sürüm düzenlenir.
   Yayındaki sürüm kilitli (031 trigger) — burada da bütün kontroller
   kapanır, "kaydet"e basıp sunucudan hata almak yerine düğme hiç
   tıklanabilir olmaz. Düzenlemenin yolu yeni versiyon açmak. */

const SEVIYELER = [1, 2, 3] as const

export default function OlgunlukKatalogPaneli({
  katalog, sablonlar, yetkili, rol,
}: {
  katalog: Katalog
  sablonlar: Sablon[]
  /** Rol kapısı (lib/pes/olgunluk.ts). Şu an herkes true — bkz. oradaki not. */
  yetkili: boolean
  rol: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [veri, setVeri] = useState(katalog)
  const [secili, setSecili] = useState<number | null>(veri.surecler[0]?.id ?? null)
  const [bekliyor, setBekliyor] = useState(false)

  // Hangi ekleme formu açık: sürüm, kategori, kategori-içi süreç (kategori id)
  const [versiyonFormu, setVersiyonFormu] = useState(false)
  const [kategoriFormu, setKategoriFormu] = useState(false)
  const [surecFormu, setSurecFormu] = useState<number | null>(null)

  /* Düzenleme iki koşula bağlı ve ikisi farklı şeyler söylüyor:
     sürüm taslak olmalı (031 kilidi) VE kullanıcının rolü yetmeli. */
  const acik = duzenlenebilir(veri.sablon) && yetkili

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

  async function versiyonAc(d: Record<string, string>) {
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/sablon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: 'klonla', sablon_id: veri.sablon.id, kod: d.kod, ad: d.ad }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Kopyalanamadı'); return false }
      toast.success(`${d.kod} oluşturuldu — düzenlemeye açık`)
      router.push(`/pes/olgunluk/katalog?sablon=${j.sablon_id}`)
      router.refresh()
      return true
    } finally {
      setBekliyor(false)
    }
  }

  /* Kilitli sürümden düzenlemeye tek tıkla geçiş: kod üretimi ve zaten
     açık bir taslak varsa ona yönlendirme sunucuda (bkz. sablon route). */
  async function duzenlemeyeBasla() {
    setBekliyor(true)
    try {
      const r = await fetch('/api/pes/olgunluk/sablon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: 'duzenlemeyeBasla', sablon_id: veri.sablon.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? 'Taslak açılamadı'); return }
      toast.success(j.mevcut_kod
        ? `Açık taslağa geçildi: ${j.mevcut_kod}`
        : `${j.yeni_kod} taslağı oluşturuldu`)
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

  async function surecEkle(kategoriId: number, d: Record<string, string>) {
    const ok = await istek('/api/pes/olgunluk/surec', 'POST',
      { sablon_id: veri.sablon.id, kategori_id: kategoriId, kod: d.kod, ad: d.ad },
      'Süreç eklendi')
    if (ok) await yenile()
    return ok
  }

  async function kategoriTasi(i: number, yon: -1 | 1) {
    const yeni = tasinmis(kategoriler, i, yon)
    if (!yeni) return
    if (await istek('/api/pes/olgunluk/kategori', 'PUT',
      { sablon_id: veri.sablon.id, sira: yeni })) await yenile()
  }

  async function kategoriSil(kat: { id: number; kod: string; ad: string }) {
    if (!window.confirm(`"${kat.kod} · ${kat.ad}" ana başlığı silinecek. Emin misiniz?`)) return
    if (await istek(`/api/pes/olgunluk/kategori?id=${kat.id}`, 'DELETE',
      undefined, 'Ana başlık silindi')) await yenile()
  }

  async function kategoriEkle(d: Record<string, string>) {
    const ok = await istek('/api/pes/olgunluk/kategori', 'POST',
      { sablon_id: veri.sablon.id, kod: d.kod, ad: d.ad }, 'Kategori eklendi')
    if (ok) await yenile()
    return ok
  }

  async function surecSil(s: Surec) {
    if (!window.confirm(`"${s.kod} ${s.ad}" silinecek. Maddeleri de gider. Emin misiniz?`)) return
    if (await istek(`/api/pes/olgunluk/surec?id=${s.id}`, 'DELETE', undefined, 'Süreç silindi')) {
      if (secili === s.id) setSecili(null)
      await yenile()
    }
  }

  async function kriterEkle(seviye: number, d: Record<string, string>) {
    if (!seciliSurec) return false
    const ok = await istek('/api/pes/olgunluk/kriter', 'POST',
      { surec_id: seciliSurec.id, seviye, metin: d.metin }, 'Madde eklendi')
    if (ok) await yenile()
    return ok
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
      {/* Sürüm şeridi — kimlik üstte, sayılar altta; hepsi tek satırda
          sıkışınca hangisinin ne olduğu okunmuyordu. */}
      <div className="rounded-lg border border-line-soft bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Select
              className="w-52"
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
          </div>

          <div className="flex items-center gap-2">
            {yetkili && (
              <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />}
                      onClick={() => setVersiyonFormu((v) => !v)} loading={bekliyor}>
                Yeni versiyon
              </Button>
            )}
            {acik && (
              <Button size="sm" icon={<Send className="size-3.5" />}
                      onClick={yayinla} loading={bekliyor}>
                Yayınla
              </Button>
            )}
          </div>
        </div>

        <dl className="flex flex-wrap items-end gap-x-10 gap-y-3 border-t border-line-soft px-4 py-3">
          {[
            ['Kategori', String(kategoriler.length)],
            ['Süreç', String(surecler.length)],
            ['Madde', String(toplamMadde)],
            ['Denetim', `${veri.sablon.tamamlanan_adedi} tamamlandı / ${veri.sablon.denetim_adedi}`],
            ['Rolünüz', rol],
          ].map(([etiket, deger]) => (
            <div key={etiket}>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-faint">{etiket}</dt>
              <dd className="num text-[15px] leading-snug tracking-tight text-ink">{deger}</dd>
            </div>
          ))}
        </dl>
      </div>

      {versiyonFormu && yetkili && (
        <SatirEkleme
          alanlar={[
            { ad: 'kod', etiket: 'Sürüm kodu' },
            { ad: 'ad', etiket: 'Ad (isteğe bağlı)', genis: true },
          ]}
          onEkle={versiyonAc}
          onKapat={() => setVersiyonFormu(false)}
          bekliyor={bekliyor}
          gonderEtiketi="Kopyala"
        />
      )}

      {!yetkili && (
        <p className="rounded-lg border border-line-soft bg-canvas px-4 py-3 text-[13px] text-muted">
          Katalogu görüntüleyebilirsiniz ama düzenleme yetkiniz yok
          (rolünüz: <strong>{rol}</strong>).
        </p>
      )}

      {yetkili && !duzenlenebilir(veri.sablon) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-canvas px-4 py-3">
          <p className="min-w-[280px] flex-1 text-[13px] text-muted">
            Bu sürüm {veri.sablon.durum === 'yayinda' ? 'yayında' : 'arşivde'} ve salt okunur.
            {veri.sablon.tamamlanan_adedi > 0
              ? ` ${veri.sablon.tamamlanan_adedi} tamamlanmış denetim bu soruları kullanıyor;
                  metni değiştirmek o denetimlerin puanını açıklanamaz hale getirirdi.`
              : ' Denetimler bu sürüme açılıyor.'}
            {' '}Düzenleme, sürümün bir kopyasında yapılır — eski denetimler kendi sorularıyla kalır.
          </p>
          <Button size="sm" icon={<PencilLine className="size-3.5" />}
                  onClick={duzenlemeyeBasla} loading={bekliyor}>
            Düzenlemeye başla
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr] items-start">
        {/* Sol: kategori -> süreç ağacı */}
        <Card>
          <CardHeader title="Kategoriler ve süreçler" aside={`${surecler.length} süreç`} />
          <CardBody className="space-y-4 p-3">
            {kategoriler.map((kat, ki) => {
              const ici = surecler.filter((s) => s.kategori_id === kat.id)
              return (
                <div key={kat.id}>
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    {acik ? (
                      <KategoriBasligi
                        kategori={kat}
                        bekliyor={bekliyor}
                        ilk={ki === 0}
                        son={ki === kategoriler.length - 1}
                        surecAdedi={ici.length}
                        onKaydet={async (alanlar) => {
                          if (await istek('/api/pes/olgunluk/kategori', 'PATCH',
                            { id: kat.id, ...alanlar }, 'Ana başlık kaydedildi')) await yenile()
                        }}
                        onTasi={(yon) => kategoriTasi(ki, yon)}
                        onSil={() => kategoriSil(kat)}
                      />
                    ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                        {kat.kod} · {kat.ad}
                      </span>
                    )}
                    <span className="num text-[11px] text-faint">{ici.length}</span>
                    {acik && (
                      <button
                        onClick={() => setSurecFormu(surecFormu === kat.id ? null : kat.id)}
                        className="ml-auto text-faint hover:text-ink"
                        title="Bu kategoriye süreç ekle"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {acik && surecFormu === kat.id && (
                    <div className="pb-1.5">
                      <SatirEkleme
                        alanlar={[
                          { ad: 'kod', etiket: 'Kod' },
                          { ad: 'ad', etiket: 'Süreç adı', genis: true },
                        ]}
                        onEkle={(d) => surecEkle(kat.id, d)}
                        onKapat={() => setSurecFormu(null)}
                        bekliyor={bekliyor}
                      />
                    </div>
                  )}

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

            {acik && (kategoriFormu ? (
              <SatirEkleme
                alanlar={[
                  { ad: 'kod', etiket: 'Kod' },
                  { ad: 'ad', etiket: 'Kategori adı', genis: true },
                ]}
                onEkle={kategoriEkle}
                onKapat={() => setKategoriFormu(false)}
                bekliyor={bekliyor}
              />
            ) : (
              <button onClick={() => setKategoriFormu(true)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-canvas hover:text-ink">
                <Plus className="size-3.5" /> Kategori ekle
              </button>
            ))}
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

/* ----------------------------------------------------------------
   Satır içi ekleme formu.

   Eskiden window.prompt kullanılıyordu: iki alan iki ayrı kutu demekti,
   birinciyi doldurup ikinciyi iptal edince yarım kayıt riski vardı,
   metin uzunsa tek satırlık kutuya sığmıyordu ve tarayıcı prompt'u
   mobilde/tablette kullanılabilir değil. Bu form aynı yerde açılır,
   Enter ile gönderir, Esc ile kapanır.
   ---------------------------------------------------------------- */

type AlanTanim = { ad: string; etiket: string; genis?: boolean; cokSatir?: boolean }

function SatirEkleme({
  alanlar, onEkle, onKapat, bekliyor, gonderEtiketi = 'Ekle',
}: {
  alanlar: AlanTanim[]
  onEkle: (degerler: Record<string, string>) => Promise<boolean | undefined>
  onKapat: () => void
  bekliyor: boolean
  gonderEtiketi?: string
}) {
  const [degerler, setDegerler] = useState<Record<string, string>>({})

  // İlk alan zorunlu; gerisi (ör. sürüm adı) boş bırakılabilir.
  const gecerli = (degerler[alanlar[0].ad] ?? '').trim().length > 0

  async function gonder() {
    if (!gecerli || bekliyor) return
    const ok = await onEkle(degerler)
    if (ok !== false) { setDegerler({}); onKapat() }
  }

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded border border-line bg-canvas p-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onKapat()
        // Çok satırlı alanda Enter yeni satır açar; gönderim Ctrl/Cmd+Enter.
        if (e.key === 'Enter' && (!alanlar.some((a) => a.cokSatir) || e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          void gonder()
        }
      }}
    >
      {alanlar.map((a, i) => (
        <Field key={a.ad} label={a.etiket} className={a.genis ? 'min-w-[220px] flex-1' : 'w-28'}>
          {a.cokSatir ? (
            <textarea
              autoFocus={i === 0}
              rows={2}
              value={degerler[a.ad] ?? ''}
              onChange={(e) => setDegerler((p) => ({ ...p, [a.ad]: e.target.value }))}
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent focus:ring-3 focus:ring-accent/15"
            />
          ) : (
            <Input
              autoFocus={i === 0}
              value={degerler[a.ad] ?? ''}
              onChange={(e) => setDegerler((p) => ({ ...p, [a.ad]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <div className="flex gap-1.5 pb-0.5">
        <Button size="sm" onClick={gonder} loading={bekliyor} disabled={!gecerli}>
          {gonderEtiketi}
        </Button>
        <Button size="sm" variant="ghost" onClick={onKapat}>Vazgeç</Button>
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
  onKriterEkle: (seviye: number, degerler: Record<string, string>) => Promise<boolean | undefined>
  onKriterSil: (k: Kriter) => void
  onKriterYaz: (k: Kriter, alanlar: Record<string, unknown>, basari?: string) => Promise<void>
  onKriterTasi: (liste: Kriter[], i: number, yon: -1 | 1, seviye: number) => void
}) {
  const [kod, setKod] = useState(surec.kod)
  const [ad, setAd] = useState(surec.ad)
  const [kategoriId, setKategoriId] = useState(surec.kategori_id)
  const [agirlik, setAgirlik] = useState(surec.agirlik)
  const [maddeFormu, setMaddeFormu] = useState<number | null>(null)

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
              {degisti && (
                <Button size="sm" variant="ghost" onClick={() => {
                  setKod(surec.kod); setAd(surec.ad)
                  setKategoriId(surec.kategori_id); setAgirlik(surec.agirlik)
                }}>
                  Yoksay
                </Button>
              )}
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

              {acik && (maddeFormu === seviye ? (
                <SatirEkleme
                  alanlar={[{ ad: 'metin', etiket: `Seviye ${seviye} maddesi`, genis: true, cokSatir: true }]}
                  onEkle={(d) => onKriterEkle(seviye, d)}
                  onKapat={() => setMaddeFormu(null)}
                  bekliyor={bekliyor}
                />
              ) : (
                <button onClick={() => setMaddeFormu(seviye)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-canvas hover:text-ink">
                  <Plus className="size-3.5" /> Madde ekle
                </button>
              ))}
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- */

/* MADDE SATIRI — canlı yazım için.

   Eskiden metin bir textarea'ydı ve odak çıkınca sessizce kaydediliyordu.
   Katalogu canlı yazarken bu yanlış: yarım yazılmış bir cümle yanlışlıkla
   başka yere tıklayınca kaydediliyordu ve "kaydettim mi" belirsizdi.
   Artık düzenleme açık bir kip: Kaydet ya da Yoksay. Yoksay orijinali
   geri getirir, sunucuya hiçbir şey gitmez. */
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
  const [duzenle, setDuzenle] = useState(false)
  const [metin, setMetin] = useState(kriter.metin)
  const [gecmisAcik, setGecmisAcik] = useState(false)

  const degisti = metin.trim() !== kriter.metin && metin.trim().length > 0

  function yoksay() {
    setMetin(kriter.metin)
    setDuzenle(false)
  }
  async function kaydet() {
    if (!degisti) { setDuzenle(false); return }
    await onYaz({ metin: metin.trim() }, 'Madde kaydedildi')
    setDuzenle(false)
  }

  return (
    <div className={
      'rounded border border-line-soft px-2 py-1.5 ' +
      (kriter.aktif ? 'bg-surface' : 'bg-canvas')
    }>
      <div className="flex items-start gap-2">
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

        {duzenle ? (
          <div className="min-w-0 flex-1">
            <textarea
              autoFocus
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); yoksay() }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void kaydet() }
              }}
              rows={Math.min(6, Math.ceil(metin.length / 78) + 1)}
              className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] leading-snug text-ink outline-none focus:border-accent focus:ring-3 focus:ring-accent/15"
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <Button size="sm" onClick={kaydet} disabled={!degisti}>Kaydet</Button>
              <Button size="sm" variant="ghost" onClick={yoksay}>Yoksay</Button>
              <span className="ml-1 text-[11px] text-faint">Ctrl+Enter kaydeder · Esc vazgeçer</span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => acik && setDuzenle(true)}
            disabled={!acik}
            title={acik ? 'Düzenlemek için tıklayın' : undefined}
            className={
              'min-w-0 flex-1 rounded px-1 py-0.5 text-left text-[13px] leading-snug ' +
              (acik ? 'hover:bg-canvas cursor-text ' : 'cursor-default ') +
              (kriter.aktif ? 'text-ink' : 'text-faint line-through')
            }
          >
            {kriter.metin}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {/* SEVİYE TAŞIMA. Katalog yazarken en sık yapılan iş bir maddenin
              yanlış basamakta olduğunu görüp indirmek/çıkarmak; bunun için
              maddeyi silip yeniden yazmak gerekiyordu. */}
          {acik && (
            <span className="inline-flex overflow-hidden rounded border border-line">
              {[1, 2, 3].map((sv) => (
                <button
                  key={sv}
                  disabled={sv === kriter.seviye}
                  onClick={() => onYaz({ seviye: sv }, `Seviye ${sv}'e taşındı`)}
                  title={sv === kriter.seviye ? 'Bu seviyede' : `Seviye ${sv}'e taşı`}
                  className={
                    'num h-5 w-5 text-[11px] leading-none transition-colors ' +
                    (sv > 1 ? 'border-l border-line ' : '') +
                    (sv === kriter.seviye
                      ? 'bg-accent-soft font-semibold text-accent-ink'
                      : 'bg-surface text-faint hover:bg-canvas hover:text-ink')
                  }
                >
                  {sv}
                </button>
              ))}
            </span>
          )}

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

      {kriter.revizyon_adedi > 0 && (
        <div className="pl-1 pt-1">
          <button onClick={() => setGecmisAcik((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-ink">
            <History className="size-3" />
            {kriter.revizyon_adedi} düzenleme
          </button>
          {gecmisAcik && (
            <Gecmis tur="kriter" kayitId={kriter.id}
                    onGeriGetir={acik ? (m) => { setMetin(m); setDuzenle(true) } : undefined} />
          )}
        </div>
      )}
    </div>
  )
}

/** Ana başlık — kod ve ad birlikte düzenlenir, sıralanır, boşsa silinir. */
function KategoriBasligi({
  kategori, bekliyor, ilk, son, surecAdedi, onKaydet, onTasi, onSil,
}: {
  kategori: { id: number; kod: string; ad: string }
  bekliyor: boolean
  ilk: boolean
  son: boolean
  surecAdedi: number
  onKaydet: (alanlar: { kod?: string; ad?: string }) => Promise<void>
  onTasi: (yon: -1 | 1) => void
  onSil: () => void
}) {
  const [duzenle, setDuzenle] = useState(false)
  const [kod, setKod] = useState(kategori.kod)
  const [ad, setAd] = useState(kategori.ad)
  const degisti = (ad.trim() !== kategori.ad || kod.trim() !== kategori.kod)
    && ad.trim().length > 0 && kod.trim().length > 0

  function yoksay() {
    setKod(kategori.kod); setAd(kategori.ad); setDuzenle(false)
  }

  if (!duzenle) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <button
          onClick={() => setDuzenle(true)}
          title="Ana başlığı düzenle"
          className="min-w-0 flex-1 truncate rounded px-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint hover:bg-canvas hover:text-ink"
        >
          {kategori.kod} · {kategori.ad}
        </button>
        <button onClick={() => onTasi(-1)} disabled={ilk}
                className="shrink-0 text-faint hover:text-ink disabled:opacity-30" title="Yukarı">
          <ChevronUp className="size-3" />
        </button>
        <button onClick={() => onTasi(1)} disabled={son}
                className="shrink-0 text-faint hover:text-ink disabled:opacity-30" title="Aşağı">
          <ChevronDown className="size-3" />
        </button>
        <button
          onClick={onSil}
          className="shrink-0 text-faint hover:text-danger disabled:opacity-30"
          disabled={surecAdedi > 0}
          title={surecAdedi > 0
            ? `${surecAdedi} süreç bağlı — önce başka kategoriye taşıyın`
            : 'Kategoriyi sil'}
        >
          <Trash2 className="size-3" />
        </button>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      <input
        value={kod}
        onChange={(e) => setKod(e.target.value)}
        className="num w-14 shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink outline-none focus:border-accent"
      />
      <input
        autoFocus
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') yoksay()
          if (e.key === 'Enter' && degisti) {
            void onKaydet({ kod: kod.trim(), ad: ad.trim() }).then(() => setDuzenle(false))
          }
        }}
        className="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink outline-none focus:border-accent"
      />
      <button disabled={!degisti || bekliyor}
              onClick={() => onKaydet({ kod: kod.trim(), ad: ad.trim() }).then(() => setDuzenle(false))}
              className="shrink-0 text-[11px] text-accent-ink hover:underline disabled:opacity-40">
        Kaydet
      </button>
      <button onClick={yoksay} className="shrink-0 text-[11px] text-faint hover:text-ink">
        Yoksay
      </button>
    </span>
  )
}

/* ----------------------------------------------------------------
   GEÇMİŞ — salt okunur.
   "Geri getir" eski metni FORMA doldurur, doğrudan kaydetmez: sessiz bir
   geri yazma, araya girmiş başka bir düzenlemeyi habersiz ezerdi. Kullanıcı
   görür, isterse Kaydet'e basar.
   ---------------------------------------------------------------- */
function Gecmis({
  tur, kayitId, onGeriGetir,
}: {
  tur: 'kategori' | 'surec' | 'kriter'
  kayitId: number
  onGeriGetir?: (metin: string) => void
}) {
  const [kayitlar, setKayitlar] = useState<Revizyon[] | null>(null)

  useEffect(() => {
    let iptal = false
    fetch(`/api/pes/olgunluk/revizyon?tur=${tur}&id=${kayitId}`)
      .then((r) => r.json())
      .then((j) => { if (!iptal) setKayitlar(j.revizyonlar ?? []) })
      .catch(() => { if (!iptal) setKayitlar([]) })
    return () => { iptal = true }
  }, [tur, kayitId])

  if (kayitlar === null) {
    return <p className="py-1 text-[11px] text-faint">yükleniyor…</p>
  }
  if (kayitlar.length === 0) {
    return <p className="py-1 text-[11px] text-faint">Kayıt yok.</p>
  }

  return (
    <ul className="mt-1 space-y-1 border-l-2 border-line-soft pl-2.5">
      {kayitlar.map((r) => {
        const eskiMetin = typeof r.onceki.metin === 'string' ? r.onceki.metin : null
        const eskiAd = typeof r.onceki.ad === 'string' ? r.onceki.ad : null
        const gosterilecek = eskiMetin ?? eskiAd
        return (
          <li key={r.id} className="text-[11px] leading-snug">
            <div className="flex flex-wrap items-center gap-x-2 text-faint">
              <span className="num">{zamanTR(r.kayit_at)}</span>
              <span>{r.degisen.map((a) => REVIZYON_ALAN_ETIKET[a] ?? a).join(', ')} değişti</span>
              {r.kaydeden_eposta && <span>· {r.kaydeden_eposta}</span>}
            </div>
            {gosterilecek && (
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-muted line-through">{gosterilecek}</span>
                {onGeriGetir && eskiMetin && (
                  <button onClick={() => onGeriGetir(eskiMetin)}
                          className="shrink-0 text-accent-ink hover:underline"
                          title="Eski metni forma doldurur; kaydetmek sana kalır">
                    geri getir
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function zamanTR(s: string) {
  const [tarih, saat] = s.split(/[ T]/)
  const [y, a, g] = (tarih ?? '').split('-')
  return `${g}.${a}.${y} ${(saat ?? '').slice(0, 5)}`
}
