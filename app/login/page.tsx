'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Geçici hızlı giriş — email/şifre kaldırıldı, tek tıkla giriş.
// Backend Supabase hesapları scripts/_seed_users.mjs ile oluşturuldu.
const ACCOUNTS = {
  atolye: { email: 'atolye@pes.local', password: 'Atolye1234!', redirect: '/workshop' },
  admin: { email: 'admin@pes.local', password: 'Admin1234!', redirect: '/pes' },
} as const

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'atolye' | 'admin' | null>(null)
  const router = useRouter()

  async function login(kind: 'atolye' | 'admin') {
    setError('')
    setLoading(kind)

    const { email, password, redirect } = ACCOUNTS[kind]
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(null)
      return
    }

    router.refresh()
    router.push(redirect)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#197A56] rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-sm">PES</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">PES Giriş</h1>
          <p className="text-sm text-gray-500 mt-1">Atölye Verimlilik Sistemi</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={() => login('atolye')}
            disabled={loading !== null}
            className="w-full py-3 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loading === 'atolye' ? 'Giriş yapılıyor...' : 'Atölye Girişi'}
          </button>

          <button
            onClick={() => login('admin')}
            disabled={loading !== null}
            className="w-full py-3 border border-[#197A56] text-[#197A56] rounded-lg hover:bg-[#197A56]/5 transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loading === 'admin' ? 'Giriş yapılıyor...' : 'Admin Girişi'}
          </button>

          <p className="text-xs text-gray-400 text-center pt-1">
            Geçici hızlı giriş — şifre gerekmez
          </p>
        </div>
      </div>
    </div>
  )
}
