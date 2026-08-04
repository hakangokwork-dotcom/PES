import postgres from 'postgres'

/**
 * Atölye profil + denetim durumu satırı.
 *
 * v_atolye_denetim_durum atölye × denetim tipi başına bir satır verir
 * (uzun format). Ekran ve Excel için tek satırda iki denetim tipi
 * gerekiyor, o yüzden burada pivotlanır.
 */
export interface AtolyeProfilSatiri {
  id: number
  code: string
  name: string
  city: string | null
  is_active: boolean

  t_kod: string | null
  tedarik_mudurlugu: string | null
  teknik_mudur: string | null
  fku: string | null
  bolge_ad: string | null
  calisma_sekli: string | null
  uretim_tipi: string | null
  subjektif_sinif: string | null
  risk_seviyesi: string | null
  is_ortakligi_leveli: string | null
  aylik_kapasite: number | null
  bant_sayisi: number | null
  profil_var: boolean

  wkys_tarih: string | null
  wkys_puan: string | null
  wkys_sinif: string | null
  wkys_sonraki: string | null
  wkys_kalan: number | null
  wkys_durum: DenetimDurum

  sosyal_tarih: string | null
  sosyal_puan: string | null
  /** Puandan türetilen sınıf; yoksa kaynağınki. */
  sosyal_sinif: string | null
  /** Kaynağın yazdığı harf — türetilenle çelişebilir, o yüzden ayrı. */
  sosyal_sinif_kaynak: string | null
  sosyal_sonraki: string | null
  sosyal_kalan: number | null
  sosyal_durum: DenetimDurum
}

export type DenetimDurum = 'YOK' | 'SURESI_DOLMUS' | 'YAKLASIYOR' | 'GECERLI'

export const DURUM_ETIKET: Record<DenetimDurum, string> = {
  YOK: 'Denetim yok',
  SURESI_DOLMUS: 'Süresi dolmuş',
  YAKLASIYOR: 'Yaklaşıyor',
  GECERLI: 'Geçerli',
}

/**
 * Tek sorgu, iki tüketici (ekran + Excel). Ayrı yazılsalardı ikisi
 * zamanla birbirinden ayrışır ve "ekranda gördüğüm rapor inmiyor"
 * sınıfından hatalar çıkardı.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withServerTenant içi) —
 * aksi halde RLS tenant context'i yok sayar ve 0 satır döner.
 */
export async function atolyeProfilSatirlari(
  sql: postgres.TransactionSql,
  opts: { arsivDahil?: boolean } = {}
): Promise<AtolyeProfilSatiri[]> {
  const rows = await sql`
    SELECT
      w.id, w.code, w.name, w.city, w.is_active,
      p.t_kod, p.tedarik_mudurlugu, p.teknik_mudur, p.fku, p.bolge_ad,
      p.calisma_sekli, p.uretim_tipi, p.subjektif_sinif, p.risk_seviyesi,
      p.is_ortakligi_leveli, p.aylik_kapasite, p.bant_sayisi,
      (p.workshop_id IS NOT NULL) AS profil_var,

      -- ::text ZORUNLU. postgres.js DATE kolonlarini JS Date nesnesine
      -- cevirir; arayuz bunlari string bekleyip .slice()/.localeCompare()
      -- cagiriyor ve Date'te bu metodlar yok -> render TypeError ile
      -- coker. Tip tanimindaki "string" ancak bu cast ile dogru olur.
      wk.son_denetim::text   AS wkys_tarih,
      wk.son_puan            AS wkys_puan,
      wk.son_sinif           AS wkys_sinif,
      wk.sonraki_tarih::text AS wkys_sonraki,
      wk.kalan_gun           AS wkys_kalan,
      wk.durum               AS wkys_durum,

      so.son_denetim::text   AS sosyal_tarih,
      so.son_puan            AS sosyal_puan,
      so.son_sinif           AS sosyal_sinif,
      so.son_sinif_kaynak    AS sosyal_sinif_kaynak,
      so.sonraki_tarih::text AS sosyal_sonraki,
      so.kalan_gun           AS sosyal_kalan,
      so.durum               AS sosyal_durum
    FROM workshop w
    LEFT JOIN workshop_profil p ON p.workshop_id = w.id
    LEFT JOIN v_atolye_denetim_durum wk
           ON wk.workshop_id = w.id AND wk.denetim_tipi = 'WKYS'
    LEFT JOIN v_atolye_denetim_durum so
           ON so.workshop_id = w.id AND so.denetim_tipi = 'SOSYAL'
    WHERE ${opts.arsivDahil ? sql`TRUE` : sql`w.is_active`}
    ORDER BY
      -- en acil üstte: süresi dolmuş > yaklaşıyor > yok > geçerli
      LEAST(
        COALESCE(wk.kalan_gun,  99999),
        COALESCE(so.kalan_gun,  99999)
      ) ASC NULLS LAST,
      w.code`
  return rows as unknown as AtolyeProfilSatiri[]
}

/** Excel için düz, Türkçe başlıklı satırlar. */
export function excelSatirlari(satirlar: AtolyeProfilSatiri[]) {
  return satirlar.map((s) => ({
    'KOD': s.code,
    'ATÖLYE': s.name,
    'ŞEHİR': s.city ?? '',
    'AKTİF': s.is_active ? 'Evet' : 'Hayır',
    'T KOD': s.t_kod ?? '',
    'TEDARİK MÜDÜRLÜĞÜ': s.tedarik_mudurlugu ?? '',
    'TEKNİK MÜDÜR': s.teknik_mudur ?? '',
    'FKU': s.fku ?? '',
    'BÖLGE': s.bolge_ad ?? '',
    'ÇALIŞMA ŞEKLİ': s.calisma_sekli ?? '',
    'ÜRETİM TİPİ': s.uretim_tipi ?? '',
    'SUBJEKTİF SINIF': s.subjektif_sinif ?? '',
    'RİSK': s.risk_seviyesi ?? '',
    'İŞ ORTAKLIĞI': s.is_ortakligi_leveli ?? '',
    'BANT': s.bant_sayisi ?? '',
    'AYLIK KAPASİTE': s.aylik_kapasite ?? '',
    'WKYS TARİH': s.wkys_tarih ?? '',
    'WKYS PUAN': s.wkys_puan ?? '',
    'WKYS SINIF': s.wkys_sinif ?? '',
    'WKYS SONRAKİ': s.wkys_sonraki ?? '',
    'WKYS KALAN GÜN': s.wkys_kalan ?? '',
    'WKYS DURUM': DURUM_ETIKET[s.wkys_durum] ?? '',
    'SOSYAL TARİH': s.sosyal_tarih ?? '',
    'SOSYAL PUAN': s.sosyal_puan ?? '',
    'SOSYAL SINIF': s.sosyal_sinif ?? '',
    'SOSYAL SINIF (KAYNAK)': s.sosyal_sinif_kaynak ?? '',
    'SOSYAL SONRAKİ': s.sosyal_sonraki ?? '',
    'SOSYAL KALAN GÜN': s.sosyal_kalan ?? '',
    'SOSYAL DURUM': DURUM_ETIKET[s.sosyal_durum] ?? '',
    'PROFİL VERİSİ': s.profil_var ? 'Var' : 'Yok',
  }))
}
