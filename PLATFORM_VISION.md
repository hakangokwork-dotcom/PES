# PES Platform Vizyonu — Atölye Odaklı Verimlilik Sistemi

> **Temel Felsefe:** Önce TEK atölye için gerçek değer üret. Atölye bu sistemi kendi işi için kullanmak İSTESİN. Sonra 100 atölyeye ölçekle.

---

## 1. Neden Önce Atölye?

Mevcut sorun: Merkezi sistemler veri toplar ama atölyeye geri dönüş vermez. Atölye "neden veri gireyim?" der.

**Çözüm:** Platform atölyenin KENDİ işine yarar →
- Kendi verimlilik darboğazlarını görür
- Adet başı maliyetini bilir
- Hangi modelin karlı, hangisinin zararlı olduğunu anlar
- Bant dengesizliklerini tespit eder
- Kalite kayıplarının maliyetini hesaplar

Atölye bu değeri görünce veri girmeye istekli olur → Merkez de bu veriye erişir → Win-win.

---

## 2. Atölye Kullanıcısı Ne Görecek?

### 2.1 Atölye Dashboard'u
- **Günlük üretim özeti** — bugün kaç adet üretildi, hedefin %kaçı
- **Anlık verimlilik** — her bandın verimlilik %'si
- **Adet başı maliyet** — bu ay ne kadara mal ediyoruz
- **Dakika başı maliyet** — TL/dk (en kritik rasyo)
- **Kalite durumu** — FPQ, red oranı
- **Duruş özeti** — bu ay toplam kayıp süre
- **Kendi skoru** — sektör benchmark'ına göre konumu

### 2.2 Atölye Veri Girişi
| Veri | Sıklık | Kim Girer |
|------|--------|-----------|
| Atölye profili (çalışan, bant, makine) | İlk kurulum + değişiklikte | Atölye yöneticisi |
| Model/SAM verileri | Her yeni model başlangıcında | Endüstri mühendisi / atölye |
| Günlük üretim adedi (bant bazlı) | Günlük | Bant şefi / üretim sorumlusu |
| Aylık gider kalemleri | Aylık | Muhasebe / atölye sahibi |
| Kalite kontrol sonuçları | Günlük veya haftalık | Kalite sorumlusu |
| Duruş kayıtları | Oluştuğunda | Bant şefi |
| Model değişim (changeover) | Oluştuğunda | Üretim planlama |
| İşgücü giriş-çıkış | Aylık | İK / atölye yöneticisi |

### 2.3 Atölye Analiz Araçları

#### A. Verimlilik Analizi
- Model bazlı verimlilik karşılaştırması
- Bant bazlı verimlilik karşılaştırması
- Günlük/haftalık/aylık trend
- Hedef vs gerçekleşen gap analizi
- "En iyi performans gününüz X tarihiydi, o gün ne farklıydı?" önerileri

#### B. Maliyet Analizi
- Adet başı maliyet breakdown (personel, enerji, malzeme...)
- Model bazlı karlılık analizi — hangi model karlı, hangisi zararlı
- "Bu modeli %85 verimlilikle dikseydiniz adet maliyeti X olurdu" simülasyonu
- Gider kalemlerinin toplam içindeki oranları (pasta grafik)
- Önceki aya göre maliyet değişimi

#### C. Darboğaz Analizi
- Her bant için süreç bazlı kapasite görünümü
- Darboğaz operasyonun tespiti — "Montaj süreciniz hattı kısıtlıyor"
- Darboğaz çözüm önerileri (operatör ekleme, iş bölümü)
- Bant dengesi skoru

#### D. Kalite Analizi
- FPQ trendi (aylık)
- Hata Pareto analizi — en sık hata türleri
- Kalite kayıp maliyeti hesabı (yeniden işlem + red maliyeti)
- Hata kaynağı analizi (hangi bant, hangi operasyon)

#### E. Duruş ve OEE
- OEE hesabı (Kullanılabilirlik × Performans × Kalite)
- Duruş Pareto — en sık duruş nedenleri
- Planlı vs plansız duruş oranı
- Duruş kaynaklı kayıp üretim ve maliyet

