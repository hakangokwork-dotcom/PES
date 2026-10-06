/**
 * Yıllık plan (v2) — veritabanı okuması. Hesap yillik-plan.ts'te.
 *
 * Tüm fonksiyonlar TRANSACTION handle'ı ister (withTenantRoute /
 * withServerTenant içi); aksi halde RLS tenant bağlamı yok, 0 satır.
 */
import type postgres from 'postgres'
import {
  bazKaynagi, yillikKapasite,
  type AtolyeKapasitesi, type AyDuzeltmesi, type AySatiri, type Klasman, type PlanSatiri,
} from './yillik-plan'

type Sql = postgres.TransactionSql

/** Klasman kataloğu (capability_value, boyut 'klasman'), katalog sırasıyla. */
export async function klasmanKatalogu(sql: Sql): Promise<Klasman[]> {
  return await sql`
    SELECT v.code, v.label
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code = 'klasman'
     ORDER BY v.sort_order, v.label
  ` as unknown as Klasman[]
}

export async function klasmanVarMi(sql: Sql, kod: string): Promise<boolean> {
  const r = await sql`
    SELECT 1
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code = 'klasman' AND v.code = ${kod}
     LIMIT 1`
  return r.length > 0
}

/**
 * Klasman boyutu yetenek kataloğunda tutuluyor mu. Hiç kayıt yoksa uyum
 * sorulamaz — her atölye "kontrol edilemedi" görünür, "uygun değil" değil.
 */
export async function klasmanIzleniyor(sql: Sql): Promise<boolean> {
  const r = await sql`SELECT 1 FROM line_capability WHERE dimension_code = 'klasman' LIMIT 1`
  return r.length > 0
}

/** Aktif atölyeler: 12 aylık kapasite (kaynağıyla), düzeltmeler, klasman yetenekleri. */
export async function atolyeKapasiteleri(sql: Sql, yil: number): Promise<AtolyeKapasitesi[]> {
  const atolyeler = await sql`
    SELECT w.id, w.code, w.name,
           wp.aylik_kapasite AS profil,
           w.monthly_capacity AS atolye,
           COALESCE((SELECT SUM(pl.daily_target) FROM production_line pl
                      WHERE pl.workshop_id = w.id AND pl.is_active), 0)::int AS hedef
      FROM workshop w
      LEFT JOIN workshop_profil wp ON wp.workshop_id = w.id
     WHERE w.is_active
     ORDER BY w.code
  ` as unknown as Array<{ id: number; code: string; name: string; profil: number | null; atolye: number | null; hedef: number }>

  const duzeltmeSatirlari = await sql`
    SELECT workshop_id, ay, adet, sebep
      FROM atolye_kapasite_ay
     WHERE yil = ${yil}
  ` as unknown as Array<{ workshop_id: number; ay: number; adet: number; sebep: string | null }>

  const yetenekSatirlari = await sql`
    SELECT DISTINCT pl.workshop_id, lc.value_code AS kod
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
     WHERE lc.dimension_code = 'klasman' AND pl.is_active
  ` as unknown as Array<{ workshop_id: number; kod: string }>

  const duzeltmeler = new Map<number, (AyDuzeltmesi | null)[]>()
  for (const d of duzeltmeSatirlari) {
    const l = duzeltmeler.get(d.workshop_id) ?? Array<AyDuzeltmesi | null>(12).fill(null)
    l[d.ay - 1] = { adet: d.adet, sebep: d.sebep }
    duzeltmeler.set(d.workshop_id, l)
  }
  const yetenek = new Map<number, string[]>()
  for (const y of yetenekSatirlari) {
    const l = yetenek.get(y.workshop_id) ?? []
    l.push(y.kod)
    yetenek.set(y.workshop_id, l)
  }

  return atolyeler.map((a) => {
    const duzeltme = duzeltmeler.get(a.id) ?? Array<AyDuzeltmesi | null>(12).fill(null)
    const k = yillikKapasite(yil, {
      duzeltmeler: duzeltme.map((d) => d?.adet ?? null),
      profil: a.profil,
      atolye: a.atolye,
      gunlukHedef: a.hedef,
    })
    return {
      workshopId: a.id,
      kod: a.code,
      ad: a.name,
      profilKapasite: a.profil,
      atolyeKapasite: a.atolye,
      gunlukHedef: a.hedef,
      bazKaynak: bazKaynagi(a.profil, a.atolye, a.hedef),
      kapasite: k.adet,
      kaynak: k.kaynak,
      duzeltme,
      klasmanlar: yetenek.get(a.id) ?? [],
    }
  })
}

export async function planSatirlari(sql: Sql, yil: number): Promise<PlanSatiri[]> {
  return await sql`
    SELECT p.id, p.workshop_id AS "workshopId", p.ay, p.klasman_kodu AS "klasmanKodu",
           p.adet, p.not_metni AS "notMetni"
      FROM plan_atolye_ay p
      JOIN workshop w ON w.id = p.workshop_id AND w.is_active
     WHERE p.yil = ${yil}
     ORDER BY p.workshop_id, p.ay, p.klasman_kodu
  ` as unknown as PlanSatiri[]
}

export async function talepSatirlari(sql: Sql, yil: number): Promise<AySatiri[]> {
  return await sql`
    SELECT NULL::int AS "workshopId", ay, klasman_kodu AS "klasmanKodu", adet
      FROM plan_talep_ay
     WHERE yil = ${yil}
  ` as unknown as AySatiri[]
}

/**
 * Atanmış gerçek siparişler (bilgi amaçlı). Ay = bitiş, yoksa teslim
 * (v1 poAylikYuk ve Planlama Masası ipucuyla aynı kural).
 */
export async function fiiliSiparisler(sql: Sql, yil: number): Promise<AySatiri[]> {
  return await sql`
    SELECT o.workshop_id AS "workshopId",
           extract(month FROM COALESCE(o.bitis_tarihi, o.teslim_tarihi))::int AS ay,
           o.klasman_kodu AS "klasmanKodu",
           COALESCE(SUM(o.siparis_miktari), 0)::int AS adet
      FROM work_order o
      JOIN workshop w ON w.id = o.workshop_id AND w.is_active
     WHERE o.durum NOT IN ('İptal', 'Iptal')
       AND extract(year FROM COALESCE(o.bitis_tarihi, o.teslim_tarihi)) = ${yil}
     GROUP BY 1, 2, 3
  ` as unknown as AySatiri[]
}
