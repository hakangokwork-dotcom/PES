/**
 * /pes/ekonomi/formuller — Formül kütüphanesi
 *
 * Excel'in FORMULLER sayfasının PES karşılığı: her göstergenin sözel formülü,
 * Excel karşılığı, kod karşılığı ve "nasıl okunur" notu.
 *
 * ASIL İŞ HESAP İZİ. Formülü okumak "marj neden −%4" sorusunu cevaplamaz;
 * o formüle giren sayılar cevaplar. Bir atölye seçilince her formülün altında
 * o atölyenin gerçek girdileri ve sonucu çıkar.
 *
 * FORMÜLLER DÜZENLENEMEZ — bilerek. Bir satırı veritabanından düzenlenebilir
 * yapmak hesabı değiştirmez, yalnız ekonomi-hesap.ts'ten sessizce sapan bir
 * belge üretir. Değişebilen şey parametrelerdir: /pes/ekonomi/parametre.
 *
 * Seçimler URL'de (?donem=&atolye=&q=) — paylaşılabilir, geri tuşu çalışır.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { marjSirasi, fiyatEndeksi } from '@/lib/pes/ekonomi-akran'
import { FORMUL_KATALOGU, type FormulKaynak, type FormulGirdisi } from '@/lib/pes/formul-katalogu'
import { degerHavuzu, formulIzi, type DegerHavuzu } from '@/lib/pes/formul-izi'
import { RASYO_META_MAP } from '@/lib/pes/ekonomi-rasyo-meta'
import { fmtRasyo } from '../formatlayici'

export const dynamic = 'force-dynamic'

const KAYNAK_BASLIK: Record<FormulKaynak, string> = {
  PARAMETRE: 'Parametre — sabitlerden türeyenler',
  HESAP: 'Atölye hesabı — aylık rasyolar',
  MODEL_HESAP: 'Model fiyatlama',
  OZET: 'Özet ve sıralama',
  PANO: 'Pano göstergeleri',
}

const KAYNAK_SIRA: FormulKaynak[] = ['PARAMETRE', 'HESAP', 'MODEL_HESAP', 'OZET', 'PANO']

const trGenel = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })

/** İz satırı için biçim: rasyo alanıysa kendi biçimini, değilse genel sayı. */
function fmtDeger(anahtar: string, v: number | null): string {
  if (v === null) return '—'
  const alan = anahtar.startsWith('rasyo.') ? anahtar.slice(6) : null
  const meta = alan ? RASYO_META_MAP.get(alan) : undefined
  return meta ? fmtRasyo(meta, v) : trGenel.format(v)
}

