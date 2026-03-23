# Bursluluk V1 Panel Frontend Living Log

Date: 2026-03-20  
Status: Active working log  
Owner: Frontend-first implementation lane  
Primary runtime: `apps/www`

## 1. Amaç

Bu doküman iki işi aynı anda yapmak için tutulur:

- panel frontend tarafında yapılan değişiklikleri tek yerde tarihli şekilde toplamak
- diğer mühendisin kodu, kontratları ve bağımlılıkları hızlıca bulabilmesini sağlamak

Bu belge ikinci bir changelog değildir. Panel tarafındaki aktif handoff ve uygulama notu olarak kullanılacaktır.

## 2. Dış Girdiler ve Ürün Niyeti

Bu çalışma kolu aşağıdaki dış girdileri ürün niyeti olarak esas alır:

- `/Users/afumacpro/Downloads/bursluluk-v1-yol-haritasi.md`
- `/Users/afumacpro/Downloads/BURSLULUK AKIŞI.docx`

Bu iki belge panelin büyük resmini şu eksende sabitler:

- bursluluk akışı yalnız sınav değil, operasyon ve dönüşüm yüzeyidir
- panel v1 içinde görünür ve yönetilebilir operasyon ekranları olmalıdır
- UI tarafı yeni backend uydurarak ilerlememelidir
- mevcut çalışan yüzeyler korunarak genişletme yapılmalıdır

## 3. Repo Gerçekliği ve Edit Sınırları

Bu iş kolunda repo gerçeği, dış roadmap notundan daha güncel kabul edilir.

- Resmi frontend edit hedefi `apps/www` altıdır.
- Root `src/` ağacı tarihsel karşılaştırma ve drift tespiti için okunabilir; aktif edit yüzeyi değildir.
- Root `api/` ve `api/_lib/` bu iş kolunda edit hedefi değildir.
- Panel frontend aynı SPA içinde `/panel/*` route ailesi olarak çalışır; ayrı panel frontend app yoktur.

Bu iş kolu için açık karar:

- Dış roadmap dosyasındaki `root src source-of-truth` notu stale kabul edilmiştir.
- Panel frontend değişiklikleri `apps/www/src/**` altında yapılacaktır.
- Legacy root runtime mirror yalnız uyumluluk gerektiren endpoint eklemelerinde elle eşlenir; canonical kaynak yine `apps/*/api` kalır.

Başlangıç anındaki kirli çalışma ağacı notu:

- panel auth/backend tarafında kullanıcıya ait mevcut değişiklikler vardı
- bursluluk candidate akışında kullanıcıya ait mevcut değişiklikler vardı
- bu turda yalnız `apps/www` panel yüzeyi ve `guidelines` altındaki living doc hedeflendi

## 4. Aktif Panel Kapsamı

Bu ilk dilimde canlı geliştirilen yüzeyler:

- `/panel/login`
- `/panel/dashboard`
- `/panel/password-reset`
- dashboard altı operasyon yüzeyleri:
  - `Anasayfa / Owner Console`
  - `CRM Aktarım`
  - `Bursluluk Adaylar`
  - `Otomasyon Merkezi`
  - `Entegrasyon Sağlığı`
  - `Güvenlik & Audit`
  - `Ayarlar`

Bu turda özellikle yapılmayacaklar:

- yeni backend endpoint uydurma
- yeni veri modeli varsayımı
- roadmap’te geçen ama backend’i hazır olmayan yeni ekranları canlı route olarak ekleme
- root `src` ile paralel UI üretme

## 5. Nerede Bulurum?

