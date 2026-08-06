'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/* Atölye seçim ekranı. 114+ kayıt olduğu için arama şart; sahiplenilen
   atölye listenin başında ayrı bölümde durur.

   SAHİPLİK ERİŞİM KISITI DEĞİLDİR — sahiplenmediğin atölyeye de girebilirsin.
   İşaretin amacı kendi atölyeni 114 kaydın içinde kaybetmemek ve yönetimin
   kimin nereyle ilgilendiğini görmesi. */

export interface AtolyeSatiri {
  id: number
  code: string
  name: string
  city: string | null
  type: string
  sewing_staff: number
  total_staff: number
  owner_user_id: string | null
  owner_email: string | null
}

export default function AtolyeSecici({
  atolyeler,
  userId,
}: {
  atolyeler: AtolyeSatiri[]
  userId: string
}) {
  const [q, setQ] = useState('')
  const [hata, setHata] = useState('')
  const [bekleyen, setBekleyen] = useState<number | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const { benim, digerleri } = useMemo(() => {
    const arama = q.trim().toLocaleLowerCase('tr')
    const uyan = arama
      ? atolyeler.filter((a) =>
          `${a.code} ${a.name} ${a.city ?? ''}`.toLocaleLowerCase('tr').includes(arama))
      : atolyeler
    return {
      benim: uyan.filter((a) => a.owner_user_id === userId),
      digerleri: uyan.filter((a) => a.owner_user_id !== userId),
    }
  }, [atolyeler, q, userId])

  async function sahiplik(id: number, sahiplen: boolean) {
    setHata('')
    setBekleyen(id)
    try {
      const r = await fetch(`/api/pes/workshops/${id}/sahiplen`, {
        method: sahiplen ? 'POST' : 'DELETE',
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setHata(d.error ?? 'İşlem başarısız')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setHata('Bağlantı hatası')
    } finally {
      setBekleyen(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl">PES</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Atölye Seçin</h1>
        <p className="text-faint mt-1">
          Verimlilik paneline erişmek için atölyenizi seçin
        </p>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Kod, isim veya şehir ara…"
        className="w-full px-4 py-2.5 border border-line rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
      />

      {hata && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {hata}
        </div>
      )}

      {benim.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Benim atölyelerim
          </h2>
          {benim.map((a) => (
            <Kart key={a.id} a={a} benimMi bekliyor={bekleyen === a.id} onSahiplik={sahiplik} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        {benim.length > 0 && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Diğer atölyeler
          </h2>
        )}
        {digerleri.map((a) => (
          <Kart key={a.id} a={a} benimMi={false} bekliyor={bekleyen === a.id} onSahiplik={sahiplik} />
        ))}
        {benim.length === 0 && digerleri.length === 0 && (
          <p className="text-center text-faint text-sm py-8">
            &quot;{q}&quot; için atölye bulunamadı.
          </p>
        )}
      </section>
    </div>
  )
}

function Kart({
  a,
  benimMi,
  bekliyor,
  onSahiplik,
}: {
  a: AtolyeSatiri
  benimMi: boolean
  bekliyor: boolean
  onSahiplik: (id: number, sahiplen: boolean) => void
}) {
  const baskasinda = !!a.owner_user_id && !benimMi

  return (
    <div
      className={`bg-white border rounded-xl p-5 transition-all hover:shadow-md ${
        benimMi ? 'border-accent ring-1 ring-accent/20' : 'border-line-soft hover:border-accent'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <Link href={`/workshop?wid=${a.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-accent font-bold text-lg">{a.code}</span>
            <span className="text-ink font-medium">{a.name}</span>
            {benimMi && (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                Benim
              </span>
            )}
          </div>
          <p className="text-sm text-faint mt-0.5">
            {[a.city, `Tip ${a.type}`, `${a.sewing_staff} dikim op.`, `${a.total_staff} toplam`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {baskasinda && (
            <p className="text-xs text-faint mt-1">Sahiplenen: {a.owner_email ?? 'başka kullanıcı'}</p>
          )}
        </Link>

        <button
          onClick={() => onSahiplik(a.id, !benimMi)}
          disabled={bekliyor || baskasinda}
          title={baskasinda ? 'Başka bir kullanıcı sahiplenmiş' : undefined}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            benimMi
              ? 'border-line text-muted hover:bg-canvas'
              : 'border-accent text-accent hover:bg-accent/5'
          }`}
        >
          {bekliyor ? '…' : benimMi ? 'Bırak' : 'Sahiplen'}
        </button>
      </div>
    </div>
  )
}
