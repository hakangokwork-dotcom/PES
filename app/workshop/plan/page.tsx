import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { DURUM_ETIKET, GEREKCE_ETIKET, type TeklifDurumu, type GerekceKodu } from '@/lib/pes/plan-onay'
import Cevapla, { type TeklifGorunum } from './Cevapla'
import GecikmeBildir, { type PlanliIs, type GecmisBildirim } from './GecikmeBildir'

export const dynamic = 'force-dynamic'

/**
 * /workshop/plan — Atölyenin gelen planı gördüğü ve cevapladığı ekran.
 *
 * Araştırmadaki döngünün atölye tarafı: kabul / revizyon önerisi / ret.
 * Cevap YAPISAL — gerekçe kodu zorunlu, çünkü "olmaz" tek başına
 * planlamacıya yeni tur açtırmaz.
 *
 * ATÖLYE YALNIZ KENDİ TEKLİFİNİ GÖRÜR (RLS 044, eşitlik kalıbı) ve
 * taslakları hiç görmez — planlamacının denemeleri buraya düşmez.
 */
export default async function AtolyePlanSayfasi() {
  const tenant = await requireSession()
  if (!tenant.workshopId) redirect('/pes/plan-tezgahi')

  const veri = await withServerTenant(async (sql) => {
    const [w] = await sql`
      SELECT id, code, name FROM workshop WHERE id = ${tenant.workshopId}
    ` as unknown as Array<{ id: number; code: string; name: string }>

    const teklifler = await sql`
      SELECT t.id, t.tur_no, t.durum, t.gonderildi_at, t.cevap_at,
             t.gerekce_kodu, t.cevap_notu, s.ad AS taslak_adi
        FROM plan_teklif t
        JOIN plan_taslak s ON s.id = t.taslak_id
       ORDER BY (t.durum = 'bekliyor') DESC, t.gonderildi_at DESC
       LIMIT 50
    ` as unknown as Array<Record<string, unknown>>

    const kalemler = teklifler.length ? await sql`
      SELECT k.id, k.teklif_id, k.work_order_id, k.line_id,
             k.baslangic::text AS baslangic, k.bitis::text AS bitis, k.adet,
             k.karsi_baslangic::text AS karsi_baslangic, k.karsi_adet, k.karsi_not,
             w.is_emri_no, w.model_adi, w.musteri, w.teslim_tarihi::text AS teslim,
             pl.name AS bant_adi
        FROM plan_teklif_kalem k
        JOIN work_order w ON w.id = k.work_order_id
        JOIN production_line pl ON pl.id = k.line_id
       WHERE k.teklif_id = ANY(${teklifler.map((t) => t.id as number)})
       ORDER BY k.baslangic
    ` as unknown as Array<Record<string, unknown>> : []

    /* Bu atölyeye yazılmış GERÇEK plan — gecikme bildirimi buna dayanır. */
    const planliIsler = await sql`
      SELECT DISTINCT wo.id, wo.is_emri_no, wo.model_adi,
             max(st.plan_bitis)::text AS plan_bitis,
             wo.teslim_tarihi::text AS teslim
        FROM work_order_stage st
        JOIN work_order wo ON wo.id = st.work_order_id
       WHERE st.workshop_id = ${tenant.workshopId}
         AND wo.durum NOT IN ('Tamamlandi', 'Sevk Edildi', 'İptal')
       GROUP BY wo.id, wo.is_emri_no, wo.model_adi, wo.teslim_tarihi
       ORDER BY wo.is_emri_no
    ` as unknown as Array<Record<string, unknown>>

    const bildirimler = await sql`
      SELECT b.id, b.work_order_id, b.eski_bitis::text AS eski_bitis,
             b.yeni_bitis::text AS yeni_bitis, b.gerekce_kodu, b.not_metni,
             b.created_at, wo.is_emri_no
        FROM plan_bildirim b
        JOIN work_order wo ON wo.id = b.work_order_id
       WHERE b.tip = 'gecikme'
       ORDER BY b.created_at DESC LIMIT 20
    ` as unknown as Array<Record<string, unknown>>

    return { atolye: w, teklifler, kalemler, planliIsler, bildirimler }
  })

  if (!veri) redirect('/login')

  const gorunumler: TeklifGorunum[] = veri.teklifler.map((t) => ({
    id: t.id as number,
    turNo: t.tur_no as number,
    durum: t.durum as TeklifDurumu,
    taslakAdi: (t.taslak_adi as string) ?? '',
    gonderildi: String(t.gonderildi_at ?? '').slice(0, 10),
    cevapTarihi: t.cevap_at ? String(t.cevap_at).slice(0, 10) : null,
    gerekceKodu: (t.gerekce_kodu as GerekceKodu | null) ?? null,
    cevapNotu: (t.cevap_notu as string | null) ?? null,
    kalemler: veri.kalemler
      .filter((k) => k.teklif_id === t.id)
      .map((k) => ({
        id: k.id as number,
        workOrderId: k.work_order_id as number,
        isEmriNo: (k.is_emri_no as string) ?? `#${k.work_order_id}`,
        modelAdi: (k.model_adi as string) ?? '',
        musteri: (k.musteri as string) ?? '',
        bantAdi: (k.bant_adi as string) ?? `Bant ${k.line_id}`,
        baslangic: k.baslangic as string,
        bitis: k.bitis as string,
        adet: k.adet as number,
        teslim: (k.teslim as string | null) ?? null,
        karsiBaslangic: (k.karsi_baslangic as string | null) ?? null,
        karsiAdet: (k.karsi_adet as number | null) ?? null,
        karsiNot: (k.karsi_not as string | null) ?? null,
      })),
  }))

  const planliIsler: PlanliIs[] = veri.planliIsler.map((r) => ({
    workOrderId: r.id as number,
    isEmriNo: (r.is_emri_no as string) ?? `#${r.id}`,
    modelAdi: (r.model_adi as string) ?? '',
    planBitis: (r.plan_bitis as string | null) ?? null,
    teslim: (r.teslim as string | null) ?? null,
  }))

  const gecmisBildirimler: GecmisBildirim[] = veri.bildirimler.map((r) => ({
    id: r.id as number,
    workOrderId: r.work_order_id as number,
    isEmriNo: (r.is_emri_no as string) ?? `#${r.work_order_id}`,
    eskiBitis: (r.eski_bitis as string | null) ?? null,
    yeniBitis: r.yeni_bitis as string,
    gerekceKodu: r.gerekce_kodu as GerekceKodu,
    not: (r.not_metni as string | null) ?? null,
    olusturulma: String(r.created_at ?? '').slice(0, 10),
  }))

  const bekleyen = gorunumler.filter((t) => t.durum === 'bekliyor')
  const gecmis = gorunumler.filter((t) => t.durum !== 'bekliyor')

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/workshop" className="text-sm text-faint hover:text-ink">← Panel</Link>
        <h1 className="text-xl font-semibold mt-1">Gelen Plan</h1>
        <p className="text-sm text-slate-500">
          {veri.atolye.name} · {bekleyen.length} teklif cevabınızı bekliyor
        </p>
      </div>

      {gorunumler.length === 0 && (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Şu an size gönderilmiş bir plan yok. Planlamacı taslak üzerinde
          çalışırken burada bir şey görünmez; yalnız gönderilen teklifler düşer.
        </p>
      )}

      {bekleyen.map((t) => <Cevapla key={t.id} teklif={t} />)}

      <GecikmeBildir isler={planliIsler} gecmis={gecmisBildirimler} />

      {gecmis.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Geçmiş turlar
          </h2>
          {gecmis.map((t) => (
            <article key={t.id} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex justify-between gap-3 flex-wrap">
                <span className="font-medium">
                  {t.taslakAdi} · {t.turNo}. tur
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  t.durum === 'kabul' ? 'bg-emerald-100 text-emerald-800'
                  : t.durum === 'ret' ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'}`}>
                  {DURUM_ETIKET[t.durum]}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t.kalemler.length} iş · gönderildi {t.gonderildi}
                {t.cevapTarihi && ` · cevaplandı ${t.cevapTarihi}`}
              </div>
              {t.gerekceKodu && (
                <div className="text-xs text-slate-600 mt-1">
                  Gerekçe: {GEREKCE_ETIKET[t.gerekceKodu]}
                  {t.cevapNotu && ` — ${t.cevapNotu}`}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
