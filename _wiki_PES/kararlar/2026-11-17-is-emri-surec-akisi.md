---
tur: karar
durum: gecerli
tarih: 2026-11-17
guncelleme: 2026-11-17
kaynaklar: [docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md, supabase/migrations/061_olcu_sartname.sql, supabase/migrations/062_kumas_top_surec.sql]
---
# İş emri süreç akışı: kumaştan bitmiş ürüne tek akış

## Bağlam
Denim üretiminde ölçü ve renk sorunları kesimden önce (kumaş topu, çekme grubu) belirleniyor; kayıtlar dağınıktı ve iş emri bazındaki tek çekme testi top farkını göremiyordu.

## Karar
- İş emrinde "Süreç" sekmesi, adım 0–8; adım durumu `v_is_emri_surec` görünümünde.
- Ölçü şartnamesi (061): model × kumaş kategorisi × aşama × revizyon; kabul aralığı saklanmaz (hedef nominal); onaylı revizyon kilitli; yalnız merkez yazar, atölye okur.
- Kumaş topu (062): karantina → serbest/red; RED testli top serbest olamaz; lot, top, ton grubu, çekme grubu ayrı alanlar. Çekme testi top bazlı (eski kolonlar: boy = çözgü, en = atkı).
- Fotoğraflar üretim formlarının kovasında (`surec/` öneki), aynı küçültme.
- Kurallar `PT422` ile veritabanında; API 422 döner.

## Seçilmeyenler ve neden
- Ayrı kontrol formu tablosu: `uretim_formu` (059) zaten var.
- Ölçüyü JSONB formlarda tutmak: POM bazlı geçti/kaldı ve yıkama öncesi/sonrası eşleştirme zayıf kalır (kullanıcı kararı: süreç ölçümü esas).
- Yıkamacıyı `workshop` satırı yapmak: o tabloyu okuyan 88 dosya; yıkamacılar atölye kıyaslarına karışırdı (sürüm 3).

## Sonuçlar
- Sürüm 2: pastal/demet, ölçüm + `v_olcum_sonuc`, ölçü formlarının bu kayıtları göstermesi, yıkamaya sevk.
- Sürüm 3: yıkamacı hesabı (`current_workshop_id = 0` ile varsayılan kapalı), yıkama yükü, dönüş, final.

## Dersler
- Worktree'de `node_modules` bağlantısını Turbopack kabul etmiyor ("points out of the filesystem root"); `next dev --webpack` çalışır. Webpack dev modu `.next/dev/types` üretir ve `withTenantRoute` rotaları orada tip hatası verir (eski rotalarda da); build doğrulayıcısı (`.next/types/validator.ts`) etkilenmez — `tsc` öncesi `.next/dev/types` silinir.
- `Input` `className` ile genişlik veremez (`cn` birleştirmez, `w-full` kazanır); saran `div` ile verilir.
