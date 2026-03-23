# Bursluluk Frontend + Panel Diff

Tarih: 2026-03-23

Karşılaştırılan klasörler:

- Current workspace: `/Users/afumacpro/Documents/TeacheraWebsiteBurslulukSMSOTP`
- Referans kopya: `/Users/afumacpro/Documents/TeacheraBurslulukSMSotpAliyeHoca`

Amaç:

- `TeacheraWebsiteBurslulukSMSOTP` içinde yaptığımız ön yüz değişikliklerini, özellikle menü, panel ve bursluluk başvuru/giriş akışı tarafında, yazılımcının kendi dosyasına taşıyabilmesi için dosya ve satır bazında listelemek.

Not:

- Satır aralıkları current workspace içindir.
- `App.tsx` ve `routeManifest.ts` pratikte değişmemiş; asıl fark `routes.ts` ve `components/**` altında.
- Bu belge diff + satır okuma + paralel alt ajan incelemeleriyle hazırlanmıştır.

## 1. En kritik özet

Bu klasördeki ön yüz değişiklikleri referans kopyaya göre 3 ana blokta toplanıyor:

1. Bursluluk başvuru akışı `BurslulukGirisPage` içinden alınmış ve `Bursluluk2026Page` içine taşınmış.
2. Bursluluk giriş/onay tarafına SMS şifre tekrar gönderimi ve cooldown eklenmiş.
3. Panel tarafı eski tek parça dashboard yapısından modüler V2 shell yapısına dönmüş: sidebar + topbar + query tabanlı view/focus sistemi + ayrı modül dosyaları.

## 2. Geliştirici için dosya haritası

Önce bakılması gereken dosyalar:

- `apps/www/src/app/routes.ts:30-73`
- `apps/www/src/app/components/Bursluluk2026Page.tsx:1-1379`
- `apps/www/src/app/components/BurslulukGirisPage.tsx:1-331`
- `apps/www/src/app/components/BurslulukOnayPage.tsx:1-401`
- `apps/www/src/app/components/BurslulukBeklemePage.tsx:1-135`
- `apps/www/src/app/components/BurslulukSinavPage.tsx:1-461`
- `apps/www/src/app/components/BurslulukSonucPage.tsx:1-147`
- `apps/www/src/app/components/BurslulukRandevuPage.tsx:1-100`
- `apps/www/src/app/components/bursluluk/burslulukFlowSession.ts:1-140`
- `apps/www/src/app/components/bursluluk/credentialsResendCooldown.ts:1-64`
- `apps/www/src/app/components/bursluluk/konyaSchoolCatalog.ts:1-398`
- `apps/www/src/app/components/Navigation.tsx:23-230`
- `apps/www/src/app/components/MobileMenu.tsx:43-52`
- `apps/www/src/app/components/RootLayout.tsx:136-181`
- `apps/www/src/app/components/Footer.tsx:137-145`
- `apps/www/src/app/components/SeoManager.tsx:162-184`
- `apps/www/src/app/components/panel/PanelDashboardPage.tsx:43-279`
- `apps/www/src/app/components/panel/PanelSidebar.tsx:1-187`
- `apps/www/src/app/components/panel/PanelTopbar.tsx:1-124`
- `apps/www/src/app/components/panel/panelNavigationConfig.ts:1-141`
- `apps/www/src/app/components/panel/panelTypes.ts:1-233`
- `apps/www/src/app/components/panel/panelPermissions.ts:1-85`
- `apps/www/src/app/components/panel/usePanelAuth.ts:1-98`
- `apps/www/src/app/components/panel/usePanelData.ts:1-146`
- `apps/www/public/teachera-logo.svg`

Public asset notu:

- `apps/www/public/teachera-logo.svg` current workspace'te yeni.
- `apps/www/src/app/components/panel/PanelSidebar.tsx:69` bu asset'i render ediyor.

## 3. Menü / shell / route farkları

### 3.1 Ana route zinciri

`apps/www/src/app/routes.ts:30-73`

- `/bursluluk` artık `/bursluluk/giris` sayfasına düşüyor.
- `/bursluluk/randevu` diye yeni bir route eklenmiş.
- ASCII URL yerine Türkçe karakterli bursluluk route’ları canonical yapılmış:
  - `/bursluluk/sinav -> /bursluluk/sınav`
  - `/bursluluk/sonuc -> /bursluluk/sonuç`
