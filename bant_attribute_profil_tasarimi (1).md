# Bant Attribute Profili & Kapasite Analizi — Revize Tasarım

## 1. Temel Kavram

```
Bir bandın attribute seti = o bandın YAPABİLECEĞİ iş zarfı (capability envelope)

Örnek — Bant 1, Şükür Tekstil:
  Cinsiyet/Yaş  : [Kadın, Kız Çocuk]
  Klasman       : [Elbise, Bluz, Gömlek]
  Kumaş Grubu   : [Dokuma]
  Kumaş Türü    : [Müslin, Gabardin, Poplin, Tencel]
  Kol Türü      : [Askılı, Kısa Kollu, Kolsuz, Uzun Kollu]
  Yaka Türü     : [V Yaka, U Yaka, Bisiklet Yaka, Kaçık Yaka, Kayık Yaka]

→ Bu bant "Kız Çocuk / Elbise / Müslin / Kısa Kollu / V Yaka" yapabilir  ✓
→ Bu bant "Kadın / Gömlek / Gabardin / Uzun Kollu / Gömlek Yaka" yapabilir ✓
→ Bu bant "Erkek / Pantolon / Denim" yapabilir  ✗  (zarfın dışında)

Üretim planında bant her hafta tek tipe odaklanır.
Ama zarfı genişse ilerleyen haftalarda farklı bir tipe kaydırılabilir.
```

---

## 2. Veri Modeli

### 2.1 Dimension Tanımları (Sabit Lookup Tablosu)

```sql
-- Hiyerarşideki her boyut ve alabileceği değerler
CREATE TABLE capability_dimensions (
  id        UUID PRIMARY KEY,
  code      VARCHAR(40) UNIQUE NOT NULL,   -- 'cinsiyet', 'klasman', 'kumas_turu' ...
  label     VARCHAR(60),                   -- 'Cinsiyet / Yaş', 'Klasman', 'Kumaş Türü'
  applies_to VARCHAR(60)[],               -- ['ELBISE','BLUZ','GOMLEK'] veya NULL=hepsi
  sort_order INTEGER
);

CREATE TABLE capability_dimension_values (
  id            UUID PRIMARY KEY,
  dimension_id  UUID REFERENCES capability_dimensions(id),
  code          VARCHAR(50) UNIQUE NOT NULL,  -- 'KADIN', 'ELBISE', 'MUSLIN', 'V_YAKA'
  label         VARCHAR(80),                  -- 'Kadın', 'Elbise', 'Müslin', 'V Yaka'
  parent_code   VARCHAR(50),                  -- Üst boyutla kısıtlama (opsiyonel)
  sort_order    INTEGER
);
```

Seed data — Dimension'lar ve değerleri (dosyadan çıkarılan):

```
dimension          | values
───────────────────┼──────────────────────────────────────────────────────
cinsiyet_yas       | KADIN · ERKEK · KIZ_BEBEK · ERKEK_BEBEK ·
                   | KIZ_COCUK · ERKEK_COCUK
───────────────────┼──────────────────────────────────────────────────────
klasman            | ELBISE · SALOPET · BODY · TAKIM · BLUZ · PANTOLON ·
                   | SORT · ETEK · TUNIK · GOMLEK · CEKET · BERMUDA ·
                   | KAPRI · TULUM · YELEK ...
───────────────────┼──────────────────────────────────────────────────────
kumas_grubu        | DOKUMA · ORME · DENIM
───────────────────┼──────────────────────────────────────────────────────
kumas_turu         | MUSLIN · GABARDIN · POPLIN · VISKON · SATEN · GOFRE ·
                   | TENCEL · DENIM · SUPREM · KADIFE · POLYESTER · POLAR ·
                   | VUAL · ARMURLU · DANTEL · BRODE · BURUMCUK ·
                   | CIFT_YUZLU · KETEN · KREP · KRINKLE · PENYE · RASEL ·
                   | SELANIK · SHALLY · SUNI_DERI · SUET · SIFON · TUL ·
                   | TUVIT · INTERLOCK · JAKAR · HAVLU
───────────────────┼──────────────────────────────────────────────────────
kol_turu           | ASKILI · KISA_KOLLU · KOLSUZ · UZUN_KOLLU · TRUVAKAR
  applies_to →     | ELBISE, BLUZ, GOMLEK, TUNIK, TAKIM
───────────────────┼──────────────────────────────────────────────────────
yaka_turu          | V_YAKA · U_YAKA · KACIK_YAKA · BISIKLET_YAKA ·
                   | GOMLEK_YAKA · SAL_YAKA · KAYIK_YAKA · HAKIM_YAKA ·
                   | DUGMELI_GOMLEK_YAKA · KARE_YAKA
  applies_to →     | ELBISE, BLUZ, GOMLEK, TUNIK
───────────────────┼──────────────────────────────────────────────────────
kalip_turu         | BAGGY · BOYFRIEND · CARROT · DAR_SLIM · JOGGER ·
                   | LOOSE_BOL · MOM_FIT · SIGARET · WIDELEG · STRAIGHT
  applies_to →     | PANTOLON
───────────────────┼──────────────────────────────────────────────────────
siluet             | A_KESIM · BALIK_ETEK · BALON · BELDEN_OTURTMA ·
                   | FIRFIRLI · KLOC · PILELI · 5_CEP · FLARE · JUPITER ·
                   | KARGO · MARS · MERCURY · PALAZZO
  applies_to →     | ETEK, SORT, PANTOLON
───────────────────┼──────────────────────────────────────────────────────
cep_turu           | 5_CEP · FLETO · TORBALI · KORUKLU · KAPAKLI
  applies_to →     | PANTOLON, SORT
───────────────────┼──────────────────────────────────────────────────────
makine_parkuru     | CEP_OTOMATI · KOPRU_OTOMATI · SINGER · OVERLOK_4I ·
                   | OVERLOK_5I · ILIK · RECME · PUNTERIZ · CIFT_IGNE ·
                   | KEMER_MAKINESI · FLETO
```

