/* Depo sözleşmesi — simülasyonun kayıtlı HAT (tesis) ve ÜRÜN GRUBU verisini
   nereden okuyup nereye yazdığını soyutlar. Çekirdek (bu dizin) hiçbir sunucu
   adresi bilmez; gömen uygulama kendi deposunu verir:
     - PES:     components/pes/vsimPesDepo.ts  (/api/pes/vsim, kiracı + RLS)
     - ProVSM:  yerelDepo (tarayıcı) → ileride kendi bulut deposu
   Depo verilmezse kayıt paneli hiç görünmez.

   @typedef {'tesis' | 'urun-grubu'} KayitTuru

   @typedef {Object} Kayit
   @property {number|string} id
   @property {string} ad
   @property {boolean} varsayilan
   @property {string} [updated_at]
   @property {string} [sahip]        Kaydın sahibi (çok sahipli görünümde gösterilir)
   @property {Object} [veri]         Yalnız getir() döndürür
   (tesis: oge_sayisi; ürün grubu: adim_sayisi, toplam_sn, kaynak, urun_tipi_id)

   @typedef {Object} ReferansKaynagi
   @property {string} ad                                 Arayüzde görünen kaynak adı (ör. "PES MTM")
   @property {() => Promise<Array<{id:number, klasman_ad:string}>>} tipler
   @property {(tipId:number|string, esik:string) => Promise<Object>} surec

   @typedef {Object} VsimDepo
   @property {boolean} yazabilir
   @property {(tur:KayitTuru, q?:{varsayilan?:boolean}) => Promise<Kayit[]>} listele
   @property {(tur:KayitTuru, id:Kayit['id']) => Promise<Kayit>} getir
   @property {(tur:KayitTuru, govde:Object) => Promise<{id:Kayit['id']}>} olustur
   @property {(tur:KayitTuru, id:Kayit['id'], govde:Object) => Promise<{id:Kayit['id']}>} guncelle
   @property {(tur:KayitTuru, id:Kayit['id']) => Promise<void>} sil
   @property {ReferansKaynagi | null} referans           null → "referanstan başlat" gizlenir
*/

export const KAYIT_TURLERI = ['tesis', 'urun-grubu'];
