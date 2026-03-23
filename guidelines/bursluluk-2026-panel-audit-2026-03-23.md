# Bursluluk 2026 + Panel İnceleme Raporu

Date: 2026-03-23  
Workspace: `/Users/afumacpro/Documents/TeacheraWebsiteBurslulukSMSOTP`  
Scope: `apps/www`, `apps/panel-api`, `apps/exam-api`, `packages/shared/backend`, `db/migrations`, `guidelines`, kalite hattı ve smoke scriptleri  
Mode: İnceleme ve plan çıkarımı, uygulama yok

## 1. Yönetici Özeti

Bu inceleme, `bursluluk-2026` aday akışı ile panel tarafındaki son değişiklikleri birlikte değerlendirir. Sonuç net: repo içinde çalışan parçalar var, fakat sistemin bugünkü hali release güveni vermiyor. Sorun tek bir modülde değil; akış doğruluğu, auth güvenliği, kontrat bütünlüğü ve kalite hattı aynı anda kırık.

### P0 bulgular

1. Sınavda boş bırakılan cevaplar answered sayılabiliyor.
   - Frontend `selectedOption: null` satırlarını save ve submit payload’ına dahil ediyor.
   - Backend bu satırları `exam_answers` içine yazıp answered count içinde sayıyor.
   - Sonuç: unanswered metrikleri bozuluyor, sınav doğruluğu düşüyor.

2. Bekleme ekranı `exam_open=true` olmadan sınava geçişe izin verebiliyor.
   - `session/status` yanıtı yoksa veya hatalıysa client-side `examOpenAt` fallback’i ile kapı açılabiliyor.
   - Bu, tanımlı ürün kuralını ihlal ediyor.

3. Candidate sonuç endpoint’i publish edilmemiş sonucu da gösterebiliyor.
   - `GET /api/exam/results/:attemptId` candidate için `published_at IS NOT NULL` zorlamıyor.
   - Yanlışlıkla erken görünüm ve `VIEWED` side-effect riski var.

4. Panel password reset akışı policy bypass içeriyor.
   - `password-reset` endpoint’i `requireRole()` yerine `getPanelIdentity()` ile çalışıyor.
   - OTP zorunluluğu, password reset policy ve daha sıkı role guard bu endpointte uygulanmıyor.

5. Panel preview modu query param ile auth bypass yaratıyor.
   - `panelPreview=1` ile sahte `SUPER_ADMIN` preview identity üretilebiliyor.
   - Bu production davranışı olarak kabul edilemez.

6. Panel privileged view guard merkezi değil.
   - Sidebar görünürlüğü ile gerçek route/render guard ayrışmış durumda.
   - URL üzerinden `users`, `results`, `security` gibi yüzeylere erişim denenebiliyor.

7. Panel V2 modüllerinin büyük kısmı mock-only.
   - Appointments, exam builder, reports, system status, users ve operations center alt sekmelerinin önemli bölümü local state ile çalışıyor.
   - UI, bu modülleri her yerde yeterince sert bir şekilde preview/mock olarak işaretlemiyor.

### P1 bulgular

1. Frontend’in topladığı aday metadata backend’e gitmiyor.
   - `tckn`, `birthYear`, `branch`, `selectedSessionId`, `selectedSessionLabel`, `examOpenAt`, `schoolDistrict`, `schoolType` backend start kontratına dahil değil.

2. Çoklu oturum seçimi yalnız UI düzeyinde var.
   - Backend gate sadece campaign-level çalışıyor.
   - 28 Mart 10:00, 28 Mart 13:00, 29 Mart 13:00 ayrımı server tarafında saklanmıyor.

3. Panel login backend email login destekliyor, frontend desteklemiyor.
   - Migration ile `tckn optional` olmuş durumda.
   - UI hâlâ sadece 11 haneli TCKN formu üzerinden ilerliyor.

4. Settings yetki modeli frontend-backend uyumsuz.
   - Frontend `ADMIN` için edit açık gösteriyor.
   - Backend yalnız `SUPER_ADMIN` kabul ediyor.

5. Candidate drawer yanlış veya eksik veri gösteriyor.
   - `created_at` yerine `updated_at` kullanılıyor.
   - `appointment_status`, `registration_status`, `crm_status` bilinçli olarak `null` besleniyor.

6. Quality/evidence hattı bugünkü worktree için güvenilir değil.
   - Mevcut smoke artefact’leri stale.
   - CI root build ve legacy testlerle sınırlı.

### P2 bulgular

1. Sidebar IA tasarımı ile gerçek render uyuşmuyor.
2. `settings` route’u fiilen ölü.
3. Topbar filter state’i var ama UI’de yok.
4. Permission mantığı iki dosyada kopyalı.
5. School search API tanımlı ama landing sayfası statik katalogla çalışıyor.

## 2. İnceleme Yöntemi ve Yürütülen Doğrulamalar