---

### 2.2 Bant Tablosu

```sql
CREATE TABLE workshop_lines (
  id              UUID PRIMARY KEY,
  workshop_id     UUID REFERENCES workshops(id),
  line_code       VARCHAR(20),        -- 'B1', 'B2', 'A-HATTI' ...
  line_name       VARCHAR(80),        -- 'Bant 1', 'Denim Hattı' ...
  worker_count    INTEGER,
  shift_hours     DECIMAL(4,1),
  days_per_week   INTEGER DEFAULT 5,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);
-- Teorik haftalık kapasite (dakika) = worker_count × shift_hours × 60 × days_per_week
-- Teorik adet = hesap zamanında: kapasiteDk × verimlilik / model_std_süresi
```

---

### 2.3 Bant Attribute Profili ← Yeni Yapı

```sql
CREATE TABLE line_capability_attributes (
  id              UUID PRIMARY KEY,
  line_id         UUID REFERENCES workshop_lines(id),
  dimension_code  VARCHAR(40),        -- 'cinsiyet_yas' | 'klasman' | 'kumas_turu' ...
  value_code      VARCHAR(50),        -- 'KADIN' | 'ELBISE' | 'MUSLIN' ...
  --
  -- Bu attribute bandın profil tanımı mı, yoksa o haftaki aktif atama mı?
  -- Profil = kalıcı yetkinlik, Atama = o dönem için fiili kullanım
  attribute_type  VARCHAR(10) DEFAULT 'PROFILE',  -- 'PROFILE' | 'ASSIGNED'
  --
  valid_from      DATE,               -- NULL = her zaman geçerli
  valid_to        DATE,               -- NULL = süresiz
  created_by      UUID,
  created_at      TIMESTAMP DEFAULT NOW(),
  --
  UNIQUE (line_id, dimension_code, value_code, attribute_type)
);
```

**Örnek — Şükür Tekstil Bant 1 profili:**

```
line_id | dimension_code  | value_code      | type
────────┼─────────────────┼─────────────────┼─────────
B1_SUKR | cinsiyet_yas    | KADIN           | PROFILE
B1_SUKR | cinsiyet_yas    | KIZ_COCUK       | PROFILE
B1_SUKR | klasman         | ELBISE          | PROFILE
B1_SUKR | klasman         | BLUZ            | PROFILE
B1_SUKR | klasman         | GOMLEK          | PROFILE
B1_SUKR | kumas_grubu     | DOKUMA          | PROFILE
B1_SUKR | kumas_turu      | MUSLIN          | PROFILE
B1_SUKR | kumas_turu      | GABARDIN        | PROFILE
B1_SUKR | kumas_turu      | POPLIN          | PROFILE
B1_SUKR | kumas_turu      | TENCEL          | PROFILE
B1_SUKR | kol_turu        | ASKILI          | PROFILE
B1_SUKR | kol_turu        | KISA_KOLLU      | PROFILE
B1_SUKR | kol_turu        | KOLSUZ          | PROFILE
B1_SUKR | kol_turu        | UZUN_KOLLU      | PROFILE
B1_SUKR | yaka_turu       | V_YAKA          | PROFILE
B1_SUKR | yaka_turu       | U_YAKA          | PROFILE
B1_SUKR | yaka_turu       | BISIKLET_YAKA   | PROFILE
B1_SUKR | makine_parkuru  | CEP_OTOMATI     | PROFILE
B1_SUKR | makine_parkuru  | SINGER          | PROFILE
B1_SUKR | makine_parkuru  | OVERLOK_5I      | PROFILE
B1_SUKR | makine_parkuru  | PUNTERIZ        | PROFILE
```

