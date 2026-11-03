# Veri sahipliği matrisi — kim girer, kim onaylar

**Durum:** Karar 1 uygulandı (054, v1.11.0) · Karar 2 ve 3 açık
**Kural (CLAUDE.md):** atölye beyan eder, merkez doğrular. Aynı veriye iki taraf yazıyorsa hangisinin kaynak olduğu ekranda yazılı olmalı.

Bugünkü durum koddan çıkarıldı: hangi panel hangi API'ye yazıyor. "Önerilen" sütunu karar içindir.

## Matris

| Veri | Atölye paneli | Merkez paneli | Bugün | Önerilen sahip | Önerilen doğrulama |
|---|---|---|---|---|---|
| Günlük üretim (bant × gün) | yazar | okur | tek taraf | Atölye | Merkez yalnız okur; aylık özetle tutarsızlık uyarısı |
| Aylık üretim (`monthly_production`) | yazar | **yazar** (aynı API) | çift yazım | Atölye | Merkez düzeltirse "merkez düzeltmesi" iz kaydı |
| Kalite (`quality_record`) | yazar | **yazar** | çift yazım | Atölye | Merkez kalite ekibi denetimde doğrular |
| Duruş (`downtime_record`) | yazar | **yazar** | çift yazım | Atölye | — |
| İşgücü devri (`workforce_turnover`) | yazar | **yazar** | çift yazım | Atölye | — |
| Model değişimi (`changeover_record`) | — | yazar | yalnız merkez | Atölye | Atölye ekranı yok; eklenmeli ya da merkezde kalmalı |
| Gider beyanı (`monthly_expense`) | yazar | **yazar** | çift yazım | Atölye | Var: beyan kalitesi ve revizyon geçmişi (022) |
| Ekonomi verisi (040) | yazar | talep açar, okur | iki yönlü | Atölye | Var: merkez talep eder, atölye doldurur |
| Atölye profili, bantlar | yazar | **yazar** | çift yazım | Atölye | Merkez onayı: kapasiteyi etkileyen alanlar (bant sayısı, kişi) |
| Bant yetenekleri | yazar | **yazar** | çift yazım | Atölye | Merkez denetimde doğrular |
| İş emri | yazar | okur, plan masasından atar | iki yönlü | Merkez (sipariş), atölye (ilerleme) | Künye merkezde, ilerleme atölyede |
| Plan teklifi | cevaplar | gönderir | iki yönlü | Merkez | Var: kabul / karşı teklif / ret (044) |
| Gecikme bildirimi | yazar | okur | tek taraf | Atölye | — |
| Olgunluk öz değerlendirmesi | yazar | okur | tek taraf | Atölye | Sınıfı belirlemez (034) |
| Olgunluk denetimi | okur | yazar | tek taraf | Merkez | Atölye salt okunur görür |
| Sosyal uygunluk / WKYS | — | yazar | tek taraf | Merkez | — |
| Yıllık talep planı | kapasite beyanı | plan, talep | iki yönlü | Merkez | Atölye beyanı varsayılan kapasite olur |
| Kaizen, Yıkama/UKP | yazar | — | tek taraf | Atölye | — |
| Dakika maliyeti, referans fiyatlar | — | yazar | tek taraf | Merkez | — |

## Açık kararlar

1. **Çift yazım — UYGULANDI (2026-11-03).** İki taraf da yazmaya devam ediyor; her kayıt artık `giren_taraf` (atolye/merkez), `giren_eposta` ve `girildi_at` taşıyor. Tetikleyici doldurur (054), istemci taklit edemez. Merkez ekranları mevcut kaydın kimden geldiğini gösterir ve atölye beyanının üzerine yazmadan önce uyarır. Eski kayıtlar "kaynak bilinmiyor".
   Önceki durum: Yedi veri türü iki panelden aynı API ile yazılıyor ve kimin girdiği kaydedilmiyor. Seçenekler:
   - Merkez ekranları salt okunur olur, düzeltme "atölye adına çalış" ile yapılır. En sade; iz kaydı zaten atölye kapsamında kalır.
   - Merkez yazmaya devam eder ama her kayda `kaynak = atolye | merkez` yazılır ve ekranda gösterilir.
2. **Model değişimi** için atölye ekranı yok. Eklensin mi, yoksa merkezin ölçtüğü bir veri mi?
3. **Profil ve bant değişiklikleri** kapasiteyi doğrudan değiştiriyor (plan masası, yıllık plan). Atölyenin yaptığı değişiklik merkez onayına mı düşmeli?

## Ekranda taraf etiketi

Karar verildikten sonra her veri giriş ekranının başlığına tek bir etiket eklenir:

- "Atölye beyanı": atölyenin girdiği, merkezin okuduğu veri.
- "Merkez kaydı": merkezin girdiği, atölyenin okuduğu veri.
- "Ortak": iki yönlü akış; ekranda kimin son yazdığı görünür.
