---
tur: modul
panel: merkez
yol: /pes/atolye-profil
guncelleme: 2026-11-09
kaynaklar: [app/pes/atolye-profil/page.tsx, lib/pes/atolye-profil.ts]
---
# Profil & Sosyal Uygunluk

> Merkez, tüm atölyelerin künye bilgisini ve WKYS / sosyal uygunluk denetim durumunu tek tabloda görür.

## Veri
- okur: [[v-atolye-denetim-durum]] (iki tip), `workshop`, `workshop_profil`
- yazar: `/api/pes/atolye-profil/[id]` (profil alanları; [[2026-11-03-ortak-kayit]] kuralı geçerli)

## Bilinen sorunlar / dersler
- v1.15.1'e kadar sayfa ~23 s'de açılıyor ya da hiç açılmıyordu; diğer sayfalar hızlanınca öne çıktı. v1.15.2'de görünüm MATERIALIZED CTE ile bir kez hesaplanıyor (~0,15 s). Bkz. [[performans-dersleri]].
