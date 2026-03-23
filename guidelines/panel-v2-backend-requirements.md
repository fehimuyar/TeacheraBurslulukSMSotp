# Panel V2 — Backend & Veritabanı Gereksinimleri (Güncel)

> Frontend tamamlandı, tüm veriler mock. Bu doküman backend mühendisinin yapması gereken işleri listeler.

**Son güncelleme**: 2026-03-23
**Durum**: Backend implementasyonu bekleniyor

---

## 1. YENİ VERİTABANI TABLOLARI

### 1.1 — `advisors` (Danışman)
```sql
CREATE TABLE advisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  specializations JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.2 — `advisor_availability` (Danışman Müsaitlik)
```sql
CREATE TABLE advisor_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30
);
CREATE INDEX idx_advisor_availability ON advisor_availability (advisor_id, day_of_week);
```

### 1.3 — `appointments` (Randevu)
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  candidate_id UUID REFERENCES candidates(id),
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','BOOKED','ATTENDED','NO_SHOW','CANCELLED')),
  meeting_notes TEXT,
  meeting_outcome TEXT CHECK (meeting_outcome IN ('PENDING','INTERESTED','REGISTERED','DECLINED')),
  program_id UUID,
  discount_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_appointments_advisor_date ON appointments (advisor_id, appointment_date);
CREATE INDEX idx_appointments_candidate ON appointments (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_appointments_status ON appointments (status, appointment_date);
```

