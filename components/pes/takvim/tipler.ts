/* /api/pes/takvim/doluluk yanıtının şekli. Tarihler 'YYYY-MM-DD' metindir —
   uç ::text ile döndürür, burada Date yoktur. */

export type Atolye = {
  id: number; code: string; name: string; is_active: boolean
  tedarik_mudurlugu: string | null; bolge: string | null
}
export type Bant = {
  id: number; code: string; name: string; workshop_id: number
  daily_target: number; is_active: boolean
}
export type Atama = {
  id: number; line_id: number; adet: number
  plan_baslangic: string; plan_bitis: string
  gercek_baslangic: string | null; gercek_bitis: string | null
  work_order_id: number; is_emri_no: string; model_adi: string
  musteri: string | null; teslim_tarihi: string | null; siparis_miktari: number
  durum: string; oncelik: string | null
}
export type Blok = {
  id: number; line_id: number; tip: string; adet: number | null
  sahip: string | null; gecerlilik_bitis: string | null; notlar: string | null
  baslangic_tarihi: string; bitis_tarihi: string
}
export type KapasiteGun = {
  workshop_id: number; tarih: string; gunluk_kapasite: number; sebep: string | null
}
export type GunlukSatirDto = {
  atama_id: number; tarih: string; plan_adet: number | null; adet: number | null
}
export type Asama = {
  id: number; work_order_id: number; workshop_id: number | null
  code: string; name: string; sira_no: number; zorunlu: boolean
  plan_baslangic: string | null; plan_bitis: string | null
  gercek_baslangic: string | null; gercek_bitis: string | null
  durum: string; ilerleme_pct: number | null
}
export type Malzeme = {
  work_order_id: number; tip: string; kod: string | null; ad: string
  miktar: number | null; gelen_miktar: number | null; birim: string | null
  durum: string; beklenen_tarih: string | null; gelis_tarihi: string | null
  tedarikci: string | null
}
export type CekmeTesti = {
  work_order_id: number; tarih: string; yikama_sayisi: number | null
  en_cekme_pct: number | null; boy_cekme_pct: number | null
  may_kaymasi_pct: number | null; sonuc: string; yapan: string | null
}
/* Cevap bekleyen teklif kalemi — yumuşak rezervasyon (044). Onaylı
   atamadan AYRI tutulur: reddedilirse takvimde yer kendiliğinden açılır. */
export type TeklifKalemDto = {
  id: number; teklif_id: number; line_id: number; workshop_id: number
  adet: number; baslangic: string; bitis: string
  work_order_id: number; is_emri_no: string; model_adi: string
}
export type TakvimVerisi = {
  atolyeler: Atolye[]; bantlar: Bant[]; atamalar: Atama[]; bloklar: Blok[]
  kapasiteGun: KapasiteGun[]; gunluk: GunlukSatirDto[]; asamalar: Asama[]
  malzemeler: Malzeme[]; testler: CekmeTesti[]; teklifler: TeklifKalemDto[]
}

export const BOS_VERI: TakvimVerisi = {
  atolyeler: [], bantlar: [], atamalar: [], bloklar: [],
  kapasiteGun: [], gunluk: [], asamalar: [], malzemeler: [], testler: [], teklifler: [],
}

export type Kip = 'ay' | 'hafta' | 'gun' | 'matris'
export type Vurgu = '' | 'asim' | 'rezerve' | 'teslim'