- `/panel` artık `/panel/dashboard?view=home` olarak açılıyor.
- Panel için yeni V2 alias route’ları eklenmiş:
  - `panel/home`
  - `panel/applications`
  - `panel/scholarship`
  - `panel/results`
  - `panel/operations`
  - `panel/operations/:focus`
  - `panel/reports`
  - `panel/reports/:focus`
  - `panel/exam-builder`
  - `panel/system-status`
  - `panel/users`
  - `panel/appointments`
  - `panel/appointments/:focus`

### 3.2 Navigation header

`apps/www/src/app/components/Navigation.tsx`

- `23-26`: bursluluk için light surface route tanımı eklenmiş.
- `47-69`: bursluluk landing/giriş/onay sayfaları için ayrı nav surface, button, divider ve menu renk sınıfları var.
- `101-103`: nav artık sabit dark sınıf yerine `navSurfaceClass` kullanıyor.
- `176-201`: header CTA butonları bursluluk route’larında ayrı görünüme geçiyor.
- `209`: divider rengi bursluluk route’unda değişiyor.
- `224-230`: menu pill rengi bursluluk route’unda değişiyor.

Sonuç:

- Current workspace, bursluluk landing/giriş/onay sayfalarını ana siteden görsel olarak ayırıyor.

### 3.3 Mobile menu

`apps/www/src/app/components/MobileMenu.tsx:43-52`

- Bursluluk menü item’ları aynı ama sırası farklı:
  - `Bursluluk Başvuru`
  - `Bursluluk Giriş`
- Current workspace’te bu item’lar `academy` sonrasına alınmış.
- Referans kopyada ana sayfa sonrası daha üstte duruyor.

### 3.4 Root layout

`apps/www/src/app/components/RootLayout.tsx:136-181`

- `/bursluluk-2026` route’u `isBurslulukLandingRoute` ile ayrılmış.
- `WhatsAppButton` bu route’ta gizlenmiş.

Sonuç:

- Current workspace’te bursluluk landing sayfası daha kontrollü bir funnel gibi davranıyor.

### 3.5 Footer

`apps/www/src/app/components/Footer.tsx:137-145`

- Footer’da `Bursluluk Sınavı Başvuru` linki var.
- Current workspace’te `Bursluluk Giriş` linki footer’da yok.
- Referans kopyada vardı.

### 3.6 SEO meta farkları

`apps/www/src/app/components/SeoManager.tsx:162-184`

- `162-166`: `/bursluluk-2026` açıklaması current workspace'te landing + burs yapısı + sınav takvimi + video bilgilendirmesi + başvuru sürecini aynı meta içinde anlatacak şekilde genişlemiş.
- `174-178`: `/bursluluk/onay` açıklaması current workspace'te `başvuru numarası + giriş + şifreyi tekrar SMS gönder` davranışını açıkça söylüyor.
- `180-184`: `/bursluluk/giris` açıklaması current workspace'te aday girişi yanında `şifreyi yeniden isteme` akışını da kapsıyor.

Sonuç:

- Referans kopyadaki meta açıklamaları daha dar.
- Current workspace, yeni bursluluk funnel'ını route SEO metinlerinde de yansıtıyor.

## 4. Bursluluk akışı farkları

### 4.1 Landing / başvuru akışı

`apps/www/src/app/components/Bursluluk2026Page.tsx`

- `1-275`: landing artık statik bir tanıtım sayfası değil; motion/video importları, KVKK sabitleri, oturum katalogu ve Konya okul datası burada tanımlı.
- `331-646`: başvuru akışının runtime mantığı burada:
  - modal aç/kapat
  - video kontrolü
  - okul suggestion
  - sınıfa göre oturum seçimi
  - form validation
  - `startExamSession` çağrısı
- `538-639`: form submit akışı:
  - `startExamSession(...)`
  - `saveCandidateSession(...)`
  - `savePlacementExamLead(...)`
  - `/bursluluk/onay` navigation
- `655-977`: tam ekran modal başvuru formu:
  - okul autocomplete
  - TC kimlik no
  - doğum yılı
  - veli adı/telefonu/e-postası
  - sınıf
  - şube
  - oturum seçimi
  - KVKK onayı
- `987-1118`: video kontrollü hero panel
- `1223-1269`: sınav takvimi kartları
- `1273-1315`: başvuru adımları bloğu
- `1318-1376`: SSS bloğu

Davranış farkı:

- Referans kopyadaki `landing -> giriş -> başvuru` modeli kaldırılmış.
- Current workspace’te landing sayfası başvuruyu doğrudan oluşturuyor.

### 4.2 Giriş sayfası

`apps/www/src/app/components/BurslulukGirisPage.tsx`

