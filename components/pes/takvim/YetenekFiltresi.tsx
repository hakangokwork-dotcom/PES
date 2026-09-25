'use client'

import { useEffect, useRef, useState } from 'react'
import {
  degistir, metinle, bosMu, boyutAdi, type YetenekSecim,
} from '@/lib/pes/yetenek-filtre'

type Deger = { deger: string; etiket: string; atolye: number }
type Boyut = { boyut: string; degerler: Deger[] }

/**
 * Yetenek filtresi — boyuta göre gruplu çoklu seçim.
 *
 * Eskisi tek serbest metin kutusuydu ve boyut farkı gözetmiyordu:
 * "DENIM" ana_grup'ta, "PANTOLON" klasman'da geçiyor; ikisini birlikte
 * sormanın yolu yoktu.
 *
 * HER DEĞERİN YANINDA ATÖLYE SAYISI var. Sayı olmadan filtre kör:
 * planlamacı "MOM_FIT" seçip boş ekranla karşılaşmadan önce onu 2
 * atölyenin yaptığını görmeli.
 */
export default function YetenekFiltresi({
  secim, onDegis,
}: {
  secim: YetenekSecim
  onDegis: (s: YetenekSecim) => void
}) {
  const [acik, setAcik] = useState(false)
  const [boyutlar, setBoyutlar] = useState<Boyut[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [arama, setArama] = useState('')
  const kutu = useRef<HTMLDivElement>(null)

  /* Seçenekler bir kez yüklenir; her açılışta çekmek 121 satır için
     gereksiz tur demek. */
  useEffect(() => {
    if (!acik || boyutlar.length > 0 || yukleniyor) return
    setYukleniyor(true); setHata(null)
    fetch('/api/pes/takvim/yetenekler')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Yüklenemedi (${r.status})`))))
      .then((g) => setBoyutlar(g.boyutlar ?? []))
      .catch((e) => setHata(e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setYukleniyor(false))
  }, [acik, boyutlar.length, yukleniyor])

  /* Dışarı tıklayınca kapansın — panel geniş, açık kalırsa takvimi örter. */
  useEffect(() => {
    if (!acik) return
    const dinle = (e: MouseEvent) => {
      if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false)
    }
    document.addEventListener('mousedown', dinle)
    return () => document.removeEventListener('mousedown', dinle)
  }, [acik])

  const seciliSayi = Object.values(secim).reduce((t, v) => t + v.length, 0)

  const q = arama.trim().toLocaleLowerCase('tr')
  const gorunen = q
    ? boyutlar
        .map((b) => ({
          ...b,
          degerler: b.degerler.filter((d) =>
            `${d.etiket} ${d.deger}`.toLocaleLowerCase('tr').includes(q)),
        }))
        .filter((b) => b.degerler.length > 0)
    : boyutlar

  return (
    <div className="relative" ref={kutu}>
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className={`rounded-lg border px-2 py-1.5 text-sm ${
          seciliSayi > 0
            ? 'border-accent bg-accent/10 text-ink font-medium'
            : 'border-line bg-surface text-ink'}`}>
        Yetenek{seciliSayi > 0 && ` (${seciliSayi})`}
      </button>

      {acik && (
        <div className="absolute z-30 mt-1 max-h-[26rem] w-[30rem] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="yetenek ara — denim, pantolon, overlok…"
              className="flex-1 rounded border border-line bg-canvas px-2 py-1 text-xs text-ink"
            />
            {!bosMu(secim) && (
              <button type="button" onClick={() => onDegis({})}
                      className="text-xs underline text-faint hover:text-ink">
                temizle
              </button>
            )}
          </div>

          {yukleniyor && <p className="text-xs text-faint py-2">Yükleniyor…</p>}
          {hata && <p className="text-xs text-danger py-2">{hata}</p>}

          {!yukleniyor && !hata && gorunen.length === 0 && (
            <p className="text-xs text-faint py-2">
              {q ? `“${arama}” ile eşleşen yetenek yok.` : 'Yetenek kaydı yok.'}
            </p>
          )}

          {gorunen.map((b) => (
            <section key={b.boyut} className="mb-3 last:mb-0">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1">
                {boyutAdi(b.boyut)}
              </h3>
              <div className="flex flex-wrap gap-1">
                {b.degerler.map((d) => {
                  const isaretli = (secim[b.boyut] ?? []).includes(d.deger)
                  return (
                    <button
                      key={d.deger}
                      type="button"
                      onClick={() => onDegis(degistir(secim, b.boyut, d.deger))}
                      title={`${d.etiket} — ${d.atolye} atölye`}
                      className={`rounded px-2 py-0.5 text-xs border ${
                        isaretli
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-canvas text-ink hover:border-accent'}`}>
                      {d.etiket}
                      <span className={`ml-1 ${isaretli ? 'text-white/70' : 'text-faint'}`}>
                        {d.atolye}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          {!bosMu(secim) && (
            <p className="mt-2 border-t border-line-soft pt-2 text-[11px] text-faint">
              Bir boyut içinde <strong>veya</strong>, boyutlar arasında{' '}
              <strong>ve</strong> uygulanır. Seçim: <code>{metinle(secim)}</code>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
