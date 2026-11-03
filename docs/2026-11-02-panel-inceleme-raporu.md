# PES — Atölye ve Merkez Paneli İnceleme Raporu

**Tarih:** 2026-11-02 · **Sürüm:** v1.9.0 (son commit 2026-10-06) · **Canlı:** pes.provsm.com
**Soru:** "Uzun süre sonra girdim, atölyenin olgunluk skorlarını ve süreç bazlı durumu göremedim. Sistem kötüleşti mi?"

---

## 0. Kısa cevap

**Sistem kötüleşmedi; olgunluk modülünde hiç tamamlanmış denetim yok.** Kod 6 Ekim'den beri değişmedi, tip denetimi ve 1.513 birim testi yeşil, canlı site aynı veritabanına bağlı. Veritabanında olgunluk kataloğu yüklü ve yayında (v7), ama 131 aktif atölyeden **sıfırı** denetlenmiş. Tek kayıt 14 Ağustos 2026 tarihli, hiç cevaplanmamış bir taslak. Ekranlar boş görünüyor çünkü gösterecek veri yok; üstüne bir de boş durum mesajı olmadığı için "bozuk" izlenimi veriyor.

Bunun yanında olgunluk modülünde **gerçek kırıklar** var: atölye panelinde olgunluk menüde yok, atölye sayfasındaki bağlantılar merkez paneline gidiyor (atölye hesabı oraya giremez), öz değerlendirme radarı yanlış kaynaktan besleniyor. Detaylar §2'de.

---

## 1. Kanıtlar

| Kontrol | Sonuç |
|---|---|
| Canlı site hangi Supabase projesini kullanıyor | `esucqswvhlnrmcownhbd` (.env.local ile aynı; paket içinde doğrulandı) |
| Supabase MCP'de görünen proje | `jvgzfvrpjdzwfdtfvvax` — **PES değil**, 3 tablolu boş proje (9 Ekim'de açılmış). Sabahki "yanlış proje ID" notu hatalıydı. |
| Olgunluk şablonları | v4 arşiv · v5 arşiv · **v7 yayında** · v8 taslak |
| Olgunluk denetimi | 1 kayıt (taslak, 2026-08-14, tür DENETİM), **0 cevap** |
| Öz değerlendirme | 0 |
| Sınıfı (A/B/C/D) olan atölye | 0 / 131 aktif |
| Atölyeye bağlı kullanıcı hesabı (`workshop_user`) | 1 |
| Tenant | 2 (internal + demo) |
| Son aylık üretim dönemi | Ocak 2026 (seed/demo verisi) |
| `tsc --noEmit` | hatasız |
| `vitest run` | 87 dosya, 1.513 test, hepsi geçti |
| Commit dağılımı | Tem 52 · Ağu 49 · Eyl 178 · Eki 38 · Kas 0 |

Veri kaybı kanıtı yok. Bugün sabah Supabase projesi DNS'ten düşüp geri geldi (ücretsiz plan otomatik duraklatma deseni); duraklatma veriyi silmez. Yine de "ben denetim tamamlamıştım" diyorsanız Supabase panelinden yedek listesine bakmak tek doğrulama yolu.

---

## 2. Olgunluk modülü — neresi kırık

### 2.1 Atölye panelinde menüde hiç olmamış
`/workshop/olgunluk` sayfası var (034, Ağustos) ama `WorkshopSidebar` içinde buna bağlantı **hiçbir zaman** eklenmemiş (`git log -S olgunluk` boş). Atölye kullanıcısı URL'yi bilmeden bu sayfaya ulaşamaz. Dashboard'da da yok.

### 2.2 Atölye sayfasındaki bağlantılar merkez paneline gidiyor
`AtolyeOzDegerlendirme` "Devam et / Görüntüle / Başlat" hepsini `/pes/olgunluk/denetim/{id}`'ye yolluyor. `/pes` layout'u `requirePanel('yonetim')` ile korunuyor; gerçek atölye hesabı oraya tıklayınca `/workshop`'a geri düşer. Yani atölye öz değerlendirme **başlatabilir ama dolduramaz**. Merkez yöneticisi "atölye adına" girdiğinde çalışır; bu yüzden geliştirme sırasında fark edilmemiş.

