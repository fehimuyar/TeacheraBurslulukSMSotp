# Bursluluk 2026 Season-End Handoff

Bu doküman, sezon sonunda bursluluk akışında yapılan işlerin kısa özeti ve sonraki geliştirme önerileri için hazırlanmıştır.

## Bu Sezonda Yapılan Ana Düzenlemeler

### 1. Landing Sayfası

- `/bursluluk-2026` sayfası yeniden tasarlandı.
- Açık tema, daha sakin tipografi ve mobil öncelikli düzen kuruldu.
- Hero video alanı yeniden düzenlendi ve web için optimize edilmiş video kullanıldı.
- `Hemen Başvur` akışı landing içinde tutuldu.
- Sayfa içi spacing, CTA yerleşimi ve tablo görünümü birkaç tur boyunca rafine edildi.
- Sınav takvimi 3 oturuma düşürüldü:
  - `28 Mart 2026 10:00-11:00` -> `1.2.3.4. sınıflar`
  - `28 Mart 2026 13:00-14:00` -> `5.6.7.8. sınıflar`
  - `29 Mart 2026 13:00-14:00` -> `9.10.11.12. sınıflar`

### 2. Başvuru Formu

- Başvuru formu landing içinde popup/modal olarak çalışacak şekilde düzenlendi.
- Okul alanı için verilen okul listesine dayalı autocomplete eklendi.
- Listede olmayan okul için manuel giriş desteği bırakıldı.
- Sınıfa göre uygun oturumların filtrelenmesi eklendi.
- Sınıf seçimi `1-12` aralığına açıldı.
- `1. sınıf` ile `2. sınıf`, `11. sınıf` ile `12. sınıf` aynı soru mantığında ilerleyecek şekilde grade kabul aralığı güncellendi.
- Başvuru tamamlandığında bursluluk akışı session tabanlı olarak devam edecek yapı kuruldu.

### 3. Başvuru Onay Sayfası

- `/bursluluk/onay` sayfası yeniden düzenlendi.
- Başvuru bilgileri, giriş yönlendirmesi ve teknik hazırlık notları daha okunur hale getirildi.
- `Giriş Yap` ve `Şifreyi Tekrar Gönder` aksiyonları sadeleştirildi.
- Tipografi ve kart hiyerarşisi birkaç tur boyunca dengelendi.

### 4. Giriş Sayfası

- `/bursluluk/giris` sayfası sadeleştirildi.
- Aday giriş akışı ile şifre yenile akışı aynı sayfada tutuldu.
- Kullanıcıyı yormayan, mobilde daha rahat çalışan bir düzen kuruldu.

### 5. Menü ve Footer Güncellemeleri

- Mobil menü içine bursluluk akışı için iki ayrı rota eklendi:
  - `Bursluluk Başvuru` -> `/bursluluk-2026`
  - `Bursluluk Giriş` -> `/bursluluk/giris`
- Footer `Site Haritası` alanına `Bursluluk Sınavı Başvuru` linki eklendi.
- `Bursluluk Giriş` için menü içinde ayrı CTA benzeri bir görünüm denendi, ancak geri alındı.
- Final durumda `Bursluluk Giriş`, diğer menü öğeleriyle aynı satır düzeninde normal menü maddesi olarak bırakıldı.

## Mevcut Giriş Mantığı

Şu anki akışta:

- Kullanıcı adı olarak `başvuru numarası` kullanılıyor.
- Şifre olarak SMS ile gelen oturum bazlı teknik token kullanılıyor.
- Şifre yenile akışı giriş sayfasında `başvuru numarası + veli telefonu` ile çalışıyor.
- Onay sayfasında ise `Şifreyi Tekrar Gönder` akışı mevcut aday oturumu üzerinden çalışıyor.

Bu yapı güvenlik açısından kabul edilebilir olsa da kullanım kolaylığı açısından zayıf bulunmuştur.

## Sezon Sonu İçin Öneriler

Bu bölümdeki maddeler öneridir. Mevcut kodda uygulanmamıştır.

