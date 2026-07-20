// PostgREST cache'i bypass edip doğrudan SQL çalıştırır
export async function execSQL(query: string): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    // rpc/exec_sql yoksa pg_net ile deneyelim — veya hata dönelim
    return { data: null, error: `SQL exec failed: ${res.status}` }
  }

  const data = await res.json()
  return { data, error: null }
}

// Supabase Management API veya doğrudan pg bağlantısı yerine
// en basit çözüm: raw SQL'i Supabase SQL endpoint'i üzerinden çalıştır
export async function runSQL(sql: string, params?: Record<string, unknown>): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Supabase'in pg REST endpoint'i — /pg/query (beta)
  // Bu yoksa fallback olarak tek tek INSERT yaparız
  try {
    const res = await fetch(`${url}/pg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql, params }),
    })

    if (res.ok) {
      const data = await res.json()
      return { rows: data, error: null }
    }
  } catch {
    // /pg endpoint yoksa devam et
  }

  return { rows: [], error: 'SQL endpoint not available' }
}
