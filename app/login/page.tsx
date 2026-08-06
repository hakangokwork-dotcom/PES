'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/* Giriş sonrası kök sayfaya gidilir; hangi panele düşeceğini rol belirler
   (bkz. app/page.tsx + lib/auth/panel-guard.ts). Yönetim ve atölye
   hesapları ayrı e-postalardır — burada seçim yapılmaz, rol karar verir. */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      /* Supabase "Invalid login credentials" der; hangi alanın yanlış
         olduğunu sızdırmamak doğru davranış, mesajı Türkçeleştiriyoruz. */
      setError(
        authError.message.includes('Invalid login credentials')
          ? 'E-posta veya şifre hatalı.'
          : authError.message
      )
      setLoading(false)
      return
    }

    router.refresh()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-sm">PES</span>
          </div>
          <h1 className="text-xl font-bold text-ink">PES Giriş</h1>
          <p className="text-sm text-faint mt-1">Atölye Verimlilik Sistemi</p>
        </div>

        <form onSubmit={submit} className="bg-white border border-line-soft rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoFocus
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>

          <p className="text-xs text-faint text-center pt-1">
            Şifreni bilmiyorsan sistem yöneticisine sor.
          </p>
        </form>
      </div>
    </div>
  )
}