---

### 2.4 Haftalık Bant Kullanımı (Planlama)

```sql
CREATE TABLE line_weekly_assignments (
  id              UUID PRIMARY KEY,
  line_id         UUID REFERENCES workshop_lines(id),
  week_start      DATE,               -- o haftanın Pazartesi tarihi
  --
  -- O hafta bu bant ne üretiyor? (tek fokus)
  klasman_code    VARCHAR(50),        -- 'ELBISE'
  order_ref       VARCHAR(80),        -- sipariş/koleksiyon kodu
  model_code      VARCHAR(80),        -- model kodu (isteğe bağlı)
  --
  -- Kapasite girdileri
  std_time_min    DECIMAL(6,2),       -- bu modelin STD süresi (dk)
  efficiency_rate DECIMAL(4,2),       -- verimlilik katsayısı (0.55–0.77 arası)
  --
  -- Snapshot (bant bilgileri o an ne durumdaysa)
  worker_count    INTEGER,
  shift_hours     DECIMAL(4,1),
  days_in_week    INTEGER,
  --
  -- Hesaplanan kapasite
  -- planned_qty = (worker_count × shift_hours × 60 × days_in_week × eff_rate) / std_time_min
  planned_qty     INTEGER GENERATED ALWAYS AS (
    ROUND((worker_count * shift_hours * 60 * days_in_week * efficiency_rate) / std_time_min)
  ) STORED,
  actual_qty      INTEGER,            -- haftanın sonunda güncellenir
  --
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Capability Envelope Sorgusu

### 3.1 "Bu bant ne yapabilir?" — Profil Özeti

```sql
-- Bir bandın tüm attribute'larını dimension bazında grupla
SELECT
  d.label                          AS boyut,
  STRING_AGG(dv.label, ' · ' ORDER BY dv.sort_order) AS yapabilecekleri
FROM line_capability_attributes lca
JOIN capability_dimensions d      ON d.code = lca.dimension_code
JOIN capability_dimension_values dv ON dv.code = lca.value_code
WHERE lca.line_id = :line_id
  AND lca.attribute_type = 'PROFILE'
GROUP BY d.label, d.sort_order
ORDER BY d.sort_order;
```

Çıktı örneği:
```
Boyut             │ Yapabilecekleri
──────────────────┼──────────────────────────────────────────────────────
Cinsiyet / Yaş    │ Kadın · Kız Çocuk
Klasman           │ Elbise · Bluz · Gömlek
Kumaş Grubu       │ Dokuma
Kumaş Türü        │ Müslin · Gabardin · Poplin · Tencel · Kadife
Kol Türü          │ Askılı · Kısa Kollu · Kolsuz · Uzun Kollu
Yaka Türü         │ V Yaka · U Yaka · Bisiklet Yaka · Kaçık Yaka
Makine Parkuru    │ Cep Otomatı · Singer · Overlok 5i · Punteriz
```

### 3.2 "Tüm ağda Elbise yapabilecek kaç bantım var?" — Kapasite Analizi

```sql
SELECT
  w.name                                                  AS atolye,
  wl.line_name                                            AS bant,
  wl.worker_count,
  wl.shift_hours,
  -- Teorik haftalık kapasite (dakika)
  wl.worker_count * wl.shift_hours * 60 * wl.days_per_week AS kapasite_dk
FROM workshop_lines wl
JOIN workshops w ON w.id = wl.workshop_id
WHERE wl.is_active = TRUE
  AND wl.id IN (
    SELECT DISTINCT line_id
    FROM line_capability_attributes
    WHERE dimension_code = 'klasman'
      AND value_code = 'ELBISE'
      AND attribute_type = 'PROFILE'
  )