- `3-16`: `searchSchools`, `startExamSession`, attribution/analytics importları kaldırılmış; `renewCandidateCredentials`, notifications ve resend cooldown helper’ı eklenmiş.
- `57-91`: sayfa artık apply/login toggle tutmuyor; yalnızca mevcut session ile login + şifre yenileme state’ini yönetiyor.
- `93-148`: login başarılı olunca session daha zengin payload ile tekrar yazılıyor:
  - `parentPhoneE164`
  - `schoolName`
  - `schoolDistrict`
  - `schoolType`
  - `grade`
  - `tckn`
  - `birthYear`
  - `branch`
  - `selectedSessionId`
  - `selectedSessionLabel`
  - `ageRange`
  - `language`
  - `questionCount`
  - `campaignCode`
  - `examOpenAt`
- `150-191`: yeni şifre yenileme akışı:
  - `renewCandidateCredentials(null, { applicationNo, parentPhoneE164, campaignCode })`
  - `startCredentialsResendCooldown(applicationNo)`
- `193-329`: eski başvuru formu tamamen çıkarılmış; sadece:
  - `Giriş Yap`
  - `Şifremi Yenile`
  card yapısı bırakılmış.

Davranış farkı:

- Referans kopyadaki başvuru oluşturma işi burada artık yok.

### 4.3 Onay sayfası

`apps/www/src/app/components/BurslulukOnayPage.tsx`

- `15-190`: yeni summary/list bileşenleri eklenmiş.
- `192-251`: SMS tekrar gönderimi burada:
  - `renewCandidateCredentials(session.sessionToken, { attemptId })`
  - dönen yeni token ve SMS status bilgisi session’a merge ediliyor.
- `253-280`: session yoksa fallback ekranı var:
  - `/bursluluk-2026`
  - `/bursluluk/giris`
- `290-345`: başvuru no, SMS durumu, öğrenci, oturum özeti + resend butonu
- `348-383`: sonraki adım kartı
- `386-397`: teknik gereksinimler + tavsiyeler blokları

Davranış farkı:

- Referans kopyadaki video panel yerine aksiyonel confirmation dashboard gelmiş.
- `candidateCode` yerine `applicationNo` öne çıkmış.

### 4.4 Bekleme ekranı

`apps/www/src/app/components/BurslulukBeklemePage.tsx`

- `42-68`: gate polling devam ediyor, ama sadece `getExamSessionStatus(...).gate` kullanılıyor.
- `93-104`: ekran artık:
  - `studentFullName || applicationNo`
  - `applicationNo`
  - `serverGate.exam_open_at || session.examOpenAt`
  gösteriyor.
- `114-122`: buton artık doğrudan `/bursluluk/sınav` route’una gidiyor.

Davranış farkı:

- Eski analytics start tetikleri kaldırılmış.

### 4.5 Sınav sayfası

`apps/www/src/app/components/BurslulukSinavPage.tsx`

- `36-82`: seeded deterministic shuffle kaldırılmış.
  - Artık ilk `questionCount` soru kullanılıyor.
  - seçenekler `Math.random()` ile karışıyor.
- `140-223`: runtime telemetry ve server-side sync sadeleşmiş.
- `225-323`: submit/autosave akışı devam ediyor ama server runtime ile süre güncellemesi yok.
- `235-246`: submit sonrası `/bursluluk/sonuç?attemptId=...` route’una gidiliyor.
- `254-257`: süre bitince auto submit devam ediyor.
- `389-416`: header artık `applicationNo` gösteriyor.

Davranış farkı:

- Server-side runtime poll loop kaldırılmış.
- `trackExamRuntimeEvent` kaldırılmış.
- Soru sırası deterministic değil.

### 4.6 Sonuç sayfası

`apps/www/src/app/components/BurslulukSonucPage.tsx`

- `6-22`: payload sadeleşmiş; artık burs oranı, sınıf sırası, doğru/yanlış/boş gibi detayları beklemiyor.
- `45-83`: sonuç fetch var, randevu slot fetch/book yok.
- `103-118`: sadece skor, yüzde ve yerleşim bandı gösteriliyor.
- `121-137`: `result.status === 'VIEWED'` ise `/bursluluk/randevu` CTA’sı gösteriliyor.
- `139-143`: iletişim sayfası linki kaldırılmış.

Davranış farkı:

- Referans kopyadaki inline randevu rezervasyonu kaldırılmış.
- Referans kopyada sonuç ekranına `BurslulukHybridResultOffers.tsx` ile program/fiyat/paket/video upsell paneli ekleniyordu; current workspace'te bu yardımcı bileşen yok.

### 4.7 Yeni randevu sayfası