Bu rapor paralel inceleme hatları ile çıkarıldı:

- Bursluluk 2026 aday akışı
- Panel shell, auth ve navigation
- Panel canlı operasyon modülleri
- Panel backend/API/DB kontratları
- Panel V2 mock modülleri
- Test, CI ve smoke/evidence hattı

### Yürütülen komutlar

```bash
git status --short
npm test
npm run typecheck
npm run lint
npx eslint apps/www/src/app/components/Bursluluk2026Page.tsx apps/www/src/app/components/BurslulukGirisPage.tsx apps/www/src/app/components/BurslulukOnayPage.tsx apps/www/src/app/components/BurslulukBeklemePage.tsx apps/www/src/app/components/BurslulukSinavPage.tsx apps/www/src/app/components/BurslulukSonucPage.tsx apps/www/src/app/components/BurslulukRandevuPage.tsx apps/www/src/app/components/bursluluk apps/www/src/app/components/panel apps/www/src/app/api/examApi.ts apps/www/src/app/routes.ts apps/panel-api/api/panel apps/panel-api/api/_lib/auth.js apps/exam-api/api/exam apps/exam-api/api/forms.js packages/shared/backend/auth.js
npm run check:shared-backend-sync
npm run check:legacy-runtime-sync
```

### Doğrulama sonuçları

- `npm test`
  - Geçti.
  - Ancak yalnız root `src/**/*.test.ts?(x)` desenine bağlı legacy testleri koşturdu.
  - Kanonik `apps/www/src/**` yüzeyini kapsamadı.

- `npm run typecheck`
  - Geçti.
  - Ancak `tsconfig.json` yalnız `src` alanını include ediyor.
  - `apps/www`, `apps/panel-api`, `apps/exam-api`, `apps/ops-api` gerçek anlamda typecheck kapsamına girmiyor.

- `npm run lint`
  - Fail.
  - Global lint `.claude` içindeki scriptleri ve `apps/www/dist` build artifaktlarını da tarıyor.
  - Bu sonuç gürültülü; ürün yüzeyi için tek başına sağlıklı sinyal değil.

- Hedefli `npx eslint ...`
  - Yalnız bir gerçek ürün hatası verdi:
  - `apps/www/src/app/components/Bursluluk2026Page.tsx:513` için `no-useless-assignment`.

- `npm run check:shared-backend-sync`
  - Fail.
  - `packages/shared/backend/exam.js` ile `api/_lib/exam.js` ve `apps/exam-api/api/_lib/exam.js` arasında içerik uyumsuzluğu var.
  - Fark yalnız header değil; grade aralığı `2-11` yerine `1-12` olarak değiştirilmiş ve shared kaynakla senkron değil.

- `npm run check:legacy-runtime-sync`
  - Pass.

## 3. Yapısal Riskler

### 3.1 Kanonik kaynak ile kalite hattı ayrışmış durumda

Repo iki düzlemde yaşıyor:

- legacy root yüzeyi: `src`, `api`
- kanonik monorepo yüzeyi: `apps/www`, `apps/panel-api`, `apps/exam-api`, `apps/ops-api`

Bugünkü kalite hattı ağırlıklı olarak legacy root yüzeyini ölçüyor.

#### Doğrulanmış yapısal noktalar

- `vitest.config.ts` yalnız `src/**/*.test.ts` ve `src/**/*.test.tsx` include ediyor.
- `tsconfig.json` yalnız `src` include ediyor.
- CI quality job `pnpm build` çalıştırıyor; bu root Vite build.
- Monorepo için hazır `build:monorepo` ve `runtime:verify` scriptleri var ama quality job’da kullanılmıyor.

### 3.2 Evidence artefact’leri stale

`guidelines/frontend-uat-bugfix-freeze-rc-latest.md` ve `guidelines/panel-step-14/16/17/18/19/20-*` artefact’leri mevcut worktree’nin tamamını temsil etmiyor.

Neden:

- İncelenen worktree’de 2026-03-20 ve 2026-03-23 tarihli kapsamlı bursluluk/panel değişiklikleri var.
- Smoke scriptleri ve kanıt dosyalarının önemli kısmı daha eski.
- Sonuç: “PASS” ifadesi bugünkü kod için release kanıtı sayılamaz.

### 3.3 Smoke scriptleri gerçek browser E2E değil

Mevcut smoke yaklaşımı ağırlıklı olarak:

- route availability
- unauth 401
- response schema kırığı var mı
- source bundle marker string kontrolü

üzerine kurulu.

Doğrulamadığı başlıca alanlar:

- form doldurma
- disabled state davranışı
- redirect zinciri
- countdown akışı
- autosave-before-unload
- session restore
- modal interaction
- role bazlı gerçek ekran davranışı

### 3.4 Shared-backend sync kırığı release blocker

