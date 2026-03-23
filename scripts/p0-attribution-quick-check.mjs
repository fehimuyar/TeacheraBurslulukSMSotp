import process from 'node:process';
import { Client } from 'pg';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function toTurkeyDate(value = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(value);
}

async function run() {
  const campaignCode = safeTrim(process.env.SCHOOL_COVERAGE_CAMPAIGN_CODE || process.env.SMOKE_CAMPAIGN_CODE || '2026_BURSLULUK');
  const dateTr = safeTrim(process.env.SCHOOL_COVERAGE_DATE || toTurkeyDate());
  const dbUrl = safeTrim(process.env.SMOKE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL);

  if (!dbUrl) {
    throw new Error('DATABASE_URL/SMOKE_DB_URL missing.');
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const summaryRes = await client.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE nullif(trim(ev.event_payload ->> 'utm_source'), '') IS NOT NULL)::int AS with_utm_source,
          COUNT(*) FILTER (WHERE nullif(trim(ev.event_payload ->> 'utm_medium'), '') IS NOT NULL)::int AS with_utm_medium,
          COUNT(*) FILTER (WHERE nullif(trim(ev.event_payload ->> 'utm_campaign'), '') IS NOT NULL)::int AS with_utm_campaign
        FROM activity_events ev
        JOIN candidates c ON c.id = ev.candidate_id
        WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
          AND c.campaign_code = $1
          AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
      `,
      [campaignCode, dateTr],
    );

    const channelRes = await client.query(
      `
        SELECT
          lower(trim(COALESCE(ev.event_payload ->> 'utm_source', ''))) AS utm_source,
          COUNT(*)::int AS total
        FROM activity_events ev
        JOIN candidates c ON c.id = ev.candidate_id
        WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
          AND c.campaign_code = $1
          AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
        GROUP BY 1
        ORDER BY total DESC, utm_source ASC
      `,
      [campaignCode, dateTr],
    );

    const sampleRes = await client.query(
      `
        SELECT
          ev.id,
          ev.occurred_at,
          ev.event_payload ->> 'utm_source' AS utm_source,
          ev.event_payload ->> 'utm_medium' AS utm_medium,
          ev.event_payload ->> 'utm_campaign' AS utm_campaign,
          ev.event_payload ->> 'landing_url' AS landing_url,
          ev.event_payload ->> 'referrer' AS referrer
        FROM activity_events ev
        JOIN candidates c ON c.id = ev.candidate_id
        WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
          AND c.campaign_code = $1
          AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
        ORDER BY ev.occurred_at DESC
        LIMIT 10
      `,
      [campaignCode, dateTr],
    );

    const observedChannels = channelRes.rows
      .map((row) => safeTrim(row.utm_source))
      .filter(Boolean);

    const payload = {
      timestamp: new Date().toISOString(),
      campaign_code: campaignCode,
      date_tr: dateTr,
      summary: summaryRes.rows[0] || {
        total: 0,
        with_utm_source: 0,
        with_utm_medium: 0,
        with_utm_campaign: 0,
      },
      observed_channels: observedChannels,
      observed_channels_breakdown: channelRes.rows,
      sample_latest_10: sampleRes.rows,
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((error) => {
  process.stderr.write(`[p0-attribution-quick-check] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
