# Admin Panel Release Sign-Off Checklist (One-Page)

Date: 2026-03-18  
Product: Teachera Bursluluk Admin Panel  
Environment: Production (`teachera.com.tr`, `panel-api.teachera.com.tr`)

## 1) Scope (What is being signed off)
This sign-off covers end-to-end admin panel readiness across frontend, backend/API, data contract, security guards, and operational actions.

## 2) Go/No-Go Gates
| Gate | Requirement | Status | Evidence |
|---|---|---|---|
| G1 | Panel public routes resolve (`/panel/login`, `/panel/dashboard`, `/panel/audit`) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-14-closeout-smoke-latest.json` |
| G2 | Unauthorized API access is blocked (401) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-14-closeout-smoke-latest.json` |
| G3 | Candidate operations grid (13 mandatory columns) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-16-ops-grid-smoke-latest.json` |
| G4 | Mandatory filters (school, grade, sms, login, exam, result viewed, whatsapp) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-16-ops-grid-smoke-latest.json` |
| G5 | Mandatory actions (SMS resend, WA single, WA bulk, CSV/XLS export) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-16-ops-grid-smoke-latest.json` |
| G6 | Login/session flow (role routing, password reset gate, session guard) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-17-rbac-session-smoke-latest.json` |
| G7 | RBAC policy (read/write/super-admin boundaries) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-18-rbac-policy-smoke-latest.json` |
| G8 | Frontend-backend panel data contract integrity | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-19-data-contract-smoke-latest.json` |
| G9 | Final closeout (aggregated panel readiness) | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/guidelines/panel-step-20-final-closeout-smoke-latest.json` |
| G10 | CI mandatory gate green for this release line | PASS | GitHub Actions `CI/CD #14` (success) |
| G11 | `panel:step20:final-closeout` freshness-enforced release gate is mandatory (step21 freshness included) | PASS | `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/panel-step-20-final-closeout-smoke-latest.json` |
| G12 | Şube/slot görünürlüğü prod smoke (`section`, `exam_scheduled_at`, `exam_slot_label`) strict PII mode ile doğrulandı | PASS | `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/p0-panel-prod-slot-visibility-smoke-latest.json` |

## 3) UX Completion Items (Panel)
| Item | Status | Evidence |
|---|---|---|
| Sticky filter bar | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/apps/www/src/app/components/panel/CandidateOperationsPanel.tsx` |
| Saved filter presets | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/apps/www/src/app/components/panel/CandidateOperationsPanel.tsx` |
| Error-code tooltip dictionary | PASS | `/Users/aliye/Downloads/Teachera Website Bursluluk/apps/www/src/app/components/panel/CandidateOperationsPanel.tsx` |

## 4) Risk Review (Release Blockers)
| Risk | Current State |
|---|---|
| Auth/RBAC bypass | No blocker detected in smoke gates |
| Missing mandatory panel columns/actions | No blocker detected |
| Unauthorized API data exposure | No blocker detected (401 protections validated) |
| Contract mismatch between UI and API | No blocker detected |

## 5) Release Decision
`GO` (Admin panel release criteria satisfied for current scope).

## 6) Approvals
| Role | Name | Decision | Date |
|---|---|---|---|
| Product Owner |  | GO / NO-GO |  |
| Tech Lead |  | GO / NO-GO |  |
| QA Lead |  | GO / NO-GO |  |
| Ops Lead |  | GO / NO-GO |  |