| Alan | Frontend yolları | Bağlı API yüzeyi | Durum |
| --- | --- | --- | --- |
| Panel shell ve view yönlendirme | `apps/www/src/app/components/panel/PanelDashboardPage.tsx`, `apps/www/src/app/routes.ts` | `/api/panel/auth/me`, `/api/panel/dashboard`, `/api/panel/settings` | aktif |
| Başvurular inbox ve detay | `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`, `apps/www/src/app/components/panel/PanelDashboardPage.tsx` | `/api/panel/applications`, `/api/panel/applications/:id`, `/api/panel/applications/actions` | aktif |
| Panel login | `apps/www/src/app/components/panel/PanelLoginPage.tsx` | `/api/panel/auth/login`, `/api/panel/auth/me` | aktif |
| Şifre yenileme | `apps/www/src/app/components/panel/PanelPasswordResetPage.tsx` | `/api/panel/auth/password-reset`, `/api/panel/auth/me` | aktif |
| Aday operasyonları | `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx` | `/api/panel/candidates`, `/api/panel/candidates/actions`, `/api/panel/candidates/export` | aktif |
| Bildirim merkezi | `apps/www/src/app/components/panel/NotificationCenterPanel.tsx` | `/api/panel/notifications`, `/api/panel/notifications/actions` | aktif |
| Sonuç görmeyenler | `apps/www/src/app/components/panel/UnviewedResultsPanel.tsx` | `/api/panel/unviewed-results`, `/api/panel/unviewed-results/actions` | aktif |
| DLQ operasyonu | `apps/www/src/app/components/panel/DlqOperationsPanel.tsx` | `/api/panel/dlq`, `/api/panel/dlq/actions` | aktif |
| Panel ayarları | `apps/www/src/app/components/panel/SettingsOperationsPanel.tsx` | `/api/panel/settings` | aktif |
| Audit ekranı | `apps/www/src/app/components/panel/PanelAuditTrailPanel.tsx` | `/api/panel/audit`, `/api/panel/audit/export` | aktif |
| Panel rol davranışı | `apps/www/src/app/components/panel/panelRoleAccess.ts` | panel role payload’ları | aktif |
| Ortak panel UI yardımcıları | `apps/www/src/app/components/panel/panelUi.tsx` | kontrat etkisi yok | aktif |
| Panel API resolver/fetch | `apps/www/src/app/api/panelApi.ts` | `VITE_PANEL_API_BASE` | aktif |
| Panel admin bootstrap | `scripts/panel-create-admin.mjs` | `admin_users`, `admin_user_roles`, `roles`, `admin_sessions` | aktif |
| Owner console step-up UI preview | `apps/www/src/app/components/panel/PanelDashboardPage.tsx` | yeni backend servisi gerekir | planned / frontend preview |

## 6. Bu Turda Yapılan Değişiklikler

### 2026-03-20

- Living doc eklendi.
  - Yol: `guidelines/bursluluk-v1-panel-frontend-living-log.md`
  - Kontrat etkisi: yok
  - Amaç: tek yaşayan handoff + değişiklik günlüğü yüzeyi oluşturmak

- Panel için ortak UI helper katmanı eklendi.
  - Yol: `apps/www/src/app/components/panel/panelUi.tsx`
  - Kontrat etkisi: yok
  - Amaç: surface, stat card, button, feedback ve loading/empty-state tekrarlarını düşük riskle merkezileştirmek

- Panel auth ekranları görsel olarak toparlandı.
  - Yollar:
    - `apps/www/src/app/components/panel/PanelLoginPage.tsx`
    - `apps/www/src/app/components/panel/PanelPasswordResetPage.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar: metin hiyerarşisi sadeleştirildi, ortak not kartı/feedback dili kullanıldı

- Dashboard shell ve görev/operasyon yüzeyi ortak panel diliyle hizalandı.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar: error/loading/auth-required görünümü, stat kartları ve action chip’leri ortak helper’a bağlandı

- Panel owner console bilgi mimarisi kuruldu.
  - Yollar:
    - `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
    - `apps/www/src/app/routes.ts`
  - Kontrat etkisi: mevcut `/panel/dashboard?view=...&focus=...` shell korunarak view seti genişletildi
  - Yapılanlar:
    - dashboard shell `desktop-first owner console` yapısına taşındı
    - kalıcı sidebar, üst sağlık barı ve owner sağ rail eklendi
    - canlı modüller `Anasayfa`, `CRM Aktarım`, `Bursluluk Adaylar`, `Otomasyon Merkezi`, `Entegrasyon Sağlığı`, `Güvenlik & Audit`, `Ayarlar` altında yeniden eşlendi
    - backend’i hazır olmayan modüller panel içinde `planned / backend-dependent` placeholder yüzeyleri olarak işlendi
    - eski panel route alias’ları korunup yeni IA’ya yönlendirildi

