BEGIN;

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions (code, name, description)
VALUES
  ('PANEL_DASHBOARD_READ', 'Panel Dashboard Read', 'Read access for panel dashboard KPIs and school distribution.'),
  ('PANEL_CANDIDATES_READ', 'Candidate Grid Read', 'Read access for candidate operations table.'),
  ('PANEL_CANDIDATES_EXPORT', 'Candidate Grid Export', 'Export candidate grid data.'),
  ('PANEL_CANDIDATES_ACTION', 'Candidate Actions', 'Execute candidate operations actions (sms retry, wa send, notes).'),
  ('PANEL_NOTIFICATIONS_READ', 'Notifications Read', 'Read notification queue and history.'),
  ('PANEL_NOTIFICATIONS_ACTION', 'Notifications Action', 'Retry, cancel, or requeue notification jobs.'),
  ('PANEL_UNVIEWED_READ', 'Unviewed Results Read', 'Read candidates who did not view published results.'),
  ('PANEL_UNVIEWED_ACTION', 'Unviewed Results Action', 'Trigger WhatsApp flow for unviewed results.'),
  ('PANEL_DLQ_READ', 'DLQ Read', 'Read dead-letter queue jobs.'),
  ('PANEL_DLQ_ACTION', 'DLQ Action', 'Execute DLQ retry and close actions.'),
  ('PANEL_SETTINGS_READ', 'Settings Read', 'Read app settings through panel.'),
  ('PANEL_SETTINGS_WRITE', 'Settings Write', 'Update app settings through panel.'),
  ('PANEL_AUDIT_READ', 'Audit Read', 'Read audit trail entries.'),
  ('PANEL_AUDIT_EXPORT', 'Audit Export', 'Export audit trail entries.'),
  ('PANEL_RESULTS_REVIEW', 'Results Review', 'Review candidate results before publish.'),
  ('PANEL_RESULTS_OVERRIDE', 'Results Override', 'Override ranking/discount decisions with audit trail.'),
  ('PANEL_RESULTS_PUBLISH', 'Results Publish', 'Publish final results to candidates.'),
  ('PANEL_CRM_PUSH', 'CRM Push', 'Push candidate data to external CRM.'),
  ('PANEL_IP_POLICY_READ', 'IP Policy Read', 'Read role-based panel IP policy settings.'),
  ('PANEL_IP_POLICY_WRITE', 'IP Policy Write', 'Update role-based panel IP policy settings.')
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_role
  ON role_permissions (permission_id, role_id);

WITH mapping(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'PANEL_DASHBOARD_READ'),
    ('SUPER_ADMIN', 'PANEL_CANDIDATES_READ'),
    ('SUPER_ADMIN', 'PANEL_CANDIDATES_EXPORT'),
    ('SUPER_ADMIN', 'PANEL_CANDIDATES_ACTION'),
    ('SUPER_ADMIN', 'PANEL_NOTIFICATIONS_READ'),
    ('SUPER_ADMIN', 'PANEL_NOTIFICATIONS_ACTION'),
    ('SUPER_ADMIN', 'PANEL_UNVIEWED_READ'),
    ('SUPER_ADMIN', 'PANEL_UNVIEWED_ACTION'),
    ('SUPER_ADMIN', 'PANEL_DLQ_READ'),
    ('SUPER_ADMIN', 'PANEL_DLQ_ACTION'),
    ('SUPER_ADMIN', 'PANEL_SETTINGS_READ'),
    ('SUPER_ADMIN', 'PANEL_SETTINGS_WRITE'),
    ('SUPER_ADMIN', 'PANEL_AUDIT_READ'),
    ('SUPER_ADMIN', 'PANEL_AUDIT_EXPORT'),
    ('SUPER_ADMIN', 'PANEL_RESULTS_REVIEW'),
    ('SUPER_ADMIN', 'PANEL_RESULTS_OVERRIDE'),
    ('SUPER_ADMIN', 'PANEL_RESULTS_PUBLISH'),
    ('SUPER_ADMIN', 'PANEL_CRM_PUSH'),
    ('SUPER_ADMIN', 'PANEL_IP_POLICY_READ'),
    ('SUPER_ADMIN', 'PANEL_IP_POLICY_WRITE'),

    ('OPERATIONS', 'PANEL_DASHBOARD_READ'),
    ('OPERATIONS', 'PANEL_CANDIDATES_READ'),
    ('OPERATIONS', 'PANEL_CANDIDATES_EXPORT'),
    ('OPERATIONS', 'PANEL_CANDIDATES_ACTION'),
    ('OPERATIONS', 'PANEL_NOTIFICATIONS_READ'),
    ('OPERATIONS', 'PANEL_NOTIFICATIONS_ACTION'),
    ('OPERATIONS', 'PANEL_UNVIEWED_READ'),
    ('OPERATIONS', 'PANEL_UNVIEWED_ACTION'),
    ('OPERATIONS', 'PANEL_DLQ_READ'),
    ('OPERATIONS', 'PANEL_DLQ_ACTION'),
    ('OPERATIONS', 'PANEL_SETTINGS_READ'),
    ('OPERATIONS', 'PANEL_AUDIT_READ'),
    ('OPERATIONS', 'PANEL_AUDIT_EXPORT'),
    ('OPERATIONS', 'PANEL_RESULTS_REVIEW'),
    ('OPERATIONS', 'PANEL_CRM_PUSH'),
    ('OPERATIONS', 'PANEL_IP_POLICY_READ'),

    ('READ_ONLY', 'PANEL_DASHBOARD_READ'),
    ('READ_ONLY', 'PANEL_CANDIDATES_READ'),
    ('READ_ONLY', 'PANEL_CANDIDATES_EXPORT'),
    ('READ_ONLY', 'PANEL_NOTIFICATIONS_READ'),
    ('READ_ONLY', 'PANEL_UNVIEWED_READ'),
    ('READ_ONLY', 'PANEL_DLQ_READ'),
    ('READ_ONLY', 'PANEL_SETTINGS_READ'),
    ('READ_ONLY', 'PANEL_AUDIT_READ'),
    ('READ_ONLY', 'PANEL_AUDIT_EXPORT'),
    ('READ_ONLY', 'PANEL_RESULTS_REVIEW'),
    ('READ_ONLY', 'PANEL_IP_POLICY_READ')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mapping m
JOIN roles r ON r.code = m.role_code
JOIN permissions p ON p.code = m.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_ip_policies (
  role_code TEXT PRIMARY KEY REFERENCES roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_ips TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  note TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_ip_policies_enabled
  ON admin_ip_policies (is_enabled);

INSERT INTO admin_ip_policies (role_code, is_enabled, allowed_ips, note, updated_by)
SELECT
  r.code,
  FALSE,
  ARRAY[]::TEXT[],
  'Disabled by default. Enable for role-based allowlist.',
  'migration_20260320_0009'
FROM roles r
ON CONFLICT (role_code) DO NOTHING;

COMMIT;
