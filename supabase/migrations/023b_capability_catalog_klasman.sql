-- ============================================================
-- 023b_capability_catalog_klasman.sql
-- Klasman saha sözlüğünün (114 atölyeden toplanan) PES kataloğuna geçişi.
--
-- KAYNAK: C:\Users\bhaka\Desktop\Klasman\MEVCUT_DURUM\vocab.json
--
-- NEDEN: PES kataloğu dar kalmıştı (klasman 15, kumaş türü 18, makine 11) ve
--   "ana grup" boyutu hiç yoktu. Saha verisi 49 klasman / 33 kumaş türü /
--   15 makine terimi kullanıyor; import bu terimler olmadan yapılamaz.
--
-- İKİ İŞ:
--   1) ana_grup boyutu + eksik değerler (global katalog, tenant_id = NULL)
--   2) Mevcut etiketlerde kayıp Türkçe harflerin restorasyonu ("Gomlek" →
--      "Gömlek"). Bu etiketler yetenek arayüzünde kullanıcıya gösterilecek.
--      KODLAR DEĞİŞMEZ — line_capability.value_code onlara bağlı.
--
-- İDEMPOTENT: ON CONFLICT DO NOTHING; tekrar çalıştırmak güvenli.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ANA GRUP BOYUTU
-- ============================================================
-- Ürünün üst kategorisi (Denim / Dokuma Alt / Dokuma Üst / Dış Giyim …).
-- Klasman'ın üstünde bir kırılım olduğu için sort_order = 0.
INSERT INTO capability_dimension (code, label, applies_to, sort_order, tenant_id)
VALUES ('ana_grup', 'Ana Grup', NULL, 0, NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. EKSİK DEĞERLER
-- ============================================================
-- ana_grup: 6 yeni değer
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, x.code, x.label, x.so, NULL
FROM capability_dimension d
CROSS JOIN (VALUES
    ('DENIM', 'Denim', 1),
    ('DOKUMA_ALT', 'Dokuma Alt', 2),
    ('DOKUMA_UST', 'Dokuma Üst', 3),
    ('DIS_GIYIM', 'Dış Giyim', 4),
    ('KAYAK_PANTOLONU', 'Kayak Pantolonu', 5),
    ('TAKIM', 'Takım', 6)
) AS x(code, label, so)
WHERE d.code = 'ana_grup'
ON CONFLICT (dimension_id, code) DO NOTHING;

-- klasman: 35 yeni değer
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, x.code, x.label, x.so, NULL
FROM capability_dimension d
CROSS JOIN (VALUES
    ('5_CEP', '5 Cep', 16),
    ('ATLET', 'Atlet', 17),
    ('BASIC_UST', 'Basic Üst', 18),
    ('BELI_LASTIKLI_PANTOLON', 'Beli Lastikli Pantolon', 19),
    ('BLAZER', 'Blazer', 20),
    ('BUSTIYER', 'Bustiyer', 21),
    ('CROP', 'Crop', 22),
    ('DOKUMA_TAKIM', 'Dokuma Takım', 23),
    ('ELDE_TAKMA_KEMER_BELI_LASTIKLI_CHINO', 'Elde Takma Kemer Beli Lastikli Chino', 24),
    ('ELDE_TAKMA_KEMER_CHINO_ORME_DOKUMA', 'Elde Takma Kemer Chino (Örme-Dokuma)', 25),
    ('ELDE_TAKMA_KEMER_CHINO_FERMUARLI', 'Elde Takma Kemer Chino Fermuarlı', 26),
    ('HIRKA', 'Hırka', 27),
    ('JOGGER', 'Jogger', 28),
    ('KABAN', 'Kaban', 29),
    ('KAPUSONLU_GOMLEK', 'Kapüşonlu Gömlek', 30),
    ('KARGO_CEP', 'Kargo cep', 31),
    ('KAYAK_MONTU', 'Kayak Montu', 32),
    ('KIMONO', 'Kimono', 33),
    ('KLASIK_CHINO', 'Klasik Chino', 34),
    ('KOSTUM', 'Kostüm', 35),
    ('MANTO', 'Manto', 36),
    ('MODELLI_ALT', 'Modelli Alt', 37),
    ('MODELLI_UST', 'Modelli Üst', 38),
    ('MONT', 'Mont', 39),
    ('MONT_YELEK', 'Mont Yelek', 40),
    ('PARDESU', 'Pardesü', 41),
    ('SALOPET_ETEK', 'Salopet Etek', 42),
    ('T_SHIRT', 'T-shirt', 43),
    ('TAKIM_ELBISE', 'Takım-Elbise', 44),
    ('TAKIM_ORME', 'Takım-Örme', 45),
    ('TRENCKOT', 'Trençkot', 46),
    ('UZUN_MONT', 'Uzun Mont', 47),
    ('YAGMURLUK', 'Yağmurluk', 48),
    ('YUZME_SORT', 'Yüzme Şort', 49),
    ('SORTETEK', 'Şortetek', 50)
) AS x(code, label, so)
WHERE d.code = 'klasman'
ON CONFLICT (dimension_id, code) DO NOTHING;

-- kumas_turu: 18 yeni değer
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, x.code, x.label, x.so, NULL
FROM capability_dimension d
CROSS JOIN (VALUES
    ('ARMURLU', 'Armürlü', 19),
    ('BURUMCUK', 'Bürümcük', 20),
    ('DIGER', 'Diğer', 21),
    ('HAVLU', 'Havlu', 22),
    ('INTERLOK', 'Interlok', 23),
    ('JAKAR', 'Jakar', 24),
    ('KETEN_GORUNUMLU', 'Keten Görünümlü', 25),
    ('KETEN_KARISIMLI', 'Keten Karışımlı', 26),
    ('KRINKLE', 'Krinkle', 27),
    ('RASEL', 'Raşel', 28),
    ('SELANIK', 'Selanik', 29),
    ('SHALLY', 'Shally', 30),
    ('SUNI_DERI', 'Suni Deri', 31),
    ('SUET', 'Süet', 32),
    ('TUL', 'Tül', 33),
    ('TUVIT', 'Tüvit', 34),
    ('VUAL', 'Vual', 35),
    ('CIFT_YUZLU', 'Çift Yüzlü', 36)
) AS x(code, label, so)
WHERE d.code = 'kumas_turu'
ON CONFLICT (dimension_id, code) DO NOTHING;

-- makine_parkuru: 8 yeni değer
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, x.code, x.label, x.so, NULL
FROM capability_dimension d
CROSS JOIN (VALUES
    ('BANT_BICAK', 'Bant Bıçak', 12),
    ('DUZ_MAKINE', 'Düz Makine', 13),
    ('DUZ_MAKINE_TRANSFER_PRESI', 'Düz Makine Transfer Presi', 14),
    ('LASTIK_MAKINESI', 'Lastik Makinesi', 15),
    ('OTOMAT', 'Otomat', 16),
    ('OVERLOK', 'Overlok', 17),
    ('TRANSFER_PRESI', 'Transfer Presi', 18),
    ('CITCIT_PRESI', 'Çıtçıt Presi', 19)
) AS x(code, label, so)
WHERE d.code = 'makine_parkuru'
ON CONFLICT (dimension_id, code) DO NOTHING;

-- ============================================================
-- 3. ETİKET RESTORASYONU (yalnız global satırlar)
-- ============================================================
-- Tenant'a özel satırlara dokunulmaz; onları tenant kendi yazmıştır.
UPDATE capability_value v
SET label = x.label
FROM capability_dimension d,
     (VALUES
       ('cinsiyet_yas', 'KADIN', 'Kadın'),
       ('cinsiyet_yas', 'KIZ_COCUK', 'Kız Çocuk'),
       ('cinsiyet_yas', 'ERKEK_COCUK', 'Erkek Çocuk'),
       ('cinsiyet_yas', 'KIZ_BEBEK', 'Kız Bebek'),
       ('kumas_grubu', 'ORME', 'Örme'),
       ('klasman', 'GOMLEK', 'Gömlek'),
       ('klasman', 'TAKIM', 'Takım'),
       ('klasman', 'SORT', 'Şort'),
       ('kumas_turu', 'MUSLIN', 'Müslin'),
       ('kumas_turu', 'SIFON', 'Şifon'),
       ('kol_turu', 'ASKILI', 'Askılı'),
       ('kol_turu', 'KISA_KOLLU', 'Kısa Kollu'),
       ('yaka_turu', 'GOMLEK_YAKA', 'Gömlek Yaka'),
       ('yaka_turu', 'KACIK_YAKA', 'Kaçık Yaka'),
       ('yaka_turu', 'KAYIK_YAKA', 'Kayık Yaka'),
       ('yaka_turu', 'SAL_YAKA', 'Şal Yaka'),
       ('siluet', 'KLOC', 'Kloş'),
       ('cep_turu', 'TORBALI', 'Torbalı'),
       ('cep_turu', 'KORUKLU', 'Körüklü'),
       ('cep_turu', 'KAPAKLI', 'Kapaklı'),
       ('makine_parkuru', 'CEP_OTOMATI', 'Cep Otomatı'),
       ('makine_parkuru', 'KOPRU_OTOMATI', 'Köprü Otomatı'),
       ('makine_parkuru', 'OVERLOK_4I', 'Overlok 4 İplik'),
       ('makine_parkuru', 'OVERLOK_5I', 'Overlok 5 İplik'),
       ('makine_parkuru', 'ILIK', 'İlik'),
       ('makine_parkuru', 'RECME', 'Reçme'),
       ('makine_parkuru', 'CIFT_IGNE', 'Çift İğne')
     ) AS x(dim, code, label)
WHERE v.dimension_id = d.id
  AND d.code = x.dim
  AND v.code = x.code
  AND v.tenant_id IS NULL;

-- ============================================================
-- 4. BOYUT ETİKETLERİ
-- ============================================================
-- Değerlerle aynı sorun: boyut başlıkları da Türkçe harfleri kaybetmiş
-- ("Kumas Turu"). Bunlar yetenek ekranında sütun/bölüm başlığı olarak çıkar.
UPDATE capability_dimension d
SET label = x.label
FROM (VALUES
       ('cinsiyet_yas', 'Cinsiyet / Yaş'),
       ('kumas_grubu',  'Kumaş Grubu'),
       ('kumas_turu',   'Kumaş Türü'),
       ('kol_turu',     'Kol Türü'),
       ('yaka_turu',    'Yaka Türü'),
       ('kalip_turu',   'Kalıp Türü'),
       ('siluet',       'Silüet'),
       ('cep_turu',     'Cep Türü')
     ) AS x(code, label)
WHERE d.code = x.code
  AND d.tenant_id IS NULL;

COMMIT;
