import { describe, it, expect } from 'vitest';
import { yerelDepo } from './yerelDepo.js';

function bellek() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
let saat = 0;
const yeni = (depolama = bellek()) => yerelDepo({ depolama, simdi: () => `2026-01-01T00:00:${String(saat++).padStart(2, '0')}Z` });

describe('yerelDepo — VsimDepo sözleşmesi', () => {
  it('oluştur → listele (özet, veri yok) → getir (veri var)', async () => {
    const d = yeni();
    const { id } = await d.olustur('tesis', { ad: 'Bant 1', veri: { layout: { items: [1, 2] } }, oge_sayisi: 2 });
    const liste = await d.listele('tesis');
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id, ad: 'Bant 1', oge_sayisi: 2, varsayilan: false });
    expect(liste[0].veri).toBeUndefined();
    expect((await d.getir('tesis', id)).veri).toEqual({ layout: { items: [1, 2] } });
  });

  it('türler birbirinden ayrı', async () => {
    const d = yeni();
    await d.olustur('tesis', { ad: 'T' });
    await d.olustur('urun-grubu', { ad: 'U', adim_sayisi: 3 });
    expect((await d.listele('tesis')).map(k => k.ad)).toEqual(['T']);
    expect((await d.listele('urun-grubu')).map(k => k.ad)).toEqual(['U']);
  });

  it('varsayılan tektir; varsayilan filtresi veriyle döner', async () => {
    const d = yeni();
    const a = await d.olustur('tesis', { ad: 'A', veri: { x: 1 }, varsayilan: true });
    const b = await d.olustur('tesis', { ad: 'B', veri: { x: 2 } });
    await d.guncelle('tesis', b.id, { varsayilan: true });
    const v = await d.listele('tesis', { varsayilan: true });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: b.id, veri: { x: 2 } });
    expect((await d.getir('tesis', a.id)).varsayilan).toBe(false);
  });

  it('güncelle veriyi değiştirir, sil kaldırır; olmayan kayıt hata verir', async () => {
    const d = yeni();
    const { id } = await d.olustur('urun-grubu', { ad: 'P', veri: { v: 1 } });
    await d.guncelle('urun-grubu', id, { veri: { v: 2 }, adim_sayisi: 5 });
    expect(await d.getir('urun-grubu', id)).toMatchObject({ veri: { v: 2 }, adim_sayisi: 5 });
    await d.sil('urun-grubu', id);
    expect(await d.listele('urun-grubu')).toEqual([]);
    await expect(d.getir('urun-grubu', id)).rejects.toThrow('bulunamadı');
  });

  it('kalıcı: aynı depolamayla açılan yeni depo kayıtları görür', async () => {
    const m = bellek();
    await yeni(m).olustur('tesis', { ad: 'Kalıcı' });
    expect((await yeni(m).listele('tesis')).map(k => k.ad)).toEqual(['Kalıcı']);
  });

  it('bozuk depolama boş sayılır; bilinmeyen tür reddedilir; referans yok', async () => {
    const m = bellek(); m.setItem('provsm_kayitlar_v1', '{bozuk');
    const d = yeni(m);
    expect(await d.listele('tesis')).toEqual([]);
    await expect(d.listele('yok')).rejects.toThrow('Bilinmeyen');
    expect(d.referans).toBeNull();
    expect(d.yazabilir).toBe(true);
  });
});
