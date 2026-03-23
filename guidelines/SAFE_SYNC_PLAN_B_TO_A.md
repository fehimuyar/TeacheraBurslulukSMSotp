# Safe Sync Plan (B -> A)

Target A: /Users/aliye/Downloads/TeacheraBurslulukSMSotp
Source B: /Users/aliye/Downloads/TeacheraWebsiteBurslulukSMSOTP2303
Date: 2026-03-23 14:10:57 +03

## Block-1 Safe Copy Whitelist (copy directly)
Count:        5

These are low-risk docs/static files to copy first:

- [ ] guidelines/bursluluk-2026-panel-audit-2026-03-23.md
- [ ] guidelines/bursluluk-2026-season-end-handoff.md
- [ ] guidelines/bursluluk-v1-panel-frontend-living-log.md
- [ ] guidelines/panel-v2-backend-requirements.md
- [ ] apps/www/public/teachera-logo.svg

## Risky Merge List (do NOT bulk-copy)

### A) Same path but content differs (manual merge required)
Count:      143

See full list:
- /Users/aliye/Documents/New project/repo-diff-report-2026-03-23/risky-merge-content-diff.txt

### B) Missing in A but medium/high risk (manual review before copy)
Count:       67

See full list:
- /Users/aliye/Documents/New project/repo-diff-report-2026-03-23/risky-missing-in-A.txt

## Execution Steps
1. Create backup + working branch in A.
2. Copy Block-1 whitelist files from B to A.
3. Run build + smoke.
4. Move to risky list, merge item-by-item.
5. Run build + smoke after each risky block.
