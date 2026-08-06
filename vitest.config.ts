import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /* Bu depodaki testlerin bir kısmı GERÇEK veritabanına bağlanıyor
       (RLS, tenant izolasyonu ve tarih tipleri sahte sürücüyle
       kanıtlanamaz — bkz. lib/pes/*.test.ts). Supabase eu-west-1'de ve
       her test birkaç gidiş-dönüş yapıyor.

       Vitest'in 5 sn varsayılanı tek dosya çalışırken yetiyordu ama tüm
       paket paralel koşarken bağlantılar birbirini bekletiyor ve testler
       ZAMAN AŞIMINA düşüyordu — kod bozuk olmadığı halde kırmızı.
       Yavaş test değil, uzak veritabanı. */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