`apps/www/src/app/components/BurslulukRandevuPage.tsx:1-100`

- Yeni client-side tarih/saat seçim ekranı.
- Şu an yalnızca local state ile onay ekranı veriyor.

Kritik not:

- Bu sayfa gerçek backend booking entegrasyonu yapmıyor.
- Referans kopyadaki gerçek randevu işlevselliğinin bire bir eşdeğeri değil.

### 4.8 Session helper ve yardımcı dosyalar

`apps/www/src/app/components/bursluluk/burslulukFlowSession.ts`

- `1-28`: session schema genişletilmiş:
  - `parentEmail`
  - `schoolDistrict`
  - `schoolType`
  - `tckn`
  - `birthYear`
  - `branch`
  - `selectedSessionId`
  - `selectedSessionLabel`
- `89-110`: `expiresAt` yerine `createdAt` üzerinden 7 günlük koruma var.

Risk:

- Backend token ömrü dolsa bile front-end session daha uzun yaşayabilir.

`apps/www/src/app/components/bursluluk/credentialsResendCooldown.ts:1-64`

- Başvuru no bazlı 60 saniyelik resend cooldown.
- `localStorage` kullanıyor.
- Hem giriş hem onay sayfası bunu ortak kullanıyor.

`apps/www/src/app/components/bursluluk/konyaSchoolCatalog.ts:1-398`

- Konya okul listesi statik dataset.
- Current flow’da `searchSchools()` yerine bu dosya kullanılıyor.

## 5. Bursluluk API coupling

`apps/www/src/app/api/examApi.ts`

- `212-222`: `startExamSession` -> `/api/exam/session/start`
- `225-238`: `searchSchools` wrapper'ı dosyada duruyor, ama current bursluluk front-end akışı artık bunu çağırmıyor.
- `240-250`: `candidateLogin` -> `/api/exam/candidate/login`
- `253-266`: `getExamSessionStatus` -> `/api/exam/session/status`
- `268-287`: `renewCandidateCredentials` -> `/api/exam/session/credentials`
- `289-301`: `submitExam` -> `/api/exam/session/submit`
- `304-337`: autosave answer endpoint -> `/api/exam/session/answer`

Akış bağı:

1. `Bursluluk2026Page` submit
2. `BurslulukOnayPage` summary + SMS resend
3. `BurslulukGirisPage` login + credential renew
4. `BurslulukBeklemePage`
5. `BurslulukSinavPage`
6. `BurslulukSonucPage`

Not:

- `BurslulukRandevuPage` current durumda `examApi.ts` ile doğrudan konuşmuyor; sayfa local UI state ile çalışıyor.

Wrapper drift notu:

- `renewCandidateCredentials` artık current bursluluk akışının zorunlu parçası; hem `BurslulukGirisPage` hem `BurslulukOnayPage` bu wrapper'a bağlı.
- `searchSchools()` API wrapper'ı `examApi.ts` içinde yaşamaya devam ediyor, fakat current front-end flow'da okul seçimi `konyaSchoolCatalog.ts` üzerinden yapıldığı için fiilen devre dışı kalmış durumda.
- Referans kopyadaki `candidatePasswordReset`, `trackExamRuntimeEvent`, sonuç-randevu intent, slot listeleme ve booking wrapper'ları current `examApi.ts` içinde yok.
- `StartExamSession` ve `CandidateLogin` payload/response sözleşmeleri daha dar; eski `candidateCode`, `section`, `scheduledExamAt`, `examSlotLabel` gibi alanlara güvenen entegrasyonlar yeniden gözden geçirilmeli.
- `apps/www/src/app/api/panelApi.ts` için diff çıkmıyor; panel taşıma listesine `değişen dosya` gibi yazılmamalı.

## 6. Panel tarafındaki büyük değişiklik

### 6.1 Panel route ve shell

`apps/www/src/app/components/panel/PanelDashboardPage.tsx`

- `43-68`: yeni `readView` / `readFocus` resolver
- `161-244`: view dispatch katmanı
- `249-279`: yeni shell layout

Sonuç:

- Eski tek dosyalı dashboard mimarisi kırılmış.
- Yeni mimari query tabanlı:
  - `view`
  - `focus`
  paramlarıyla ayrı modüller render ediyor.

### 6.2 Yeni panel iskelet dosyaları

Bu dosyalar referans kopyada yok, current workspace’te yeni:

