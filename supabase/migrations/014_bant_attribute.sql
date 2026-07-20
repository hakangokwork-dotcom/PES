-- Bant Attribute Profili — Yetenek Zarfi

CREATE TABLE IF NOT EXISTS capability_dimension (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40) UNIQUE NOT NULL,
  label       VARCHAR(60) NOT NULL,
  applies_to  TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS capability_value (
  id            SERIAL PRIMARY KEY,
  dimension_id  INTEGER NOT NULL REFERENCES capability_dimension(id) ON DELETE CASCADE,
  code          VARCHAR(50) NOT NULL,
  label         VARCHAR(80) NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  UNIQUE(dimension_id, code)
);

CREATE TABLE IF NOT EXISTS line_capability (
  id              SERIAL PRIMARY KEY,
  line_id         INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
  dimension_code  VARCHAR(40) NOT NULL,
  value_code      VARCHAR(50) NOT NULL,
  attribute_type  VARCHAR(10) DEFAULT 'PROFILE' CHECK (attribute_type IN ('PROFILE','ASSIGNED')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(line_id, dimension_code, value_code, attribute_type)
);
CREATE INDEX IF NOT EXISTS idx_linecap_line ON line_capability(line_id);
CREATE INDEX IF NOT EXISTS idx_linecap_dim ON line_capability(dimension_code, value_code);

-- SEED: Dimension tanimlari
INSERT INTO capability_dimension (code, label, applies_to, sort_order) VALUES
  ('cinsiyet_yas', 'Cinsiyet / Yas', NULL, 1),
  ('klasman', 'Klasman', NULL, 2),
  ('kumas_grubu', 'Kumas Grubu', NULL, 3),
  ('kumas_turu', 'Kumas Turu', NULL, 4),
  ('kol_turu', 'Kol Turu', 'ELBISE,BLUZ,GOMLEK,TUNIK,TAKIM', 5),
  ('yaka_turu', 'Yaka Turu', 'ELBISE,BLUZ,GOMLEK,TUNIK', 6),
  ('kalip_turu', 'Kalip Turu', 'PANTOLON,SORT,BERMUDA', 7),
  ('siluet', 'Siluet', 'ETEK,SORT,PANTOLON', 8),
  ('cep_turu', 'Cep Turu', 'PANTOLON,SORT', 9),
  ('makine_parkuru', 'Makine Parkuru', NULL, 10)
ON CONFLICT (code) DO NOTHING;

-- SEED: Dimension degerleri
INSERT INTO capability_value (dimension_id, code, label, sort_order)
SELECT d.id, v.code, v.label, v.sort_order FROM capability_dimension d,
(VALUES
  ('cinsiyet_yas', 'KADIN', 'Kadin', 1), ('cinsiyet_yas', 'ERKEK', 'Erkek', 2),
  ('cinsiyet_yas', 'KIZ_COCUK', 'Kiz Cocuk', 3), ('cinsiyet_yas', 'ERKEK_COCUK', 'Erkek Cocuk', 4),
  ('cinsiyet_yas', 'KIZ_BEBEK', 'Kiz Bebek', 5), ('cinsiyet_yas', 'ERKEK_BEBEK', 'Erkek Bebek', 6),
  ('klasman', 'ELBISE', 'Elbise', 1), ('klasman', 'BLUZ', 'Bluz', 2), ('klasman', 'GOMLEK', 'Gomlek', 3),
  ('klasman', 'PANTOLON', 'Pantolon', 4), ('klasman', 'ETEK', 'Etek', 5), ('klasman', 'SORT', 'Sort', 6),
  ('klasman', 'TUNIK', 'Tunik', 7), ('klasman', 'CEKET', 'Ceket', 8), ('klasman', 'SALOPET', 'Salopet', 9),
  ('klasman', 'TULUM', 'Tulum', 10), ('klasman', 'YELEK', 'Yelek', 11), ('klasman', 'TAKIM', 'Takim', 12),
  ('klasman', 'BERMUDA', 'Bermuda', 13), ('klasman', 'KAPRI', 'Kapri', 14), ('klasman', 'BODY', 'Body', 15),
  ('kumas_grubu', 'DOKUMA', 'Dokuma', 1), ('kumas_grubu', 'ORME', 'Orme', 2), ('kumas_grubu', 'DENIM', 'Denim', 3),
  ('kumas_turu', 'MUSLIN', 'Muslin', 1), ('kumas_turu', 'GABARDIN', 'Gabardin', 2), ('kumas_turu', 'POPLIN', 'Poplin', 3),
  ('kumas_turu', 'VISKON', 'Viskon', 4), ('kumas_turu', 'SATEN', 'Saten', 5), ('kumas_turu', 'GOFRE', 'Gofre', 6),
  ('kumas_turu', 'TENCEL', 'Tencel', 7), ('kumas_turu', 'DENIM', 'Denim', 8), ('kumas_turu', 'SUPREM', 'Suprem', 9),
  ('kumas_turu', 'KADIFE', 'Kadife', 10), ('kumas_turu', 'POLYESTER', 'Polyester', 11), ('kumas_turu', 'POLAR', 'Polar', 12),
  ('kumas_turu', 'KETEN', 'Keten', 13), ('kumas_turu', 'KREP', 'Krep', 14), ('kumas_turu', 'PENYE', 'Penye', 15),
  ('kumas_turu', 'SIFON', 'Sifon', 16), ('kumas_turu', 'BRODE', 'Brode', 17), ('kumas_turu', 'DANTEL', 'Dantel', 18),
  ('kol_turu', 'ASKILI', 'Askili', 1), ('kol_turu', 'KISA_KOLLU', 'Kisa Kollu', 2),
  ('kol_turu', 'KOLSUZ', 'Kolsuz', 3), ('kol_turu', 'UZUN_KOLLU', 'Uzun Kollu', 4), ('kol_turu', 'TRUVAKAR', 'Truvakar', 5),
  ('yaka_turu', 'V_YAKA', 'V Yaka', 1), ('yaka_turu', 'U_YAKA', 'U Yaka', 2),
  ('yaka_turu', 'BISIKLET_YAKA', 'Bisiklet Yaka', 3), ('yaka_turu', 'GOMLEK_YAKA', 'Gomlek Yaka', 4),
  ('yaka_turu', 'KACIK_YAKA', 'Kacik Yaka', 5), ('yaka_turu', 'KAYIK_YAKA', 'Kayik Yaka', 6),
  ('yaka_turu', 'SAL_YAKA', 'Sal Yaka', 7), ('yaka_turu', 'HAKIM_YAKA', 'Hakim Yaka', 8), ('yaka_turu', 'KARE_YAKA', 'Kare Yaka', 9),
  ('kalip_turu', 'BAGGY', 'Baggy', 1), ('kalip_turu', 'BOYFRIEND', 'Boyfriend', 2), ('kalip_turu', 'CARROT', 'Carrot', 3),
  ('kalip_turu', 'DAR_SLIM', 'Dar/Slim', 4), ('kalip_turu', 'JOGGER', 'Jogger', 5), ('kalip_turu', 'MOM_FIT', 'Mom Fit', 6),
  ('kalip_turu', 'WIDELEG', 'Wide Leg', 7), ('kalip_turu', 'STRAIGHT', 'Straight', 8),
  ('siluet', 'A_KESIM', 'A Kesim', 1), ('siluet', 'KLOC', 'Kloc', 2), ('siluet', 'PILELI', 'Pileli', 3),
  ('siluet', '5_CEP', '5 Cep', 4), ('siluet', 'KARGO', 'Kargo', 5), ('siluet', 'PALAZZO', 'Palazzo', 6),
  ('cep_turu', '5_CEP', '5 Cep', 1), ('cep_turu', 'FLETO', 'Fleto', 2), ('cep_turu', 'TORBALI', 'Torbali', 3),
  ('cep_turu', 'KORUKLU', 'Koruklu', 4), ('cep_turu', 'KAPAKLI', 'Kapakli', 5),
  ('makine_parkuru', 'CEP_OTOMATI', 'Cep Otomati', 1), ('makine_parkuru', 'KOPRU_OTOMATI', 'Kopru Otomati', 2),
  ('makine_parkuru', 'SINGER', 'Singer', 3), ('makine_parkuru', 'OVERLOK_4I', 'Overlok 4 Iplik', 4),
  ('makine_parkuru', 'OVERLOK_5I', 'Overlok 5 Iplik', 5), ('makine_parkuru', 'ILIK', 'Ilik', 6),
  ('makine_parkuru', 'RECME', 'Recme', 7), ('makine_parkuru', 'PUNTERIZ', 'Punteriz', 8),
  ('makine_parkuru', 'CIFT_IGNE', 'Cift Igne', 9), ('makine_parkuru', 'KEMER_MAKINESI', 'Kemer Makinesi', 10),
  ('makine_parkuru', 'FLETO', 'Fleto', 11)
) AS v(dim_code, code, label, sort_order)
WHERE d.code = v.dim_code
ON CONFLICT (dimension_id, code) DO NOTHING;
