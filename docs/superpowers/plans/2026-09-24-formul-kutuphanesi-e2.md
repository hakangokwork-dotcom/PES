# E2 — Formül kütüphanesi (uygulama kaydı)

**Spec:** `docs/superpowers/specs/2026-09-24-formul-kutuphanesi-e2-design.md`
**Dal:** `feat/formul-kutuphanesi`
**Tarih:** 2026-09-24

E2 küçük ve iyi tanımlı olduğu için ayrı görev planı yerine doğrudan
uygulandı; bu dosya ne yapıldığını ve yolda ne öğrenildiğini kaydeder.

## Yapılanlar

- [x] `scripts/uret_formul_katalogu.mjs` — FORMULLER → TS üreteci
- [x] `lib/pes/formul-katalogu.ts` — 54 giriş, 34'ü rasyo alanına bağlı
- [x] `lib/pes/formul-katalogu.test.ts` — 9 sürüklenme testi
- [x] `lib/pes/formul-izi.ts` + testi — değer havuzu ve hesap izi (9 test)
- [x] `app/pes/ekonomi/formuller/page.tsx` — gruplu, aranabilir ekran + iz
- [x] Radar rasyo gezgininden derin bağlantı
- [x] Sidebar: Analiz → Formül Kütüphanesi

## Yolda çıkan üç şey

**1. Excel'in tek satırı üç rasyo hesaplıyor.** `KESİM / DİKİM / UKP dk
maliyeti` satırını yalnız `dikimDkMaliyet`'e bağlamıştım; `kesimDkMaliyet` ve
`ukpDkMaliyet` formülsüz kalıyordu. "Sıralanabilir her rasyonun bir katalog
girişi olmalı" testi bunu ilk koşuda yakaladı. `alanlar` bu yüzden dizi.

**2. Aynı gösterge iki sayfada geçiyor.** `Marj %` hem HESAP hem MODEL_HESAP
satırında var. Eşleme anahtarı tek başına gösterge olsaydı biri sessizce
düşerdi; anahtar `sayfa|gösterge` çifti.

**3. Vitest tip denetimi yapmıyor.** İz testinin fikstüründe gider anahtarları
yanlıştı (`salary`/`severance`/`area_m` yerine `personnel`/`severance_reserve`/
`area_m2`) ve testler yine de geçti — net gider 4,3 M yerine 1,25 M çıktığı
için bir iddia kırılana kadar fark edilmedi. `tsc --noEmit` yakaladı. Ders:
canlı sayıya dayanan bir iddia yazmak, fikstürün doğruluğunu da test eder.

## Bilerek yapılmayan

**Formül metnine sayı yerleştiren ayrıştırıcı.** 54 sözel ifadeyi string
ikamesiyle çözmek kırılgandır ve doğru görünen yanlış bir ifade üretir. İz
bunun yerine tablo: girdi adı → gerçek değer, altında sonuç.

**Düzenlenebilir formül.** Katalog satırını değiştirmek hesabı değiştirmez;
yalnız koddan sapan bir belge üretir. Ekranda bu açıkça yazıyor.

## Doğrulama

- 18 yeni test geçiyor; `tsc --noEmit` temiz; `npm run build` temiz,
  `/pes/ekonomi/formuller` rotası derleniyor
- Canlı veri (2026-01, 11 pilot): izdeki girdilerden elle hesaplanan marj
  rasyonun kendisiyle birebir (fark 0), 54 katalog anahtarının hepsi havuzda
  çözülüyor, 41/54 formülün izi dolu (kalan 13'ü MODEL_HESAP — atölye
  rasyosu değil, model girdisi gerektiriyor)

## Kayda değer gözlem — kod değil veri

2026-01'de marjı hesaplanabilen 11 pilotun **8'i zararda**: TEKNİK TEKSTİL
+%17,6'dan BAGİSAN −%74,0'a. Bu rakamlar E0'da Excel HESAP sayfasına karşı
zaten doğrulanmıştı, yani hesap hatası değil.

Yine de "8/11 zararda" sonucuna varmadan önce iki şey bilinmeli: **ciro
yalnız beyandan geliyor** (PES'te gerçekleşen ciro yok) ve adet bant
kapasitesi tahmini. Katalogdaki net gider notu da aynı yöne işaret ediyor:
*"SGK brüt bildirilmişse doğru; net bildirilmişse teşvik iki kez düşülmüş
olur."* Yani bu tablo ya gerçek bir zarar tablosu ya da eksik ciro beyanının
tablosu — ikisini ayırmak **E4'ün işi** (veri toplama ve atölyeyle paylaşım).
