/* Bir grup saniye değerini ORTAK birimde formatlar (karşılaştırma tutarlılığı — D4).
   Birim, değerlerin en büyük mutlak büyüklüğüne göre seçilir; a/b/delta tek birimde okunur. */
export function fmtSecShared(values) {
  const nums = (values || []).filter(v => v != null).map(v => Math.abs(v));
  const maxAbs = nums.length ? Math.max(...nums) : 0;
  const [div, unit] = maxAbs >= 3600 ? [3600, 'sa'] : maxAbs >= 60 ? [60, 'dk'] : [1, 'sn'];
  return (v) => v == null ? '—' : `${(v / div).toFixed(unit === 'sn' ? 0 : 1)} ${unit}`;
}
