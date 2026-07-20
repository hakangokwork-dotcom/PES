# Konfeksiyon Operasyon Hiyerarşisi — İlişkisel Veri Modeli

## 1. Özet

Orijinal dosya: `KONFEKSİYON_OPERASYONLARI.xlsx` — 46.244 satır, 6 sütunlu düz yapı.

Yeni yapı: **7 tabloluk ilişkisel model**. Toplam 33.798 satır (yaklaşık %27 daralma ve veri kalitesi sinyali eklendi).

| Tablo | Satır | Rol |
|---|---|---|
| `urun_tipi` | 117 | Klasman — attribute'lara ayrıştırılmış |
| `ek_parca_tipi` | 464 | Ek parçaların **base** adları |
| `ek_parca_varyant` | 1.270 | Özellikleriyle tam varyantlar |
| `operasyon_grup` | 273 | Operasyon grupları |
| `operasyon` | 1.338 | Atomik alt operasyonlar |
| `makine_tipi` | 17 | Placeholder — tohum veri |
| `operasyon_zamani` | 30.319 | **Ana tablo** — MTM değerleri |

---

## 2. Yapılan Dönüşümler

### Temizlik
- `Bölge` sütunu kaldırıldı.
- 3.805 tam duplike satır + 284 MTM=0 kaydı atıldı.
- Typo düzeltmeleri: `İlik Açama → İlik Açma`, `BASİC → BASIC`, `Düğme Dikme → Düğme Dikim`.
- Tab/trailing space temizliği yapıldı.

### Yapısal
- **Klasman ayrıştırması**: `"KEY DOKUMA GOMLEK U.KOL"` → `segment=KEY, kumas_grubu=DOKUMA, urun_grubu=GOMLEK, kol_tipi=UZUN_KOL`.
- **Ek parça ayrıştırması**: `"Kendinden Dönüşlü Pat (Dikişli)(Ekoseli)"` → base `"Kendinden Dönüşlü Pat"` + özellikler `"Dikişli | Ekoseli"`. 1.270 varyant, 464 base'e indi. UI'da önce base, sonra varyant seçimi mümkün hale geldi.
- **MTM agregasyonu**: Aynı `(urun_tipi, ek_parca, op_grup, operasyon)` anahtarının birden fazla MTM değeri varsa **medyan** baz alındı; min, max, std, örneklem sayısı ve güven seviyesi ayrıca tutuldu.

### MTM güven seviyesi (otomatik etiketlendi)

| Seviye | Kural | Sayı |
|---|---|---|
| `TEK_OLCUM` | Sadece 1 ölçüm var | 21.595 |
| `YUKSEK` | Varyasyon katsayısı < %5 | 4.824 |
| `ORTA` | %5 ≤ VK < %20 | 1.861 |
| `DUSUK` | VK ≥ %20 — sahada doğrulanmalı | 2.039 |

**Öncelikli aksiyon:** 2.039 `DUSUK` kayıt şüpheli — ya farklı operatör/atölye ölçümlerinden ya da hatalı veriden geliyor. Saha sürümünde önce bunlar doğrulanmalı.

---

## 3. PostgreSQL Şeması

