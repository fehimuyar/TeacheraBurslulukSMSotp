# Bursluluk Canli Aktarim Delta Notu - 2026-03-28

Bu not, mevcut workspace ile GitHub'daki canli repo `aliyeteachera-hue/TeacheraBurslulukSMSotp` arasindaki bursluluk sinav farklarini hizli ve guvenli aktarim icin ozetler.

Kaynak baz:

- Mevcut workspace: bu calisma klasoru
- Canli repo incelemesi: `aliyeteachera-hue/TeacheraBurslulukSMSotp` `new-bursluluk` dalindaki dosya yapisi

Operasyonel not:

- Bu workspace'te `.git` yok.
- Buradan direkt branch/PR hazirlanamaz.
- Aktarim gercek git clone uzerinde yapilmali.

## 1. Oncelik Sirasi

Canliya aktarim sirası su olmalı:

1. DB migration
2. Exam API backend
3. Panel API + panel UI
4. Web candidate flow + public assets + fonts

Kismi tasima guvenli degil. Ozellikle speaking, submit ve panel scoring zinciri birlikte alinmali.

## 1.1 Release Gate

Transfer tamamlandi sayilmasi icin su komutlar yesil olmali:

- `npm run test`
- `npm run runtime:verify`
- `npm run build:monorepo`
- `npm run p0:go-live:package:audit`
- `npm run service-env:preflight`
- `npm run lint`

Bu workspace'te bugun gorulen blokajlar:

- `service-env:preflight` kirik

Su anki durum:

- `lint` yesil
- `test` yesil
- `typecheck` yesil
- `runtime:verify` yesil
- `build:monorepo` yesil
- `p0:go-live:package:audit` yesil
- `service-env:preflight` kirik

Canli onayi icin kalan tek net blokaj production env provision tarafidir.

## 2. Canlida Net Olarak Eksik Olanlar

### DB / Migration

Canlida bulunmuyor, ilk uygulanacak on kosul:

- `db/migrations/20260327_0010_bursluluk_package_objective_speaking.sql`

Bu migration olmadan su alanlar/tablo eksik kalir:

- `results.objective_score_80`
- `results.speaking_score_20`
- `results.speaking_status`
- `results.final_score_100`
- `results.review_note`
- `speaking_responses`

### Web shell akisi

Canli repoda `bursluluk-shell` klasoru yok. Bu yuzden su akış da yok:

- `welcome -> prep -> exam -> completion`

Tam kopya alinacak dosyalar:

- `apps/www/src/app/components/bursluluk-shell/BurslulukExamShell.tsx`
- `apps/www/src/app/components/bursluluk-shell/welcome-screen.tsx`
- `apps/www/src/app/components/bursluluk-shell/prep-screen.tsx`
- `apps/www/src/app/components/bursluluk-shell/completion-screen.tsx`
- `apps/www/src/app/components/bursluluk-shell/use-audio.ts`
- `apps/www/src/app/components/bursluluk-shell/shell-theme.css`
- `apps/www/src/app/components/bursluluk-shell/progress.ts`

### Public shell assets ve fonts

Canlida aktif kontrat olarak tasinmasi gerekenler:

- `apps/www/public/shared-shell/*`
- `apps/www/public/heart.webp`
- `apps/www/public/fonts/*`
- `apps/www/src/styles/fonts.css`

Not:

- Aktif asset yolu `shared-shell`dir.
- `apps/www/public/bursluluk-shell/*` legacy kopya gibi duruyor; kanonik kaynak olarak alinmamali.

### Speaking sonuc/panel zinciri

Canli repoda bursluluk speaking scoring/import/download yuzeyi eksik:

- `apps/panel-api/api/panel/results/speaking-score.js`
- `apps/panel-api/api/panel/results/speaking-import.js`
- `apps/panel-api/api/panel/results/speaking-download.js`
- `apps/panel-api/api/panel/results/_helpers.js`
- `apps/panel-api/api/panel/results/[attemptId].js`

Canli repo sonuc klasorunde eski yapilar var:

- `apps/panel-api/api/panel/results/actions.js`
- `apps/panel-api/api/panel/results/[resultId].js`

Bu nedenle panel sonucu tek dosya degil, klasor olarak dikkatli aktarilmali.

## 3. Birlikte Alinmasi Zorunlu Paketler

### Exam API backend paketi

Tek tek cherry-pick yapmayin. Su paket birlikte alinmali:

- `apps/exam-api/api/exam/session/start.js`
- `apps/exam-api/api/exam/session/answer.js`
- `apps/exam-api/api/exam/session/submit.js`
- `apps/exam-api/api/exam/session/result-status.js`
- `apps/exam-api/api/exam/session/speaking/init.js`
- `apps/exam-api/api/exam/session/speaking/complete.js`
- `apps/exam-api/api/exam/results/[attemptId].js`
- `apps/exam-api/api/exam/candidate/login.js`

Destekleyici ortak helperlar:

- `apps/exam-api/api/_lib/burslulukExam.js`
- `packages/shared/backend/burslulukExam.js`

### Panel sonucu paketi

Asagidaki backend + UI birlikte alinmali:

- `apps/panel-api/api/panel/results/index.js`
- `apps/panel-api/api/panel/results/[attemptId].js`
- `apps/panel-api/api/panel/results/_helpers.js`
- `apps/panel-api/api/panel/results/speaking-score.js`
- `apps/panel-api/api/panel/results/speaking-import.js`
- `apps/panel-api/api/panel/results/speaking-download.js`
- `apps/panel-api/api/panel/results/publish.js`
- `apps/panel-api/api/panel/results/unpublish.js`
- `apps/www/src/app/components/panel/ResultsScholarshipPanel.tsx`
- `apps/www/src/app/components/panel/ResultEditModal.tsx`

## 4. Canlida Eski Kalan Ama Buradan Dikkatli Entegre Edilecek Yerler

### BurslulukSinavPage