ORDER BY w.name, wl.line_code;
```

### 3.3 "Klasman bazında toplam kapasite payları"

```sql
WITH klasman_lines AS (
  SELECT
    lca.value_code                              AS klasman,
    SUM(wl.worker_count * wl.shift_hours * 60
        * wl.days_per_week)                     AS toplam_kapasite_dk
  FROM line_capability_attributes lca
  JOIN workshop_lines wl ON wl.id = lca.line_id
  WHERE lca.dimension_code = 'klasman'
    AND lca.attribute_type = 'PROFILE'
    AND wl.is_active = TRUE
  GROUP BY lca.value_code
),
total AS (SELECT SUM(toplam_kapasite_dk) AS genel_toplam FROM klasman_lines)
SELECT
  dv.label                                      AS klasman,
  kl.toplam_kapasite_dk / 60                    AS kapasite_saat,
  ROUND(kl.toplam_kapasite_dk * 100.0
        / t.genel_toplam, 1)                    AS pay_pct
FROM klasman_lines kl
JOIN total t ON TRUE
JOIN capability_dimension_values dv ON dv.code = kl.klasman
ORDER BY kl.toplam_kapasite_dk DESC;
```

---

## 4. UX Akışı — Bant Attribute Profili Tanımlama Ekranı

### Adım 1: Atölye seç → Bantlarını listele

```
Atölye: Şükür Tekstil
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bant 1   9 kişi  8.5 saat    [Profil Düzenle] [Kopyala]
  Bant 2   7 kişi  8.5 saat    [Profil Düzenle] [Kopyala]
  Bant 3   5 kişi  8.5 saat    [Profil Düzenle] [Kopyala]
  [+ Yeni Bant Ekle]
```

### Adım 2: Bant Profili — Boyut Bazlı Çoklu Seçim

```
BANT PROFİLİ: Bant 1 — Şükür Tekstil
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CİNSİYET / YAŞ
  [x] Kadın    [x] Kız Çocuk    [ ] Kız Bebek
  [ ] Erkek    [ ] Erkek Çocuk  [ ] Erkek Bebek

KLASMAN
  [x] Elbise   [x] Bluz   [x] Gömlek   [ ] Pantolon
  [ ] Etek     [ ] Şort   [ ] Salopet   [ ] Tulum
  [ ] Ceket    [ ] Takım  [ ] Tunik

KUMAŞ GRUBU
  [x] Dokuma   [ ] Örme   [ ] Denim

KUMAŞ TÜRÜ                                   [Tümünü Seç]
  [x] Müslin       [x] Gabardin    [x] Poplin
  [x] Tencel       [x] Kadife      [ ] Denim
  [ ] Süprem       [ ] Viskon      [x] Saten
  [ ] Polar        [ ] Vual        [x] Gofre
  ... (32 seçenek, arama destekli)

KOL TÜRÜ            ← Sadece seçilen klasmanlara (Elbise/Bluz/Gömlek) göre görünür
  [x] Askılı   [x] Kısa Kollu   [x] Kolsuz
  [x] Uzun Kollu   [ ] Truvakar Kol

YAKA TÜRÜ           ← Sadece seçilen klasmanlara göre görünür
  [x] V Yaka    [x] U Yaka    [x] Bisiklet Yaka
  [x] Kaçık Yaka   [ ] Gömlek Yaka   [x] Kayık Yaka
  [ ] Şal Yaka   [ ] Hakim Yaka   [ ] Düğmeli Gömlek Yaka
  [ ] Kare Yaka

MAKİNE PARKURU      ← Bu seçim diğer boyutları kısmen kısıtlar
  [x] Singer       [x] Overlok 5 iplik   [x] Cep Otomatı
  [x] Punteriz     [ ] Köprü Otomatı     [ ] İlik
  [x] Reçme        [x] Çift İğne         [x] Kemer Makinesi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÖZET: Bu bant 2 cinsiyet × 3 klasman × 5 kumaş türü kombinasyonunu yapabilir
      Tahmini profil karmaşıklığı: ORTA ✓

                             [İptal]  [Kaydet]
```

### Adım 3: Profil Özet Kartı (Kaydedince)

```
┌─────────────────────────────────────────────────────┐
│ BANT 1 — Şükür Tekstil              9 kişi / 8.5s  │
│                                                     │
│ Cinsiyet  : Kadın · Kız Çocuk                       │
│ Klasman   : Elbise · Bluz · Gömlek                  │
│ Kumaş     : Müslin · Gabardin · Poplin · Tencel ...  │
│ Kol       : Askılı · Kısa · Kolsuz · Uzun           │
│ Yaka      : V · U · Bisiklet · Kaçık · Kayık         │
│                                                     │
│ Teorik Kapasite    : 2.295 dk/hafta                 │
│ (STD süre girilince adet hesaplanır)                │
└─────────────────────────────────────────────────────┘
```

---

## 5. Kapasite Analizi Rapor Yapısı (4 Seviye)

### 5.1 Bant Bazlı Kırılım (En Detay)

```
HAFTA 16/2026 — BANT BAZLI KAPASİTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Atölye           Bant    Kişi  Kapasite  Bu Hafta Atandı    Kullanım
                                (dk)     Klasman    Adet
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Şükür Tekstil    Bant 1    9   22.950   Elbise      832      ─────── 73%
Şükür Tekstil    Bant 2    7   17.850   Pantolon    611      ─── 57%
Şükür Tekstil    Bant 3    5   12.750   Bluz        776      ────────── 85%
Lidatekstil      Bant 1    8   20.400   Elbise      750      ──────── 77%
Lidatekstil      Bant 2    6   15.300   Gömlek      490      ─── 53%
...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5.2 Atölye Bazlı Toplam