`packages/shared/backend` ile deploy edilen runtime kopyaları aynı değilse:

- local inceleme ile gerçek runtime davranışı ayrışır
- smoke scripti yanlış yüzeyi onaylayabilir
- release sonrası beklenmeyen davranış oluşur

Bu nedenle `check:shared-backend-sync` fail durumu release blocker olarak ele alınmalıdır.

## 4. Bursluluk 2026 Aday Akışı

### 4.1 Mevcut akış haritası

Kanonik route zinciri:

1. `/bursluluk-2026`
2. `/bursluluk/giris`
3. `/bursluluk/onay`
4. `/bursluluk/bekleme`
5. `/bursluluk/sınav`
6. `/bursluluk/sonuç`
7. `/bursluluk/randevu`

Akışın bugünkü davranışı:

- Landing sayfası başvuru formu ve oturum seçimi topluyor.
- `startExamSession` sonrası candidate session `sessionStorage` içine yazılıyor.
- Onay ekranı credential resend akışı sunuyor.
- Giriş ekranı aday login yapıyor.
- Bekleme ekranı `session/status` poll ediyor.
- Sınav ekranı soru bankası + autosave + submit yönetiyor.
- Sonuç ekranı `results/:attemptId` çağırıyor.
- Randevu ekranı yalnız client-side mock.

### 4.2 Kritik bulgular

#### P0: Boş cevaplar answered sayılıyor

Sorun zinciri:

- Frontend tüm sorular için cevap satırı üretiyor.
- Cevap seçilmemiş sorularda `selectedOption: null` kalıyor.
- Save/submit payload’ı bunları filtrelemiyor.
- Backend bu satırları `exam_answers` içine yazıyor.
- Submit tarafında answered count `COUNT(*)` ile hesaplanıyor.

Etkisi:

- unanswered count fiilen 0’a yaklaşabiliyor
- başarı yüzdesi ve operasyonel değerlendirme güvenilmez hale geliyor
- sonuç ekranı ve panel raporları bozuluyor

#### P0: Bekleme ekranı server gate olmadan sınava geçebilir

Bekleme ekranı `session/status` üzerinden gelen `exam_open` bilgisi yerine gerektiğinde client-side `examOpenAt` fallback’i kullanıyor.

Etkisi:

- API hata verirse kullanıcı sınava client saati ile girebilir
- merkezi operasyon aç/kapa kontrolü delinmiş olur
- kural ihlali oluşur

#### P1: Server gate varken sayaç akıcı değil

`remaining_seconds` sabit alınıyor, sayaç yalnız poll aralıklarında zıplıyor.

Etkisi:

- UX bozuk
- kullanıcının kalan süre algısı zayıf

#### P1: Oturum seçimi backend’e gitmiyor

Frontend:

- `selectedSessionId`
- `selectedSessionLabel`
- `examOpenAt`

değerlerini topluyor ama sadece browser storage’a yazıyor.

Backend:

- `start` kontratında bu alanları almıyor
- `status` ve `candidate/login` gate’i yalnız campaign bazında çözüyor

Etkisi:

- çoklu oturum sunulduğu halde server tarafında tek oturum varmış gibi davranılıyor
- recovery ve ops yüzeyleri oturum seçimini bilmiyor

#### P1: Frontend’in topladığı önemli alanlar persist edilmiyor

Eksik persist alanları:

- `tckn`
- `birthYear`
- `branch`
- `selectedSessionId`
- `selectedSessionLabel`
- `examOpenAt`
- `schoolDistrict`
- `schoolType`

Etkisi:

- farklı cihazdan login eksik session üretir
- panel/ops yüzeyi tam veri göremez
- kontrat drift’i oluşur

#### P1: Ham PII browser storage’a yazılıyor

Browser storage’a giden başlıca alanlar:

- TCKN
- doğum yılı
- telefon
- veli adı
- öğrenci adı
- email

Etkisi:

- KVKK ve güvenlik riski
- cihaz paylaşımlıysa görünür footprint artar
- backend PII encryption yaklaşımı frontend tarafından delinmiş olur

#### P1: Fresh-device login eksik session kuruyor

`candidate/login` response’u cihaz bağımsız session rebuild için yeterli veri döndürmüyor.

Etkisi:

- `schoolName`
- `parentPhone`
- `selectedSession*`
- `tckn`
- `birthYear`
- `branch`

alanları boş kalabiliyor.

#### P1: Result endpoint publish state zorlamıyor

Candidate tarafında yayınlanmamış sonuç görünme riski var.

Etkisi:

- erken açıklama
- yanlışlıkla viewed side-effect
- operasyon planlaması bozulması

#### P2: `randevu` ekranı prod-ready değil

Bugünkü davranış:

- hardcoded tarih/saat
- local state onay
- API yok
- session/result guard yok

Etkisi:

- prod route olarak açık kalması yanlış güven verir