### 1. Giriş Alanları Yeniden Ele Alınmalı

Öneri:

- Girişte `başvuru numarası` yerine daha kısa bir `aday kodu` kullanılmalı.
- Şifre olarak teknik oturum tokenı yerine kısa ve insan dostu bir `kısa şifre` kullanılmalı.

Gerekçe:

- Mevcut başvuru numarası karmaşık ve uzun.
- Mevcut SMS şifresi kullanıcı dostu değil.
- Elle giriş yapan veli ve öğrenciler için hata riski yükseliyor.
- Tablet, bilgisayar ve ortak cihaz kullanımında kullanıcı deneyimi zayıflıyor.

Not:

- İçeride mevcut `application_no` ve teknik `session token` tutulabilir.
- Ancak kullanıcı arayüzünde daha kısa ve okunabilir bir kimlik modeli tercih edilmelidir.

### 2. Şifremi Yenile Akışı Değiştirilmeli

Öneri:

- `Şifremi Yenile` akışı `TC Kimlik No + Doğum Yılı` ile başlamalı.
- Bu bilgiler doğrulandıktan sonra kayıtlı telefon numarası otomatik gösterilmeli.
- Kullanıcı onay verdikten sonra SMS tekrar gönderilmeli.
- Bu işlem sırasında `aday kodu` sabit kalmalı.
- Yalnızca şifre yenilenmeli ve SMS ile tekrar iletilmeli.

Beklenen akış:

1. Kullanıcı `TC Kimlik No` girer.
2. Kullanıcı `Doğum Yılı` girer.
3. Sistem eşleşen adayı bulur.
4. Kayıtlı telefon numarası masked veya güvenli biçimde gösterilir.
5. `SMS Tekrar Gönder` butonu açılır.
6. Aynı adaya ait kısa şifre yeniden üretilir veya yenilenir ve SMS ile gönderilir.
7. Aday kodu değişmez.

Not:

- Bu öneri mevcut backend auth/recovery kontratını değiştirir.
- Uygulanmadan önce güvenlik, rate limit ve veri doğrulama kuralları yeniden ele alınmalıdır.
- Bu öneri özellikle giriş sayfasındaki mevcut `başvuru numarası + veli telefonu` akışının yerine düşünülmüştür.

### 3. SMS Linki Ana Akış Olmamalı

Değerlendirme:

- Aynı ailede birden fazla öğrencinin bulunması,
- Aynı telefon numarasının birden fazla aday için kullanılması,
- Kullanıcının telefondan değil tablet veya bilgisayardan giriş yapmak istemesi

nedenleriyle yalnızca SMS linkine dayalı giriş ana yöntem olarak önerilmemektedir.

SMS linki yalnızca yardımcı kolaylaştırıcı seçenek olarak değerlendirilebilir.

## Sonuç

Bu sezon kurulan yapı işlevsel hale gelmiştir; ancak giriş deneyimi kullanıcı dostuluğu açısından bir sonraki geliştirme turunda yeniden ele alınmalıdır.

Öncelikli öneri:

- `aday kodu + kısa şifre` modeline geçilmesi
- `şifremi yenile` akışının `TC Kimlik No + Doğum Yılı -> kayıtlı telefon -> SMS tekrar gönder` şeklinde yeniden tasarlanması

## Uygulama Notu

Bu dokümanda yer alan aşağıdaki maddeler mevcut sistemde uygulanmış durumdadır:

- landing yeniden tasarımı
- modal başvuru formu
- onay ekranı güncellemeleri
- giriş ekranı sadeleştirmeleri
- menü ve footer bursluluk linkleri

Bu dokümanda yer alan aşağıdaki maddeler ise öneri niteliğindedir ve henüz uygulanmamıştır:

- `aday kodu + kısa şifre` giriş modeli
- `TC Kimlik No + Doğum Yılı -> telefon -> SMS tekrar gönder` yenileme akışı
- SMS linkinin yalnızca yardımcı yöntem olarak değerlendirilmesi