### 1.4 — `exam_definitions` (Sınav Tanımları - Builder)
```sql
CREATE TABLE exam_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  total_duration_seconds INTEGER NOT NULL DEFAULT 2400,
  randomize_questions BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_answers BOOLEAN NOT NULL DEFAULT FALSE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.5 — `exam_builder_questions` (Sınav Soruları)
```sql
CREATE TABLE exam_builder_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exam_definitions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('RICH_TEXT','VIDEO','AUDIO')),
  content_html TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  video_view_limit INTEGER,
  audio_url TEXT DEFAULT '',
  audio_listen_limit INTEGER,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('MULTIPLE_CHOICE','AUDIO_RECORDING','VISUAL','TEXT')),
  duration_seconds INTEGER,
  weight NUMERIC(8,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.6 — `exam_builder_answer_options` (Cevap Şıkları)
```sql
CREATE TABLE exam_builder_answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES exam_builder_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT DEFAULT '',
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  media_url TEXT,
  option_order INTEGER NOT NULL DEFAULT 0
);
```

### 1.7 — `exam_grade_assignments` (Sınav-Sınıf Atamaları)
```sql
CREATE TABLE exam_grade_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exam_definitions(id) ON DELETE CASCADE,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 2 AND 12),
  campaign_code TEXT NOT NULL REFERENCES campaigns(code),
  assigned_by UUID REFERENCES admin_users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id, grade, campaign_code)
);
```

### 1.8 — `exam_sessions` (Sınav Oturumları)
```sql
CREATE TABLE exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_name TEXT NOT NULL,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grade_range TEXT,
  capacity INTEGER NOT NULL DEFAULT 500,
  enrolled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','OPEN','CLOSED','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.9 — `education_programs` (Eğitim Programları)
```sql
CREATE TABLE education_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  list_price NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.10 — `bank_installment_rates` (Banka Taksit)
```sql
CREATE TABLE bank_installment_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  months_1 NUMERIC(5,2) DEFAULT 0,
  months_3 NUMERIC(5,2) DEFAULT 0,
  months_6 NUMERIC(5,2) DEFAULT 0,
  months_9 NUMERIC(5,2) DEFAULT 0,
  months_12 NUMERIC(5,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.11 — `panel_custom_roles` (Özel Roller)
```sql
CREATE TABLE panel_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.12 — `automation_rules` (Otomasyon Kuralları)
```sql
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value INTEGER NOT NULL,
  trigger_unit TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. MEVCUT TABLO DEĞİŞİKLİKLERİ

```sql
-- candidates tablosuna yeni sütunlar
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS appointment_status TEXT DEFAULT 'NOT_BOOKED';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'NOT_REGISTERED';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS crm_status TEXT DEFAULT 'NOT_TRANSFERRED';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS section TEXT; -- şube (3-A, 5-B)

-- schools tablosuna yeni sütunlar
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_hours TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS student_population INTEGER;

-- admin_users tablosuna yeni sütunlar
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES panel_custom_roles(id);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone_personal TEXT;

-- v_candidate_operations view güncelleme: appointment_status, registration_status, crm_status, section ekle
```

---

## 3. YENİ API ENDPOINT'LERİ (~50 endpoint)

### Randevu & Danışman
| Method | Path | Açıklama |
|--------|------|----------|
| GET/POST | `/api/panel/advisors` | Danışman CRUD |
| PUT | `/api/panel/advisors/:id` | Danışman güncelle |
| GET/POST | `/api/panel/appointments` | Randevu CRUD |
| GET | `/api/panel/appointments/schedule` | Haftalık takvim |
| PUT | `/api/panel/appointments/:id` | Durum/not güncelle |
| GET | `/api/panel/appointments/summary` | Dashboard KPI |
| GET | `/api/panel/advisors/performance` | Danışman performans |

### Sınav Builder
| Method | Path | Açıklama |
|--------|------|----------|
| GET/POST | `/api/panel/exam-definitions` | Sınav CRUD |
| GET/PUT/DELETE | `/api/panel/exam-definitions/:id` | Sınav detay |
| POST | `/api/panel/exam-definitions/:id/publish` | Yayınla |
| GET/POST | `/api/panel/exam-assignments` | Sınav-sınıf atama |
| GET/POST | `/api/panel/exam-sessions` | Oturum CRUD |
| PATCH | `/api/panel/exam-sessions/:id/gate` | Oturum aç/kapat |

### Operasyonlar
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/panel/wp-triggers/scenarios` | WA senaryo sayıları |
| POST | `/api/panel/wp-triggers` | WA tetikle |
| POST | `/api/panel/sms/send` | SMS gönder |
| GET | `/api/panel/sms/preview` | SMS önizleme |
| GET | `/api/panel/integrations/health` | API sağlık |
| GET/POST/PUT/DELETE | `/api/panel/operations/schools` | Okul CRUD |
| GET/POST/PUT/DELETE | `/api/panel/operations/programs` | Program CRUD |
| GET/POST/PUT/DELETE | `/api/panel/operations/banks` | Banka CRUD |
| GET/POST/PUT/DELETE | `/api/panel/automation-rules` | Otomasyon kuralları |

### Raporlar
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/panel/reports/sales-funnel` | Satış hunisi |
| GET | `/api/panel/reports/school-sales` | Okul satış |
| GET | `/api/panel/reports/sms-stats` | SMS rapor |
| GET | `/api/panel/reports/wp-stats` | WP rapor |

### Sonuç Yönetimi
| Method | Path | Açıklama |
|--------|------|----------|
| PUT | `/api/panel/results/:candidateId` | Sonuç düzenle (OTP zorunlu) |
| POST | `/api/panel/results/bulk-publish` | Toplu yayınla (OTP zorunlu) |
| POST | `/api/panel/results/bulk-sms` | Toplu SMS duyuru (OTP zorunlu) |

### Sistem & Kullanıcı
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/panel/system/health` | Sistem sağlığı |
| GET | `/api/panel/system/alerts` | Aktif uyarılar |
| GET/POST/PUT | `/api/panel/roles` | Özel rol CRUD |
| GET/POST/PUT | `/api/panel/admin-users` | Kullanıcı CRUD |
| PATCH | `/api/panel/admin-users/:id/status` | Kullanıcı askıya al |
| POST | `/api/panel/media/upload` | Medya yükleme (S3/R2) |

---

## 4. GÜVENLİK GEREKSİNİMLERİ

### OTP Zorunlu İşlemler
- Sonuç düzenleme, sonuç yayınlama, toplu SMS
- Header: `X-Panel-OTP: 123456`

### Rol Bazlı Erişim
- SUPER_ADMIN: tüm endpoint'ler
- OPERATIONS: okuma + yazma (sonuç düzenleme hariç)
- READ_ONLY: sadece GET
- Özel roller: `panel_custom_roles.permissions` JSONB kontrol

### Yeni Audit Log Aksiyonları
- `PANEL_EXAM_DEFINITION_*`, `PANEL_EXAM_ASSIGNMENT_*`, `PANEL_EXAM_SESSION_*`
- `PANEL_ADVISOR_*`, `PANEL_APPOINTMENT_*`
- `PANEL_WP_TRIGGER`, `PANEL_SMS_SEND`
- `PANEL_SCHOOL_*`, `PANEL_PROGRAM_*`, `PANEL_BANK_*`
- `PANEL_RESULT_EDIT`, `PANEL_RESULT_PUBLISH`, `PANEL_RESULT_BULK_SMS`
- `PANEL_ROLE_*`, `PANEL_USER_*`, `PANEL_AUTOMATION_RULE_*`

### Dosya Depolama
- S3/R2 bucket: sınav builder medya (video/ses/resim)
- Max: Video 100MB, Ses 20MB, Resim 5MB
- Signed URL upload pattern

---

## 5. MOCK → API GEÇİŞ REHBERİ

Mock veri içeren frontend dosyaları (backend hazır olduğunda değiştirilecek):

| Dosya | Mock Veri |
|-------|-----------|
| `ops/ExamAssignmentTab.tsx` | MOCK_EXAMS, INITIAL_ASSIGNMENTS |
| `ops/WhatsAppTriggersTab.tsx` | WA_SCENARIOS, INITIAL_LOG |
| `ops/SmsOperationsTab.tsx` | SMS_TYPES, INITIAL_LOG |
| `ops/ApiStatusTab.tsx` | MOCK_INTEGRATIONS, MOCK_ERRORS |
| `ops/SchoolListTab.tsx` | INITIAL_SCHOOLS (performans metrikleri dahil) |
| `ops/ProgramsPricingTab.tsx` | INITIAL_PROGRAMS |
| `ops/BankListTab.tsx` | INITIAL_BANKS |
| `ops/ExamSessionsTab.tsx` | MOCK_SESSIONS |
| `ops/PipelineKanbanTab.tsx` | MOCK_CARDS |
| `ops/AutomationRulesTab.tsx` | MOCK_RULES |
| `reports/SalesFunnelReport.tsx` | MOCK_FUNNEL |
| `reports/SchoolSalesReport.tsx` | MOCK_DATA |
| `reports/SmsReportsPanel.tsx` | MOCK_STATUS, MOCK_TREND, MOCK_LOGS |
| `reports/WpBotReportsPanel.tsx` | MOCK_STATS, MOCK_LOGS |
| `ResultsScholarshipPanel.tsx` | MOCK_RESULTS |
| `SystemStatusPanel.tsx` | MOCK_SERVICES, MOCK_ALERTS, MOCK_AUDIT |
| `users/RoleManagementTab.tsx` | INITIAL_CUSTOM_ROLES |
| `users/UserAccountsTab.tsx` | MOCK_USERS |
| `exam-builder/examBuilderMockData.ts` | MOCK_EXAMS |
| `appointments/appointmentsMockData.ts` | MOCK_ADVISORS, MOCK_APPOINTMENTS |
| `HomeDashboardPanel.tsx` | APPOINTMENT_METRICS |

---

## 6. ÖNCELİK SIRALAMASI

**P0 — Sınav Öncesi (28 Mart)**:
- Sınav oturum gate control API
- SMS gönderim API (credentials, hatırlatma)
- Sonuç hesaplama + yayınlama API

**P1 — Sınav Sonrası**:
- Randevu & danışman API
- WhatsApp tetikleme API
- Raporlama API

**P2 — Operasyon**:
- Okul/program/banka CRUD
- Kullanıcı & rol yönetimi
- Otomasyon kuralları engine
- Medya upload (S3/R2)

**P3 — İyileştirme**:
- Sistem sağlık check
- Pipeline kanban backend
- Entegrasyon test bağlantısı
