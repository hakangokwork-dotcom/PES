# E2 — Formül ve parametre kütüphanesi (tasarım)

**Tarih:** 2026-09-24
**Durum:** tasarım
**Öncül:** E0 (`ekonomi-hesap.ts`), E1 (radar), E3 (`model-fiyat.ts`)

## Amaç

Kullanıcının isteği: *"formül kütüphaneleri vb"* — ve arkasındaki asıl ihtiyaç:
**atölyenin farkında olmadan zarara uğradığını anlamak.** Bir sayının yanlış
olduğunu değil, **nasıl oluştuğunu** görmek gerekir.

Excel'in `FORMULLER` sayfası 54 satırlık bir sözlük taşıyor: gösterge, sözel
formül, Excel karşılığı ve **"nasıl okunur / neden"**. Son sütun en değerlisi;
PES'te hiçbir yerde yok. Bu satırlar hesap değil, **yorum** taşıyor:
"%55–75 tipik", "SGK net bildirilmişse teşvik iki kez düşülmüş olur".

## Kapsam dışı — ve nedeni

**Formüller düzenlenebilir OLMAYACAK.** Kataloğu veritabanına koyup
düzenlenebilir yapmak cazip görünüyor ama satırı değiştirmek hesabı
değiştirmez — `ekonomi-hesap.ts` çalışmaya devam eder. Ortaya koddan sessizce
sapan, doğru görünen yanlış bir belge çıkar. Katalog **koda bağlı, okunur**
kalır; değişebilen şey parametrelerdir ve onlar zaten `economy_param`'da
düzenlenebilir (`/pes/ekonomi/parametre`).

Bu ayrım ekranda da açıkça yazılacak: "Formül kodun kendisidir; değiştirmek
için parametreyi değiştirin."

## Üç parça

### 1. Katalog — `lib/pes/formul-katalogu.ts`

54 giriş. Her giriş:

```ts
type FormulGirdisi = {
  id: string                 // 'hesap.marj'
  kaynak: FormulKaynak       // 'PARAMETRE' | 'HESAP' | 'MODEL_HESAP' | 'OZET' | 'PANO'
  etiket: string             // 'Marj %'
  sozel: string              // '(Ciro − net gider) ÷ ciro'
  excel: string | null       // '=(H−M)/H'
  okuma: string              // FORMULLER son sütunu — yorum, eşik, tuzak
  alan: RasyoAlan | null     // EkonomiRasyo alanı; yoksa null (model/pano)
  kod: string | null         // 'lib/pes/ekonomi-hesap.ts#marj'
  girdiler: FormulGirdi[]    // hesap izi için: etiket + değer anahtarı
}
```

`girdiler` **hesap izini** mümkün kılar: her girdi, değer havuzundaki
(rasyo ∪ param ∪ ham satır ∪ gider) bir anahtara işaret eder.

### 2. Hesap izi — `lib/pes/formul-izi.ts`

`formulIzi(girdi, havuz)` → girdilerin **gerçek sayılarla** listesi + sonuç.

**Formül metnine sayı yerleştiren bir ayrıştırıcı YAZILMAYACAK.** 54 farklı
ifadeyi string ikamesiyle çözmek kırılgan ve sessizce yanlış sonuç verir.
Bunun yerine iz bir **tablo**: girdi adı → gerçek değer, altında sonuç.
Dürüst, ve hangi girdinin sayıyı bozduğu doğrudan görünür.

`null` girdi "hesaplanamadı" olarak işaretlenir — 0 değil (E0 kuralı).

### 3. Ekran — `/pes/ekonomi/formuller`

- Kaynağa göre gruplanmış, aranabilir 54 satır
- Seçili dönemin **yürürlükteki parametre değerleri** yanda
- Atölye seçilirse her formülün altında **o atölyenin hesap izi**
- Radardan derin bağlantı: rasyo → `?formul=hesap.marj`

## Sürüklenmeye karşı koruma

Katalog kodu tekrar ettiği için **sapabilir**. Üç test bunu engelliyor:

1. `alan` dolu her giriş, gerçek `hesapla()` çıktısında var olan bir alana
   işaret etmeli
2. `kod` dolu her giriş, gerçekten dışa aktarılmış bir fonksiyona işaret etmeli
3. Sıralanabilir (`yon ≠ notr`) her rasyonun bir katalog girişi olmalı —
   yeni rasyo eklenip formülü yazılmazsa test kırılır

Üçüncüsü asıl kıymetli olan: katalog eksik kalırsa sessiz kalmaz.

## Ölçüt

- 54 giriş yüklü, `/pes/ekonomi/formuller` açılıyor
- Bir atölye seçilince marj izi gerçek sayıları gösteriyor
- Yeni bir rasyo eklenip kataloğa yazılmazsa test kırılıyor