- Panel ortak görsel sistemi açık tema owner console diline geçirildi.
  - Yollar:
    - `apps/www/src/app/components/panel/panelUi.tsx`
    - `apps/www/src/app/components/panel/PanelPasswordResetPage.tsx`
    - `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/NotificationCenterPanel.tsx`
    - `apps/www/src/app/components/panel/DlqOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/UnviewedResultsPanel.tsx`
    - `apps/www/src/app/components/panel/SettingsOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/PanelAuditTrailPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - açık tema, yeşil ağırlıklı, neutraface text temelli panel yüzeyi kuruldu
    - stat kartları, tablolar, filter bölgeleri ve action butonları light owner console paletine taşındı
    - password reset ekranı login ile aynı premium sade dilde hizalandı

- Kritik owner aksiyonları için step-up doğrulama UI preview eklendi.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: gelecekte yeni backend OTP kontratı gerektirir
  - Yapılanlar:
    - SMS OTP birincil, mail OTP fallback mantığıyla modal akışı kuruldu
    - `Kullanıcı oluştur`, `Rol ata`, `IP kuralı ekle`, `2FA zorunlu yap`, `Kuyruğu durdur/devam ettir` owner aksiyonları modal üzerinden tasarım önizlemesine bağlandı
    - şu an gerçek OTP doğrulaması yok; akış UI preview olarak işaretlendi

- Owner sidebar ikinci turda gerçek menü hiyerarşisine taşındı.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - sidebar kart listesi yerine bölüm başlıklı navigation yapısı kuruldu
    - `Operasyon / Kontrol / Yönetim` ayrımı yapıldı
    - aktif modül vurgusu sıkı satır ritmiyle menü davranışına çevrildi
    - seçili modül özeti sidebar altına taşındı

- Owner console yanlış ilk uygulama revize edilerek gerçek app shell'e taşındı.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yok
  - Revizyon nedeni:
    - ilk owner console denemesi hâlâ `dashboard + kart koleksiyonu` gibi davranıyordu
    - menü görsel olarak sol dock hissi vermiyor, içerikle aynı ağırlıkta yüzüyordu
    - canlı modüller ile planned modüller yeterince sert ayrışmıyordu
  - Yeni karar:
    - sidebar viewport'a dock olan tam yükseklikli app shell olarak yeniden kuruldu
    - üst bölüm hero yerine kompakt topbar olarak sadeleştirildi
    - anasayfa sağlık ve kritik uyarı öncelikli başladı; KPI yüzeyleri ikinci katmana itildi
    - planned modüller locked/backend-dependent davranışıyla içerikte tek standarda bağlandı
    - step-up modal owner action layer olarak korundu ve frontend preview olduğu açık bırakıldı

- Owner shell metin yükü azaltıldı ve çıkış menü altına taşındı.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - sidebar üstündeki `Teachera Ops / Owner Console / Solda sabit menü...` blokları kaldırıldı
    - topbar içindeki `Desktop-First Owner Console` ve modül açıklama metni kaldırıldı
    - `Seçili Modül` özet kartı kaldırıldı
    - oturum/çıkış alanı topbar’dan çıkarılıp sidebar footer’a taşındı
    - çıkış aksiyonu `Çıkış Yap` olarak yeniden adlandırıldı

- Owner ana sayfası health-first ve contract-visible KPI düzenine taşındı.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yeni public API yok, mevcut panel summary yüzeyleri birlikte okunuyor
  - Yapılanlar:
    - ana sayfa `Kritik Durum Şeridi`, `Kurum Performansı`, `İletişim ve Takip Sağlığı`, `Modül Snapshot Kartları` sırasıyla yeniden kuruldu
    - eski generic sağlık kartları, uzun açıklama blokları, trend alanı ve home sağ rail kaldırıldı
    - canlı veri olmayan `Randevu / Gerçekleşen Randevu / Kayıt / Dönüşüm` KPI’ları fake sayı yerine görünür placeholder kart olarak işlendi
    - home için mevcut `/api/panel/dashboard`, `/api/panel/candidates`, `/api/panel/notifications`, `/api/panel/unviewed-results`, `/api/panel/audit`, `/api/panel/settings` summary yüzeyleri birlikte okunmaya başlandı
    - üst bar yalnız başlık, kampanya filtresi, uygula ve yenile aksiyonuna indirildi
    - `ui-ux-pro-max` skill prensipleri manuel uygulandı; skill içindeki script yolu bu ortamda dosya yönlendirmesi bozuk olduğu için otomatik design-system çıktısı alınamadı

- Owner home kullanıcı dostu bir hiyerarşiyle ikinci kez rafine edildi.
  - Yol: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - ana sayfanın üstüne karar odaklı `Bugünün Özeti` bloğu eklendi
    - teknik başlıklar daha doğal Türkçeye çekildi: `Giriş SMS Başarısı`, `WhatsApp Ulaşımı`, `Bekleyen Bildirim` gibi
    - placeholder kartlarda teknik kaynak etiketi daha geri plana taşındı, kullanıcı metni baskın hale getirildi
    - modül snapshot kartları kart içinde kart yerine daha kolay taranan satır düzenine geçirildi

- Operasyon panellerinde görünür tekrarlar azaltıldı.
  - Yollar:
    - `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/NotificationCenterPanel.tsx`
    - `apps/www/src/app/components/panel/UnviewedResultsPanel.tsx`
    - `apps/www/src/app/components/panel/DlqOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/SettingsOperationsPanel.tsx`
    - `apps/www/src/app/components/panel/PanelAuditTrailPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar: section wrapper, stat card, primary/secondary action, feedback, loading ve empty-state sunumları ortaklaştırıldı

