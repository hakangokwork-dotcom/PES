'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type ProfilKaydi = {
  workshop_id: number
  t_kod: string | null
  bw_atolye_adi: string | null
  odito_adi: string | null
  atolye_unvani: string | null
  tedarik_mudurlugu: string | null
  teknik_mudur: string | null
  fku: string | null
  yetkili_kisi: string | null
  calisma_sekli: string | null
  uretim_tipi: string | null
  inspection: string | null
  kapasite_tipi: string | null
  on_uretim_numunesi: string | null
  subjektif_sinif: string | null
  is_ortakligi_leveli: string | null
  risk_seviyesi: string | null
  bolge_ad: string | null
  bant_sayisi: number | null
  aylik_kapasite: number | null
  calisan_sayisi: number | null
  calisan_sayisi_alt: number | null
  ozel_not: string | null
  eslesme_yontemi: string
  data_confidence: string
} | null

export type DenetimKaydi = {
  id: number
  tip: 'WKYS' | 'SOSYAL'
  tarih: string
  puan: string | null
  /** Kaynağın/kullanıcının yazdığı harf. Puanla çelişebilir. */
  sinif: string | null
  /** Puandan türetilen harf (yalnız SOSYAL). Rapor bunu esas alır. */
  sinif_hesap: string | null
  gecerlilik_ay: number
  sonraki_tarih: string
  kaynak: string | null
}

/* Alan tanımları tek yerde: hem görünüm hem form buradan üretilir,
   ikisi ayrı listeden beslenirse zamanla birbirini tutmaz. */
const ALANLAR: { ad: keyof NonNullable<ProfilKaydi>; etiket: string; tip?: 'sayi'; secenek?: string[] }[] = [
  { ad: 'tedarik_mudurlugu', etiket: 'Tedarik müdürlüğü' },
  { ad: 'teknik_mudur', etiket: 'Teknik müdür / takım lideri' },
  { ad: 'fku', etiket: 'FKU' },
  { ad: 'yetkili_kisi', etiket: 'Yetkili kişi' },
  { ad: 'bolge_ad', etiket: 'Tedarik bölgesi' },
  { ad: 'calisma_sekli', etiket: 'Çalışma şekli', secenek: ['SÜREKLİ', 'GİR-ÇIK', 'YENİ', 'DURDURULDU'] },
  { ad: 'uretim_tipi', etiket: 'Üretim tipi', secenek: ['CMT', 'UKP', 'DİKİM', 'DİKİM-UKP', 'KESİM-DİKİM'] },
  { ad: 'inspection', etiket: 'Inspection', secenek: ['TEK', 'ÇİFT'] },
  { ad: 'kapasite_tipi', etiket: 'Kapasite tipi', secenek: ['SABİT KAPASİTE', 'DEĞİŞKEN KAPASİTE'] },
  { ad: 'subjektif_sinif', etiket: 'Subjektif sınıf', secenek: ['A', 'B', 'C', 'D'] },
  { ad: 'risk_seviyesi', etiket: 'Risk seviyesi', secenek: ['DÜŞÜK', 'ORTA', 'YÜKSEK'] },
  { ad: 'is_ortakligi_leveli', etiket: 'İş ortaklığı leveli', secenek: ['1 YILDIZ', '2 YILDIZ', '3 YILDIZ', '4 YILDIZ', '5 YILDIZ'] },
  { ad: 'on_uretim_numunesi', etiket: 'Ön üretim numunesi', secenek: ['TÜM MODELLERİ DİKİYOR', 'SIKLIKLA DİKİYOR', 'ARADA DİKİYOR', 'DİKMİYOR'] },
  { ad: 'bant_sayisi', etiket: 'Bant sayısı', tip: 'sayi' },
  { ad: 'aylik_kapasite', etiket: 'Aylık kapasite', tip: 'sayi' },
  { ad: 'calisan_sayisi', etiket: 'Çalışan sayısı', tip: 'sayi' },
  { ad: 't_kod', etiket: "T'li kod" },
  { ad: 'atolye_unvani', etiket: 'Atölye ünvanı' },
  { ad: 'bw_atolye_adi', etiket: 'BW atölye adı' },
  { ad: 'odito_adi', etiket: 'Odito adı' },
]

