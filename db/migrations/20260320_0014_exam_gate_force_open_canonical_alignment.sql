BEGIN;

WITH open_at_source AS (
  SELECT
    legacy.value,
    legacy.updated_by
  FROM app_settings legacy
  WHERE legacy.key IN ('bursluluk.campaign.exam_open_at', 'exam.open_at')
  ORDER BY
    CASE legacy.key
      WHEN 'bursluluk.campaign.exam_open_at' THEN 1
      ELSE 2
    END,
    legacy.updated_at DESC
  LIMIT 1
)
INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT
  'bursluluk.exam_open_at',
  source.value,
  COALESCE(NULLIF(source.updated_by, ''), 'migration_20260320_0014'),
  NOW()
FROM open_at_source source
WHERE NOT EXISTS (
  SELECT 1
  FROM app_settings canonical
  WHERE canonical.key = 'bursluluk.exam_open_at'
);

WITH force_open_source AS (
  SELECT
    legacy.value,
    legacy.updated_by
  FROM app_settings legacy
  WHERE legacy.key IN ('bursluluk.campaign.exam_force_open', 'exam.force_open')
  ORDER BY
    CASE legacy.key
      WHEN 'bursluluk.campaign.exam_force_open' THEN 1
      ELSE 2
    END,
    legacy.updated_at DESC
  LIMIT 1
)
INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT
  'bursluluk.exam_force_open',
  source.value,
  COALESCE(NULLIF(source.updated_by, ''), 'migration_20260320_0014'),
  NOW()
FROM force_open_source source
WHERE NOT EXISTS (
  SELECT 1
  FROM app_settings canonical
  WHERE canonical.key = 'bursluluk.exam_force_open'
);

COMMIT;
