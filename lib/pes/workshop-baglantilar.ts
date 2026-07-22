import type postgres from 'postgres'

/* Atölye silinebilir mi? Kararın tamamı burada.
 *
 * NEDEN pg_constraint: workshop'a bugün 24 tablo bağlı (23'ü CASCADE, biri
 * SET NULL). Listeyi elle yazsaydık, ileride bağlanan her yeni tablo sessizce
 * kontrol dışında kalır ve bir DELETE o tablodaki kayıtları da silerdi.
 * Katalogdan okuyunca kontrol kendiliğinden genişler. */

export type Engel = { tablo: string; etiket: string; adet: number }

/* Hata mesajı kullanıcıya gösteriliyor; tablo adı yerine Türkçe karşılık.
   Listede olmayan tablo kendi adıyla görünür — eksik etiket hatayı gizlemesin. */
const ETIKETLER: Record<string, string> = {
  declaration_quality: 'beyan kalite kaydı',
  downtime_record: 'duruş kaydı',
  eder_model: 'eder modeli',
  expense_declaration_staging: 'gider beyan taslağı',
  kaizen_action: 'kaizen aksiyonu',
  line_process_capacity: 'bant süreç kapasitesi',
  model_library: 'model',
  monthly_expense: 'gider kaydı',
  monthly_production: 'üretim kaydı',
  operation_measurement: 'operasyon ölçümü',
  operator: 'operatör',
  production_line: 'bant',
  quality_record: 'kalite kaydı',
  supplier_score: 'skor kaydı',
  ukp_record: 'UKP kaydı',
  wip_record: 'WIP kaydı',
  work_order: 'iş emri',
  workforce_turnover: 'işgücü devir kaydı',
  workshop_account: 'cari hesap',
  workshop_contact: 'ilgili kişi',
  workshop_customer_share: 'müşteri payı kaydı',
  workshop_interaction: 'görüşme kaydı',
  workshop_product: 'ürün kaydı',
  yikama_record: 'yıkama kaydı',
}

type FkKolonu = { tablo: string; kolon: string }
type SayimSatiri = { sira: number; adet: number }

/** Atölyeye bağlı, sıfırdan fazla satırı olan tablolar. */
export async function bagimliliklariSay(
  sql: postgres.TransactionSql,
  workshopId: number
): Promise<Engel[]> {
  /* Bağlı (tablo, kolon) çiftleri. regclass::text ve quote_ident gerektiğinde
     tırnaklar — adlar doğrudan sorguya gömülebilir. Tek kolonlu FK varsayımı
     yok: conkey birden çok kolon içerse her biri ayrı satır olarak gelir ve
     hepsi kontrol edilir. */
  const fkler = (await sql`
    SELECT c.conrelid::regclass::text AS tablo,
           quote_ident(att.attname) AS kolon
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    WHERE c.contype = 'f' AND c.confrelid = 'workshop'::regclass
    ORDER BY 1`) as unknown as FkKolonu[]

  if (fkler.length === 0) return []

  /* Tek turda say: 24 ayrı sorgu, veritabanına 24 gidiş-dönüş demekti.
     Tablo adı sonuca sıra numarasıyla döner — katalogdan gelen adı metin
     sabiti olarak sorguya gömmek gerekmesin. */
  const parcalar = fkler.map(
    (f, i) => `SELECT ${i} AS sira, count(*)::int AS adet FROM ${f.tablo} WHERE ${f.kolon} = $1`
  )
  const satirlar = (await sql.unsafe(parcalar.join(' UNION ALL '), [workshopId])) as unknown as SayimSatiri[]

  return satirlar
    .filter((s) => s.adet > 0)
    .map((s) => ({
      tablo: fkler[s.sira].tablo,
      etiket: ETIKETLER[fkler[s.sira].tablo] ?? fkler[s.sira].tablo,
      adet: s.adet,
    }))
    .sort((a, b) => a.tablo.localeCompare(b.tablo, 'tr'))
}

export type SilmeSonucu = { bulundu: boolean; silindi: boolean; engeller: Engel[] }

/**
 * Atölyeyi siler — yalnız hiçbir bağlı kaydı yoksa.
 *
 * KİLİT: FOR UPDATE atölye satırını kilitler. Bir alt tabloya kayıt eklemek
 * yabancı anahtar kontrolü için üst satırda FOR KEY SHARE alır ve bu FOR UPDATE
 * ile çakışır; böylece sayım ile silme arasında kimse bu atölyeye kayıt giremez.
 * Dokuz kişi ortak alanda çalışıyor, bu teorik bir senaryo değil.
 *
 * bulundu = false hem "yok" hem "başka tenant'ın" demektir: RLS satırı
 * gizlediği için ayrım yapılamaz, zaten yapılmamalı da.
 *
 * Çağıran transaction içinde olmalıdır (withTenantRoute zaten açıyor).
 */
export async function atolyeSil(
  sql: postgres.TransactionSql,
  workshopId: number
): Promise<SilmeSonucu> {
  const [row] = await sql`SELECT id FROM workshop WHERE id = ${workshopId} FOR UPDATE`
  if (!row) return { bulundu: false, silindi: false, engeller: [] }

  const engeller = await bagimliliklariSay(sql, workshopId)
  if (engeller.length > 0) return { bulundu: true, silindi: false, engeller }

  await sql`DELETE FROM workshop WHERE id = ${workshopId}`
  return { bulundu: true, silindi: true, engeller: [] }
}

/** "3 bant, 12 üretim kaydı" — kullanıcıya gösterilecek özet. */
export function engelleriYaz(engeller: Engel[]): string {
  return engeller.map((e) => `${e.adet} ${e.etiket}`).join(', ')
}
