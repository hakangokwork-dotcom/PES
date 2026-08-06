'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Check, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Başarı bildirimi 4 saniyede kaybolur; sayfaya kalıcı yeşil kutu EKLENMEZ.
   Hata metni kullanıcının rolüne göre yazılır — ham DB mesajı buraya gelmez,
   console.error / log tarafında kalır. */

type ToastKind = 'success' | 'error'
type Toast = { id: number; kind: ToastKind; text: string }

const Ctx = createContext<{ push: (kind: ToastKind, text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random()
    setItems(prev => [...prev, { id, kind, text }])
  }, [])

  const drop = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {items.map(t => <Row key={t.id} toast={t} onClose={() => drop(t.id)} />)}
      </div>
    </Ctx.Provider>
  )
}

function Row({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    /* Hata daha uzun kalır: kullanıcı okumadan kaçırmasın. */
    const ms = toast.kind === 'success' ? 4000 : 8000
    const id = setTimeout(onClose, ms)
    return () => clearTimeout(id)
  }, [toast.kind, onClose])

  const ok = toast.kind === 'success'
  return (
    <div className={cn(
      'pointer-events-auto flex items-center gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 shadow-[0_4px_14px_rgba(15,23,32,0.07)]',
      ok ? 'border-line' : 'border-danger-line',
    )}>
      <span className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full',
        ok ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger',
      )}>
        {ok ? <Check className="size-2.5" strokeWidth={3} /> : <AlertTriangle className="size-2.5" strokeWidth={3} />}
      </span>
      <span className="text-[13px] text-ink">{toast.text}</span>
      <button onClick={onClose} aria-label="Kapat" className="ml-1.5 text-faint hover:text-ink">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı (app/layout.tsx)')
  return {
    success: (text: string) => ctx.push('success', text),
    error: (text: string) => ctx.push('error', text),
  }
}
