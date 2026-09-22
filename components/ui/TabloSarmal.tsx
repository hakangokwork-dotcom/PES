import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* El yapımı <table> için yatay kaydırma sarmalı (tasarım §3.4).
   Sayfalar DataTable kullanmıyor; tabloyu yeniden yazmak yerine sarıyoruz.

   Yapışkan başlık YALNIZCA `yukseklik` verilirse çalışır: overflow-x
   sarmalı bir kaydırma kabı yapar, bu yüzden thead'in position:sticky'si
   sayfaya değil bu sarmala tutunur. Sarmalın kendisi dikey kaydırmazsa
   (sınırlı yükseklik yoksa) başlık hiç kaymaz, yani yapışkanlık görünmez.
   `yukseklik` (CSS max-height, ör. '70vh') verildiğinde tablo sarmalın
   içinde kayar ve başlık gerçekten yapışır.
   Yapışkan thead CSS'i globals.css'te (.tablo-sarmal thead th). */
export function TabloSarmal({
  children,
  className,
  yukseklik,
}: {
  children: ReactNode
  className?: string
  /** CSS max-height, ör. '70vh'. Verilirse dikey kaydırma + gerçek yapışkan başlık. */
  yukseklik?: string
}) {
  return (
    <div
      className={cn('tablo-sarmal w-full overflow-x-auto', yukseklik && 'overflow-y-auto', className)}
      style={yukseklik ? { maxHeight: yukseklik } : undefined}
    >
      {children}
    </div>
  )
}