- `apps/www/src/app/components/panel/PanelSidebar.tsx:1-187`
- `apps/www/src/app/components/panel/PanelTopbar.tsx:1-124`
- `apps/www/src/app/components/panel/panelNavigationConfig.ts:1-141`
- `apps/www/src/app/components/panel/panelPermissions.ts:1-85`
- `apps/www/src/app/components/panel/panelPreviewSession.ts:1-67`
- `apps/www/src/app/components/panel/panelTypes.ts:1-233`
- `apps/www/src/app/components/panel/panelUi.tsx:1-477`
- `apps/www/src/app/components/panel/usePanelAuth.ts:1-98`
- `apps/www/src/app/components/panel/usePanelData.ts:1-146`

Bu iskeletin görevi:

- sidebar navigasyon
- breadcrumb/topbar
- role-based module visibility
- preview mode
- auth doğrulama
- dashboard summary verilerini paralel yükleme
- query string bazlı panel href üretme

Asset bağımlılığı:

- `apps/www/public/teachera-logo.svg` current workspace'te yeni bir asset.
- `apps/www/src/app/components/panel/PanelSidebar.tsx:69` bu dosyayı doğrudan kullanıyor.
- Sidebar entegrasyonu taşınacaksa `teachera-logo.svg` birlikte taşınmalı; aksi halde panel shell eksik logo ile açılır.

### 6.3 Yeni panel modülleri

Ana yeni modüller:

- `apps/www/src/app/components/panel/HomeDashboardPanel.tsx:1-451`
- `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx:1-1202`
- `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx:1-306`
- `apps/www/src/app/components/panel/OperationsCenterPanel.tsx:1-68`
- `apps/www/src/app/components/panel/ReportsPanel.tsx:1-56`
- `apps/www/src/app/components/panel/SystemStatusPanel.tsx:1-174`
- `apps/www/src/app/components/panel/UserPermissionPanel.tsx:1-55`
- `apps/www/src/app/components/panel/ApplicationPersonDrawer.tsx:1-206`
- `apps/www/src/app/components/panel/CandidatePersonDrawer.tsx:1-274`
- `apps/www/src/app/components/panel/BulkSmsResultModal.tsx:1-82`
- `apps/www/src/app/components/panel/ResultEditModal.tsx:1-119`
- `apps/www/src/app/components/panel/AppointmentsPanel.tsx:1-56`
- `apps/www/src/app/components/panel/ExamBuilderPanel.tsx:1-148`

Alt klasörler:

- `apps/www/src/app/components/panel/appointments/appointmentsMockData.ts:1-132`
- `apps/www/src/app/components/panel/appointments/AdvisorListTab.tsx:1-217`
- `apps/www/src/app/components/panel/appointments/DailyViewTab.tsx:1-161`
- `apps/www/src/app/components/panel/appointments/ScheduleTab.tsx:1-204`
- `apps/www/src/app/components/panel/appointments/SlotDetailModal.tsx:1-168`
- `apps/www/src/app/components/panel/appointments/AdvisorPerfTab.tsx:1-142`
- `apps/www/src/app/components/panel/exam-builder/ExamPreview.tsx:1-103`
- `apps/www/src/app/components/panel/exam-builder/examBuilderTypes.ts:1-78`
- `apps/www/src/app/components/panel/exam-builder/AnswerEditor.tsx:1-142`
- `apps/www/src/app/components/panel/exam-builder/examBuilderMockData.ts:1-49`
- `apps/www/src/app/components/panel/exam-builder/RichTextToolbar.tsx:1-67`
- `apps/www/src/app/components/panel/exam-builder/ExamSettings.tsx:1-80`
- `apps/www/src/app/components/panel/exam-builder/QuestionEditor.tsx:1-172`
- `apps/www/src/app/components/panel/exam-builder/ExamBuilderEditor.tsx:1-180`
- `apps/www/src/app/components/panel/ops/WhatsAppTriggersTab.tsx:1-159`
- `apps/www/src/app/components/panel/ops/AutomationRulesTab.tsx:1-192`
- `apps/www/src/app/components/panel/ops/ProgramsPricingTab.tsx:1-138`
- `apps/www/src/app/components/panel/ops/PipelineKanbanTab.tsx:1-114`
- `apps/www/src/app/components/panel/ops/SmsOperationsTab.tsx:1-189`
- `apps/www/src/app/components/panel/ops/ApiStatusTab.tsx:1-173`
- `apps/www/src/app/components/panel/ops/ExamSessionsTab.tsx:1-219`
- `apps/www/src/app/components/panel/ops/SchoolListTab.tsx:1-180`
- `apps/www/src/app/components/panel/ops/ExamAssignmentTab.tsx:1-187`
- `apps/www/src/app/components/panel/ops/BankListTab.tsx:1-201`
- `apps/www/src/app/components/panel/reports/PanelChartSvg.tsx:1-173`
- `apps/www/src/app/components/panel/reports/SmsReportsPanel.tsx:1-145`
- `apps/www/src/app/components/panel/reports/WpBotReportsPanel.tsx:1-164`
- `apps/www/src/app/components/panel/reports/SalesFunnelReport.tsx:1-111`
- `apps/www/src/app/components/panel/reports/SchoolSalesReport.tsx:1-114`
- `apps/www/src/app/components/panel/users/PermissionMatrixEditor.tsx:1-68`
- `apps/www/src/app/components/panel/users/UserAccountsTab.tsx:1-188`
- `apps/www/src/app/components/panel/users/RoleManagementTab.tsx:1-164`

