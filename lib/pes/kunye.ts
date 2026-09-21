import type postgres from 'postgres'

/* Künye doğrulama — tek yerde (spec K3, §4).

   Altı alan katalog kodu taşır; katalog capability_value(dimension_id, code)
   tekil olduğu için tek kolon FK kurulamıyor. POST ve PATCH bu fonksiyonu
   çağırır; yazmadan önce kodun O BOYUTTA var olduğu doğrulanır — klasman
   kodu kumaş türü alanına yazılırsa katalogda "var" ama yanlış boyutta,
   reddedilir. Boş / null alan doğrulanmaz — künye isteğe bağlıdır. */

/** kolon → capability_dimension.code */
export const KUNYE_BOYUTLARI = {
  ana_grup_kodu: 'ana_grup',
  klasman_kodu: 'klasman',
  kumas_turu_kodu: 'kumas_turu',
  kumas_grubu_kodu: 'kumas_grubu',
  cinsiyet_yas_kodu: 'cinsiyet_yas',
  kalite_kodu: 'kalite',
} as const

export type KunyeKolonu = keyof typeof KUNYE_BOYUTLARI
export type Kunye = Partial<Record<KunyeKolonu, string | null>> & { kumasci?: string | null }

export async function kodlariDogrula(
  sql: postgres.TransactionSql, kunye: Kunye,
): Promise<{ hatalar: string[] }> {
  const dolu = (Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[])
    .filter(k => kunye[k] != null && String(kunye[k]).trim() !== '')
  if (dolu.length === 0) return { hatalar: [] }

  const boyutlar = [...new Set(dolu.map(k => KUNYE_BOYUTLARI[k]))]
  const satirlar = await sql`
    SELECT d.code AS boyut, v.code
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code IN ${sql(boyutlar)}`
  const mevcut = new Set(satirlar.map(r => `${r.boyut}|${r.code}`))

  const hatalar: string[] = []
  for (const k of dolu) {
    const kod = String(kunye[k]).trim()
    if (!mevcut.has(`${KUNYE_BOYUTLARI[k]}|${kod}`)) hatalar.push(`${k}: ${kod} katalogda yok`)
  }
  return { hatalar }
}

/** İstek gövdesinden künyeyi ayıklar; boş dizeyi null yapar, gönderilmeyeni atlar. */
export function kunyeyiAyikla(b: Record<string, unknown>): Kunye {
  const out: Kunye = {}
  const temizle = (v: unknown) => (v === null || String(v).trim() === '' ? null : String(v).trim())
  for (const k of Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[]) {
    if (b[k] !== undefined) out[k] = temizle(b[k])
  }
  if (b.kumasci !== undefined) out.kumasci = temizle(b.kumasci)
  return out
}