### 4.3 Kontrat drift’leri

#### Frontend topluyor, backend almıyor

| Alan | Frontend | Backend |
| --- | --- | --- |
| `tckn` | topluyor | persist etmiyor |
| `birthYear` | topluyor | persist etmiyor |
| `branch` | topluyor | persist etmiyor |
| `selectedSessionId` | topluyor | persist etmiyor |
| `selectedSessionLabel` | topluyor | persist etmiyor |
| `examOpenAt` | UI/session düzeyinde tutuyor | authoritative değil |
| `schoolDistrict` | katalogdan çıkarıyor | persist etmiyor |
| `schoolType` | katalogdan çıkarıyor | persist etmiyor |

#### UI session-level, backend campaign-level

Frontend çoklu slot yönetiyor. Backend tek campaign gate mantığı ile çalışıyor.

Bu ikisi aynı ürün modeli değil.

### 4.4 Güvenlik ve KVKK riskleri

- PII sessionStorage içinde düz JSON tutuluyor.
- Candidate recovery eksik veri yüzünden client fallback’lere dayanıyor.
- `resolveDefaultExamOpenAt()` kritik akışta authoritative bilgi gibi davranabiliyor.
- Client session helper `expiresAt` yerine ağırlıklı olarak `createdAt` yaş kontrolü yapıyor.

### 4.5 Bursluluk 2026 için zorunlu iş listesi

#### P0

- Save ve submit payload’ından `selectedOption === null` satırlarını çıkar.
- Backend metrics hesabını `selected_option IS NOT NULL` veya eşdeğer ignored-row mantığına geçir.
- `exam_open=true` olmadan sınava geçişi kesin olarak kapat.
- Candidate sonuç endpoint’inde `published_at IS NOT NULL` zorunlu kıl.

#### P1

- `selectedSessionId`, `selectedSessionLabel`, `examOpenAt` alanlarını server-authoritative hale getir.
- `start` endpointine aday metadata kontratını ekle ve persist et.
- `candidate/login` response’unu fresh-device rebuild yapacak kadar zenginleştir.
- Client-side PII footprint’ini azalt; opaque reference veya minimal session modeli kullan.
- `randevu` route’unu guard’la veya preview-only yap.

#### P2

- School search için statik katalog mu, `/api/schools/search` mi canonical olacak netleştir.
- `resolveDefaultExamOpenAt()` fallback’ini sadece non-authoritative UI hint’e indir.

### 4.6 Gelecek doğrulama senaryoları

- `bursluluk-2026 -> giris -> bekleme -> sınav -> submit -> sonuç`
- fresh-device recovery login
- `session/status` fail durumunda gate closed kalmalı
- unpublished result negative case
- result viewed side-effect doğrulaması
- sonuçtan randevu geçişi
- credential resend rate/cooldown davranışı
- session expiry ve token rotation

## 5. Panel Shell, Auth ve Yetki

### 5.1 Mevcut bilgi mimarisi

Hedef bilgi mimarisi üç ana bölüm tanımlıyor:

- Ana Operasyon
- Yönetim
- Sistem

Ancak gerçek sidebar bu section yapısını kullanmıyor; düz liste render ediyor.

Route modeli:

- `/panel/*` alias’ları
- merkezi olarak `/panel/dashboard?view=...&focus=...`

Auth guard:

- router-level guard yok
- koruma `usePanelAuth()` + ekran içi davranış ile çözülmeye çalışılıyor

### 5.2 Kritik bulgular

#### P0: `panelPreview=1` ile auth bypass

Preview runtime explicit local/dev sınırı yerine query param ile açılabiliyor.

Etkisi:

- production URL üzerinden sahte preview kimliği üretilebilir
- sahte `SUPER_ADMIN` session benzeri deneyim açılır

#### P1: OTP fiilen opsiyonel

- Login formu OTP’siz submit olabiliyor.
- Dashboard tarafı `mfa_verified=false` oturumu erişimden düşürmüyor.

Etkisi:

- “MFA zorunlu” ürün iddiası ile gerçek davranış ayrışıyor

#### P1: `next` redirect üretiliyor ama tüketilmiyor

Etkisi:

- deep-link sonrası login dönüşü bozuk
- password reset sonrası kullanıcı doğru hedefe dönemiyor

#### P1: `settings` route’u ölü

`view=settings` resolver tarafında gerçek view olarak kabul edilmiyor.

Etkisi:

- `/panel/settings` home’a düşebiliyor
- route sözleşmesi kırık

#### P1: Merkezi privileged-view gate yok

Sorun:

- sidebar görünürlüğü ile gerçek render ayrışmış
- URL üzerinden yetkisiz view denemeleri mümkün
- bazı alt component’ler sadece butonları kapatıyor, sayfayı değil

Etkisi:

- privileged bilgi sızıntısı
- operasyon dışı rollerin admin/mock veri görmesi