```
ATÖLYE KAPASİTE ÖZETİ
Atölye           Toplam dk   Plan Adet   Gerçek   Kullanım
─────────────────────────────────────────────────────────
Şükür Tekstil      53.550      2.219      1.940      88%
Lidatekstil        35.700      1.240      1.190      96%
Class Tekstil      28.900        980        920      94%
...
TOPLAM            487.000     17.840     16.200      91%
```

### 5.3 Hiyerarşi Bazlı Pay Analizi

```
KAPASİTE DAĞILIMI — KLASMANx CİNSİYET
(Tüm bantların PROFIL attribute'ları baz alınır)

               Kadın    Kız Çocuk  Kız Bebek  Erkek  Toplam   Pay
Elbise        54.200    28.100     12.300       —    94.600   31.2%
Pantolon      38.100    18.200      6.800    4.200   67.300   22.2%
Bluz          29.300    15.100      8.200       —    52.600   17.3%
Gömlek        21.800     9.400      3.100    1.800   36.100   11.9%
Etek          18.200    10.300      4.100       —    32.600   10.7%
Şort          12.100     6.800      2.200       —    21.100    7.0%
─────────────────────────────────────────────────────────────
TOPLAM       173.700    87.900     36.700    6.000  304.300  100%
```

### 5.4 Tüm Ağ Özeti (200 Atölye)

```
AĞ GENEL KAPASİTE — Nisan 2026

Toplam Aktif Bant     : 487 bant
Toplam Çalışan        : 4.280 kişi
Haftalık Kapasite     : 2.184.000 dk  ≈  36.400 saat

ANA GRUP PAYI:
  Dokuma Üst    ████████████████░░░░   43.2%   942.288 dk
  Dokuma Alt    ███████████░░░░░░░░░   30.6%   667.704 dk
  Denim         █████░░░░░░░░░░░░░░░   15.9%   347.256 dk
  Dış Giyim     ████░░░░░░░░░░░░░░░░   10.3%   224.952 dk

EN YÜKSEK KAPASİTE ← Profil attribute'larına göre
  1. Elbise (Dokuma/Müslin-Gabardin)    312.400 dk  — 87 bant
  2. Pantolon (Dokuma)                  224.800 dk  — 62 bant
  3. Bluz/Gömlek                        198.600 dk  — 54 bant
  4. Denim Pantolon                     186.200 dk  — 38 bant
  5. Etek                               142.000 dk  — 41 bant
```

---

## 6. Açık Sorular (Attribute Modeline Özel)

1. **Boyut null = tüm değerler mi?**
   Bir banda "kumaş türü" attribute'u hiç atanmazsa → "tüm kumaşları yapar" mı sayılacak, yoksa "tanımsız/eksik" mi? Öneri: zorunlu boyutlar (cinsiyet, klasman, kumaş grubu) doldurulmadan kayıt edilemesin.

2. **Attribute çakışma kontrolü**
   "Klasman = Pantolon seçildi ama Kol Türü attribute'u da dolu" → Pantolon'da kol boyutu anlamsız. UI bunu filtreli mı göstersin (applies_to mantığı), yoksa kullanıcı yine de ekleyebilir mi?

3. **Makine parkuru attribute'u kapasite hesabına giriyor mu?**
   Şu an kapasite hesabı sadece kişi × saat × verimlilik. Makinenin adet kapasitesi ayrıca bir darboğaz oluşturuyor mu? (Cep Otomatı varsa bant kapasitesini sınırlamıyor, sadece o ürünü yapabilmesini sağlıyor — bu doğru mu?)

4. **Verimlilik katsayısı bant bazında mı, model bazında mı?**
   Dosyadaki tablo (Sayfa1-3) sipariş adedine göre katsayı veriyor. Haftalık atamada bu katsayıyı kim ve nasıl giriyor?
```