Canli [BurslulukSinavPage.tsx](https://github.com/aliyeteachera-hue/TeacheraBurslulukSMSotp/blob/new-bursluluk/apps/www/src/app/components/BurslulukSinavPage.tsx) eski akisi kullaniyor:

- eski `scholarship-exam/*` modulu mount ediyor
- shell yok
- submit sonrasi `/bursluluk/sonuç` route'una gidiyor
- default sure `2400` saniye

Buradan dikkatli entegre edilecek dosya:

- `apps/www/src/app/components/BurslulukSinavPage.tsx`

Ek dogrulama:

- grade mapping aktif olarak `1 -> grade-02`, `12 -> grade-11` seklinde calisiyor
- canliya aktarimda bu mapping korunmali; `grade-01` veya `grade-12` diye ayri content klasoru beklenmemeli
- `normalizeGrade()` gecersiz degeri `8`e dusuruyor; bu release blocker degil ama hardening/takip isi olarak not dusulebilir

### Exam runtime UI

Bu klasor aktif screenshot-kontrat UI'ı tasiyor:

- `apps/www/src/app/components/bursluluk-exam/`

Ozellikle fark yaratan dosyalar:

- `apps/www/src/app/components/bursluluk-exam/scholarship-exam-module.tsx`
- `apps/www/src/app/components/bursluluk-exam/styles.css`
- `apps/www/src/app/components/bursluluk-exam/components/listening-player.tsx`
- `apps/www/src/app/components/bursluluk-exam/adapters.ts`
- `apps/www/src/app/components/bursluluk-exam/utils.ts`

Not:

- `adapters.ts` backend response normalization iceriyor
- `utils.ts` local draft temizleme yardimcisi ekli
- bunlar package dosyalarindan farkli ve host tarafinda korunmali
- `scholarship-exam-module.tsx` icinde speaking sorularinda gorsel tek kez render edilecek sekilde duzeltilmis durumda
- speaking visual duplicate bug, ayni `visualAsset`'in hem parent module hem recorder icinde render edilmesinden kaynaklaniyordu; mevcut durumda tek render parent module tarafinda
- bu fix canliya da alinmali, aksi halde ozellikle `grade-02`, `grade-03`, `grade-04` speaking sorularinda cift gorsel riski var

Icerik audit sonucu:

- `apps/www/public/bursluluk-exam/grade-02` ... `grade-11` arasi tum sinif paketleri mevcut
- her grade icin `assessment.public.json` toplam `60` soru iceriyor
- `questionNo` duplicate'i tespit edilmedi
- referans verilen `visualAsset` ve `listeningAsset` dosyalarinda eksik dosya tespit edilmedi
- speaking + visual iceren sorular su anda yalniz su grade'lerde var:
  - `grade-02`: Q58, Q59, Q60
  - `grade-03`: Q59
  - `grade-04`: Q57, Q58

### RootLayout

Canliya alinmasi gereken route-level davranis:

- `apps/www/src/app/components/RootLayout.tsx`

Bu dosyada `/bursluluk/sinav` ve `/bursluluk/sınav` icin global chrome gizleniyor.

## 5. Bilincli Olarak Korunacak Repo-Ozel Farklar

Asagidakiler package kopyasi degil, host karari:

- anti-cheat overlay
  - `BurslulukExamShell.tsx` icinde
- exam clock helper
  - `apps/www/src/app/components/bursluluk-shell/progress.ts`
- backend adapter normalization
  - `apps/www/src/app/components/bursluluk-exam/adapters.ts`

Anti-cheat disindaki UI farklari package/screenshot parity'nin parcasi sayiliyor; bunlar canliya aktarilacak.

Production diff'ine bilincli olarak dahil edilmeyecek local-only yuzeyler:

- onceki local QA preview helper'i
  - `previewGrade`
  - `demoGrade`
  - `createPreviewExamAdapter()`
- bu yuzeyler release-hazir workspace'ten cikarildi
- canli PR kapsaminda yeniden eklenmemeli

## 6. Env ve Infra On Kosullari

Speaking upload icin zorunlu env:

- `S3_BUCKET_NAME` veya `AWS_S3_BUCKET_NAME`
- `AWS_REGION` veya `S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- opsiyonel `AWS_SESSION_TOKEN`

Ek dikkat:

- exam gate config canlida mevcut olmali
- migration + backend + panel + web birlikte acilmali
- kismi tasima speaking kaydi, final skor veya panel sonuc ekranlarini bozar

Preflight'ta kirmizi veren servis env'leri:

- `www`
  - `VITE_SITE_URL`
  - `VITE_EXAM_API_BASE` veya `EXAM_API_BASE_URL`
  - `VITE_PANEL_API_BASE` veya `PANEL_API_BASE_URL`
- `exam-api`
  - `SERVICE_RUNTIME`
  - `SERVICE_HOST_GUARD_MODE`
  - `EXPECTED_SERVICE_HOST`
  - `DATABASE_URL` veya `POSTGRES_URL`
  - `REDIS_URL`
  - `DEFAULT_CAMPAIGN_CODE`
  - `TURNSTILE_SECRET_KEY`
- `panel-api`
  - `SERVICE_RUNTIME`
  - `SERVICE_HOST_GUARD_MODE`
  - `EXPECTED_SERVICE_HOST`
  - `DATABASE_URL` veya `POSTGRES_URL`
  - `REDIS_URL`
  - `PANEL_SESSION_SECRET`
- `ops-api`
  - `SERVICE_RUNTIME`
  - `SERVICE_HOST_GUARD_MODE`
  - `EXPECTED_SERVICE_HOST`
  - `DATABASE_URL` veya `POSTGRES_URL`
  - `REDIS_URL`
  - `NOTIFICATION_WORKER_SECRET` veya `CRON_SECRET`
  - `NOTIFICATION_PROVIDER_WEBHOOK_SECRET`
  - `SQS_QUEUE_URL`

## 7. Hizli Aktarim Checklist'i

- Migration'i uygula
- Exam API paketini birlikte al
- Panel results paketini birlikte al
- `bursluluk-shell` + `shared-shell` assets + fonts kopyala
- `BurslulukSinavPage` ve `RootLayout` entegrasyonunu yap
- `bursluluk-exam/*` runtime UI klasorunu birlikte tası
- speaking gorselli sorulari ozellikle smoke test et:
  - `grade-02` Q58/Q59/Q60
  - `grade-03` Q59
  - `grade-04` Q57/Q58
- grade mapping smoke test et:
  - grade `1` adayi `grade-02` icerigi gormeli
  - grade `12` adayi `grade-11` icerigi gormeli
- speaking upload env'lerini dogrula
- objective + speaking + submit + panel sonucu birlikte smoke test et

## 8. Kisa Risk Notu

En kritik riskler:

- sadece UI tasinip migration/backend alinmazsa submit ve sonuc zinciri bozulur
- sadece backend tasinip panel alinmazsa speaking skoru manuel yonetilemez
- sadece shell tasinip `BurslulukSinavPage` entegre edilmezse canlida eski akış kalir
- legacy `bursluluk-shell` public klasoru aktif kaynak sanilip yanlis asset yolu kullanilabilir
- `apps/www/dist/**` build artifaktlari bu workspace'te mevcut; transfere dahil edilmemeli
- lint gurultusunun bir kismi `apps/www/dist/**` kaynakliydi; nested `dist/**` ignore edilerek ve tek source uyarisi temizlenerek lint yesile alindi
- kaynak dosyalar disindaki build ciktisi PR'a girmemeli