#### P1: Permission mantığı kopyalı

İki ayrı kaynak:

- `panelPermissions.ts`
- `panelRoleAccess.ts`

Etkisi:

- drift riski
- modüller arası davranış farkı

#### P2: Topbar filter modeli kopuk

- state var
- query modeli var
- UI render yok

### 5.3 Yetki ve auth guard eksikleri

- Sidebar görünürlüğü güvenlik katmanı olarak kullanılıyor.
- `renderCurrentView()` öncesinde merkezi `canAccessView(role, view)` yok.
- `users`, `results`, `security`, `settings` için explicit deny/fallback yok.
- Password reset ekranı “oturum var mı” üzerinden çalışıyor, “reset-required mi” üzerinden değil.
- Preview identity auth layer dışından inject ediliyor.

### 5.4 Panel shell için zorunlu iş listesi

#### P0

- Preview mode’u production query param’ından tamamen çıkar.
- Preview auth’u yalnız explicit env + local host ile sınırla.
- Merkezi `canAccessView(role, view)` katmanı ekle.
- Privileged view’lar için explicit deny veya redirect davranışı tanımla.
- Password reset endpointini ve frontend akışını daha sıkı policy ile hizala.

#### P1

- `next` redirect’i login ve password reset sonrası gerçekten uygula.
- `settings` route’unu canonical resolver ile hizala veya kaldır.
- OTP/MFA zorunluluğunu frontend-backend tek politika ile netleştir.
- `panelPermissions.ts` ve `panelRoleAccess.ts` tek kaynağa indir.

#### P2

- Sidebar section render’ını gerçek IA ile hizala.
- Topbar global filter modelini ya tamamla ya da sadeleştir.

### 5.5 Gelecek doğrulama senaryoları

- `/panel/login -> /panel/dashboard`
- `?next=` ile deep-link dönüşü
- password-reset-required kullanıcı akışı
- OTP’li ve OTP’siz login senaryoları
- `users/results/security/settings` yetkisiz deep-link denial
- preview mode prod ortamda kapalı olmalı

## 6. Panel Canlı Operasyon Modülleri

### 6.1 Gerçek backend’e bağlı modüller

| Modül | Endpointler | Veri kaynağı |
| --- | --- | --- |
| Applications Inbox | `/api/panel/applications`, `/api/panel/applications/:id`, `/api/panel/applications/actions` | `lead_form_submissions`, `lead_form_notes` |
| Candidate Operations | `/api/panel/candidates`, `/api/panel/candidates/actions`, `/api/panel/candidates/export` | `v_candidate_operations`, `activity_events` |
| Notification Center | `/api/panel/notifications`, `/api/panel/notifications/actions` | `v_notifications` |
| DLQ Operations | `/api/panel/dlq`, `/api/panel/dlq/actions` | `dlq_jobs`, `notification_jobs` |
| Unviewed Results | `/api/panel/unviewed-results`, `/api/panel/unviewed-results/actions` | `v_unviewed_results` |
| Settings | `/api/panel/settings` | `app_settings` |
| Audit Trail | `/api/panel/audit`, `/api/panel/audit/export` | `audit_log_entries` |

### 6.2 Somut bug ve kontrat boşlukları

#### P0: Settings role policy mismatch

- Frontend `ADMIN` kullanıcısına edit izni gösteriyor.
- Backend `PUT /api/panel/settings` için yalnız `SUPER_ADMIN` kabul ediyor.

Etkisi:

- kullanıcı save butonunu görür
- aksiyon backend’de fail olur

#### P1: Candidate drawer eksik/yanlış veri kullanıyor

- Drawer liste DTO’sundan kısıtlı alanlarla besleniyor.
- `created_at` yerine `updated_at` kullanılıyor.
- Süreç alanları bilinçli `null`.

Etkisi:

- başvuru zamanı yanlış görünür
- süreç state’i eksik görünür
- operatör yanlış yorum yapar

#### P1: Grade kapsamı drift riski

Panel filtrelerinde ve bazı operasyon yüzeylerinde sınıf aralığı `2-11`.

Eğer bursluluk akışı `1-12` ise:

- 1. sınıf ve 12. sınıf adaylar ops dışında kalabilir

#### P1: Unviewed filtreleri timezone açısından tutarsız

- Unviewed sonuç ekranı UTC `Z` ile tarih kuruyor.
- Applications ekranı `+03:00` mantığı kullanıyor.

Etkisi:

- Istanbul gün sınırında eksik/fazla kayıt dönebilir

#### P1: WA reminder template konfigürasyonu eksik

- Unviewed sonuç ekranı iki template seçeneği sunuyor.
- Settings ekranı yalnız tek WA template anahtarı yönetiyor.

Etkisi:

- `WA_RESULT_REMINDER` template kaynağı belirsiz

