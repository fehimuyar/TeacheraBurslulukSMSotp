# Bursluluk Frontend-Backend Contract v1

Updated: 2026-03-20
Service: `exam-api`, `panel-api`

## 1) `GET /api/schools/search`
Purpose: Konya okul arama/autocomplete

Request
```http
GET /api/schools/search?q=meram&limit=8
```

Response `200`
```json
{
  "ok": true,
  "query": "meram",
  "items": [
    {
      "id": "uuid-or-null",
      "name": "Konya Meram Fen Lisesi",
      "district": "Meram",
      "city": "Konya",
      "source": "db"
    }
  ]
}
```

Errors
- `429 schools_search_rate_limited`
- `500 internal_error`

## 2) `POST /api/exam/candidate/login`
Purpose: aday username/password ile session recover

Request
```json
{
  "username": "20260315-100001",
  "password": "sms_ile_gelen_sifre",
  "campaignCode": "2026_BURSLULUK"
}
```

Response `200`
```json
{
  "ok": true,
  "session": {
    "applicationNo": "20260315-100001",
    "attemptId": "uuid",
    "candidateId": "uuid",
    "sessionToken": "token",
    "expiresAt": "2026-03-15T12:00:00.000Z",
    "examStatus": "STARTED",
    "examLanguage": "en",
    "examAgeRange": "13–17",
    "questionCount": 40
  },
  "candidate": {
    "studentFullName": "Ali Veli",
    "parentFullName": "Ayse Veli",
    "grade": 8
  },
  "gate": {
    "exam_open": false,
    "exam_open_at": "2026-03-15T13:00:00.000Z",
    "server_time_utc": "2026-03-15T11:30:00.000Z",
    "remaining_seconds": 5400,
    "source": "app_settings:bursluluk.exam_open_at"
  }
}
```

Errors
- `400 invalid_json | missing_login_fields`
- `401 invalid_candidate_credentials`
- `429 candidate_login_ip_rate_limited | candidate_login_username_rate_limited`
- `500 internal_error`

## 3) `GET /api/exam/session/status`
Purpose: bekleme/sayac ekrani icin `exam_open` gate durumu

Request
```http
GET /api/exam/session/status?attemptId=<uuid>
x-exam-session-token: <token>
```

Response `200`
```json
{
  "ok": true,
  "session": {
    "attemptId": "uuid",
    "applicationNo": "20260315-100001",
    "candidateId": "uuid",
    "campaignCode": "2026_BURSLULUK",
    "examStatus": "STARTED",
    "expiresAt": "2026-03-15T12:00:00.000Z"
  },
  "gate": {
    "exam_open": true,
    "exam_open_at": "2026-03-15T13:00:00.000Z",
    "server_time_utc": "2026-03-15T13:02:00.000Z",
    "remaining_seconds": 0,
    "source": "app_settings:bursluluk.exam_open_at"
  }
}
```

Errors
- `400 missing_attempt_id`
- `401 missing_exam_session_token | invalid_exam_session_token | expired_exam_session_token`
- `404 attempt_not_found`
- `500 internal_error`

## 4) `GET /api/panel/settings/release-gate`
Purpose: kampanya aktivasyonundan önce SMS şifre akışı + panel write/update health kontrolünü göstermek

Request
```http
GET /api/panel/settings/release-gate?campaign_code=2026_BURSLULUK
Authorization: Bearer <panel_session_token>
```

Response `200`
```json
{
  "campaign_code": "2026_BURSLULUK",
  "release_gate": {
    "passed": false,
    "enabled": true,
    "campaign_code": "2026_BURSLULUK",
    "checked_at": "2026-03-20T20:15:00.000Z",
    "failed_checks": ["sms_credentials_flow"],
    "checks": [
      {
        "code": "sms_credentials_flow",
        "passed": false,
        "metrics": {
          "total_jobs": 3,
          "success_rate_pct": 66.67,
          "failed_rate_pct": 33.33
        },
        "thresholds": {
          "min_jobs": 5
        },
        "reasons": {
          "has_sample": false
        }
      },
      {
        "code": "panel_write_update_flow",
        "passed": true,
        "metrics": {
          "total_writes": 8,
          "domain_count": 3
        }
      }
    ]
  }
}
```

Errors
- `401` (panel session/token geçersiz veya yok)
- `403` (rol/permission yetersiz)
- `500 internal_error`

## 5) `PUT /api/panel/settings` (Release-Gate Aktivasyon Niyeti)
Purpose: aktivasyon write'larında release-gate kontrolünün hangi key'lere bağlı olduğunu netleştirmek

Canonical aktivasyon key'leri
- `bursluluk.exam_force_open`
- `bursluluk.exam_open_at`

Davranış
- Release-gate aktivasyon niyeti sadece yukarıdaki canonical key'lerden biri write edildiğinde hesaplanır.
- Legacy gate key'ler (`exam.force_open`, `exam.open_at`, `bursluluk.campaign.exam_force_open`, `bursluluk.campaign.exam_open_at`) aktivasyon niyeti oluşturmaz.
- `bursluluk.exam_open_at` geçersiz datetime ise `400 invalid_exam_open_at` döner.
- Legacy gate key gönderilirse `400 legacy_gate_keys_not_supported` döner.
- Aktivasyon niyeti oluşmuş ve release-gate check'leri başarısız ise `409 release_gate_blocked` döner.
