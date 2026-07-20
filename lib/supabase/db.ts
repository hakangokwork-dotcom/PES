import postgres from 'postgres'

let sql: ReturnType<typeof postgres> | null = null

export function getDB() {
  if (!sql) {
    // APP_DATABASE_URL = pes_app rolü (NOBYPASSRLS) — 019c sonrası normal yol.
    // DATABASE_URL = postgres rolü (BYPASSRLS), yalnız migration/script için;
    // uygulama bununla bağlanırsa RLS politikaları atıl kalır.
    const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL
    if (!url) throw new Error('APP_DATABASE_URL / DATABASE_URL tanımlı değil (.env.local kontrol et)')

    sql = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  }
  return sql
}
