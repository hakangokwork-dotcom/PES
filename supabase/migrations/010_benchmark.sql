CREATE TABLE IF NOT EXISTS pes_benchmark (
  id              SERIAL PRIMARY KEY,
  metric_key      VARCHAR(50)    NOT NULL UNIQUE,
  metric_label    VARCHAR(100)   NOT NULL,
  target_value    DECIMAL(10,2)  NOT NULL,
  warning_value   DECIMAL(10,2),
  critical_value  DECIMAL(10,2),
  unit            VARCHAR(20)    DEFAULT '%',
  direction       VARCHAR(20)    DEFAULT 'higher_better' CHECK (direction IN ('higher_better','lower_better')),
  notes           TEXT,
  updated_at      TIMESTAMPTZ    DEFAULT now()
);

INSERT INTO pes_benchmark (metric_key, metric_label, target_value, warning_value, critical_value, unit, direction) VALUES
  ('efficiency', 'Verimlilik', 85, 70, 60, '%', 'higher_better'),
  ('fpq', 'Ilk Gecis Kalitesi (FPQ)', 95, 90, 85, '%', 'higher_better'),
  ('cost_per_min', 'Dakika Maliyeti', 6.00, 7.00, 8.00, 'TL/dk', 'lower_better'),
  ('margin', 'Net Marj', 15, 8, 0, '%', 'higher_better'),
  ('downtime_pct', 'Durus Orani', 3, 5, 8, '%', 'lower_better'),
  ('turnover', 'Isgucudevir Orani', 5, 10, 15, '%', 'lower_better'),
  ('composite_score', 'Genel Skor', 85, 70, 55, 'puan', 'higher_better'),
  ('reject_rate', 'Red Orani', 1, 3, 5, '%', 'lower_better')
ON CONFLICT (metric_key) DO NOTHING;
