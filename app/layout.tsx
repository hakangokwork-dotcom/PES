import type { Metadata } from "next"
import { Geist, Geist_Mono, Quicksand, Source_Sans_3, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "@/components/ui"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

/* VSIM tipografisi (/workshop/vsm). Yalnız .vsim-root altında devreye girer —
   bkz. components/pes/vsim-bridge.css. Türkçe karakterler için latin-ext şart. */
const vsimDisplay = Quicksand({
  variable: "--vsim-font-display",
  subsets: ["latin", "latin-ext"],
})

const vsimSans = Source_Sans_3({
  variable: "--vsim-font-sans",
  subsets: ["latin", "latin-ext"],
})

const vsimMono = IBM_Plex_Mono({
  variable: "--vsim-font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
})

export const metadata: Metadata = {
  title: "PES — Atölye Verimlilik Sistemi",
  description: "Production Efficiency System — 200 fason atölye verimlilik değerlendirme ve tedarikçi skorlama sistemi",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} ${vsimDisplay.variable} ${vsimSans.variable} ${vsimMono.variable} h-full antialiased`}>
      {/* font-sans açıkça yazılı: globals.css'teki `font-family: Arial` satırı
          kalktı, yazı tipi artık @theme'deki --font-sans üzerinden Geist. */}
      <body className="min-h-full flex flex-col font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
