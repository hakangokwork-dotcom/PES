---
tur: sentez
soru: "Menü geçişleri ve bazı sayfalar neden yavaştı, ne yapıldı?"
guncelleme: 2026-11-09
kaynaklar: [vercel.json, lib/supabase/server.ts, lib/auth/tenant-context.ts, lib/supabase/tenant-db.ts, lib/pes/atolye-profil.ts, lib/pes/aday-atolye.ts]
---
# Performans dersleri (v1.15.1 – v1.15.2)

## Cevap

### 1. Gezinme yavaşlığı: mesafe ve gidiş-dönüş sayısı (v1.15.1)
- Fonksiyonlar iad1 (ABD), veritabanı eu-west-1'deydi; her sorgu okyanus aşırıydı. → `vercel.json` `regions: ["dub1"]`.
- Bir sayfa yüklemesinde `auth.getUser()` birkaç kez çağrılıyordu. → React `cache()` ile `oturumKullanicisi()` (`lib/supabase/server.ts`) ve `getTenantContext` istek başına bir kez.
- Kiracı + atölye çözümü iki sorguydu → tek sorgu. `withTenant` içindeki dört `set_config` → tek SELECT.
- Atölye panosunun 10 bağımsız sorgusu sırayla gidiyordu → `Promise.all`.
- `loading.tsx` + `SayfaIskeleti`: tıklama anında geri bildirim.

### 2. Tek sayfanın "hiç gelmemesi": RLS altında görünümün tekrar hesaplanması (v1.15.2)
- [[atolye-profil]], [[v-atolye-denetim-durum]]'u iki kez birleştiriyordu. pes_app (RLS) ile ölçüm: 12,6 s + 10,3 s; postgres rolüyle hızlı görünüyordu.
- Sebep: planlayıcı görünümü dış sorgunun her satırı için yeniden çalıştırıyor, her seferinde RLS fonksiyonları da çalışıyor.
- Düzeltme: `WITH dd AS MATERIALIZED (...)` → 0,15 s. Aynı desen [[siparis-yerlestirme]] aday listesinde de düzeltildi.

## Kural
- Ağır görünümü (DISTINCT ON, çapraz çarpım içeren) başka sorguya birleştirirken MATERIALIZED CTE kullan.
- Sorgu ölçümünü **pes_app** bağlantısıyla yap; postgres rolü RLS'i atladığı için yanıltır ([[rls-ve-kiracilik]]).

## Dayanak
- Commit'ler: 68f5809 (v1.15.1), 656f292 (v1.15.2).
