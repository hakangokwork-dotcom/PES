import postgres from 'postgres'

let sql: ReturnType<typeof postgres> | null = null

export function getDB() {
  if (!sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL tanımlı değil (.env.local kontrol et)')

    sql = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  }
  return sql
}
