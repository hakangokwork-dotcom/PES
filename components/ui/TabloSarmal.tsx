import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* El yapımı <table> için yatay kaydırma + yapışkan başlık (tasarım §3.4).
   Sayfalar DataTable kullanmıyor; tabloyu yeniden yazmak yerine sarıyoruz.
   Yapışkan thead CSS'i globals.css'te (.tablo-sarmal thead th). */
export function TabloSarmal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('tablo-sarmal w-full overflow-x-auto', className)}>
      {children}
    </div>
  )
}