- Panel admin bootstrap script’i kurulum açısından toparlandı.
  - Yol: `scripts/panel-create-admin.mjs`
  - Kontrat etkisi: yeni public API yok, yalnız admin seed/maintenance akışı iyileştirildi
  - Yapılanlar: `--env-file` desteği eklendi, güvenli local env autoload eklendi, `tckn` opsiyonel hale getirildi, email verilmezse TCKN’den iç kullanım için türetiliyor, mevcut kullanıcı email veya TCKN ile bulunup güncellenebiliyor

- İstenen panel `SUPER_ADMIN` hesabı bootstrap script’i üzerinden upsert edildi.
  - Yol: `scripts/panel-create-admin.mjs`
  - Kontrat etkisi: yok
  - Not: hassas kimlik ve parola bilgileri bilinçli olarak repoya yazılmadı; işlem runtime sırasında env üzerinden veritabanına uygulandı

- Başvurular modülü canlı inbox akışıyla açıldı.
  - Yollar:
    - `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`
    - `apps/www/src/app/components/panel/PanelDashboardPage.tsx`
    - `apps/exam-api/api/forms.js`
    - `apps/panel-api/api/panel/applications/index.js`
    - `apps/panel-api/api/panel/applications/[id].js`
    - `apps/panel-api/api/panel/applications/actions.js`
    - `db/migrations/20260320_0009_panel_lead_form_inbox.sql`
    - legacy mirror: `api/forms.js`, `api/panel/applications/*`
  - Kontrat etkisi:
    - yeni panel endpoint ailesi eklendi:
      - `/api/panel/applications`
      - `/api/panel/applications/:id`
      - `/api/panel/applications/actions`
    - mevcut `/api/forms` akışı korunarak eligible lead formlar panel inbox’a persist edilmeye başladı
  - Dahil edilen formlar:
    - `Teachera Geri Arama Talebi`
    - `Ucretsiz Deneme Seansi Talebi`
    - `Seviye Tespit Talebi`
    - `Egitim Formati Danismanlik Talebi`
    - `Kurumsal Egitim Teklif Talebi`
  - Hariç tutulan formlar:
    - `İş Başvurusu Formu`
    - `Musteri Temsilcisi Basvurusu`
    - `Teachera Elci Programi Basvurusu`
    - `SpeakUP Campus Basvuru Talebi`
    - `Teachera Academy Bulten Abonelik Talebi`
  - Yapılanlar:
    - `Başvurular` menüde planned olmaktan çıkarılıp canlı modüle bağlandı
    - liste görünümü `desktop-first inbox` mantığıyla yeniden tasarlandı
    - detay görünümü aynı shell içinde `applicationId` query param ile ayrı sayfa olarak açıldı
    - toplu `CRM’e Aktar` ve detay bazlı append-only not ekleme akışı kuruldu
    - CRM listesi bilinçli olarak yalnız `Aktarıldı / Aktarılmadı` durumunu gösterir; son hata yalnız detayda görünür
    - `ui-ux-pro-max` prensipleri manuel uygulandı; skill CLI yolu bu ortamda bozuk olduğu için otomatik design-system çıktısı alınamadı

