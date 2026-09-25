/**
 * /pes/plan-tezgahi — Planlamacının tezgâhı
 *
 * Sol panelde yerleştirilmemiş iş emirleri, sağda bant × gün ızgarası.
 * Kart bir hücreye sürüklenir; bitiş tarihi kapasiteden TÜRETİLİR.
 *
 * BURASI SANAL ALAN. Taslak atölyeye görünmez ve gerçek kapasiteyi
 * tüketmez; planlamacı denemelerini atölyeye bildirim yağdırmadan
 * yapabilsin diye. Gönderme ve onay döngüsü 2. turda.
 *
 * Tasarım araştırmadan geliyor (2026-09-25): MRP'nin planned ↔ firm
 * ayrımı, tedarikçi portallarının kabul/karşı-öneri/ret döngüsü,
 * konfeksiyonun TNA takvimi ve yumuşak/sert kapasite rezervasyonu.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { atolyeBaglamiYukle } from '@/lib/pes/bant-doluluk-veri'
import { bantPayi, type HesapBaglami } from '@/lib/pes/bant-doluluk'
import {
  kalemPlani, cakismalar, zamanCitiUyarilari, gunAraligi,
  type TaslakKalem, type KalemPlani,
} from '@/lib/pes/plan-tezgah'
import Tezgah, {
  type BantSatiri, type HavuzKarti, type YerlesikKalem,
} from './Tezgah'

export const dynamic = 'force-dynamic'

/** Izgarada kaç gün gösterilsin. */
const GUN_SAYISI = 35
/** Zaman çiti — bu kadar gün kalmışsa uyarı. Kullanıcı kararı: engellemez. */
const ZAMAN_CITI_GUN = 7

function bugunStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function PlanTezgahiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ taslak?: string; atolyeler?: string; baslangic?: string }>
}) {
  const sp = await searchParams
  const bugun = bugunStr()
  const ilkGun = /^\d{4}-\d{2}-\d{2}$/.test(sp.baslangic ?? '') ? sp.baslangic! : bugun
  const gunler = gunAraligi(ilkGun, GUN_SAYISI)

  const veri = await withServerTenant(async (sql) => {
    /* ---- Taslaklar ---- */
    const taslaklar = await sql`
      SELECT t.id, t.ad, t.durum,
             (SELECT count(*)::int FROM plan_taslak_kalem k WHERE k.taslak_id = t.id) AS kalem
        FROM plan_taslak t
       WHERE t.durum = 'taslak'
       ORDER BY t.updated_at DESC
    ` as unknown as Array<{ id: number; ad: string; durum: string; kalem: number }>

    const seciliId = Number(sp.taslak) || taslaklar[0]?.id || 0

    /* ---- Seçili taslağın kalemleri ---- */
    const kalemSatirlari = seciliId ? await sql`
      SELECT k.id, k.work_order_id, k.workshop_id, k.line_id,
             k.baslangic::text AS baslangic, k.adet,
             w.is_emri_no, w.model_adi, w.musteri, w.teslim_tarihi::text AS teslim
        FROM plan_taslak_kalem k
        JOIN work_order w ON w.id = k.work_order_id
       WHERE k.taslak_id = ${seciliId}
       ORDER BY k.baslangic
    ` as unknown as Array<Record<string, unknown>> : []

    /* ---- Tahtada gösterilecek atölyeler ----
       Varsayılan: taslakta kalemi olanlar. Hiç yoksa aktif bandı olan ilk
       üç atölye — boş bir tahta planlamacıya hiçbir şey söylemez. */
    const istenen = (sp.atolyeler ?? '')
      .split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)

    const kalemAtolyeleri = [...new Set(kalemSatirlari.map((k) => k.workshop_id as number))]
    let atolyeIdler = istenen.length ? istenen : kalemAtolyeleri

    if (atolyeIdler.length === 0) {
      const ilkler = await sql`
        SELECT DISTINCT pl.workshop_id
          FROM production_line pl JOIN workshop w ON w.id = pl.workshop_id
         WHERE pl.is_active AND w.is_active AND pl.daily_target > 0
         ORDER BY pl.workshop_id LIMIT 3
      ` as unknown as Array<{ workshop_id: number }>
      atolyeIdler = ilkler.map((x) => x.workshop_id)
    }

    /* ---- Bantlar ---- */
    const bantSatirlari = atolyeIdler.length ? await sql`
      SELECT pl.id AS line_id, pl.name AS bant_adi, pl.daily_target, pl.is_active,
             w.id AS workshop_id, w.name AS atolye_adi, w.code AS atolye_kodu
        FROM production_line pl
        JOIN workshop w ON w.id = pl.workshop_id
       WHERE pl.workshop_id = ANY(${atolyeIdler}) AND pl.is_active
       ORDER BY w.name, pl.name
    ` as unknown as Array<Record<string, unknown>> : []

    /* ---- Her atölye için hesap bağlamı ----
       Kapasite ATÖLYENİNDİR (bant-doluluk notu); bu yüzden atölye başına
       bir kez yükleniyor, bant başına değil. */
    const baglamlar = new Map<number, HesapBaglami>()
    for (const wsId of atolyeIdler) {
      const ornekBant = bantSatirlari.find((b) => b.workshop_id === wsId)
      if (!ornekBant) continue
      const ctx = await atolyeBaglamiYukle(sql, ornekBant.line_id as number)
      if (ctx) baglamlar.set(wsId, ctx)
    }

    /* ---- Havuz: yerleştirilmemiş iş emirleri ----
       Başlamamış olanlar. Bu taslakta zaten yeri olan iş emri panelde
       tekrar görünmez; iki kez yerleştirme kafa karıştırır. */
    const yerlesikWo = new Set(kalemSatirlari.map((k) => k.work_order_id as number))
    const havuzSatirlari = await sql`
      SELECT w.id, w.is_emri_no, w.model_adi, w.musteri, w.siparis_miktari,
             w.teslim_tarihi::text AS teslim, w.durum, w.workshop_id,
             a.name AS atolye_adi
        FROM work_order w
        LEFT JOIN workshop a ON a.id = w.workshop_id
       WHERE w.durum IN ('Taslak', 'Planlandi', 'Bekleniyor')
       ORDER BY w.teslim_tarihi NULLS LAST, w.id
       LIMIT 200
    ` as unknown as Array<Record<string, unknown>>

    return { taslaklar, seciliId, kalemSatirlari, atolyeIdler, bantSatirlari, baglamlar, havuzSatirlari, yerlesikWo }
  })

  if (!veri) redirect('/login')

  /* ---- Hesap: her kalemin planı, çakışmalar, çit uyarıları ---- */
  const kalemler: TaslakKalem[] = veri.kalemSatirlari.map((k) => ({
    id: k.id as number,
    workOrderId: k.work_order_id as number,
    workshopId: k.workshop_id as number,
    lineId: k.line_id as number,
    baslangic: k.baslangic as string,
    adet: k.adet as number,
  }))

  const planlar: KalemPlani[] = kalemler.map((k) => {
    const ctx = veri.baglamlar.get(k.workshopId)
    /* Bağlamı yüklenmemiş atölyedeki kalem (tahtada gösterilmiyor):
       planı hesaplanamaz, ama kaybolmasın diye sığmadı olarak geçer. */
    if (!ctx) return { ...k, bitis: k.baslangic, gunler: [], sigmadi: true }
    return kalemPlani(k, ctx)
  })

  const kapasiteFn = (lineId: number, tarih: string): number => {
    const bant = veri.bantSatirlari.find((b) => b.line_id === lineId)
    if (!bant) return 0
    const ctx = veri.baglamlar.get(bant.workshop_id as number)
    if (!ctx) return 0
    return bantPayi(lineId, ctx.bantlar, ctx.bloklar, tarih, ctx.override(tarih))
  }

  const catismalar = cakismalar(planlar, kapasiteFn)
  const citUyarilari = zamanCitiUyarilari(planlar, bugun, ZAMAN_CITI_GUN)

  /* ---- İstemciye giden biçim ---- */
  const bantlar: BantSatiri[] = veri.bantSatirlari.map((b) => ({
    lineId: b.line_id as number,
    bantAdi: (b.bant_adi as string) ?? `Bant ${b.line_id}`,
    workshopId: b.workshop_id as number,
    atolyeAdi: b.atolye_adi as string,
    atolyeKodu: (b.atolye_kodu as string) ?? '',
    gunlukHedef: Number(b.daily_target ?? 0),
    kapasite: Object.fromEntries(gunler.map((g) => [g, kapasiteFn(b.line_id as number, g)])),
  }))

  const woBilgi = new Map(veri.kalemSatirlari.map((k) => [k.work_order_id as number, k]))
  const yerlesik: YerlesikKalem[] = planlar.map((p) => {
    const w = woBilgi.get(p.workOrderId)
    return {
      id: p.id,
      workOrderId: p.workOrderId,
      lineId: p.lineId,
      baslangic: p.baslangic,
      bitis: p.bitis,
      adet: p.adet,
      sigmadi: p.sigmadi,
      isEmriNo: (w?.is_emri_no as string) ?? `#${p.workOrderId}`,
      modelAdi: (w?.model_adi as string) ?? '',
      musteri: (w?.musteri as string) ?? '',
      teslim: (w?.teslim as string) ?? null,
      gunler: p.gunler,
    }
  })

  const havuz: HavuzKarti[] = veri.havuzSatirlari
    .filter((h) => !veri.yerlesikWo.has(h.id as number))
    .map((h) => ({
      workOrderId: h.id as number,
      isEmriNo: (h.is_emri_no as string) ?? `#${h.id}`,
      modelAdi: (h.model_adi as string) ?? '',
      musteri: (h.musteri as string) ?? '',
      adet: Number(h.siparis_miktari ?? 0),
      teslim: (h.teslim as string) ?? null,
      durum: h.durum as string,
      atolyeAdi: (h.atolye_adi as string) ?? null,
    }))

  return (
    <main className="p-4 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Planlama Tezgâhı</h1>
          <p className="text-sm text-slate-500">
            Taslak — atölye görmez, kapasite tüketmez ·{' '}
            <Link href="/pes/takvim" className="underline">bant takvimi →</Link>
            {' · '}
            <Link href="/pes/siparisler" className="underline">sipariş havuzu →</Link>
          </p>
        </div>
      </header>

      {veri.taslaklar.length === 0 ? (
        <Tezgah
          taslaklar={[]} seciliTaslak={0}
          bantlar={[]} gunler={gunler} havuz={havuz} yerlesik={[]}
          cakismalar={[]} citUyarilari={[]} citGun={ZAMAN_CITI_GUN} bugun={bugun}
        />
      ) : (
        <Tezgah
          taslaklar={veri.taslaklar}
          seciliTaslak={veri.seciliId}
          bantlar={bantlar}
          gunler={gunler}
          havuz={havuz}
          yerlesik={yerlesik}
          cakismalar={catismalar}
          citUyarilari={citUyarilari}
          citGun={ZAMAN_CITI_GUN}
          bugun={bugun}
        />
      )}
    </main>
  )
}