```sql
-- =============================================
-- KONFEKSİYON OPERASYON HİYERARŞİSİ
-- PostgreSQL 14+
-- =============================================

-- 1. URUN_TIPI (Klasman) -----------------------
CREATE TABLE urun_tipi (
    id           SERIAL PRIMARY KEY,
    klasman_ad   VARCHAR(200) NOT NULL UNIQUE,
    segment      VARCHAR(20),    -- BASIC, CV, KEY, HAMILE, CLASSIC, FORMAL, UNCV, SIK
    kumas_grubu  VARCHAR(30),    -- DOKUMA, DENIM, DENIM_DUVAR, PU, NAYLON, NAYLON_PUFFER,
                                 -- SENTETIK, PAMUKLU, KASE, DOKUMA_EKOSELI, DOKUMA_CIZGILI,
                                 -- DOKUMA_BASKILI
    urun_grubu   VARCHAR(30),    -- GOMLEK, PANTOLON, ELBISE, MONT, ETEK, CEKET, vb.
    kol_tipi     VARCHAR(20),    -- UZUN_KOL, KISA_KOL, KOLSUZ
    ozellik      VARCHAR(20),    -- INCE, ORTA, KALIN
    aktif        BOOLEAN DEFAULT TRUE,
    olusturma    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_urun_tipi_segment ON urun_tipi(segment);
CREATE INDEX idx_urun_tipi_urun_grubu ON urun_tipi(urun_grubu);


-- 2. EK_PARCA_TIPI (Base) ----------------------
CREATE TABLE ek_parca_tipi (
    id        SERIAL PRIMARY KEY,
    ad        VARCHAR(200) NOT NULL UNIQUE,
    aktif     BOOLEAN DEFAULT TRUE
);


-- 3. EK_PARCA_VARYANT --------------------------
CREATE TABLE ek_parca_varyant (
    id                 SERIAL PRIMARY KEY,
    ek_parca_tipi_id   INTEGER NOT NULL REFERENCES ek_parca_tipi(id),
    tam_ad             VARCHAR(400) NOT NULL UNIQUE,
    ozellikler         TEXT,    -- "Dikişli | Ekoseli" gibi pipe-ayırmalı
    aktif              BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_varyant_tipi ON ek_parca_varyant(ek_parca_tipi_id);


-- 4. OPERASYON_GRUP ----------------------------
CREATE TABLE operasyon_grup (
    id     SERIAL PRIMARY KEY,
    ad     VARCHAR(200) NOT NULL UNIQUE,
    aktif  BOOLEAN DEFAULT TRUE
);


-- 5. MAKINE_TIPI (placeholder) -----------------
CREATE TABLE makine_tipi (
    id         SERIAL PRIMARY KEY,
    ad         VARCHAR(100) NOT NULL UNIQUE,
    aciklama   TEXT,
    aktif      BOOLEAN DEFAULT TRUE
);


-- 6. OPERASYON (Alt Operasyon) -----------------
CREATE TABLE operasyon (
    id              SERIAL PRIMARY KEY,
    ad              VARCHAR(200) NOT NULL UNIQUE,
    makine_tipi_id  INTEGER REFERENCES makine_tipi(id),   -- NULL: atanmadı
    skill_level     VARCHAR(20),    -- JUNIOR, SENIOR, EXPERT
    setup_suresi    NUMERIC(8,2),   -- dakika cinsinden
    aciklama        TEXT,
    aktif           BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_operasyon_makine ON operasyon(makine_tipi_id);


-- 7. OPERASYON_ZAMANI (Ana tablo) --------------
CREATE TABLE operasyon_zamani (
    id                     SERIAL PRIMARY KEY,
    urun_tipi_id           INTEGER NOT NULL REFERENCES urun_tipi(id),
    ek_parca_varyant_id    INTEGER NOT NULL REFERENCES ek_parca_varyant(id),
    operasyon_grup_id      INTEGER NOT NULL REFERENCES operasyon_grup(id),
    operasyon_id           INTEGER NOT NULL REFERENCES operasyon(id),
    mtm                    NUMERIC(10,3) NOT NULL,  -- baz değer (medyan)
    mtm_min                NUMERIC(10,3),
    mtm_max                NUMERIC(10,3),
    mtm_ortalama           NUMERIC(10,3),
    mtm_std                NUMERIC(10,3),
    orneklem               INTEGER DEFAULT 1,
    varyasyon_yuzde        NUMERIC(6,2),
    guven_seviyesi         VARCHAR(20),   -- TEK_OLCUM, YUKSEK, ORTA, DUSUK
    son_guncelleme         TIMESTAMP DEFAULT NOW(),
    UNIQUE (urun_tipi_id, ek_parca_varyant_id, operasyon_grup_id, operasyon_id)
);
CREATE INDEX idx_oz_urun ON operasyon_zamani(urun_tipi_id);
CREATE INDEX idx_oz_varyant ON operasyon_zamani(ek_parca_varyant_id);
CREATE INDEX idx_oz_operasyon ON operasyon_zamani(operasyon_id);
CREATE INDEX idx_oz_guven ON operasyon_zamani(guven_seviyesi);


-- =============================================
-- İLERİDE EKLENECEK TABLOLAR (tohum)
-- =============================================

-- 8. MTM_OLCUM_GECMIS (saha verisi, ML için)
-- Her yeni ölçüm burada kalır, operasyon_zamani periyodik recompute eder
CREATE TABLE mtm_olcum_gecmis (
    id                     SERIAL PRIMARY KEY,
    operasyon_zamani_id    INTEGER REFERENCES operasyon_zamani(id),
    mtm                    NUMERIC(10,3) NOT NULL,
    olcum_tarihi           DATE NOT NULL,
    atolye_id              INTEGER,          -- workshop referansı (henüz yok)
    operator_id            INTEGER,          -- operator referansı (henüz yok)
    vardiya                VARCHAR(10),
    not_                   TEXT
);

-- 9. OPERASYON_ONCELIK (precedence - ileride)
-- Hangi operasyon hangisinden önce yapılmalı?
CREATE TABLE operasyon_oncelik (
    id                   SERIAL PRIMARY KEY,
    urun_tipi_id         INTEGER REFERENCES urun_tipi(id),
    oncul_operasyon_id   INTEGER REFERENCES operasyon(id),
    ardil_operasyon_id   INTEGER REFERENCES operasyon(id),
    zorunlu              BOOLEAN DEFAULT TRUE,
    UNIQUE (urun_tipi_id, oncul_operasyon_id, ardil_operasyon_id)
);
```