- Başvurular modülü ikinci turda daha sade ve taranabilir bir operasyon inbox’una çekildi.
  - Yollar:
    - `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - üst özet kartları daha sakin bir ritimde yeniden ele alındı
    - filtre ve aksiyon alanı tek kompakt toolbar altında toplandı
    - liste görünümündeki açıklama ve chrome yoğunluğu azaltıldı
    - tablo satırları daha net okunacak şekilde sadeleştirildi
    - detay ekranı `başvuru bilgileri` ve `operasyon` ayrımını daha güçlü verecek şekilde revize edildi
    - `ui-ux-pro-max` admin panel ve okunabilirlik ilkeleri manuel uygulandı

- Başvurular listesi üçüncü turda daha kompakt filtre ve tablo düzenine çekildi.
  - Yol:
    - `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - filtre alanı daha kısa ve tek bakışta okunur hale getirildi
    - tablo kolon sırası `Tarih / Tür / İsim / Telefon / CRM / Notlar / İşlem` olacak şekilde düzenlendi
    - tür sütununda kısaltma badge yapısına geçildi
    - `Son Aktarım` sütunu kaldırıldı
    - CRM durumu sembolleştirildi; tik yoksa aktarılmamış kabul edilir

- Başvurular listesi dördüncü turda tipografi ve filtre dengesi açısından yeniden düzenlendi.
  - Yol:
    - `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - filtre alanı etiketli ve daha düzenli bir desktop filter rail yapısına çevrildi
    - özet kartları ve tablo başlıklarında font hiyerarşisi sadeleştirildi
    - tablo satırlarında alt metin yoğunluğu azaltıldı ve not özeti tek satıra indirildi
    - `ui-ux-pro-max` typography, layout ve admin table ilkeleri manuel uygulandı

- Başvurular listesi beşinci turda filtre etkileşimi ve başlık yoğunluğu açısından yeniden sıkılaştırıldı.
  - Yol:
    - `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`
  - Kontrat etkisi: yok
  - Yapılanlar:
    - üst açıklama metni kaldırıldı
    - filtre paneli ikonla açılan kapalı yapı haline getirildi
    - filtre aksiyonları açık panelin altına taşındı
    - filtre etiketleri ve tablo başlıkları daha dengeli bir tipografik ritme çekildi

## 7. Mevcut Kontratlar ve Backend Bağımlılıkları

Bu dilim mevcut hazır backend yüzeyleriyle sınırlıdır:

- `/api/panel/auth/*`
- `/api/panel/dashboard`
- `/api/panel/applications`
- `/api/panel/applications/:id`
- `/api/panel/applications/actions`
- `/api/panel/candidates`
- `/api/panel/notifications`
- `/api/panel/dlq`
- `/api/panel/unviewed-results`
- `/api/panel/settings`
- `/api/panel/audit`

Panel auth/MFA davranışı için mevcut backend notları:

- OTP zorunluluğu global olarak `PANEL_REQUIRE_OTP` env flag’i ile açılır.
- Flag unset veya `false` ise panel session’ı OTP olmadan ilerleyebilir.
- Kullanıcı bazlı OTP, `admin_users.mfa_enabled` ve `admin_users.mfa_totp_secret` alanlarıyla belirlenir.
- Panel admin seed/rotation işlemleri `scripts/panel-create-admin.mjs` üzerinden yönetilir.

Frontend bu turda aşağıdakileri tahmin ederek implement etmez:

- sonuç override / publish / unpublish paneli
- appointments, advisor operations, school performance
- CRM export UI
- bot activity görünümü
- dashboard funnel genişlemeleri
- candidate forgot-password için `TCKN + birthYear` tabanlı yeni kontrat
- kritik aksiyon SMS OTP / mail OTP backend servisi
- randevu / gerçekleşen randevu / kayıt KPI veri kaynağı

Bu maddeler roadmap’te vardır, ancak bu iş kolunda `planned / backend-dependent` kabul edilir.

## 8. Planned / Backend-Dependent Notlar

Panelde sonraki genişleme adayları:

- `Result Governance`
- `Appointments`
- `CRM Export`
- `Bot Activity`
- `School Performance`
- `Advisor Operations`
- `Kullanıcı Yönetimi`
- `Step-up OTP Service`

Bu alanlara geçmeden önce ilgili endpoint, payload ve yetki matrisi netleştirilmelidir.

## 9. Teknik Borç ve Dikkat Noktaları

- Panel hâlâ public shell’den gelen tracking/provider katmanını dolaylı olarak miras alıyor.
- Root `src` ile `apps/www/src` arasında drift var; yeni iş yanlış ağaca taşınmamalı.
- Panel büyük ölçüde query param temelli tek dashboard shell içinde yaşıyor; gereksiz route çoğaltılmamalı.
- Mevcut smoke script’ler canlı servis erişimine dayanabilir; explicit network onayı olmadan çalıştırılmamalıdır.

## 10. Doğrulama Notları

Bu turda çalıştırılan doğrulamalar:

- `npm --prefix apps/www run build`
  - Sonuç: PASS
- `npx eslint apps/www/src/app/components/panel apps/www/src/app/api/panelApi.ts`
  - Sonuç: PASS
- `npx eslint apps/www/src/app/components/panel/PanelDashboardPage.tsx apps/www/src/app/components/panel/panelUi.tsx apps/www/src/app/components/panel/CandidateOperationsPanel.tsx apps/www/src/app/components/panel/NotificationCenterPanel.tsx apps/www/src/app/components/panel/DlqOperationsPanel.tsx apps/www/src/app/components/panel/UnviewedResultsPanel.tsx apps/www/src/app/components/panel/SettingsOperationsPanel.tsx apps/www/src/app/components/panel/PanelAuditTrailPanel.tsx apps/www/src/app/components/panel/PanelPasswordResetPage.tsx apps/www/src/app/routes.ts`
  - Sonuç: PASS
- `npx eslint apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Sonuç: PASS
- `npm --prefix apps/www run build`
  - Sonuç: PASS
- `npx eslint apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx apps/www/src/app/components/panel/PanelDashboardPage.tsx`
  - Sonuç: PASS
- `npx eslint apps/exam-api/api/forms.js apps/panel-api/api/panel/applications/index.js apps/panel-api/api/panel/applications/[id].js apps/panel-api/api/panel/applications/actions.js`
  - Sonuç: PASS
- `node --check apps/exam-api/api/forms.js`
  - Sonuç: PASS
- `node --check api/forms.js`
  - Sonuç: PASS
- `node --check apps/panel-api/api/panel/applications/index.js`
  - Sonuç: PASS
- `node --check apps/panel-api/api/panel/applications/[id].js`
  - Sonuç: PASS
- `node --check apps/panel-api/api/panel/applications/actions.js`
  - Sonuç: PASS
- `node --check api/panel/applications/index.js`
  - Sonuç: PASS
- `node --check api/panel/applications/[id].js`
  - Sonuç: PASS
- `node --check api/panel/applications/actions.js`
  - Sonuç: PASS

Bu turda çalıştırılmayan doğrulamalar:

- `panel:step16:ops-grid`
- `panel:step17:rbac-session`
- `panel:step19:data-contract`
- `panel:step20:final-closeout`

Sebep:

- Bu smoke akışları canlı servis/host erişimi gerektirebilir.
- Bu repo için explicit network/fetch onayı alınmadan çalıştırılmadı.
