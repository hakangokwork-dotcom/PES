import type postgres from 'postgres'
import type { HesapBaglami, BantTanim, BlokTanim } from './bant-doluluk'

/* bant-doluluk saf modülünün veritabanı köprüsü.

   Bir bandın ATÖLYESİNİN hesap bağlamını kurar — kapasite atölyenindir,
   tek bandın değil. Hem atama taşıma ucu (PATCH /atamalar/[id]) hem
   sunucu tarafında plan_bitis türetmek isteyen her yer buradan okur;
   sorguyu iki yerde yazmak iki farklı gerçek demekti.

   Tarihler ::text ile döner — postgres.js DATE'i Date nesnesine çevirir
   ve saf modül dize bekler. */

export async function atolyeBaglamiYukle(
  sql: postgres.TransactionSql, lineId: number,
): Promise<HesapBaglami | null> {
  const [bant] = await sql`SELECT workshop_id FROM production_line WHERE id = ${lineId}`
  if (!bant) return null
  const wsId = bant.workshop_id as number

  const bantSatirlari = await sql`
    SELECT id, daily_target, is_active FROM production_line WHERE workshop_id = ${wsId}`
  const bantlar: BantTanim[] = bantSatirlari.map(b => ({
    lineId: b.id as number,
    dailyTarget: b.daily_target as number,
    aktif: b.is_active as boolean,
  }))

  const blokSatirlari = await sql`
    SELECT ls.line_id, ls.tip, ls.adet,
           ls.baslangic_tarihi::text, ls.bitis_tarihi::text
      FROM line_schedule ls
      JOIN production_line pl ON pl.id = ls.line_id
     WHERE pl.workshop_id = ${wsId}`
  const bloklar: BlokTanim[] = blokSatirlari.map(b => ({
    lineId: b.line_id as number,
    tip: b.tip as BlokTanim['tip'],
    adet: b.adet as number | null,
    baslangic: b.baslangic_tarihi as string,
    bitis: b.bitis_tarihi as string,
  }))

  const kapasiteSatirlari = await sql`
    SELECT tarih::text, gunluk_kapasite FROM workshop_kapasite_gun WHERE workshop_id = ${wsId}`
  const harita = new Map<string, number>(
    kapasiteSatirlari.map(k => [k.tarih as string, k.gunluk_kapasite as number]))

  return { bantlar, bloklar, override: t => harita.get(t) ?? null }
}

/** Atamanın elle girilmiş günlük planları — taşımada KORUNUR (spec §4 varsayımı). */
export async function elleplanYukle(
  sql: postgres.TransactionSql, atamaId: number,
): Promise<Record<string, number>> {
  const satirlar = await sql`
    SELECT tarih::text, plan_adet FROM work_order_gunluk_uretim
     WHERE atama_id = ${atamaId} AND plan_adet IS NOT NULL`
  return Object.fromEntries(satirlar.map(s => [s.tarih as string, s.plan_adet as number]))
}
