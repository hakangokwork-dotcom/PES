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
