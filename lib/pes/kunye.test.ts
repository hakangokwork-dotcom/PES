import { afterAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { kodlariDogrula, KUNYE_BOYUTLARI, kunyeyiAyikla } from './kunye'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
afterAll(() => sql.end())

test('altı künye alanı ve boyut eşlemesi tanımlı', () => {
  expect(Object.keys(KUNYE_BOYUTLARI)).toEqual([
    'ana_grup_kodu', 'klasman_kodu', 'kumas_turu_kodu',
    'kumas_grubu_kodu', 'cinsiyet_yas_kodu', 'kalite_kodu',
  ])
})

test('katalogdaki kod geçer', async () => {
  const [v] = await sql`
    SELECT v.code FROM capability_value v
    JOIN capability_dimension d ON d.id = v.dimension_id
    WHERE d.code = 'klasman' LIMIT 1`
  const s = await sql.begin(tx => kodlariDogrula(tx, { klasman_kodu: v.code as string }))
  expect(s.hatalar).toEqual([])
})

test('olmayan kod alan adıyla reddedilir', async () => {
  const s = await sql.begin(tx => kodlariDogrula(tx, {
    klasman_kodu: 'YOK_BOYLE_KOD', kumas_turu_kodu: 'YOK_BOYLE_KOD',
  }))
  expect(s.hatalar).toEqual([
    'klasman_kodu: YOK_BOYLE_KOD katalogda yok',
    'kumas_turu_kodu: YOK_BOYLE_KOD katalogda yok',
  ])
})

test('bir boyutun kodu başka boyutta geçmez', async () => {
  /* klasman kodu kumas_turu alanına yazılırsa katalogda "var" ama yanlış
     boyutta — reddedilmeli. */
  const [v] = await sql`
    SELECT v.code FROM capability_value v
    JOIN capability_dimension d ON d.id = v.dimension_id
    WHERE d.code = 'klasman' LIMIT 1`
  const s = await sql.begin(tx => kodlariDogrula(tx, { kumas_turu_kodu: v.code as string }))
  expect(s.hatalar).toHaveLength(1)
})

test('boş ve null alan doğrulanmaz — künye isteğe bağlı (K3)', async () => {
  const s = await sql.begin(tx => kodlariDogrula(tx, { klasman_kodu: null, kalite_kodu: '' }))
  expect(s.hatalar).toEqual([])
})

test('kunyeyiAyikla boş dizeyi null yapar, gönderilmeyeni atlar', () => {
  const k = kunyeyiAyikla({ klasman_kodu: ' GOMLEK ', kalite_kodu: '', kumasci: '  Bossa ' })
  expect(k).toEqual({ klasman_kodu: 'GOMLEK', kalite_kodu: null, kumasci: 'Bossa' })
  expect('ana_grup_kodu' in k).toBe(false)
})
