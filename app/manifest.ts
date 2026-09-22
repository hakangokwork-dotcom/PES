import type { MetadataRoute } from 'next'

/* PWA manifesti — tasarım 2026-09-22 §3.1. Next bunu /manifest.webmanifest
   olarak sunar ve <link rel="manifest"> etiketini kendisi ekler.
   start_url /workshop: atölye tableti kurunca doğrudan kendi paneline düşer;
   oturum yoksa layout /login'e yönlendirir. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PES Atölye',
    short_name: 'PES',
    description: 'Atölye veri girişi ve performans — Production Efficiency System',
    lang: 'tr',
    start_url: '/workshop',
    /* Kapsam '/' — '/workshop' DEĞİL: oturum yoksa start_url /login'e düşer;
       dar kapsamda o sayfa tam ekran modundan çıkardı. */
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#197A56',
    background_color: '#F6F8F9',
    icons: [
      { src: '/icons/pes-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pes-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/pes-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