#### P1: Applications / CRM failure semantiği silik

- Migration `FAILED` state tanımlıyor.
- Liste tarafı non-transferred kayıtları sadeleştiriyor.
- Action tarafı gerçek CRM entegrasyonu yerine status flip yapıyor.

Etkisi:

- failure / retry / last error görünürlüğü kayboluyor
- operatör başarısız aktarımı seçemiyor

#### P2: Subject string bağımlılığı

Lead inbox persist mantığı exact form subject string’e bağlı.

Etkisi:

- subject kopyası değişirse lead upstream’e gider ama inbox’e düşmeyebilir

### 6.3 Canlı operasyon modülleri için zorunlu iş listesi

#### P0

- Settings edit yetkisini backend ile hizala.
- Candidate detail kontratını netleştir:
  - ya `GET /api/panel/candidates/:id`
  - ya drawer ihtiyacını karşılayan genişletilmiş list payload

#### P1

- Candidate drawer’da `created_at` ve süreç alanlarını düzelt.
- Grade kapsamını landing/panel/backend boyunca hizala.
- Unviewed tarih filtrelerini Istanbul timezone standardına çek.
- WA reminder template registry/settings yüzeyini tamamla.
- Applications tarafına `FAILED`, `crm_last_error`, retry semantiği ekle.

#### P2

- `forms.js` subject mapping’ini canonical `form_type` veya explicit field mantığına çevir.

### 6.4 Gelecek doğrulama senaryoları

- Applications list/detail/actions
- Candidate drawer detail doğruluğu
- Settings `SUPER_ADMIN` allow, diğer roller deny
- Unviewed filters gün sınırı
- WA template selection request payload
- CRM failure state ve retry görünürlüğü

## 7. Panel V2 Mock Modüller

### 7.1 Mock-only modül envanteri

Bu modüller bugünkü repo gerçekliğinde preview/demo düzeyinde:

- Appointments
- Exam Builder
- Reports
- System Status
- Users / Roles
- Operations Center alt sekmeleri:
  - exam assignment
  - whatsapp triggers
  - sms operations
  - api status
  - schools
  - programs/pricing
  - banks
  - exam sessions
  - pipeline
  - automation rules

### 7.2 Öne çıkan bulgular

#### P0: Mock modüller go-live yüzeyinde yeterince ayrışmıyor

UI bazı yerlerde çalışıyormuş gibi davranıyor.

Etkisi:

- operatör gerçek veri yönettiğini sanabilir
- UAT yanlış pozitif üretir

#### P1: Appointments stale modal state

- Parent state güncellenirken seçili slot state’i senkronize edilmiyor.
- Note state slot değişince temizlenmiyor.

Etkisi:

- eski slot verisi modalda kalabilir
- yanlış not/aksiyon algısı oluşur

#### P1: Exam builder edit erişim sızıntısı

- Read-only kullanıcı için de bazı edit aksiyonları açık kalabiliyor.

#### P1: Pipeline role guard olmadan local mutation yapıyor

- READ_ONLY kullanıcı bile drag-drop ile aşama oynatabilir.
- Değişiklik persist olmaz ama kalıcıymış hissi verir.

#### P1: ApiStatusTab secret-benzeri örnek değer gösteriyor

- Gerçek secret olmasa bile güvenlik pratiği açısından yanlış örnek.

#### P1: System status refresh gerçek fetch yapmıyor

- Yenile butonu canlı veri değil, sahte başarı hissi üretiyor.

#### P1: Reports ekranları kozmetik filtre + mock veri

- KPI ve chartlar operasyon kararı için güvenilir değil.

### 7.3 Bu modüller için karar modeli

Her modül için açık karar gerekir:

- `Go-live’a alınacak`
- `Hidden tutulacak`
- `Preview-only tutulacak`

Ara form kabul edilmemeli. “UI var ama gerçek değil” modüller açık prod route olarak kalmamalı.

### 7.4 V2 mock modüller için zorunlu iş listesi

#### P0

- Her modül için go-live / hidden / preview-only kararı çıkar.
- Preview-only kalan modüller production UI’de açıkça işaretlensin veya tamamen kapatılsın.

#### P1

- Appointments için slot derive, modal reset, gerçek schedule modeli ve role guard tanımla.
- Exam builder için publish validation ve role guard tamamla.
- Reports için gerçek veri kaynaklarını tanımla.
- System status için gerçek fetch ve severity aggregation tasarla.
- Users/Roles için custom role modelini backend auth ile hizala.
- ApiStatusTab’dan secret-benzeri örnekleri çıkar.

#### P2

- Mock modüller için ortak preview abstraction düşün.

### 7.5 Gelecek doğrulama senaryoları

- appointments stale state regresyonu
- exam builder role guard
- reports empty/error/loading davranışı
- system status refresh gerçek veri akışı
- users/roles privileged access matrix
- preview-only modül visibility gate

