-- ============================================================
-- 023c_klasman_atolye_alanlari.sql
-- Klasman saha verisinin (114 atölye) PES'e girebilmesi için eksik alanlar.
--
-- SORUN: Klasman'ın atölye kolonlarının bir kısmının PES'te karşılığı yok.
--   Karşılıksız alanı notlara sıkıştırmak yerine kolon açıyoruz — veri
--   sorgulanabilir kalsın, sonradan filtre/segment için kullanılabilsin.
--
--   ATOLYE_TIPI  (CMT / CMT+Yıkama / Dikim / Kesim & Dikim)  → workshop.production_type
--   AYLIK_KAPASITE (adet/ay)                                 → workshop.monthly_capacity
--   GUVEN (Yüksek/Orta/Düşük)                                → workshop_account.data_confidence
--   kaynak izi ("Klasman B001")                              → workshop_account.source_ref
--   KAPASITE_NOTU                                            → workshop_account.notes (mevcut)
--   SORUMLU                                                  → workshop_contact  (mevcut)
--
-- NEDEN workshop.type KULLANILMADI: o kolon CHAR(1) A/B/C — atölyenin
--   SINIFI (segment). Üretim tipiyle ilgisi yok, sığmaz da.
--
-- workshop.type İÇİN 'X': Klasman verisinde sınıf bilgisi YOK. NOT NULL
--   olduğu için bir değer şart; 'B' veya 'C' yazmak veri uydurmak olurdu.
--   'X' = henüz sınıflandırılmamış. Sınıflandırma yapıldıkça A/B/C'ye geçer.
--
-- İDEMPOTENT: IF NOT EXISTS / kısıt önce düşürülür.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. WORKSHOP — üretim tipi ve aylık kapasite
-- ============================================================
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS production_type TEXT;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS monthly_capacity INTEGER;

-- Kısıtlar ayrı: kolon zaten varsa ALTER ... ADD COLUMN atlanır ve
-- CHECK'ler eklenmemiş kalırdı.
ALTER TABLE workshop DROP CONSTRAINT IF EXISTS workshop_production_type_check;
ALTER TABLE workshop ADD  CONSTRAINT workshop_production_type_check
    CHECK (production_type IS NULL OR production_type IN
           ('CMT','CMT+Yıkama','Dikim','Kesim & Dikim'));

ALTER TABLE workshop DROP CONSTRAINT IF EXISTS workshop_monthly_capacity_check;
ALTER TABLE workshop ADD  CONSTRAINT workshop_monthly_capacity_check
    CHECK (monthly_capacity IS NULL OR monthly_capacity >= 0);

COMMENT ON COLUMN workshop.production_type IS
  'Atölyenin üretim tipi (Klasman ATOLYE_TIPI). workshop.type ile karıştırma: o A/B/C sınıfıdır.';
COMMENT ON COLUMN workshop.monthly_capacity IS
  'Beyan edilen aylık kapasite (adet/ay). daily_target''e ÇEVRİLMEZ — ay içi çalışma günü sayısı bilinmiyor.';

-- ============================================================
-- 2. WORKSHOP.TYPE — "sınıflandırılmamış" değeri
-- ============================================================
ALTER TABLE workshop DROP CONSTRAINT IF EXISTS workshop_type_check;
ALTER TABLE workshop ADD  CONSTRAINT workshop_type_check
    CHECK (type IN ('A','B','C','X'));

COMMENT ON COLUMN workshop.type IS
  'Atölye sınıfı: A/B/C. X = henüz sınıflandırılmamış (dış kaynaktan içe aktarılmış kayıt).';

-- ============================================================
-- 3. WORKSHOP_ACCOUNT — veri güveni ve kaynak izi
-- ============================================================
ALTER TABLE workshop_account ADD COLUMN IF NOT EXISTS data_confidence TEXT;
ALTER TABLE workshop_account ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE workshop_account DROP CONSTRAINT IF EXISTS workshop_account_data_confidence_check;
ALTER TABLE workshop_account ADD  CONSTRAINT workshop_account_data_confidence_check
    CHECK (data_confidence IS NULL OR data_confidence IN ('Yüksek','Orta','Düşük'));

COMMENT ON COLUMN workshop_account.data_confidence IS
  'Bu atölye kaydındaki bilginin ne kadar güvenilir olduğu (Klasman GUVEN). Beyan kalite skorundan (022) FARKLI: o beyanı, bu kaydın kendisini niteler.';
COMMENT ON COLUMN workshop_account.source_ref IS
  'Kaydın dış kaynaktaki kimliği, ör. "Klasman B001". Yeniden içe aktarımda eşleştirme anahtarı.';

COMMIT;
