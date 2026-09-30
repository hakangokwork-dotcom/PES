/* Tarayıcı deposu — VsimDepo sözleşmesinin localStorage üstünde uygulaması.
   Sunucusuz kullanım (ProVSM v1) ve testler için. Kayıtlar tek anahtarda,
   tür başına dizi olarak tutulur. Sözleşme: ./sozlesme.js */
import { KAYIT_TURLERI } from './sozlesme.js';

const OZET_ALANLARI = ['oge_sayisi', 'adim_sayisi', 'toplam_sn', 'kaynak', 'urun_tipi_id'];

export function yerelDepo({ anahtar = 'provsm_kayitlar_v1', depolama = globalThis.localStorage, simdi = () => new Date().toISOString() } = {}) {
  const oku = () => {
    try {
      const d = JSON.parse(depolama?.getItem(anahtar) || '{}');
      return { sonId: d.sonId || 0, 'tesis': d['tesis'] || [], 'urun-grubu': d['urun-grubu'] || [] };
    } catch { return { sonId: 0, 'tesis': [], 'urun-grubu': [] }; }
  };
  const yaz = (d) => depolama?.setItem(anahtar, JSON.stringify(d));
  const turKontrol = (tur) => { if (!KAYIT_TURLERI.includes(tur)) throw new Error(`Bilinmeyen kayıt türü: ${tur}`); };
  const bul = (d, tur, id) => {
    const k = d[tur].find(x => String(x.id) === String(id));
    if (!k) throw new Error('Kayıt bulunamadı');
    return k;
  };
  const tekVarsayilan = (d, tur, id) => { for (const x of d[tur]) x.varsayilan = String(x.id) === String(id); };
  const ozet = ({ veri, ...k }) => k; // eslint-disable-line no-unused-vars

  return {
    yazabilir: true,
    referans: null,

    async listele(tur, { varsayilan } = {}) {
      turKontrol(tur);
      const rows = oku()[tur].filter(k => !varsayilan || k.varsayilan);
      // Sunucu ile aynı sıra: varsayılan önce, sonra en yeni.
      rows.sort((a, b) => (b.varsayilan - a.varsayilan) || String(b.updated_at).localeCompare(String(a.updated_at)));
      return varsayilan ? rows.map(k => ({ ...k })) : rows.map(ozet);
    },

    async getir(tur, id) {
      turKontrol(tur);
      return { ...bul(oku(), tur, id) };
    },

    async olustur(tur, govde) {
      turKontrol(tur);
      if (!govde?.ad) throw new Error('Ad gerekli');
      const d = oku();
      const id = ++d.sonId;
      const k = { id, ad: govde.ad, veri: govde.veri, varsayilan: false, updated_at: simdi() };
      for (const a of OZET_ALANLARI) if (govde[a] !== undefined) k[a] = govde[a];
      d[tur].push(k);
      if (govde.varsayilan) tekVarsayilan(d, tur, id);
      yaz(d);
      return { id };
    },

    async guncelle(tur, id, govde) {
      turKontrol(tur);
      const d = oku();
      const k = bul(d, tur, id);
      for (const a of ['ad', 'veri', ...OZET_ALANLARI]) if (govde[a] !== undefined) k[a] = govde[a];
      k.updated_at = simdi();
      if (govde.varsayilan) tekVarsayilan(d, tur, id);
      yaz(d);
      return { id: k.id };
    },

    async sil(tur, id) {
      turKontrol(tur);
      const d = oku();
      bul(d, tur, id);
      d[tur] = d[tur].filter(x => String(x.id) !== String(id));
      yaz(d);
    },
  };
}