## 8. Backend/API/DB Kontratları

### 8.1 Zorunlu public interface değişiklikleri

#### `POST /api/exam/session/start`

Bu endpoint aşağıdaki alanları açık kontratla almalı ve persist etmelidir:

- `tckn`
- `birthYear`
- `branch`
- `selectedSessionId`
- `selectedSessionLabel`
- `examOpenAt`
- gerekirse `schoolDistrict`
- gerekirse `schoolType`

Response tarafında da frontend’in local reconstruct ettiği ama authoritative olması gereken alanlar dönmelidir:

- `examOpenAt`
- session/slot bilgisi
- `questionCount`
- canonical school summary

#### `POST /api/exam/candidate/login`

Fresh-device recovery için yeterli session verisi dönmelidir:

- aday kimlik özet alanları
- school summary
- selected session / gate bilgisi
- doğru isim alanları

#### `GET /api/exam/session/status`

Campaign-level yerine attempt/session-level gate çalıştırmalıdır.

#### `GET /api/exam/results/:attemptId`

Candidate tarafı için `published_at IS NOT NULL` zorunlu olmalıdır.

#### `POST /api/panel/auth/login`

Backend email login destekliyorsa frontend de desteklemelidir.

#### `POST /api/panel/auth/password-reset`

Daha sıkı guard ile korunmalıdır:

- `requireRole()` veya eşdeğer policy
- OTP veya current-password doğrulaması
- MFA verified state ile tutarlı session/audit davranışı

#### `GET /api/panel/candidates/:id`

Candidate drawer ihtiyacını karşılamak için eklenmeli veya aynı ihtiyaç genişletilmiş list payload ile çözülmelidir.

### 8.2 Migration etkileri

#### `20260318_0007_panel_tckn_optional_otp.sql`

Etkiler:

- `admin_users.tckn` nullable
- `mfa_enabled` default `FALSE`
- email-only panel kullanıcı modeli mümkün

Frontend drift:

- login UI bu esnekliği göstermiyor
- OTP ve session politikaları tam hizalı değil

#### `20260320_0009_panel_lead_form_inbox.sql`

Etkiler:

- lead inbox için tablo ve not modeli tanımlı
- `FAILED` gibi richer CRM state semantiği var

Frontend drift:

- applications list/action yüzeyi failure ve retry semantiğini yeterince taşımıyor
- settings/template/ops yüzeyi tam hizalı değil

### 8.3 Auth ve policy riskleri

#### P0

- `password-reset` policy bypass
- `exam/results/[attemptId]` panel erişiminde `requireRole()` yerine zayıf guard
- preview auth bypass

#### P1

- `mfa_verified_at` ile token claim ayrışması
- email login backend/frontend drift
- `FIRST_LOGIN` metrik kirlenmesi

### 8.4 Backend/API için zorunlu iş listesi

#### P0

- Password reset endpointini strict guard ile koru.
- Sonuç endpointinde unpublished result exposure’ı kapat.
- Panel sonuç erişiminde policy bypass’ı kapat.
- Session-slot kontratını campaign-level yerine attempt/session-level yap.

#### P1

- Start endpointine aday metadata kontratını ekle.
- Candidate login response’unu enrich et.
- `FIRST_LOGIN` event’ini gerçek login anına taşı.
- Applications tarafında CRM failure ve retry semantiğini genişlet.
- `candidates/actions` için UUID validation ekle.

#### P2

- Settings anahtarları için allowlist ve schema doğrulaması güçlendir.

## 9. Test ve Doğrulama Açıkları

### 9.1 Açık hüküm

Bugünkü repo durumunda:

- backend test yok
- panel component test yok
- candidate flow test yok
- mevcut Vitest include pattern’i kanonik `apps/**` yüzeyini kapsamıyor
- mevcut smoke scriptler ağırlıklı olarak marker ve HTTP availability kontrolü yapıyor

### 9.2 Acceptance gap listesi

- gerçek browser E2E yok
- panel authenticated smoke opsiyonel skip
- panel V2 route smoke yok
- backend contract regression test yok
- migration/schema smoke yok
- evidence freshness gate yok
- monorepo full build quality gate yok

### 9.3 Bugünkü kalite sinyallerinin yorumu

- `npm test` pass olması yeterli kanıt değil
- `npm run typecheck` pass olması yeterli kanıt değil
- `npm run lint` global sonucu gürültülü
- hedefli lint gerçek ürün yüzeyi için daha değerli
- stale smoke artefact’leri release kanıtı olarak kullanılamaz

### 9.4 Zorunlu test kapsamı

#### Bursluluk

- component/unit tests
  - session helper
  - countdown logic
  - answer payload normalization
  - resend cooldown
- API contract tests
  - start
  - candidate login
  - status
  - answer
  - submit
  - results
- browser E2E
  - apply -> onay -> login -> bekleme -> sınav -> submit -> sonuç

