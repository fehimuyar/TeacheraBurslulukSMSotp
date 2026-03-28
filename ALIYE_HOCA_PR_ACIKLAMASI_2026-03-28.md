# Bursluluk Sinavi Temiz Aktarim

## Ozet

Bu PR, bursluluk sinav akisini `welcome -> prep -> exam -> completion` olarak canli repoya tasir.

Birlikte gelen ana paketler:

- DB migration + exam-api scoring/speaking/result zinciri
- panel results scoring/import/download/publish-unpublish zinciri
- web shell + exam runtime UI + shared-shell assets/fonts

## Bilincli Olarak Korunan Host Farklari

- anti-cheat overlay
- `progress.ts` icindeki exam clock helper
- `adapters.ts` icindeki backend response normalization

## Production Diff'e Bilincli Olarak Dahil Edilmeyenler

- local QA preview/bypass mantigi
- `apps/www/dist/**`
- `.env*`
- `node_modules/**`
- cache/build/log ciktilari

## Birlikte Merge Edilmesi Zorunlu Paketler

1. `db/exam-api`
2. `panel`
3. `web-shell-exam-ui-assets`
4. `cleanup + release hardening`

Bu paketler parcali alinmamalidir. Migration, backend, panel ve web birlikte ele alinmalidir.

## Kalan Tek Net Release Blokaji

- production env provisioning
- `npm run service-env:preflight` yesile donmeden release onayi verilmemeli

## Beklenen Smoke Sonucu

- `welcome -> prep -> exam -> finish modal -> completion`
- `1. sinif -> grade-02`
- `12. sinif -> grade-11`
- speaking gorseli tek kez ve dogru soruda
- `/bursluluk/sonuc` ayri host sayfasi olarak calismaya devam ediyor

## Teknik Referans

Detayli aktarim notu bu branch icindeki dosyada:
`BURSLULUK_CANLI_AKTARIM_DELTA_2026-03-28.md`