#### F. İşgücü Analizi
- Devir oranı trendi
- Yeni çalışan ısınma dönemi kapasite kaybı hesabı
- Deneyimli/yeni çalışan oranı
- Kıdem dağılımı

---

## 3. Atölye İçin "Aklınıza Gelmemiş Olabilecek" Özellikler

### 3.1 Operatör Bazlı Verimlilik (İleri Seviye)
- Her operatörün hangi operasyonda ne kadar hızlı olduğu
- Çok yönlü operatör tespiti (birden fazla makine kullanabilen)
- Operatör eğitim ihtiyaç analizi
- Bant atama optimizasyonu önerisi

### 3.2 Model Değişim Optimizasyonu
- Hangi model sıralamasıyla changeover süresi minimize olur
- Benzer modelleri arka arkaya planlama önerisi
- Changeover süresinin verimlilik etkisi hesabı

### 3.3 Maliyet Simülasyonu ("Ne Olur Eğer?")
- "Elektrik %20 artarsa adet maliyetim ne olur?"
- "10 operatör daha alırsam kapasitem ve maliyetim nasıl değişir?"
- "Bu modeli %90 verimlilikle diksem ne kazanırım?"
- Farklı senaryo karşılaştırmaları

### 3.4 Sipariş Bazlı Takip
- Gelen sipariş → hangi banta atandı → üretim durumu
- Tahmini teslim tarihi hesabı (mevcut kapasiteye göre)
- Sipariş bazlı karlılık analizi

### 3.5 Bakım ve Makine Takibi
- Makine yaşı ve bakım takvimi
- Arıza geçmişi ve sıklığı
- Önleyici bakım hatırlatmaları
- Makine bazlı duruş analizi

### 3.6 Hedef Belirleme ve Takip
- Atölye kendi hedeflerini girer (verimlilik, kalite, maliyet)
- Hedefe doğru ilerleme çubuğu
- Haftalık/aylık hedef tutturma oranı
- "Bu ayın hedefine ulaşmak için günlük X adet üretmeniz gerekiyor"

### 3.7 Otomatik Uyarılar
- Verimlilik %70'in altına düştüğünde uyarı
- FPQ %90'ın altına düştüğünde uyarı
- Plansız duruş 30 dk'yı geçtiğinde uyarı
- Gider girişi ayın 5'ine kadar yapılmadıysa hatırlatma

### 3.8 Mobil Uyumluluk
- Üretim adedi girişi telefon/tabletten yapılabilmeli
- Duruş kaydı anlık girilebilmeli
- Dashboard telefonda görüntülenebilmeli

### 3.9 Sezonluk Planlama
- Geçmiş yılların sezonluk üretim kalıpları
- Yoğun dönem tahmini ve kapasite planlaması
- Fazla mesai ihtiyaç tahmini

### 3.10 Performans Panosu (TV/Monitör)
- Atölye içine asılacak büyük ekran görünümü
- Anlık üretim adedi, verimlilik, hedef
- Bant bazlı renk kodlu durum (yeşil/sarı/kırmızı)
- Motivasyon: "Hedefe X adet kaldı!"

---

## 4. Merkez (Sizin) Görünümü

### 4.1 Cross-Workshop Dashboard
- Tüm atölyelerin skor sıralaması
- Kademe dağılımı (Stratejik/Gelişen/İzlemede/Risk/Kritik)
- Verimlilik haritası (şehir bazlı)
- Trend: iyileşen vs kötüleşen atölyeler

### 4.2 Temel Rasyolar / Benchmark Yönetimi
- Sektör ortalamalarını belirleme
- Hedef eşik değerleri tanımlama
- Atölyelere otomatik benchmark karşılaştırması
- Rasyo güncelleme geçmişi

### 4.3 Sipariş Dağıtım Karar Desteği
- Boş kapasite olan atölyeler
- Skor + kapasite + ürün uyumu matriksi
- Risk konsantrasyonu kontrolü
- Öneri: "Bu siparişi ATL-004'e verin çünkü..."

