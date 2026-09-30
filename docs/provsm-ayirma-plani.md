# ProVSM — VSIM'i PES'ten ayrı ürüne çıkarma planı

**Karar (2026-09-30):** VSM + atölye simülasyonu **ProVSM** adıyla ayrı ürün olur.
Hedef: tüm tekstil üreticileri; ileride başka sektörler. PES'le tekrar birleşebilir kalmalı.

## İlke

Tek çekirdek, iki kabuk. ProVSM PES'in fork'u DEĞİL — aynı `vsim-core` paketini
kullanan ikinci bir uygulama. PES'e özgü her şey (tenant, workshop, `/api/pes/*`,
MTM kütüphanesi) çekirdeğin DIŞINDA, bir `depo` adaptörünün arkasında durur.

```
repo/  (npm workspaces)
├─ packages/vsim-core/   motor + arayüz + domain paketleri (bugünkü components/vsim)
├─ apps/pes/             PES — depo = PesDepo (/api/pes/vsim)
└─ apps/provsm/          ProVSM — depo = YerelDepo (v1) → ProvsmDepo (v2)
```

## Bugünkü bağlar (keşif)

| Bağ | Yer |
|---|---|
| Kayıt/okuma fetch'i | `components/vsim/components/AtolyeKayitPanel.jsx` (`api()` yardımcısı) |
| Açılışta varsayılan hat/ürün | `components/vsim/UretimSimulasyon.jsx` ~373 |
| Yetki bilgisi | `kayitKapsami: 'atolye' \| 'merkez'` prop'u |
| DB | `048_vsim_atolye_kayit.sql` — tenant/workshop/production_line/ref_urun_tipi FK |

Çekirdek dışında import YOK; dış paketler: react, lucide-react, xlsx, recharts, @xyflow/react.
Sektör bağımsızlığı zaten var: `domains/textile.js`, `domains/blank.js`.

## `depo` arayüzü

```js
/** @typedef {Object} VsimDepo
 *  @property {boolean} yazabilir
 *  @property {(tur:'tesis'|'urun-grubu', q?:{varsayilan?:boolean}) => Promise<Kayit[]>} listele
 *  @property {(tur, id) => Promise<Kayit>} getir
 *  @property {(tur, govde) => Promise<Kayit>} olustur
 *  @property {(tur, id, govde) => Promise<Kayit>} guncelle
 *  @property {(tur, id) => Promise<void>} sil
 *  @property {null | { tipler():Promise<Tip[]>, surec(tipId, esik):Promise<RefSurec> }} referans
 */
```
`referans: null` → "referanstan başlat" bölümü gizlenir (ProVSM v1'de MTM yoksa).
`depo` verilmezse → kayıt paneli hiç görünmez (bugünkü `kayitKapsami` yok davranışı).

## Fazlar

### Faz 0 — Mevcut işi kapat
- [ ] `feat/vsim-bant-bagla` → main, v1.7.2, canlı doğrula.

### Faz 1 — Adaptör (PES içinde, davranış değişmez)
- [ ] `components/vsim/depo/pesDepo.js` — bugünkü `/api/pes/vsim` çağrıları.
- [ ] `components/vsim/depo/yerelDepo.js` — localStorage üstünde aynı arayüz (ProVSM v1 + testler).
- [ ] `AtolyeKayitPanel` ve `UretimSimulasyon` `depo` prop'u alır; `fetch` çekirdekten kalkar.
- [ ] `VsimEmbed.tsx`: `kayitKapsami` → `pesDepo({ yazabilir })`.
- [ ] Test: `yerelDepo` sözleşme testi; mevcut vitest + build yeşil; tarayıcıda atölye/merkez akışı.
- Kabul: `grep -r "fetch\|/api/" components/vsim` yalnız `depo/pesDepo.js`'i gösterir.

### Faz 2 — Monorepo
- [ ] npm workspaces; `components/vsim` → `packages/vsim-core` (git mv, geçmiş korunur).
- [ ] PES kökü → `apps/pes`; `transpilePackages: ['@promode/vsim-core']`.
- [ ] Vercel `pes-platform` projesi Root Directory = `apps/pes`; önce preview, sonra canlı + alias.
- [ ] `scripts/sync-vsim.mjs` ve `sync:vsim` kaldırılır (artık tek kaynak paket).
- Risk: PES canlı derlemesi. Önce preview deploy, smoke test, sonra promote.

### Faz 3 — ProVSM v1 (arka uçsuz)
- [ ] `apps/provsm`: Next.js, landing + `/app` (simülasyon), `yerelDepo`, domain seçici (tekstil / genel).
- [ ] Excel içe/dışa aktarma, şablon galerisi, demo vakası (Şahinler denim, anonimleştirilmiş).
- [ ] Ayrı Vercel projesi `provsm`, ayrı alan adı.
- Çıktı: girişsiz, ücretsiz denenebilir ürün.

### Faz 4 — ProVSM v2 (hesap + bulut kayıt)
- [ ] Ayrı Supabase projesi. Tablolar: `org`, `org_uye`, `tesis`, `urun_grubu`
      (048 ile aynı `veri` JSON şeması; `workshop_id` yerine `org_id`; `harici_ref` sütunu).
- [ ] Giriş (e-posta / Google), org başına RLS, `provsmDepo`.
- [ ] Referans veri: v1 = anonim tekstil referans kopyası (ürün tipi → operasyon + süre); v2 = PES referans API'si (lisanslı).
- [ ] Faturalama / plan sınırları (ayrı karar).

### Faz 5 — (isteğe bağlı) Birleşme
- `harici_ref` üzerinden ProVSM org/tesis → PES tenant/workshop eşleme betiği.
- Ya da iki ürün yan yana: PES atölyesi ProVSM'ye tek tıkla giriş (SSO).

## Açık kararlar
1. MTM referansı ProVSM'de: anlık kopya mı, PES API'si mi? (varsayılan: v1 kopya, v2 API)
2. Alan adı (provsm.com / .app / .com.tr?)
3. ProVSM v1 dil: yalnız Türkçe mi, TR + EN mi?
4. Fiyatlandırma modeli (freemium / tesis başı / kullanıcı başı).
