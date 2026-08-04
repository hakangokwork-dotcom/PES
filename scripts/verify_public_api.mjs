#!/usr/bin/env node
/**
 * Public REST API sızıntı testi — anon anahtarıyla dışarıdan ne görünüyor?
 *
 * NEDEN VAR: 2026-07-29'da Supabase güvenlik uyarısı geldi. Doğrulayınca
 * anon anahtarıyla (Next.js bundle'ında herkese açık) 14 iş emri, 25 gider
 * satırı ve 3156 satırlık yedek tablo okunabiliyordu. Sebep iki katmandı:
 * RLS'siz tablolar ve postgres sahipli SECURITY DEFINER view'lar.
 * Migration 028 bunu kapattı; bu betik kapalı kaldığını kanıtlar.
 *
 *   node scripts/verify_public_api.mjs
 *
 * Sadece OKUMA yapar, hiçbir şeye yazmaz.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const TABAN = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const ANAHTAR = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!TABAN || !ANAHTAR) {
  console.error('.env.local içinde NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY yok')
  process.exit(1)
}

/* 028 öncesi sızan uçlar + kontrol amaçlı RLS'i zaten çalışan birkaç tablo */
const UCLAR = [
  'v_work_order_full', 'v_work_order_stages',
  'v_expense_groups', 'v_expense_groups_real', 'v_expense_revisions',
  'v_pes_monthly_summary',
  'v_eder_model_ozet', 'v_eder_model_v3_ozet', 'v_eder_model_ana_grup',
  'v_workshop_capability',
  'pes_benchmark', 'production_stage',
  'ref_operasyon', 'ref_makine_tipi', 'ref_urun_tipi',
  'kv3_urun', 'kv3_islem_katalogu',
  '_yedek_line_capability_20260723', '_yedek_production_line_20260723',
  'workshop', 'tenant_user', 'work_order', 'monthly_expense',
  // 029 ile eklenenler — denetim/künye verisi dışarı açılmamalı
  'workshop_profil', 'workshop_denetim', 'workshop_profil_staging',
  'v_atolye_denetim_durum',
]

let sizan = 0
for (const uc of UCLAR) {
  const cevap = await fetch(`${TABAN}/${uc}?select=*`, {
    headers: {
      apikey: ANAHTAR,
      Authorization: `Bearer ${ANAHTAR}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const aralik = cevap.headers.get('content-range') ?? ''
  const adet = Number(aralik.split('/')[1])

  if (cevap.status >= 400) {
    console.log(`  ok    ${uc.padEnd(34)} erisim yok (HTTP ${cevap.status})`)
  } else if (Number.isFinite(adet) && adet > 0) {
    console.log(`  SIZAN ${uc.padEnd(34)} ${adet} satir okunabiliyor`)
    sizan++
  } else {
    console.log(`  ok    ${uc.padEnd(34)} 0 satir`)
  }
}

console.log()
if (sizan > 0) {
  console.error(`✗ ${sizan} uç noktadan veri sızıyor — migration 028 uygulanmamış olabilir.`)
  process.exit(1)
}
console.log('✓ Anon anahtarıyla hiçbir uçtan veri okunamıyor.')