### 4.4 Geliştirme Planı Yönetimi
- Düşük skorlu atölyeler için aksiyon planı
- Takip ve ilerleme kayıtları
- Saha ziyareti planlaması

### 4.5 Veri Kalitesi İzleme
- Hangi atölye zamanında veri giriyor
- Eksik/tutarsız veri tespiti
- Veri kalite skoru atölye bazlı

---

## 5. Teknik Mimari

### 5.1 Aynı Proje, İki Görünüm
```
PES/
├── app/
│   ├── login/              ← Ortak giriş
│   ├── workshop/           ← Atölye görünümü (kendi verileri)
│   │   ├── page.tsx        ← Atölye dashboard
│   │   ├── production/     ← Üretim girişi
│   │   ├── costs/          ← Gider girişi
│   │   ├── quality/        ← Kalite girişi
│   │   ├── analysis/       ← Verimlilik analizi
│   │   ├── models/         ← Model/SAM yönetimi
│   │   └── settings/       ← Profil ayarları
│   └── admin/              ← Merkez görünümü (tüm atölyeler)
│       ├── page.tsx        ← Merkez dashboard
│       ├── workshops/      ← Atölye listesi + detay
│       ├── scoring/        ← Skorlama
│       ├── benchmarks/     ← Temel rasyolar
│       ├── reports/        ← Cross-workshop raporlar
│       └── planning/       ← Kapasite planlama
```

### 5.2 Auth ve Veri İzolasyonu
- Her atölye bir kullanıcı hesabı alır
- Giriş yapınca rolüne göre yönlendirme:
  - `role = 'workshop'` → `/workshop` (kendi verileri)
  - `role = 'admin'` → `/admin` (tüm veriler)
- RLS ile her atölye sadece kendi verisini görür
- Admin tüm verilere erişir

### 5.3 Veri Paylaşım Modeli
- Atölye kendi verisini girer → otomatik merkeze görünür
- Merkez benchmark değerlerini girer → atölyelere görünür
- Atölye diğer atölyelerin verisini GÖREMEZ
- Atölye kendi sektör pozisyonunu görebilir (anonim karşılaştırma)

---

## 6. Uygulama Fazları

### Faz 1: Tek Atölye MVP (2-3 hafta)
- [ ] Auth sistemi (atölye giriş)
- [ ] Atölye profil yönetimi
- [ ] Üretim verisi girişi (günlük)
- [ ] Gider girişi (aylık)
- [ ] Verimlilik dashboard'u
- [ ] Maliyet hesabı (TL/dk, adet başı)
- [ ] Basit raporlar

### Faz 2: Atölye Değer Katmanı (2-3 hafta)
- [ ] Model/SAM kütüphanesi
- [ ] Bant bazlı verimlilik karşılaştırması
- [ ] Kalite takibi + FPQ
- [ ] Duruş kayıtları + OEE
- [ ] Darboğaz tespiti
- [ ] Maliyet simülasyonu
- [ ] Hedef belirleme ve takip

### Faz 3: Merkez Katmanı (2-3 hafta)
- [ ] Admin dashboard
- [ ] Çoklu atölye yönetimi
- [ ] Tedarikçi skorlama
- [ ] Benchmark yönetimi
- [ ] Cross-workshop raporlar
- [ ] Sipariş dağıtım desteği

### Faz 4: Ölçekleme (Sürekli)
- [ ] 10 pilot atölye onboarding
- [ ] Mobil uyumluluk
- [ ] Otomatik uyarılar
- [ ] 100 atölye hedefi
- [ ] Performans panosu (TV modu)

---

## 7. Atölye İçin Değer Önerisi (Satış Argümanı)

> "Bu sistemi kullanarak:
> - Hangi modelinizin karlı, hangisinin zararlı olduğunu görürsünüz
> - Darboğaz operasyonunuzu tespit edip çözersiniz
> - Verimlilik kaybınızın TL karşılığını bilirsiniz
> - Kalite kayıplarınızın maliyetini hesaplarsınız
> - Sektör ortalamasına göre nerede olduğunuzu görürsünüz
> - Hedeflerinize doğru ilerlemenizi takip edersiniz"

---

*Son güncelleme: Nisan 2026*
