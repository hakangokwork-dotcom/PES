import type postgres from 'postgres'
import { asamaGunu } from './yerlestirme'

/* Aday atölye puanlaması (tasarım K10, §5.6).

   Ağırlıklar burada, tek yerde. Koda gömülmemesinin sebebi: hangi
   ölçütün ne kadar ağır bastığı kullanımla ayarlanacak bir şey; her
   ayarda dosya aramak zorunda kalınmamalı. */
export const AGIRLIK = {
  doluluk: 40,   // bant boşluğu — asıl ölçüt
  yetenek: 30,   // line_capability eşleşmesi
  denetim: 20,   // v_atolye_denetim_durum
  tedarik: 10,   // tedarik müdürlüğü / bölge yakınlığı
} as const

export type AdayIstek = {
  adet: number
  teslimTarihi: string
  bugun: string
  /** Verilirse bu tedarik müdürlüğündeki atölyeler puan alır */
  tedarikMudurlugu?: string | null
}

export type Aday = {
  workshopId: number
  kod: string
  ad: string
  toplamGunlukHedef: number
  gerekenGun: number | null
  yetisiyor: boolean
  puan: number
  uyarilar: string[]
}

type Satir = {
  id: number
  code: string
  name: string
  toplam_hedef: number | null
  dolu_gun: number | null
  denetim_dolmus: number | null
  yetenek_kaydi: number | null
  tedarik_mudurlugu: string | null
}

/**
 * Adayları puanlayıp sıralar. Yetişmeyen atölye listeden ATILMAZ —
 * en alta düşer ve işaretlenir; kullanıcı "hiç aday yok" ile
 * karşılaşmamalı, neden yetişmediğini görmeli.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi),
 * aksi halde RLS tenant context'i yok sayar ve 0 satır döner.
 */
export async function adayAtolyeler(
  sql: postgres.TransactionSql,
  istek: AdayIstek,
): Promise<Aday[]> {
  const satirlar = await sql`
    SELECT
      w.id, w.code, w.name,
      (SELECT COALESCE(SUM(pl.daily_target), 0)::int
         FROM production_line pl
        WHERE pl.workshop_id = w.id AND pl.is_active)             AS toplam_hedef,
      (SELECT COUNT(*)::int
         FROM work_order_stage_atama a
         JOIN production_line pl2 ON pl2.id = a.line_id
        WHERE pl2.workshop_id = w.id
          AND a.plan_bitis >= ${istek.bugun}::date
          AND a.plan_baslangic <= ${istek.teslimTarihi}::date)     AS dolu_gun,
      (SELECT COUNT(*)::int
         FROM v_atolye_denetim_durum d
        WHERE d.workshop_id = w.id AND d.durum = 'SURESI_DOLMUS')  AS denetim_dolmus,
      (SELECT COUNT(*)::int
         FROM line_capability lc
         JOIN production_line pl3 ON pl3.id = lc.line_id
        WHERE pl3.workshop_id = w.id)                              AS yetenek_kaydi,
      p.tedarik_mudurlugu
    FROM workshop w
    LEFT JOIN workshop_profil p ON p.workshop_id = w.id
    WHERE w.is_active
    ORDER BY w.code` as unknown as Satir[]

  const enCokYetenek = Math.max(1, ...satirlar.map(s => Number(s.yetenek_kaydi ?? 0)))
  const enCokDolu = Math.max(1, ...satirlar.map(s => Number(s.dolu_gun ?? 0)))

  const adaylar: Aday[] = satirlar.map(s => {
    const hedef = Number(s.toplam_hedef ?? 0)
    const gerekenGun = asamaGunu(istek.adet, hedef)
    const uyarilar: string[] = []

    // 1) Doluluk + yetişme
    let dolulukPuan = 0
    let yetisiyor = false
    if (gerekenGun === null) {
      uyarilar.push('Aktif bandı veya günlük hedefi yok')
    } else {
      const kalanGun = gunFarki(istek.bugun, istek.teslimTarihi) + 1
      yetisiyor = gerekenGun <= kalanGun
      if (!yetisiyor) {
        uyarilar.push(`Teslime yetişmiyor — ${gerekenGun} gün gerekiyor, ${kalanGun} gün var`)
      }
      const bosluk = 1 - Number(s.dolu_gun ?? 0) / enCokDolu
      dolulukPuan = (yetisiyor ? 1 : 0) * bosluk * AGIRLIK.doluluk
    }

    // 2) Yetenek
    const yetenekPuan = (Number(s.yetenek_kaydi ?? 0) / enCokYetenek) * AGIRLIK.yetenek

    // 3) Denetim
    const dolmus = Number(s.denetim_dolmus ?? 0)
    if (dolmus > 0) uyarilar.push(`${dolmus} denetimin süresi dolmuş`)
    const denetimPuan = dolmus === 0 ? AGIRLIK.denetim : 0

    // 4) Tedarik müdürlüğü
    const tedarikPuan = istek.tedarikMudurlugu && s.tedarik_mudurlugu === istek.tedarikMudurlugu
      ? AGIRLIK.tedarik : 0

    return {
      workshopId: s.id,
      kod: s.code,
      ad: s.name,
      toplamGunlukHedef: hedef,
      gerekenGun,
      yetisiyor,
      puan: Math.round(dolulukPuan + yetenekPuan + denetimPuan + tedarikPuan),
      uyarilar,
    }
  })

  /* Kapasitesi olmayan atölye HER ZAMAN en altta — puanı yüksek olsa
     bile (çok yetenek kaydı olabilir) oraya sipariş konamaz. Puanla
     yarıştırmak, seçilemeyecek bir atölyeyi listenin başına çıkarırdı. */
  return adaylar.sort((a, b) => {
    const aKapasiteli = a.gerekenGun !== null ? 1 : 0
    const bKapasiteli = b.gerekenGun !== null ? 1 : 0
    if (aKapasiteli !== bKapasiteli) return bKapasiteli - aKapasiteli
    return b.puan - a.puan
  })
}

function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}