function Iz({ formul, havuz }: { formul: FormulGirdisi; havuz: DegerHavuzu }) {
  const iz = formulIzi(formul, havuz)
  if (iz.girdiler.length === 0 && iz.sonuclar.length === 0) return null

  return (
    <div className="mt-3 rounded bg-canvas border border-line-soft p-3 text-sm">
      <div className="text-xs uppercase tracking-wide text-faint mb-2">Hesap izi</div>

      {iz.girdiler.length > 0 && (
        <table className="w-full">
          <tbody>
            {iz.girdiler.map((g) => (
              <tr key={g.anahtar} className="border-b border-line-soft last:border-0">
                <td className="py-1 pr-3 text-muted">{g.etiket}</td>
                <td className="py-1 text-right tabular-nums font-medium">
                  {!g.bulundu ? (
                    /* Katalog hatası — veri eksikliğiyle karışmasın diye ayrı görünüyor. */
                    <span className="text-warn" title={`Havuzda yok: ${g.anahtar}`}>
                      katalog hatası
                    </span>
                  ) : g.deger === null ? (
                    <span className="text-faint" title="Hesaplanamadı — sıfır değil">
                      hesaplanamadı
                    </span>
                  ) : (
                    fmtDeger(g.anahtar, g.deger)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {iz.sonuclar.length > 0 && (
        <div className="mt-2 pt-2 border-t border-line space-y-1">
          {iz.sonuclar.map((s) => {
            const meta = RASYO_META_MAP.get(s.alan)
            return (
              <div key={s.alan} className="flex justify-between gap-3">
                <span className="font-medium text-ink">{meta?.etiket ?? s.alan}</span>
                <span className="tabular-nums font-semibold">
                  {s.deger === null
                    ? <span className="text-faint font-normal">hesaplanamadı</span>
                    : fmtDeger(`rasyo.${s.alan}`, s.deger)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {iz.eksikGirdiVar && iz.sonuclar.some((s) => s.deger === null) && (
        <p className="mt-2 text-xs text-faint">
          Sonuç boş çünkü girdilerden en az biri eksik.
        </p>
      )}
    </div>
  )
}

export default async function FormullerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; atolye?: string; q?: string; formul?: string }>
}) {
  const sp = await searchParams
  const donem = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.donem ?? '')
    ? (sp.donem as string) : '2026-01'
  const [yil, ay] = donem.split('-').map(Number)
  const arama = (sp.q ?? '').trim().toLocaleLowerCase('tr')

  const sonuc = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy ORDER BY yil DESC, ay DESC LIMIT 24
    ` as Array<{ yil: number; ay: number }>

    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])

    const atolyeler = ham.map((r) => {
      const girdi = dbSatiriCoz(r as unknown as Parameters<typeof dbSatiriCoz>[0], param)
      return {
        workshopId: r.workshop_id as number,
        ad: r.name as string,
        bolge: (r.bolge as number | null) ?? null,
        girdi,
        rasyolar: hesapla(girdi),
      }
    })

    return { donemler, param, atolyeler }
  })

  if (!sonuc) redirect('/login')
  const { donemler, param, atolyeler } = sonuc

  /* Verisi olan atölyeler — marjı hesaplanamayanı seçtirmenin anlamı yok. */
  const seciilebilir = atolyeler.filter((a) => a.rasyolar.marj !== null)
  const secili = sp.atolye
    ? seciilebilir.find((a) => String(a.workshopId) === sp.atolye) ?? null
    : null

  /* marjSirasi ve fiyatEndeksi örneklem gerektirir; hesapla() dışında doldurulur. */
  let havuz: DegerHavuzu | null = null
  if (secili) {
    /* marjSirasi AkranAdayi bekliyor; klasman burada sorulmuyor (bu sayfanın
       işi değil) — marjSirasi yalnız marja bakar, boş klasman sonucu bozmaz. */
    const orneklem = seciilebilir.map((a) => ({
      workshopId: a.workshopId,
      ad: a.ad,
      klasmanlar: [] as string[],
      sewingStaff: a.girdi.ekonomi.sewing_staff,
      marj: a.rasyolar.marj,
    }))
    havuz = degerHavuzu({
      rasyo: {
        ...secili.rasyolar,
        marjSirasi: marjSirasi(secili.rasyolar.marj, orneklem),
        fiyatEndeksi: fiyatEndeksi(
          secili.rasyolar.dikimDkCiro,
          seciilebilir.map((a) => a.rasyolar.dikimDkCiro),
        ),
      },
      param: param as unknown as Record<string, unknown>,
      giris: secili.girdi.ekonomi as unknown as Record<string, unknown>,
      gider: secili.girdi.gider as unknown as Record<string, unknown>,
      atolye: { bolge: secili.bolge },
    })
  }

  const eslesen = arama
    ? FORMUL_KATALOGU.filter((f) =>
        `${f.etiket} ${f.sozel} ${f.okuma}`.toLocaleLowerCase('tr').includes(arama))
    : FORMUL_KATALOGU

  const bag = (ek: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ donem })
    if (sp.atolye) p.set('atolye', sp.atolye)
    if (sp.q) p.set('q', sp.q)
    for (const [k, v] of Object.entries(ek)) {
      if (v === undefined || v === '') p.delete(k)
      else p.set(k, v)
    }
    return `/pes/ekonomi/formuller?${p.toString()}`
  }

  return (
    <main className="p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Formül Kütüphanesi</h1>
          <p className="text-sm text-faint">
            {eslesen.length} / {FORMUL_KATALOGU.length} formül · {donem} ·{' '}
            <Link href={`/pes/ekonomi?donem=${donem}`} className="underline">rasyo radarı →</Link>
            {' · '}
            <Link href={`/pes/ekonomi/parametre?donem=${donem}`} className="underline">
              parametreler →
            </Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm flex-wrap">
          {donemler.map((d) => {
            const s = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={bag({ donem: s })}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-canvas'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      <form method="get" className="flex gap-2 items-center flex-wrap">
        <input type="hidden" name="donem" value={donem} />
        {sp.atolye && <input type="hidden" name="atolye" value={sp.atolye} />}
        <input
          type="search" name="q" defaultValue={sp.q ?? ''}
          placeholder="Formüllerde ara — örn. teşvik, dakika, marj"
          className="border border-line rounded px-3 py-1.5 text-sm w-72"
        />
        <button type="submit" className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white">
          Ara
        </button>
        {arama && (
          <Link href={bag({ q: undefined })} className="text-sm underline text-muted">
            temizle
          </Link>
        )}
      </form>

      <section className="rounded border border-line-soft p-3">
        <div className="text-xs uppercase tracking-wide text-faint mb-2">
          Hesap izi için atölye seç
        </div>
        <nav className="flex gap-1 flex-wrap text-sm">
          <Link href={bag({ atolye: undefined })}
                className={`px-2 py-1 rounded ${!secili ? 'bg-slate-900 text-white' : 'hover:bg-canvas'}`}>
            yok
          </Link>
          {seciilebilir.map((a) => (
            <Link key={a.workshopId} href={bag({ atolye: String(a.workshopId) })}
                  className={`px-2 py-1 rounded ${secili?.workshopId === a.workshopId ? 'bg-slate-900 text-white' : 'hover:bg-canvas'}`}>
              {a.ad}
            </Link>
          ))}
        </nav>
        {seciilebilir.length === 0 && (
          <p className="text-sm text-faint mt-1">
            {donem} döneminde marjı hesaplanabilen atölye yok.
          </p>
        )}
      </section>

      <p className="text-sm text-muted bg-warn-soft border border-line-soft rounded p-3">
        Formüller buradan <strong>değiştirilemez</strong> — kodun kendisidir. Hesabı
        değiştirmek için{' '}
        <Link href={`/pes/ekonomi/parametre?donem=${donem}`} className="underline">
          parametreleri
        </Link>{' '}
        düzenleyin; formüller yürürlükteki dönemin parametreleriyle çalışır.
      </p>

      {KAYNAK_SIRA.map((kaynak) => {
        const grup = eslesen.filter((f) => f.kaynak === kaynak)
        if (grup.length === 0) return null
        return (
          <section key={kaynak} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
              {KAYNAK_BASLIK[kaynak]} <span className="font-normal">({grup.length})</span>
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {grup.map((f) => (
                <article key={f.id} id={f.id}
                         className={`rounded border p-4 ${sp.formul === f.id ? 'border-line ring-1 ring-slate-900' : 'border-line-soft'}`}>
                  <h3 className="font-semibold">{f.etiket}</h3>
                  <p className="mt-1 text-sm font-mono text-ink bg-canvas rounded px-2 py-1">
                    {f.sozel}
                  </p>
                  <p className="mt-2 text-sm text-muted">{f.okuma}</p>

                  <div className="mt-2 flex gap-3 flex-wrap text-xs text-faint">
                    {f.excel && <code title="Excel karşılığı">{f.excel}</code>}
                    {f.kod && <code title="PES'te nerede hesaplanıyor">{f.kod}</code>}
                  </div>

                  {havuz && <Iz formul={f} havuz={havuz} />}
                </article>
              ))}
            </div>
          </section>
        )
      })}

      {eslesen.length === 0 && (
        <p className="text-sm text-faint">
          &ldquo;{sp.q}&rdquo; ile eşleşen formül yok.
        </p>
      )}
    </main>
  )
}