---

## 4. Örnek Sorgular

### Bir model/klasmanın tüm operasyonları ve toplam SMV'si
```sql
SELECT
    ut.klasman_ad,
    epv.tam_ad AS ek_parca,
    og.ad AS operasyon_grup,
    op.ad AS operasyon,
    oz.mtm,
    oz.guven_seviyesi
FROM operasyon_zamani oz
JOIN urun_tipi ut         ON oz.urun_tipi_id = ut.id
JOIN ek_parca_varyant epv ON oz.ek_parca_varyant_id = epv.id
JOIN operasyon_grup og    ON oz.operasyon_grup_id = og.id
JOIN operasyon op         ON oz.operasyon_id = op.id
WHERE ut.klasman_ad = 'KEY DOKUMA GOMLEK U.KOL'
ORDER BY og.ad, op.ad;
```

### Düşük güven seviyeli kayıtlar (saha doğrulama için)
```sql
SELECT ut.klasman_ad, epv.tam_ad, op.ad, oz.mtm, oz.mtm_min, oz.mtm_max, oz.varyasyon_yuzde
FROM operasyon_zamani oz
JOIN urun_tipi ut         ON oz.urun_tipi_id = ut.id
JOIN ek_parca_varyant epv ON oz.ek_parca_varyant_id = epv.id
JOIN operasyon op         ON oz.operasyon_id = op.id
WHERE oz.guven_seviyesi = 'DUSUK'
ORDER BY oz.varyasyon_yuzde DESC
LIMIT 100;
```

### Klasman bazlı toplam SMV
```sql
SELECT ut.klasman_ad,
       ROUND(SUM(oz.mtm)::numeric, 2) AS toplam_mtm,
       COUNT(*) AS operasyon_sayisi
FROM operasyon_zamani oz
JOIN urun_tipi ut ON oz.urun_tipi_id = ut.id
GROUP BY ut.klasman_ad
ORDER BY toplam_mtm DESC;
```

---

## 5. Sonraki Adımlar

### Kısa Vade
1. `urun_tipi` tablosunda boş kalan ~20 satırın `segment`, `kumas_grubu` alanlarını elle tamamla (listesi Excel'de 01_urun_tipi sayfasında görünüyor).
2. `operasyon.makine_tipi_id` eşlemesini yap — en çok kullanılan 100 operasyon için başla, %80 kapsama sağlar.
3. `DUSUK` güven seviyeli 2.039 kaydı bir pilot atölyede yeniden ölçtür.

### Orta Vade
4. `mtm_olcum_gecmis` tablosu canlıya alındığında, saha ölçümleri buraya akar; gecelik bir job `operasyon_zamani` değerlerini yeni veriyle recompute eder.
5. Pilot bir klasman için (örn. `KEY DOKUMA GOMLEK U.KOL` — 1.696 satır ile en zengin) `operasyon_oncelik` tablosunu manuel veya yarı-otomatik doldur.

### Uzun Vade (ML)
6. `mtm_olcum_gecmis` yeterli hacme ulaştığında:
   - Her (atölye, operasyon) için beklenen MTM tahmini
   - Atölye performans normalizasyon faktörü (bir atölye ortalamanın %15 üstünde ölçüyorsa)
   - Kumaş/sezon faktörleri
7. Precedence kurallarını **process mining** ile çıkar: saha ölçümlerinin kronolojik sırasından operasyon akışı öğrenilebilir.

---

## 6. Dikkat Edilmesi Gereken Noktalar

- **Ek Parça varyantı vs base ayrımı UI'da kritik:** Atölye kullanıcısına önce 464 base gösterilir (örn. "Kendinden Dönüşlü Pat"), seçince 15-20 varyant çıkar. Aksi halde 1.270 elemanlı dropdown kullanılamaz.
- **`tam_ad` UNIQUE constraint ihlal edebilir:** Özellikleri aynı sırada olmayan iki varyant birbirine eş görünebilir (örn. `(A)(B)` vs `(B)(A)`). Veriyi yüklemeden önce özelliklerin sıralı şekilde normalize edilmesi gerekir. Mevcut veride bu sorun yok ama data entry'de oluşabilir.
- **`guven_seviyesi` değerleri DENORMALIZE:** Her yeni ölçüm geldiğinde recompute edilmeli. Bir trigger ya da gece job'ı ile çözülür.
- **`operasyon.ad` UNIQUE:** 1.338 benzersiz alt operasyon var, ama saha veri girişinde "Yaka Takma" ve "Yaka Takmak" gibi varyasyonlar oluşabilir. Kullanıcı arayüzünde mutlaka autocomplete + var olanı seç mantığı olmalı, serbest metin kabul edilmemeli.
