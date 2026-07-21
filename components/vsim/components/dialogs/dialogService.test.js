import { describe, it, expect, beforeEach } from 'vitest';
import { confirmDialog, promptDialog, alertDialog, _subscribe, _resolveTop, _reset } from './dialogService.js';
beforeEach(() => _reset());
describe('dialogService (promise pub/sub)', () => {
  it('confirmDialog promise döner; _resolveTop(true) ile çözülür', async () => {
    let active = null; const unsub = _subscribe(d => { active = d; });
    const p = confirmDialog('Sil?');
    expect(active).toMatchObject({ kind: 'confirm', message: 'Sil?' });
    _resolveTop(true);
    await expect(p).resolves.toBe(true);
    expect(active).toBeNull();   // kuyruk boşaldı
    unsub();
  });
  it('promptDialog metin döndürür; iptal null', async () => {
    _subscribe(() => {});
    const p1 = promptDialog({ message: 'Ad:', defaultValue: 'x' }); _resolveTop('yeni');
    await expect(p1).resolves.toBe('yeni');
    const p2 = promptDialog('Ad:'); _resolveTop(null);
    await expect(p2).resolves.toBeNull();
  });
  it('sıraya alınan diyaloglar sırayla çözülür', async () => {
    const seen = []; _subscribe(d => seen.push(d?.kind ?? 'null'));
    const a = confirmDialog('a'); const b = alertDialog('b');
    _resolveTop(false); await a; _resolveTop(); await b;
    // subscribe anında kuyruk boş → ilk emit null; ilk *aktif* diyalog confirm olmalı
    expect(seen.find(k => k !== 'null')).toBe('confirm');  // ilk aktif confirm
  });
  it('string veya {message} kabul eder', async () => {
    let active; _subscribe(d => active = d);
    confirmDialog('düz'); expect(active.message).toBe('düz'); _resolveTop(false);
    confirmDialog({ message: 'obj', title: 'Başlık', danger: true });
    expect(active).toMatchObject({ message: 'obj', title: 'Başlık', danger: true });
  });
});