### 2.3 Öz değerlendirme radarı yanlış kaynaktan besleniyor
Bileşen yorumu "atölyenin kendi beyanı gösterilir" diyor, ama `atolyeOlgunluk()` içinde `sonKategoriler` **yalnız resmi DENETİM**'den geliyor. Sonuç: atölye öz değerlendirmeyi tamamlasa bile "Kategori profiliniz" kartı ya boş ya da denetçinin verisini gösterir.

### 2.4 Süreç bazlı görünüm yalnız denetim doldurma ekranında
"Her süreçte nasılım" sorusunun cevabı (`v_olgunluk_surec_seviye`) sadece `/pes/olgunluk/denetim/[id]` ekranının sol listesinde var. Atölye özet sayfası, merkezin atölye sekmesi ve filo ısı haritası **kategori** düzeyinde kalıyor. Süreç seviyesi listesi ve "en zayıf 5 süreç" hiçbir özette yok.

### 2.5 Boş durum yok
Filo ekranı 131 satır "YOK" ve boş hücre gösteriyor; "Henüz denetim yok, ilk denetimi başlatın" yönlendirmesi yok. Atölye sayfası "Henüz kayıt yok" diyor ama neden ve ne yapılacağını söylemiyor. Merkez dashboard'unun "Dikkat gerektirenler" listesinde olgunluk sinyali (denetlenmemiş atölye sayısı) yok.

### 2.6 İki "denetim" kavramı yan yana
Menüde "Profil & Denetim" (WKYS/sosyal uygunluk, 029) ve "Olgunluk Durumu" (031) ayrı maddeler; atölye detayında da iki ayrı sekme. İsimler birbirine çok yakın, kullanıcı hangisine bakacağını karıştırıyor.

---

## 3. Atölye paneli — genel durum

20 sayfa. Panel iki nesil kodun karışımı:

| Sinyal | Sayı | Not |
|---|---|---|
| Menüde olmayan sayfa | 4 | `olgunluk`, `vsm`, `uretim-simulasyon` (ProVSM'e taşınma kalıntısı), `gir` (route, normal) |
| "Atölye seçin" ölü boş ekranı | 15 / 20 | 033 sonrası atölye oturumdan geliyor; bu ekranlar artık hiç görünmemeli ama kod hâlâ taşıyor |
| Eski `?wid=` deseni | 16 dosya | Proxy yönlendirmesiyle yaşatılıyor |
| İstemci tarafı sayfa (`'use client'` + fetch) | 13 / 20 | Yeni sayfalar (olgunluk, plan, gunluk-uretim) sunucu bileşeni; eskiler istemci |
| Ortak `PageHeader` kullanan | 1 / 20 | Başlık/ekmek kırıntısı tutarsız |
| ASCII Türkçe metin ("Durus", "Isgucudevir", "Atolye bulunamadi") | dashboard + 3 sayfa | Tablet ekranında ilk göze çarpan şey |

Dashboard: KPI kartları Ocak 2026 verisini gösteriyor, dönem seçici yok, renkler tema token'ı yerine ham Tailwind (`text-green-600`). Hızlı erişim kutuları `?wid=` taşıyor.

Menü yapısı iyi (6 grup, iş akışına göre) ama "Üretim" grubunda "Günlük Üretim" ve "Üretim" (aylık) ayrımı etikette anlaşılmıyor.

---

## 4. Merkez paneli — genel durum

43 menü maddesi, 5 grup. "Analiz" grubu tek başına 15 madde; ekonomi alt ailesi (Atölye Ekonomi, Klasman, Formül, Dk Maliyet, Veri Toplama) kendi alt grubunu hak ediyor. "Eder Maliyet (eski)" menüde duruyor. `/pes/uretim-simulasyon` menüde yok ama sayfa var.

Dashboard'un "Dikkat gerektirenler" bölümü doğru fikir (aksiyon odaklı), ama altı sinyalin hiçbiri olgunluk, plan onayı veya atölye veri girişi eksikliği değil. "Son dönem" Ocak 2026 — demo verisi, canlıda yanıltıyor.

`PageHeader` 6 sayfada var; benchmark/compare/yetenek-rapor eski nesil (ASCII metin, ham renk, istemci fetch).

---

## 5. Portal vizyonuyla boşluk: merkez ↔ fason atölye

Hedef: fason üretim yaptıran merkez ile fason üreticiler arasında köprü. Atölye kendi işini yönetmek için veri girer ve içeriğine bakar; merkez ortak yönetim katmanını işletir.

**Altyapı hazır, kullanım yok.** Tenant tipleri (`internal / parent / individual`), `workshop_user` bağı, RLS kapsamı, "atölye adına çalışma" hepsi var. Ama 131 atölyeye karşılık **1** atölye hesabı. Panel fiilen merkez yöneticisinin iki şapkayla kullandığı tek kişilik sistem; iki taraflı akışlar bu yüzden test edilmemiş (2.2 bunun doğrudan sonucu).

İki yönlü akışın bugünkü durumu:

| Akış | Yön | Durum |
|---|---|---|
| Günlük üretim, duruş, kalite, gider beyanı | atölye → merkez | Ekranlar var; atölye hesabıyla uçtan uca denenmemiş |
| Sipariş yerleştirme, plan, plan onayı | merkez → atölye | Var (043–045), "Gelen Plan" ekranı atölyede |
| Olgunluk denetimi | merkez → atölye | Katalog hazır, 0 denetim; atölye sonucu görür ama süreç kırılımını göremez |
| Öz değerlendirme | atölye → merkez | Kırık (2.2, 2.3) |
| Yıllık talep planı | merkez → atölye | Yeni (050), atölye tarafı var |
| Atölye profili / yetenek | atölye ↔ merkez | Merkez giriyor; atölyenin kendi profilini düzenleme sınırı belirsiz |

Netleşmesi gereken ürün kararı: **hangi veriyi kim girer, kim onaylar.** Bugün çoğu ekran her iki panelde de yazılabilir; "atölye beyan eder, merkez doğrular" kuralı yalnız gider beyanı ve olgunlukta (öz değerlendirme ≠ denetim) uygulanmış. Bu kuralı tüm modüllere yaymak portalın omurgası olur.

---

## 6. Öneriler (öncelikli)

**P0 — Olgunluk bu hafta çalışır hale gelsin**
1. `WorkshopSidebar` "Verimlilik & Kalite" grubuna "Olgunluk" maddesi. (1 satır)
2. Öz değerlendirme doldurma ekranını `/workshop/olgunluk/[id]` altına taşı; `OlgunlukDenetimEkrani`'nı iki panelden de kullan, "Filo görünümü" bağlantısını panele göre değiştir.
3. `atolyeOlgunluk()` öz değerlendirme için ayrı `sonOzKategoriler` döndürsün; radar onu çizsin.
4. Süreç seviyesi listesi (`v_olgunluk_surec_seviye`) atölye özetine ve merkezin atölye sekmesine; "en zayıf süreçler" bloğu.
5. Boş durum metinleri: filo ekranı "0/131 denetlendi — ilk denetimi başlat", atölye ekranı "Henüz öz değerlendirme yapmadınız — başlayın".
6. Merkez dashboard "Dikkat gerektirenler"e "N atölye hiç denetlenmedi" satırı.
7. **İlk gerçek denetimi yapın.** Modül veri görmeden olgunlaşmaz; pilot 3 atölye.

**P1 — Atölye panelini tek nesle indir (2–3 hafta)**
8. 15 sayfadaki "Atölye seçin" boş ekranı ve `?wid=` deseni kaldırılsın; `useAktifAtolyeId`/oturum tek kaynak.
9. ASCII Türkçe metinler düzeltilsin (dashboard, kaizen, veri-yukle, yikama-ukp; merkezde compare, benchmark, yetenek-rapor).
10. Dashboard'a dönem seçici; demo verisi canlıda "örnek veri" rozetiyle işaretlensin ya da temizlensin.
11. `PageHeader` ve tema token'ları tüm sayfalarda; `vsm` ve `uretim-simulasyon` sayfaları ya menüye ya silinsin.

**P1 — Portal omurgası**
12. Atölye hesaplarını açın (en az pilot atölyeler): `scripts/create-user.mjs` + `workshop_user`. Akışlar gerçek rolle test edilsin.
13. Modül bazında "kim girer / kim onaylar" matrisi yazılsın ve her ekranın başlığında tarafı belirtilsin ("Atölye beyanı" / "Merkez kaydı").
14. Atölye dashboard'una merkezden gelen şeyler (plan, denetim sonucu, talep) tek "Gelen kutusu" bloğu.

**P2**
15. Merkez menüsü: "Analiz"i ikiye böl (Performans / Ekonomi); "Eder Maliyet (eski)" kaldır.
16. "Profil & Denetim" → "Sosyal Uygunluk (WKYS)" diye yeniden adlandır; olgunlukla karışmasın.
17. Supabase ücretsiz plan: proje boşta kalınca duraklıyor; ilk giriş 1–3 dk hata verir. Pro plana geçiş ya da haftalık ping.

---

## 6b. Uygulama durumu (2026-11-03, dal `feat/olgunluk-atolye-akisi`, v1.10.0)

| Madde | Durum |
|---|---|
| 1–6 Olgunluk akışı, süreç seviyeleri, boş durumlar, dashboard sinyali | Yapıldı. Ek bulgu: atölye resmi denetimi API'den değiştirebiliyordu; kapatıldı. |
| 7 İlk gerçek denetim | Sizde (pilot 3 atölye) |
| 8 "Atölye seçin" ölü ekranları, `?wid=` | Yapıldı |
| 9 ASCII Türkçe metinler | Yapıldı (eski nesil sayfalar) |
| 10 Atölye dashboard dönem seçici, eski veri uyarısı | Yapıldı |
| 11 Tema token'ları, başlık birliği | Durum renkleri 101 dosyada token'a geçti; başlık tipografisi birleşti. `PageHeader` bileşenine tam geçiş yapılmadı. |
| 12 Atölye hesapları | Sizde: hangi atölyeler, hangi e-postalar. Komut: `node scripts/create-user.mjs --email=... --sifre=... --atolye=B0xx` |
| 13 Kim girer / kim onaylar | Taslak: `docs/2026-11-03-veri-sahipligi-matrisi.md` (3 açık karar) |
| 14 Merkezden gelenler bloğu | Yapıldı (atölye dashboard) |
| 15 Merkez menüsü | Yapıldı: Performans / Ekonomi & Fiyat; eski Eder Maliyet menüden çıktı |
| 16 "Profil & Denetim" adı | Yapıldı: "Profil & Sosyal Uygunluk" |
| 17 Supabase planı | Sizde (ücretli plan kararı) |

## 7. Dokümantasyon durumu

- PES klasöründe **CLAUDE.md yok**; yalnız üst klasör `IDEAMD/CLAUDE.md` (wiki kuralları) var. Vizyon üç dosyada (`PLATFORM_VISION_v3`, `MODULE_CATALOG`, `COMMERCIAL_ROADMAP`) ve hepsi Nisan 2026 SaaS pivotunu anlatıyor; "merkez ↔ fason portalı" amacı yazılı değil.
- Bu raporla birlikte `WORK/PES/CLAUDE.md` taslağı oluşturuldu; amaç cümlesi sizinle netleşecek.
- Wiki (`_wiki/projeler/work-pes.md`) 9 Ekim'de güncel; `ekip.csv`'de düz metin parola uyarısı hâlâ geçerli.

---

## Ek — Çalıştırılan kontroller

```
git log -S olgunluk -- components/pes/WorkshopSidebar.tsx     → boş
grep -rl "workshop/olgunluk" app components lib                 → yalnız sayfanın kendisi
npx tsc --noEmit                                                → 0 hata
npx vitest run                                                  → 87 dosya / 1513 test geçti
curl pes.provsm.com/_next/static/chunks/*.js | grep supabase.co → esucqswvhlnrmcownhbd
SELECT ... FROM olgunluk_sablon / olgunluk_denetim / v_atolye_olgunluk (READ ONLY)
```
