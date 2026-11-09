import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component'tan çağrıldığında set edilemez
          }
        },
      },
    }
  )
}

/* Oturumdaki kullanıcı — bir sayfa isteğinde layout, kimlik bloğu ve sayfa
   ayrı ayrı soruyordu; her biri Supabase Auth'a bir ağ gidiş-dönüşüydü.
   cache() aynı render içinde tek çağrıya indirir (route handler'da etkisiz). */
export const oturumKullanicisi = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