### 6.4 Referans kopyada olup current workspace’te kaldırılan panel dosyaları

- `apps/www/src/app/components/panel/ConsultantOverviewPanel.tsx`
- `apps/www/src/app/components/panel/CrmExportPanel.tsx`
- `apps/www/src/app/components/panel/PanelIpPolicyPanel.tsx`
- `apps/www/src/app/components/panel/ResultReviewPanel.tsx`
- `apps/www/src/app/components/panel/ResultsAuditExportPanel.tsx`

### 6.5 Ortak panel dosyalarında önemli farklar

`apps/www/src/app/components/panel/PanelLoginPage.tsx`

- `96-116`: login input sözleşmesi `tckn + password + optional otpCode`
- `118-168`: mevcut session / preview identity kontrolü
- `170-241`: submit fallback davranışı
- `244-309`: komple yeni UI

`apps/www/src/app/components/panel/PanelPasswordResetPage.tsx`

- `47-98`: reset akışı korunmuş ama fallback akışı netleştirilmiş
- `100-165`: yeni UI

`apps/www/src/app/components/panel/CandidateOperationsPanel.tsx`

- `396-490`: `/api/panel/candidates` ve `/api/panel/candidates/actions`
- `536-792`: KPI, filtre, export, bulk SMS/WA/not aksiyonları
- `799-969`: tablo + `CandidatePersonDrawer`

`apps/www/src/app/components/panel/UnviewedResultsPanel.tsx`

- `152-244`: liste yükleme + `/api/panel/unviewed-results/actions`
- `246-395`: batch WhatsApp odaklı V2 UI

`apps/www/src/app/components/panel/NotificationCenterPanel.tsx:1-550`

- `1-18`: ortak `panelUi` yardımcılarına bağlanıyor.
- `52-58`: action response shape sadeleşmiş.
- Referans kopyadaki manuel `exam reminder broadcast` kontrol bloğu current panelde kaldırılmış.

`apps/www/src/app/components/panel/DlqOperationsPanel.tsx:1-580`

- `1-19`: ortak `panelUi` yardımcılarına bağlanıyor.
- `142-160`: `canOperateDlq(role, permissions)` yerine `canOperatePanelActions(role)` kullanıyor.
- DLQ ekranı V2 panel stil sistemi ile yeniden kaplanmış.

`apps/www/src/app/components/panel/SettingsOperationsPanel.tsx`

- `26-35`: bursluluk campaign code/window + template + allowed roles ayarları
- `145-247`: `/api/panel/settings` yükleme/kaydetme

`apps/www/src/app/components/panel/PanelAuditTrailPanel.tsx`

- V2 görsel düzene uyarlanmış
- audit ekranı `security` view’ına bağlanmış

`apps/www/src/app/components/panel/panelRoleAccess.ts:1-27`

- Eski permission matrix sadeleştirilmiş
- yeni shell tarafında daha çok `panelPermissions.ts` kullanılıyor

Panel API notu:

- `apps/www/src/app/api/panelApi.ts` current workspace ile referans kopya arasında değişmemiş.
- Panel farkı API wrapper'da değil; shell, permission ve modül UI katmanında.

## 7. Panel içinde bursluluk / aday akışının bağlandığı yerler

Yazılımcı özellikle şu dosyalara bakmalı:

- `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx:412-504`
- `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx:590-629`
- `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx:631-760`
- `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx:1028-1192`
- `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx:396-490`
- `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx:536-792`
- `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx:799-969`
- `apps/www/src/app/components/panel/CandidatePersonDrawer.tsx:48-105`
- `apps/www/src/app/components/panel/CandidatePersonDrawer.tsx:113-274`
- `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx:57-126`
- `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx:160-189`
- `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx:228-303`

Bu bloklar şu işleri taşıyor:

