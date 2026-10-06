import { NextResponse } from 'next/server'

/**
 * Yıllık plan YALNIZ merkez paneli. Atölye oturumu (workshopId dolu) 403 alır;
 * RLS bu tabloları tek başına atölyeden ayırmaz, kontrol burada.
 */
export function atolyeyseReddet(tenant: { workshopId: number | null }): NextResponse | null {
  return tenant.workshopId !== null
    ? NextResponse.json({ error: 'Yalnız merkez paneli' }, { status: 403 })
    : null
}
