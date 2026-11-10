---
tur: veri
cesit: gorunum
migration: 029
guncelleme: 2026-11-09
kaynaklar: [supabase/migrations/029_atolye_profil_ve_denetim.sql, supabase/migrations/029d_sosyal_denetim_bantlari.sql]
---
# v_atolye_denetim_durum

> Her atölye × denetim tipi (WKYS, SOSYAL) için son denetimin tarihi, puanı, sınıfı ve geçerlilik durumu.

## Nasıl türetiliyor
- `workshop` × (`WKYS`, `SOSYAL`) çapraz çarpımı; `workshop_denetim`'den `DISTINCT ON (workshop_id, tip)` ile son denetim; `workshop_profil` sol birleşim.
- `durum`: `YOK` (denetim yok) · `SURESI_DOLMUS` (`sonraki_tarih` geçmiş) · `YAKLASIYOR` (90 gün içinde) · `GECERLI`.
- `son_sinif` = hesaplanan sınıf, yoksa girilen sınıf.

## Kullananlar
- [[atolye-profil]]: `lib/pes/atolye-profil.ts` (WKYS ve SOSYAL için iki kez birleşir)
- [[siparis-yerlestirme]]: `lib/pes/aday-atolye.ts` (süresi dolmuş denetim sayısı)

## Dikkat
Bu görünümü başka bir sorguya **doğrudan** birleştirme. RLS altında planlayıcı onu dış sorgunun her satırı için yeniden çalıştırıyor (123 atölyede ~23 s). Önce `WITH dd AS MATERIALIZED (SELECT * FROM v_atolye_denetim_durum)` ile bir kez hesapla, sonra `dd`'ye birleş. Bkz. [[performans-dersleri]].
