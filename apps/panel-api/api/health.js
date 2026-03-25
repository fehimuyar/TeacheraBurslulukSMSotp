import { query } from './_lib/db.js';
import { isRedisConfigured, isRedisUnavailableError, runRedisCommand } from './_lib/redis.js';
import { handleRequest, methodGuard, ok } from './_lib/http.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    const { rows } = await query('SELECT NOW() AS now_utc');
    let redis = 'not_configured';
    let redisErrorCode = null;
    if (isRedisConfigured()) {
      try {
        await runRedisCommand((redisClient) => redisClient.ping());
        redis = 'up';
      } catch (error) {
        if (isRedisUnavailableError(error)) {
          redis = 'down';
          redisErrorCode = error?.code || 'redis_unavailable';
        } else {
          throw error;
        }
      }
    }

    ok(res, {
      service: 'teachera-panel-api',
      db: 'up',
      redis,
      redis_error_code: redisErrorCode,
      now_utc: rows[0]?.now_utc || null,
    });
  });
}
