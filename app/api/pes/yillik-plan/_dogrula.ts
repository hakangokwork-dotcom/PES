import { NextResponse } from 'next/server'
import type postgres from 'postgres'

type Sql = postgres.TransactionSql

export const hata = (mesaj: string, status = 400) => NextResponse.json({ error: mesaj }, { status })

export async function govdeOku(req: Request): Promise<Record<string, unknown> | null> {
  const b: unknown = await req.json().catch(() => null)
  return b !== null && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
}

export function yilAyCoz(b: Record<string, unknown>): { yil: number; ay: number } | null {
  const { yil, ay } = b
  if (typeof yil !== 'number' || !Number.isInteger(yil) || yil < 2020 || yil > 2100) return null
  if (typeof ay !== 'number' || !Number.isInteger(ay) || ay < 1 || ay > 12) return null
  return { yil, ay }
}

/** Pozitif tam sayı id; sayı ya da sayısal metin (query string) kabul eder. */
export function idCoz(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

export function metinCoz(v: unknown, enUzun: number): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, enUzun) : null
}

/** RLS altında görünen atölyenin tenant'ı; görünmüyorsa null (→ 404). */
export async function atolyeTenant(sql: Sql, workshopId: number): Promise<string | null> {
  const [w] = await sql`SELECT tenant_id FROM workshop WHERE id = ${workshopId}` as unknown as
    Array<{ tenant_id: string }>
  return w?.tenant_id ?? null
}