- website lead inbox
- bursluluk aday yaşam döngüsü
- sonuç ve burs operasyonu
- sonuç görmeyen adaylara follow-up
- randevu ve danışman ekranları

## 8. Entegrasyon riskleri

En kritik merge riskleri:

1. `BurslulukGirisPage` içine eski başvuru formunu taşımaya çalışmak
   - Current yapıda başvuru formu `Bursluluk2026Page` içinde.
2. `candidateCode` beklemek
   - Current akış pratikte `applicationNo` merkezli.
3. `searchSchools()` entegrasyonu aramak
   - Current front-end statik `konyaSchoolCatalog.ts` kullanıyor.
4. `BurslulukRandevuPage`’i gerçek booking sanmak
   - Şu an sadece UI.
5. Panelde eski `panelRoleAccess.ts` ile yeni `panelPermissions.ts` mantığını karıştırmak
   - İkisi paralel yaşıyor.
6. `settings` ve `automation` view’larının canlı olduğunu varsaymak
   - Current V2 shell’de bazı dallar route tanımı ile ulaşılmaz halde.
7. `expiresAt` üzerinden front-end session düşmesini beklemek
   - `burslulukFlowSession.ts` artık `createdAt` üzerinden 7 gün kuralı kullanıyor.

## 9. Bu farkı tekrar üretmek için kullanılan komut mantığı

Kullanılan ana yaklaşım:

- `git diff --no-index --unified=0 <aliyehoca-file> <current-file>`
- `diff -rq <aliyehoca-dir> <current-dir>`
- `rg --files ...`
- `nl -ba <file>`

Pratik örnekler:

```bash
git diff --no-index --unified=0 \
  /Users/afumacpro/Documents/TeacheraBurslulukSMSotpAliyeHoca/apps/www/src/app/components/BurslulukGirisPage.tsx \
  /Users/afumacpro/Documents/TeacheraWebsiteBurslulukSMSOTP/apps/www/src/app/components/BurslulukGirisPage.tsx
```

```bash
diff -rq \
  /Users/afumacpro/Documents/TeacheraBurslulukSMSotpAliyeHoca/apps/www/src/app/components/panel \
  /Users/afumacpro/Documents/TeacheraWebsiteBurslulukSMSOTP/apps/www/src/app/components/panel
```

## 10. Kısa taşıma sırası önerisi

Yazılımcı entegrasyonu şu sırayla yaparsa daha az çakışma yaşar:

1. `routes.ts`
2. `Navigation.tsx`, `RootLayout.tsx`, `Footer.tsx`, `MobileMenu.tsx`
3. `burslulukFlowSession.ts`, `credentialsResendCooldown.ts`, `konyaSchoolCatalog.ts`
4. `Bursluluk2026Page.tsx`
5. `BurslulukGirisPage.tsx`, `BurslulukOnayPage.tsx`, `BurslulukBeklemePage.tsx`, `BurslulukSinavPage.tsx`, `BurslulukSonucPage.tsx`, `BurslulukRandevuPage.tsx`
6. Panel shell dosyaları
7. Panel modülleri
8. Panel auth/data hooks
9. Panel permission birleşimi

## 11. Taşıma Checklisti