#### Panel auth/shell

- parser tests
  - `readView`
  - `readFocus`
- auth hook tests
  - session mevcut
  - password reset required
  - preview disabled
- role matrix tests
  - `SUPER_ADMIN`
  - `OPERATIONS`
  - `READ_ONLY`
- browser smoke
  - login
  - next redirect
  - privileged deep-link denial

#### Panel canlı modüller

- applications actions
- candidates drawer/detail
- settings role gate
- notifications/dlq/unviewed actions
- audit export

#### Panel V2 mock modüller

- preview-only gating
- route smoke
- role-based disable davranışı

#### Backend

- auth contract tests
- exam flow contract tests
- lead inbox tests
- CRM failure path tests
- migration smoke/schema assertion

## 10. Önceliklendirilmiş İş Listesi

Bu bölüm beş lane halinde ele alınmalıdır.

### Lane 1: Kalite Altyapısı

#### P0

- Test runner’ı `apps/**` kapsayacak hale getir.
- Authenticated panel smoke’u zorunlu hale getir.
- CI quality job’a monorepo full build doğrulaması ekle.
- Evidence freshness gate tanımla.

#### P1

- Real browser E2E seti kur.
- Backend contract regression harness ekle.

### Lane 2: Bursluluk Doğruluk ve Güvenlik

#### P0

- Null-answer metric bozulmasını düzelt.
- `exam_open` olmadan sınav geçişini kapat.
- Unpublished result exposure’ı kapat.

#### P1

- Session-slot modelini server-authoritative yap.
- Aday metadata persist et.
- Client-side PII footprint’ini azalt.
- `randevu` yüzeyini guard veya preview-only yap.

### Lane 3: Panel Auth/Shell Hardening

#### P0

- Preview/auth bypass’ı kapat.
- Password-reset policy bypass’ı kapat.
- Central view access gate ekle.

#### P1

- `settings` route çözümünü netleştir.
- `next` redirect’i gerçekten kullan.
- Permission kaynaklarını tekleştir.
- OTP/reset politikasını frontend-backend hizala.

### Lane 4: Canlı Operasyon Kontrat Düzeltmeleri

#### P0

- Settings role mismatch’i düzelt.
- Candidate detail kontratını netleştir.

#### P1

- Timezone standardizasyonu yap.
- Grade kapsamını hizala.
- WA template registry/settings tamamla.
- Applications CRM failure/retry semantiğini genişlet.

### Lane 5: V2 Mock Modüller için Go-live Kararı

#### P0

- Her modül için açık karar ver:
  - go-live
  - hidden
  - preview-only

#### P1

- Go-live kalacak modüller için backend ve veri modeli aç.
- Preview-only kalacak modüller için sert gate ve net UI dili ekle.

## 11. Doğrulama ve Kabul Kriterleri

Bu bölüm gelecekteki kabul için referans olmalıdır. Bugünkü pass sinyalleri release kanıtı değildir.

### Zorunlu kabul senaryoları

- `bursluluk-2026 -> giris -> bekleme -> sınav -> submit -> sonuç`
- fresh-device recovery
- unpublished-result negative case
- result viewed side-effect
- `randevu` geçişi ve guard
- panel login OTP’li akış
- panel login OTP’siz akışın policy’ye göre deny/step-up davranışı
- password-reset policy enforcement
- privileged deep-link denial
- applications/candidates/settings action regressions
- Istanbul timezone boundary
- shared-backend sync gate
- monorepo build gate

### Release-ready sayılması için minimum koşullar

1. P0 maddelerin tamamı kapanmış olmalı.
2. `apps/**` kanonik yüzeyi test/typecheck/build kapsamına girmeli.
3. Shared-backend sync pass olmalı.
4. Stale evidence yerine güncel artefact üretilmiş olmalı.
5. Mock-only modüller açık karar ile ya kapatılmış ya da gerçek backend’e bağlanmış olmalı.

## 12. Sonuç

Repo yalnızca “bazı ekranlar açılıyor” seviyesinde değerlendirilirse iyimser görünür. Ancak ürün doğruluğu, auth güvenliği, kontrat bütünlüğü ve kalite kanıtı birlikte bakıldığında tablo daha sert:

- Bursluluk akışında sonuç doğruluğunu etkileyen kritik bug var.
- Panel auth ve password-reset tarafında güvenlik açığı var.
- Panelin yeni V2 yüzeylerinin önemli bölümü mock-only.
- Mevcut quality ve evidence hattı kanonik monorepo yüzeyini yeterince temsil etmiyor.

Bu nedenle bugünkü durum için doğru özet şudur:

`bursluluk-2026` ve panel tarafı ilerlemiş, fakat release güveni vermesi için önce P0 doğruluk, güvenlik ve kalite altyapısı maddeleri kapatılmalıdır.
