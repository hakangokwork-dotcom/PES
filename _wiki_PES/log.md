---
tur: log
---
# PES Wiki: Günlük

Yalnız sona eklenir. Biçim [[CLAUDE]]'da.

## [2026-11-09] kurulum | Karpathy LLM Wiki deseni
- oluşturuldu: CLAUDE.md (şema), index.md, log.md, _sablonlar/ (modul, kavram, veri, karar, sentez), _araclar/lint.py
- klasörler: moduller/, kavramlar/, veri/, kararlar/, sentezler/
- üst wiki: `IDEAMD/_wiki/projeler/work-pes.md` bu wiki'ye yönlendiriyor

## [2026-11-09] ingest | ../CLAUDE.md, oturum v1.15.0–v1.15.2
- oluşturuldu: genel-bakis, kararlar/2026-11-03-ortak-kayit, kararlar/2026-11-09-fason-win, kavramlar/rls-ve-kiracilik, veri/v-atolye-denetim-durum, moduller/atolye-profil, sentezler/performans-dersleri
- kaynak ayrıca: migrations 029, 046, 054, 055

## [2026-11-10] ingest | v1.16.0 tasarım dili
- oluşturuldu: kararlar/2026-11-10-tasarim-dili.md
- güncellendi: index.md

## [2026-11-17] ingest | migration 057, atölye gider beyanı 2026-09
- veri: 20 atölyenin gider beyanı `monthly_expense` 2026-09'a ayrı kayıt olarak yazıldı; 2026-08 kayıtlarına (11 atölye) dokunulmadı. Ham satırlar `expense_declaration_staging`'de.
- yeni atölye: KARATUR (B115), AYAZ EFE (B116). KARTAL FASHION = KARTAL TEKSTİL (B056, pasif).
- ders: havuz (6543) üzerinden `SET default_transaction_read_only = on` oturumda kalmaz, havuzdaki bağlantıda kalır ve sonraki yazmayı bozar. Salt okunur sorgu için `BEGIN READ ONLY` kullan.
- migration 058: aynı Excel'in gider dışı alanları (ciro, adet, gün/saat, kadro kırılımı, alan m²) `workshop_economy` 2026-09'a yazıldı; kadrosu 0 olan 5 atölye (TOPRAK, ŞİRİN, DEMA, KARTAL, ENVER) dolduruldu. Gider Panosu alan m²'yi artık önce `workshop_economy.area_m2`'den okur.
- v1.17.0: Karşılaştırma tablosunda verisi olan atölyeler önde; gider toplamı `v_expense_groups`'tan, marj cirosu ve TL/dk kadrosu ayın `workshop_economy` satırından (yoksa künyeden).

## [2026-11-17] ingest | Tutulması Gereken Formlar Family.xlsx → v1.18.0 üretim formları
- oluşturuldu: kararlar/2026-11-17-uretim-formlari.md
- güncellendi: index.md
- migration 059 yazıldı (uretim_formu).
- migration 060 yazıldı (uretim_formu_dosya + Storage kovası); form eklerine fotoğraf/PDF. 059 ve 060 üretim DB'ye uygulandı (2026-11-17).

## [2026-11-17] karar | İş emri süreç akışı → v1.19.0 (sürüm 1: adım 0–2)
- oluşturuldu: kararlar/2026-11-17-is-emri-surec-akisi.md
- güncellendi: index.md
- migration 061 (ölçü şartnamesi) ve 062 (kumaş topu, top bazlı çekme, süreç görseli, v_is_emri_surec) üretim DB'ye uygulandı.
- veri: Erkek 5 Cep Denim Jean · Esnek · Final · Rev. 1 · 32 beden 10 POM, durum Önerilen (müşteri onayı bekliyor).
