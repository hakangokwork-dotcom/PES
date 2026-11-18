---
tur: karar
durum: gecerli
tarih: 2026-11-18
guncelleme: 2026-11-18
kaynaklar: [docs/superpowers/specs/2026-11-17-is-emri-sap-operasyon-design.md, docs/superpowers/plans/2026-11-18-is-emri-surum-2a.md, supabase/migrations/064_is_ortagi_rota_plan_gecmisi.sql]
---
# İş emri operasyon yönetimi: iş ortağı, rota, plan geçmişi, sorun

## Bağlam
Kumaşçı, kesim, dikim, yıkama, UKP, baskı ve nakış ayrı firmalar olabilir. SAP tablo yapısı örnek alındı (MARA→model, LFA1→iş ortağı, PLKO/PLPO→rota şablonu, AUFK→iş emri, AFVC→aşama). Kullanıcı düzeltmesi: "ERP gibi davranmak istemiyorum, operasyonumu yönetmek istiyorum". Odak TNA: ne zaman neyi planladım, ne gerçekleşti, kalite istediğim gibi mi, sorun nerede.

## Karar (sürüm 2a, v1.20.0, migration 064)
- `is_ortagi` tek ana veri; tip listesi sabit. Her atölye otomatik bir "Atölye" ortağıdır (tetikleyici `workshop_ortak_ac`). Aynı adlı atölyeler ayrı ortak kalır.
- `rota_sablonu` / `rota_operasyonu` ana veri; `wo_rota_kur()` şablonu iş emrine kopyalar: eksik adımı ekler, var olan planı/gerçeği değiştirmez, boş firmayı doldurur. Atölye tipi adımın firması iş emrinin atölyesi olur.
- Firmayı merkez önerir; sevkte değişebilir (gerekçeyle, sürüm 2b).
- Plan tarihi elle girilir; her değişiklik `adim_plan_gecmisi`'ne yazılır (tetikleyici, değiştirilemez). İlk girişten sonraki değişiklikte gerekçe zorunlu (API 400). `v_is_emri_adim`: ilk plan, güncel plan, gerçek, revizyon sayısı, kayma ve gecikme.
- Sorunlar günlükte: `neden_kodu` (sorun_neden kataloğu) ve etki; pano `/pes/sorunlar`.
- Hafıza kuralı: kayıt silinmez, ezilmez; düzeltme yeni kayıtla yapılır. Miktar kuralları sert değil, uyarıdır.

## Seçilmeyenler ve neden
- Stok/defter mantığı (MSEG gibi): kullanıcı operasyon takibi istiyor, ERP değil.
- Firma tipine özel tablolar ve paneller (yıkamacı tablosu gibi): her yeni tip yeni tablo isterdi.
- Plan tarihini rota şablonundan hesaplamak: kullanıcı kararı elle giriş.

## Sonuçlar
- 2b: teslimat; kalem bazında kabul, red ve iade (ör. 13 topun 10'u kabul, 3'ü iade); kontrol listesi tamamlanması.
- 2c: firma hesapları ve `/ortak` paneli (`current_ortak_id`; atölye olmayan firmada `current_workshop_id = 0`).
- 2d: PO tabloları, pastal, demet, ölçüm.

## Dersler
- Yeni atölye artık bir `is_ortagi` satırı da açıyor. Atölye silme kontrolü (`lib/pes/workshop-baglantilar.ts`) bu satırı engel saymamalı; satır CASCADE ile silinir.
- `npm test` içindeki entegrasyon testleri (`DATABASE_URL` okuyanlar) üretim veritabanına ZZTEST kaydı yazıp siler. Ajanlara bu dosyalar hariç çalıştırılması söylenmeli.
- Merkez atölye paneline `/workshop/gir` ile girince `workshopId` dolu gelir; "yalnız merkez" kontrolü `atolyeSecimi`'ni de merkez saymalı.
