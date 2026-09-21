/* /api/pes/siparisler yanıtı ve künye form tanımı. Tarihler ::text — dize. */

export type Siparis = {
  id: number; is_emri_no: string; siparis_no: string | null; musteri: string | null
  model_adi: string; stil_kodu: string | null; sezon: string | null
  siparis_miktari: number; teslim_tarihi: string | null; oncelik: string | null
  durum: string; workshop_id: number | null; atolye_adi: string | null
  ana_grup_kodu: string | null; klasman_kodu: string | null; kumas_turu_kodu: string | null
  kumas_grubu_kodu: string | null; cinsiyet_yas_kodu: string | null; kalite_kodu: string | null
  kumasci: string | null; klasman: string | null; kumas_turu: string | null
  kalan_gun: number | null
}

export type Secenek = { code: string; label: string }
export type Secenekler = Record<string, Secenek[]>

export type KunyeKolonu =
  | 'ana_grup_kodu' | 'klasman_kodu' | 'kumas_turu_kodu'
  | 'kumas_grubu_kodu' | 'cinsiyet_yas_kodu' | 'kalite_kodu'

/** Altı katalog alanı — sıra formdaki sıradır. Boyut adı /api/pes/katalog'a gider. */
export const KUNYE_ALANLARI: { kolon: KunyeKolonu; boyut: string; etiket: string }[] = [
  { kolon: 'ana_grup_kodu', boyut: 'ana_grup', etiket: 'Ana grup' },
  { kolon: 'klasman_kodu', boyut: 'klasman', etiket: 'Klasman' },
  { kolon: 'kumas_turu_kodu', boyut: 'kumas_turu', etiket: 'Kumaş türü' },
  { kolon: 'kumas_grubu_kodu', boyut: 'kumas_grubu', etiket: 'Kumaş grubu' },
  { kolon: 'cinsiyet_yas_kodu', boyut: 'cinsiyet_yas', etiket: 'Cinsiyet / yaş' },
  { kolon: 'kalite_kodu', boyut: 'kalite', etiket: 'Kalite segmenti' },
]

export const BOYUT_LISTESI = KUNYE_ALANLARI.map(a => a.boyut).join(',')
export const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Kritik'] as const
export type Gorunum = 'havuz' | 'atanmis' | 'hepsi'