- [ ] Route ve shell: `apps/www/src/app/routes.ts` içindeki bursluluk redirect zinciri, Türkçe karakterli canonical route'lar ve `/panel/dashboard?view=home` açılış davranışını taşı.
- [ ] Route ve shell: `apps/www/src/app/components/Navigation.tsx`, `apps/www/src/app/components/MobileMenu.tsx`, `apps/www/src/app/components/RootLayout.tsx`, `apps/www/src/app/components/Footer.tsx` farklarını birlikte taşı.
- [ ] Route ve shell: `apps/www/src/app/components/SeoManager.tsx` içindeki `/bursluluk-2026`, `/bursluluk/onay`, `/bursluluk/giris` meta açıklama güncellemelerini taşı.
- [ ] Bursluluk akışı: `apps/www/src/app/components/Bursluluk2026Page.tsx` içindeki modal başvuru akışını, `startExamSession` submit zincirini ve funnel davranışını taşı.
- [ ] Bursluluk akışı: `apps/www/src/app/components/BurslulukGirisPage.tsx` içindeki aday login + `Şifremi Yenile` yapısını birlikte taşı; eski başvuru formunu bu sayfaya geri taşımaya çalışma.
- [ ] Bursluluk akışı: `apps/www/src/app/components/BurslulukOnayPage.tsx` içindeki SMS resend, summary dashboard ve session fallback ekranlarını taşı.
- [ ] Bursluluk akışı: `apps/www/src/app/components/BurslulukBeklemePage.tsx`, `apps/www/src/app/components/BurslulukSinavPage.tsx`, `apps/www/src/app/components/BurslulukSonucPage.tsx`, `apps/www/src/app/components/BurslulukRandevuPage.tsx` zincirini birlikte taşı.
- [ ] Bursluluk akışı: referans kopyadaki `apps/www/src/app/components/BurslulukHybridResultOffers.tsx` upsell panelinin current sonuç akışında kaldırıldığını not et; yanlışlıkla geri taşımayın.
- [ ] Shared helper ve asset: `apps/www/src/app/components/bursluluk/burslulukFlowSession.ts`, `apps/www/src/app/components/bursluluk/credentialsResendCooldown.ts`, `apps/www/src/app/components/bursluluk/konyaSchoolCatalog.ts` dosyalarını birlikte taşı.
- [ ] Shared helper ve asset: `apps/www/public/teachera-logo.svg` asset'ini panel shell ile birlikte taşı; `apps/www/src/app/components/panel/PanelSidebar.tsx:69` buna bağımlı.
- [ ] Panel shell: `apps/www/src/app/components/panel/PanelDashboardPage.tsx`, `apps/www/src/app/components/panel/PanelSidebar.tsx`, `apps/www/src/app/components/panel/PanelTopbar.tsx`, `apps/www/src/app/components/panel/panelNavigationConfig.ts`, `apps/www/src/app/components/panel/panelTypes.ts`, `apps/www/src/app/components/panel/panelPermissions.ts`, `apps/www/src/app/components/panel/panelUi.tsx`, `apps/www/src/app/components/panel/usePanelAuth.ts`, `apps/www/src/app/components/panel/usePanelData.ts`, `apps/www/src/app/components/panel/panelPreviewSession.ts` dosyalarını tek parça olarak taşı.
- [ ] Panel modülleri: `apps/www/src/app/components/panel/ApplicationsInboxPanel.tsx`, `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx`, `apps/www/src/app/components/panel/UnviewedResultsPanel.tsx`, `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx`, `apps/www/src/app/components/panel/OperationsCenterPanel.tsx`, `apps/www/src/app/components/panel/ReportsPanel.tsx`, `apps/www/src/app/components/panel/AppointmentsPanel.tsx`, `apps/www/src/app/components/panel/ExamBuilderPanel.tsx`, `apps/www/src/app/components/panel/SystemStatusPanel.tsx`, `apps/www/src/app/components/panel/UserPermissionPanel.tsx` ve ilişkili drawer/modal alt klasörlerini birlikte taşı.
- [ ] Panel modülleri: `apps/www/src/app/components/panel/NotificationCenterPanel.tsx` ve `apps/www/src/app/components/panel/DlqOperationsPanel.tsx` içindeki `panelUi` geçişi ve permission guard değişimini ayrıca taşı.
- [ ] Panel modülleri: referans kopyadaki `ConsultantOverviewPanel.tsx`, `CrmExportPanel.tsx`, `PanelIpPolicyPanel.tsx`, `ResultReviewPanel.tsx`, `ResultsAuditExportPanel.tsx` dosyalarıyla çakışma kontrolü yap.
- [ ] Doğrulama uyarıları: `candidateCode` beklentisi olan yerleri `applicationNo` merkezli current akışa göre yeniden değerlendir.
- [ ] Doğrulama uyarıları: `apps/www/src/app/api/examApi.ts` içinde `renewCandidateCredentials` akışını taşı; referanstaki `candidatePasswordReset`, runtime event ve appointment booking wrapper'larının current yapıda bulunmadığını not et.
- [ ] Doğrulama uyarıları: `searchSchools` bağına güvenen yer varsa current yapıdaki statik `konyaSchoolCatalog.ts` yaklaşımına göre düzelt.
- [ ] Doğrulama uyarıları: `apps/www/src/app/components/BurslulukRandevuPage.tsx` için backend booking olmadığı notunu görünür bırak.
- [ ] Doğrulama uyarıları: `apps/www/src/app/api/panelApi.ts` değişmediği için panel merge sırasında bu dosyayı `farkın kaynağı` gibi ele alma.
- [ ] Doğrulama uyarıları: panel merge sırasında `apps/www/src/app/components/panel/panelRoleAccess.ts` ve `apps/www/src/app/components/panel/panelPermissions.ts` ikiliğini özel kontrol et.
- [ ] Doğrulama uyarıları: current shell'de `settings` ve `automation` branch'lerinin doğrudan ulaşılabilir olmadığı notunu koru.
