import React, { useEffect, useState, useCallback } from 'react';
import { X, Save, Star, Trash2, FolderOpen, RefreshCw, Factory, Shirt, Wand2 } from 'lucide-react';
import { activeLayoutOf, facilityPayload, productPayload } from '../engine/savedData.js';
import { promptDialog, confirmDialog, alertDialog } from './dialogs/dialogService.js';

/* Atölye kayıtları — sunucuda saklanan HATLAR (yerleşim + çalışan + makine) ve
   ÜRÜN GRUPLARI (adımlar + MTM süreleri). Atölye kendi kayıtlarını yönetir;
   gömen uygulamanın deposu yazmaya izin vermiyorsa yalnız görür ve açar.
   Depo bir referans kaynağı veriyorsa (PES'te MTM) ürün grubu oradan başlatılabilir.
   Tüm okuma/yazma `depo` üzerinden — sözleşme: ../depo/sozlesme.js */

const fmtTarih = (s) => { try { return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const fmtSn = (sn) => (sn == null ? '—' : sn >= 60 ? `${Math.floor(sn / 60)} dk ${Math.round(sn % 60)} sn` : `${Math.round(sn)} sn`);

export default function AtolyeKayitPanel({ open, onClose, depo, data, onApplyFacility, onApplyProduct }) {
  const yazabilir = depo.yazabilir;
  const referans = depo.referans;
  const [tesisler, setTesisler] = useState([]);
  const [urunler, setUrunler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [tipler, setTipler] = useState([]);
  const [tipId, setTipId] = useState('');
  const [esik, setEsik] = useState('0.5');
  const [onizleme, setOnizleme] = useState(null);

  const tipleriYukle = useCallback(() => (referans ? referans.tipler().then(setTipler).catch(e => setHata(`Ürün tipleri alınamadı: ${e.message}`)) : Promise.resolve()), [referans]);
  const tazele = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try {
      const [t, u] = await Promise.all([depo.listele('tesis'), depo.listele('urun-grubu')]);
      setTesisler(t); setUrunler(u);
    } catch (e) { setHata(e.message); }
    if (!tipler.length) await tipleriYukle();
    setYukleniyor(false);
  }, [depo, tipler.length, tipleriYukle]);
  useEffect(() => { if (open) tazele(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const dene = async (fn, basari) => {
    try { await fn(); if (basari) await tazele(); } catch (e) { alertDialog({ message: e.message, danger: true }); }
  };

  /* ---- hat ---- */
  const layout = activeLayoutOf(data);
  const tesisKaydet = () => dene(async () => {
    if (!layout) throw new Error('Kaydedilecek yerleşim yok — önce Yerleşim sekmesinde atölyeyi kur.');
    const ad = await promptDialog({ message: 'Hat / tesis adı:', defaultValue: layout.name || 'Bant 1' });
    if (!ad) return;
    const veri = facilityPayload(data, layout);
    await depo.olustur('tesis', { ad, veri, oge_sayisi: veri.layout.items.length, varsayilan: tesisler.length === 0 });
  }, true);
  const tesisGuncelle = (k) => dene(async () => {
    if (!layout) throw new Error('Yerleşim yok.');
    if (!(await confirmDialog({ message: `"${k.ad}" kaydı mevcut yerleşimle (${layout.name}) değiştirilecek. Devam?` }))) return;
    const veri = facilityPayload(data, layout);
    await depo.guncelle('tesis', k.id, { veri, oge_sayisi: veri.layout.items.length });
  }, true);
  const tesisAc = (k) => dene(async () => {
    const kayit = await depo.getir('tesis', k.id);
    onApplyFacility(kayit.veri, { id: kayit.id, ad: kayit.ad });
  });

  /* ---- ürün grubu ---- */
  const urunKaydet = () => dene(async () => {
    if (!(data.subOps || []).length) throw new Error(`Süreçte adım yok — önce adımları gir${referans ? ' ya da referanstan başlat' : ''}.`);
    const ad = await promptDialog({ message: 'Ürün grubu adı (ör. Polo tişört):', defaultValue: data.meta?.modelAdi || '' });
    if (!ad) return;
    const p = productPayload(data);
    await depo.olustur('urun-grubu', {
      ad, veri: p.veri, adim_sayisi: p.adimSayisi, toplam_sn: p.toplamSn,
      urun_tipi_id: data.meta?.refUrunTipiId || null, kaynak: data.meta?.kaynak || 'manuel',
      varsayilan: urunler.length === 0,
    });
  }, true);
  const urunGuncelle = (k) => dene(async () => {
    if (!(await confirmDialog({ message: `"${k.ad}" ürün grubu mevcut süreçle değiştirilecek. Devam?` }))) return;
    const p = productPayload(data);
    await depo.guncelle('urun-grubu', k.id, { veri: p.veri, adim_sayisi: p.adimSayisi, toplam_sn: p.toplamSn });
  }, true);
  const urunAc = (k) => dene(async () => {
    if ((data.subOps || []).length && !(await confirmDialog({ message: `Mevcut süreç "${k.ad}" ile değiştirilecek. Yerleşimdeki makineler aynı adlı adımlara yeniden bağlanır. Devam?` }))) return;
    const kayit = await depo.getir('urun-grubu', k.id);
    onApplyProduct(kayit.veri, { ad: kayit.ad });
  });

  const varsayilanYap = (tur, k) => dene(() => depo.guncelle(tur, k.id, { varsayilan: true }), true);
  const sil = (tur, k) => dene(async () => {
    if (!(await confirmDialog({ message: `"${k.ad}" silinecek. Emin misin?`, danger: true }))) return;
    await depo.sil(tur, k.id);
  }, true);

  /* ---- referans ---- */
  const onizle = () => dene(async () => {
    const r = await referans.surec(tipId, esik);
    setOnizleme(r);
  });
  const referansiYukle = () => dene(async () => {
    if (!onizleme) return;
    if ((data.subOps || []).length && !(await confirmDialog({ message: `Mevcut süreç "${onizleme.urunTipi.klasman_ad}" referans süreciyle değiştirilecek. Devam?` }))) return;
    onApplyProduct({
      mainOps: onizleme.mainOps, subOps: onizleme.subOps, settings: {},
      meta: { refUrunTipiId: onizleme.urunTipi.id, kaynak: 'referans' },
    }, { ad: `${onizleme.urunTipi.klasman_ad} (referans)` });
    setOnizleme(null);
  });

  if (!open) return null;
  const btn = 'h-8 px-2.5 rounded-md border border-line bg-surface hover:bg-surface-2 text-ink text-xs font-medium flex items-center gap-1';
  const iconBtn = 'h-8 w-8 rounded-md border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center disabled:opacity-40';

  const Liste = ({ tur, kayitlar, ozet, onAc, onGuncelle }) => (
    <ul className="flex flex-col gap-1.5">
      {kayitlar.length === 0 && <li className="text-xs text-ink-soft">Henüz kayıt yok.</li>}
      {kayitlar.map(k => (
        <li key={k.id} className="rounded-lg border border-line bg-surface px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate flex items-center gap-1">
                {k.varsayilan && <Star className="w-3.5 h-3.5 text-warn flex-shrink-0" fill="currentColor" aria-label="Varsayılan" />}
                {k.ad}
              </div>
              <div className="text-[11px] text-ink-soft truncate">
                {k.sahip ? `${k.sahip} · ` : ''}{ozet(k)} · {fmtTarih(k.updated_at)}
              </div>
            </div>
            <button className={btn} onClick={() => onAc(k)} title="Bu kaydı çalışma alanına yükle"><FolderOpen className="w-3.5 h-3.5" /> Aç</button>
          </div>
          {yazabilir && (
            <div className="flex gap-1.5">
              <button className={btn} onClick={() => onGuncelle(k)} title="Kaydı mevcut çalışmayla güncelle"><Save className="w-3.5 h-3.5" /> Güncelle</button>
              <button className={iconBtn} disabled={k.varsayilan} onClick={() => varsayilanYap(tur, k)} aria-label="Varsayılan yap" title="Varsayılan yap — simülasyon açılınca bu yüklenir"><Star className="w-3.5 h-3.5" /></button>
              <button className={iconBtn} onClick={() => sil(tur, k)} aria-label="Sil" title="Sil"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Atölye kayıtları">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative w-full max-w-md h-full bg-paper border-l border-line shadow-xl overflow-y-auto p-4 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-ink">Atölye kayıtları</h2>
            <p className="text-xs text-ink-soft">
              {yazabilir
                ? 'Hatlarını ve en sık ürettiğin ürün gruplarını kaydet; her cihazdan aç. ★ varsayılan, simülasyon açılınca yüklenir.'
                : 'Merkez görünümü: tüm atölyelerin kayıtları. Açıp inceleyebilirsin; değiştirmek için atölye panelinden gir.'}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button className={iconBtn} onClick={tazele} aria-label="Yenile" title="Yenile"><RefreshCw className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`} /></button>
            <button className={iconBtn} onClick={onClose} aria-label="Kapat" title="Kapat"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {hata && <div className="text-xs rounded-md bg-danger-tint text-danger px-3 py-2">{hata}</div>}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-1.5"><Factory className="w-4 h-4" /> Hatlar / tesisler</h3>
            {yazabilir && <button className={btn} onClick={tesisKaydet} title="Etkin yerleşimi, çalışanları ve makineleri kaydet"><Save className="w-3.5 h-3.5" /> Mevcut yerleşimi kaydet</button>}
          </div>
          <Liste tur="tesis" kayitlar={tesisler} ozet={k => `${k.oge_sayisi ?? '?'} öğe`} onAc={tesisAc} onGuncelle={tesisGuncelle} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-1.5"><Shirt className="w-4 h-4" /> Ürün grupları</h3>
            {yazabilir && <button className={btn} onClick={urunKaydet} title="Mevcut adımları ve süreleri kaydet"><Save className="w-3.5 h-3.5" /> Mevcut süreci kaydet</button>}
          </div>
          <Liste tur="urun-grubu" kayitlar={urunler}
            ozet={k => `${k.adim_sayisi ?? '?'} adım · ${fmtSn(k.toplam_sn)}${k.kaynak === 'referans' ? ' · referanstan' : ''}`}
            onAc={urunAc} onGuncelle={urunGuncelle} />
        </section>

        {referans && <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3">
          <h3 className="text-sm font-bold text-ink flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Referanstan başlat ({referans.ad})</h3>
          <p className="text-[11px] text-ink-soft leading-snug">Ürün tipini seç; {referans.ad} kütüphanesindeki tipik modelin adımları ve süreleri sürece yüklenir. Sonra kendi sürelerine göre düzenleyip ürün grubu olarak kaydet.</p>
          <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Ürün tipi
            <select value={tipId} onChange={e => { setTipId(e.target.value); setOnizleme(null); }} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
              <option value="">Seç…</option>
              {tipler.map(t => <option key={t.id} value={t.id}>{t.klasman_ad}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Parça seçimi
            <select value={esik} onChange={e => { setEsik(e.target.value); setOnizleme(null); }} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
              <option value="0.7">Sade — modellerin %70'inde olan parçalar</option>
              <option value="0.5">Tipik — modellerin yarısında olan parçalar</option>
              <option value="0.3">Geniş — modellerin %30'unda olan parçalar</option>
            </select>
          </label>
          <button className={`${btn} self-start`} disabled={!tipId} onClick={onizle}>Önizle</button>
          {onizleme && (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="font-semibold text-ink">{onizleme.ozet.adimSayisi} adım · toplam {fmtSn(onizleme.ozet.toplamSn)}</div>
              <ul className="flex flex-col gap-0.5">
                {onizleme.ozet.bolgeler.map(b => (
                  <li key={b.bolge} className="flex justify-between text-ink"><span>{b.bolge} · {b.parca} parça</span><span className="font-mono text-ink-soft">{b.adim} adım · {fmtSn(b.sn)}</span></li>
                ))}
              </ul>
              <p className="text-[10px] text-ink-soft">Adımların sırası kütüphanede yok; bölge içinde öneridir. Sondaki "birleştirme / son kontrol" adımı tahminidir — düzenle.</p>
              <button className="h-9 rounded-lg bg-accent hover:bg-accent-strong text-white text-xs font-semibold" onClick={referansiYukle}>Süreci yükle</button>
            </div>
          )}
        </section>}
      </aside>
    </div>
  );
}
