BEGIN;

INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT
  'bursluluk.exam_open_at',
  legacy.value,
  COALESCE(NULLIF(legacy.updated_by, ''), 'migration_20260320_0013'),
  NOW()
FROM app_settings legacy
WHERE legacy.key = 'bursluluk.campaign.exam_open_at'
  AND NOT EXISTS (
    SELECT 1
    FROM app_settings canonical
    WHERE canonical.key = 'bursluluk.exam_open_at'
  );

COMMIT;