function tarihTR(s: string | null) {
  if (!s) return '—'
  const [y, a, g] = s.slice(0, 10).split('-')
  return `${g}.${a}.${y}`
}

function gunFarki(tarih: string) {
  const hedef = new Date(`${tarih.slice(0, 10)}T00:00:00Z`).getTime()
  const bugun = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((hedef - bugun) / 86400000)
}

function DenetimBlogu({
  baslik, tip, kayitlar, workshopId, onDegisti,
}: {
  baslik: string
  tip: 'WKYS' | 'SOSYAL'
  kayitlar: DenetimKaydi[]
  workshopId: number
  onDegisti: () => void
}) {
  const [ekleAcik, setEkleAcik] = useState(false)
  const [tarih, setTarih] = useState('')
  const [puan, setPuan] = useState('')
  const [sinif, setSinif] = useState('')
  const [hata, setHata] = useState('')
  const [bekliyor, setBekliyor] = useState(false)

  const sirali = [...kayitlar].sort((a, b) => b.tarih.localeCompare(a.tarih))
  const son = sirali[0]
  const kalan = son ? gunFarki(son.sonraki_tarih) : null

  async function ekle() {
    setHata(''); setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/atolye-profil/${workshopId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip, tarih, puan, sinif }),
      })
      const d = await r.json()
      if (!r.ok) setHata(d.error ?? 'Kaydedilemedi')
      else { setEkleAcik(false); setTarih(''); setPuan(''); setSinif(''); onDegisti() }
    } catch { setHata('Bağlantı hatası') }
    setBekliyor(false)
  }

  async function sil(id: number) {
    const r = await fetch(`/api/pes/atolye-profil/${workshopId}?denetim=${id}`, { method: 'DELETE' })
    if (r.ok) onDegisti()
  }

  return (
    <div className="bg-white border border-line-soft rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-ink">{baslik}</h4>
        <button
          onClick={() => setEkleAcik(!ekleAcik)}
          className="text-xs px-2 py-1 border border-line rounded-lg text-muted hover:bg-canvas"
        >
          {ekleAcik ? 'Vazgeç' : '+ Denetim ekle'}
        </button>
      </div>

      {son ? (
        <div className="mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            kalan === null ? 'bg-canvas text-faint'
            : kalan < 0 ? 'bg-red-100 text-red-700'
            : kalan <= 90 ? 'bg-amber-100 text-amber-700'
            : 'bg-green-100 text-green-700'
          }`}>
            {kalan !== null && kalan < 0
              ? `Süresi ${Math.abs(kalan)} gün önce doldu`
              : `Geçerli · ${kalan} gün kaldı`}
          </span>
          <p className="text-sm text-muted mt-2">
            Son denetim <strong>{tarihTR(son.tarih)}</strong>
            {son.puan && ` · puan ${son.puan}`}
            {(son.sinif_hesap ?? son.sinif) && ` · sınıf ${son.sinif_hesap ?? son.sinif}`}
            {' · '}geçerlilik {son.gecerlilik_ay} ay{' → '}
            <strong>{tarihTR(son.sonraki_tarih)}</strong>
          </p>
          {/* Kaynak veride sınıf harfi puanla çelişebiliyor; sessizce
              birini seçmek yerine farkı göster. */}
          {son.sinif_hesap && son.sinif && son.sinif_hesap !== son.sinif && (
            <p className="text-xs text-amber-700 mt-1">
              Kaynak bu denetime <strong>{son.sinif}</strong> yazmış; puana göre{' '}
              <strong>{son.sinif_hesap}</strong> çıkıyor.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-faint mt-2">Denetim kaydı yok.</p>
      )}

      {ekleAcik && (
        <div className="mt-3 p-3 bg-canvas rounded-lg space-y-2">
          <div className="flex flex-wrap gap-2">
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)}
              className="px-2 py-1.5 border border-line rounded-lg text-sm" />
            <input value={puan} onChange={(e) => setPuan(e.target.value)} placeholder="Puan (0-100)"
              className="w-32 px-2 py-1.5 border border-line rounded-lg text-sm" />
            {/* Sosyalde sınıf puandan otomatik çıkar; elle girilen alan
                yalnız "kaynak ne demiş" kaydı için. */}
            {tip === 'WKYS' && (
              <select value={sinif} onChange={(e) => setSinif(e.target.value)}
                className="px-2 py-1.5 border border-line rounded-lg text-sm bg-white">
                <option value="">Sınıf yok</option>
                {['A', 'B', 'C', 'D'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button onClick={ekle} disabled={bekliyor || !tarih}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-40">
              {bekliyor ? '…' : 'Kaydet'}
            </button>
          </div>
          <p className="text-xs text-faint">
            {tip === 'WKYS'
              ? 'WKYS geçerliliği her zaman 12 ay.'
              : 'Sosyalde puandan otomatik: 90 üstü A / 12 ay · 75-90 B / 9 ay · '
                + '60-75 C / 6 ay · 60 altı D / 2 ay. Puan girilmezse 2 ay.'}
          </p>
          {hata && <p className="text-xs text-red-600">{hata}</p>}
        </div>
      )}

      {sirali.length > 1 && (
        <details className="mt-3">
          <summary className="text-xs text-faint cursor-pointer hover:text-ink">
            Geçmiş ({sirali.length - 1} önceki kayıt)
          </summary>
          <ul className="mt-2 space-y-1">
            {sirali.slice(1).map((d) => (
              <li key={d.id} className="text-xs text-faint flex items-center justify-between">
                <span>
                  {tarihTR(d.tarih)}{d.puan && ` · ${d.puan}`}
                  {(d.sinif_hesap ?? d.sinif) && ` · ${d.sinif_hesap ?? d.sinif}`}
                </span>
                <button onClick={() => sil(d.id)} className="text-red-500 hover:underline">sil</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default function AtolyeProfilSekmesi({
  workshopId, isActive, profil, denetimler,
}: {
  workshopId: number
  isActive: boolean
  profil: ProfilKaydi
  denetimler: DenetimKaydi[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [duzenle, setDuzenle] = useState(false)
  const [taslak, setTaslak] = useState<Record<string, string>>({})
  const [kaydediyor, setKaydediyor] = useState(false)
  const [hata, setHata] = useState('')
  const [aktiflikBekliyor, setAktiflikBekliyor] = useState(false)

  const yenile = () => startTransition(() => router.refresh())

  function duzenlemeyeGec() {
    const t: Record<string, string> = {}
    for (const a of ALANLAR) {
      const v = profil ? (profil[a.ad] as string | number | null) : null
      t[a.ad] = v === null || v === undefined ? '' : String(v)
    }
    t.ozel_not = profil?.ozel_not ?? ''
    setTaslak(t)
    setDuzenle(true)
    setHata('')
  }

  async function kaydet() {
    setKaydediyor(true); setHata('')
    try {
      const r = await fetch(`/api/pes/atolye-profil/${workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taslak),
      })
      const d = await r.json()
      if (!r.ok) setHata(d.error ?? 'Kaydedilemedi')
      else { setDuzenle(false); yenile() }
    } catch { setHata('Bağlantı hatası') }
    setKaydediyor(false)
  }

  async function aktifligiCevir() {
    setAktiflikBekliyor(true)
    try {
      await fetch(`/api/pes/workshops/${workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      yenile()
    } finally { setAktiflikBekliyor(false) }
  }

  const wkys = denetimler.filter((d) => d.tip === 'WKYS')
  const sosyal = denetimler.filter((d) => d.tip === 'SOSYAL')

  return (
    <div className="space-y-4">
      {/* AKTİFLİK — künyenin bir alanı değil, canlı anahtar. Bu yüzden
          formun içinde değil, en üstte ayrı duruyor. */}
      <div className="bg-white border border-line-soft rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-ink">
            Çalışma durumu:{' '}
            <span className={isActive ? 'text-green-700' : 'text-faint'}>
              {isActive ? 'Aktif — şu anda çalışıyor' : 'Pasif — şu anda çalışmıyor'}
            </span>
          </p>
          <p className="text-xs text-faint mt-0.5">
            Raporlar varsayılan olarak yalnız aktif atölyeleri sayar.
          </p>
        </div>
        <button
          onClick={aktifligiCevir}
          disabled={aktiflikBekliyor}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
            isActive
              ? 'border border-line text-body hover:bg-canvas'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {aktiflikBekliyor ? '…' : isActive ? 'Pasife al' : 'Aktife al'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <DenetimBlogu baslik="WKYS denetimi" tip="WKYS" kayitlar={wkys}
          workshopId={workshopId} onDegisti={yenile} />
        <DenetimBlogu baslik="Sosyal uygunluk denetimi" tip="SOSYAL" kayitlar={sosyal}
          workshopId={workshopId} onDegisti={yenile} />
      </div>

      <div className="bg-white border border-line-soft rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-medium text-ink">Künye</h4>
            {profil && (
              <p className="text-xs text-faint mt-0.5">
                kaynak: {profil.eslesme_yontemi === 'kesin' ? 'Excel eşleşmesi'
                  : profil.eslesme_yontemi === 'inceleme' ? 'elle onaylanmış eşleşme' : 'elle girildi'}
              </p>
            )}
          </div>
          {duzenle ? (
            <div className="flex gap-2">
              <button onClick={() => setDuzenle(false)}
                className="px-3 py-1.5 border border-line rounded-lg text-sm text-muted hover:bg-canvas">
                Vazgeç
              </button>
              <button onClick={kaydet} disabled={kaydediyor}
                className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-40">
                {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          ) : (
            <button onClick={duzenlemeyeGec}
              className="px-3 py-1.5 border border-line rounded-lg text-sm text-muted hover:bg-canvas">
              Düzenle
            </button>
          )}
        </div>

        {hata && <p className="text-sm text-red-600 mb-2">{hata}</p>}

        {!profil && !duzenle && (
          <p className="text-sm text-faint mb-3">
            Künye henüz doldurulmadı. &quot;Düzenle&quot; ile girebilirsiniz.
          </p>
        )}

        {duzenle ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {ALANLAR.map((a) => (
              <label key={a.ad} className="block">
                <span className="text-xs text-faint">{a.etiket}</span>
                {a.secenek ? (
                  <select
                    value={taslak[a.ad] ?? ''}
                    onChange={(e) => setTaslak({ ...taslak, [a.ad]: e.target.value })}
                    className="mt-0.5 w-full px-2 py-1.5 border border-line rounded-lg text-sm bg-white"
                  >
                    <option value="">—</option>
                    {a.secenek.map((s) => <option key={s} value={s}>{s}</option>)}
                    {/* kaynakta listede olmayan bir değer varsa kaybolmasın */}
                    {taslak[a.ad] && !a.secenek.includes(taslak[a.ad]) && (
                      <option value={taslak[a.ad]}>{taslak[a.ad]}</option>
                    )}
                  </select>
                ) : (
                  <input
                    value={taslak[a.ad] ?? ''}
                    inputMode={a.tip === 'sayi' ? 'numeric' : undefined}
                    onChange={(e) => setTaslak({ ...taslak, [a.ad]: e.target.value })}
                    className="mt-0.5 w-full px-2 py-1.5 border border-line rounded-lg text-sm"
                  />
                )}
              </label>
            ))}
            <label className="block sm:col-span-2">
              <span className="text-xs text-faint">Özel not</span>
              <textarea
                value={taslak.ozel_not ?? ''}
                onChange={(e) => setTaslak({ ...taslak, ozel_not: e.target.value })}
                rows={2}
                className="mt-0.5 w-full px-2 py-1.5 border border-line rounded-lg text-sm"
              />
            </label>
          </div>
        ) : (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {ALANLAR.map((a) => {
              const v = profil ? (profil[a.ad] as string | number | null) : null
              return (
                <div key={a.ad} className="flex justify-between gap-3 text-sm border-b border-line-soft py-1">
                  <dt className="text-faint">{a.etiket}</dt>
                  <dd className="text-ink text-right truncate max-w-[55%]">
                    {v === null || v === undefined || v === '' ? <span className="text-faint">—</span> : String(v)}
                  </dd>
                </div>
              )
            })}
            {profil?.ozel_not && (
              <div className="sm:col-span-2 text-sm pt-2">
                <span className="text-faint">Özel not: </span>
                <span className="text-ink">{profil.ozel_not}</span>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}
