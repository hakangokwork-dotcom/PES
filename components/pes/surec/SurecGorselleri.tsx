// components/pes/surec/SurecGorselleri.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { resmiKucult } from '@/lib/pes/resim-kucult'
import { girenMetni, type GirenAlanlari } from '@/lib/pes/giren'

type Gorsel = GirenAlanlari & { id: number; ad: string; aciklama: string | null; url: string | null }

/** Bir süreç adımının (ve isteğe bağlı bir kaydın) fotoğrafları. Telefonda kamerayı açar. */
export default function SurecGorselleri({ woId, adim, kayitId }: { woId: number; adim: string; kayitId?: number }) {
  const [gorseller, setGorseller] = useState<Gorsel[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const girdi = useRef<HTMLInputElement>(null)
  const sorgu = `adim=${adim}${kayitId ? `&kayit=${kayitId}` : ''}`

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/work-orders/${woId}/gorsel?${sorgu}`).then(r => r.json())
    setGorseller(d.gorseller ?? [])
  }, [woId, sorgu])
  useEffect(() => { yukle() }, [yukle])

  async function gonder(dosyalar: File[]) {
    setHata(null); setYukleniyor(true)
    try {
      for (const f of dosyalar) {
        const fd = new FormData()
        fd.append('dosya', await resmiKucult(f)); fd.append('adim', adim)
        if (kayitId) fd.append('kayit', String(kayitId))
        const r = await fetch(`/api/pes/work-orders/${woId}/gorsel`, { method: 'POST', body: fd })
        if (!r.ok) { setHata((await r.json()).error ?? 'Yüklenemedi'); break }
      }
    } finally { setYukleniyor(false); await yukle() }
  }

  async function sil(id: number) {
    if (!confirm('Fotoğraf silinsin mi?')) return
    const r = await fetch(`/api/pes/work-orders/${woId}/gorsel?gorsel=${id}`, { method: 'DELETE' })
    if (!r.ok) setHata((await r.json()).error ?? 'Silinemedi')
    await yukle()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {gorseller.map(g => (
          <figure key={g.id} className="w-28">
            <a href={g.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-canvas">
              {g.url && <img src={g.url} alt={g.aciklama ?? g.ad} className="h-full w-full object-cover" />}
            </a>
            <figcaption className="text-[11px] text-faint truncate" title={girenMetni(g)}>{girenMetni(g)}</figcaption>
            <button onClick={() => sil(g.id)} className="text-[11px] text-danger hover:underline">Sil</button>
          </figure>
        ))}
      </div>
      <input ref={girdi} type="file" accept="image/*" capture="environment" multiple className="sr-only"
        onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) gonder(f) }} />
      <Button size="sm" variant="secondary" loading={yukleniyor} onClick={() => girdi.current?.click()}>+ Fotoğraf</Button>
      {hata && <p className="text-xs text-danger">{hata}</p>}
    </div>
  )
}
