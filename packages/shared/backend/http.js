import { HttpError, isHttpError } from './errors.js';

function sendRawJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendJson(res, status, payload) {
  sendRawJson(res, status, payload);
}

export function ok(res, payload) {
  sendRawJson(res, 200, { ok: true, ...payload });
}

export function fail(res, status, code, message, details) {
  sendRawJson(res, status, {
    ok: false,
    error: code,
    message,
    ...(details ? { details } : {}),
  });
}

export function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnvToken(value) {
  const raw = safeTrim(value);
  if (!raw) return '';
  return raw.replace(/\\r/g, '').replace(/\\n/g, '').replace(/\r/g, '').replace(/\n/g, '').trim();
}

export function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(String(value), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function parseJsonSafe(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => normalizeEnvToken(item).toLowerCase())
    .filter(Boolean);
}

function splitCsvPreserveCase(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => normalizeEnvToken(item))
    .filter(Boolean);
}

function normalizeHost(rawHost) {
  const candidate = normalizeEnvToken(String(rawHost || '').split(',')[0]);
  if (!candidate) return '';
  return candidate.toLowerCase().replace(/:\d+$/, '');
}

function normalizeOrigin(rawOrigin) {
  const candidate = safeTrim(rawOrigin);
  if (!candidate || candidate === 'null') return '';
  try {
    return new URL(candidate).origin.toLowerCase();
  } catch {
    return '';
  }
}

function parseBoolean(rawValue, fallback = false) {
  const value = normalizeEnvToken(rawValue).toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function readServiceGuardMode() {
  const mode = normalizeEnvToken(process.env.SERVICE_HOST_GUARD_MODE).toLowerCase();
  if (mode === 'off' || mode === 'warn' || mode === 'enforce') {
    return mode;
  }
  return process.env.NODE_ENV === 'production' ? 'enforce' : 'off';
}

function readServiceRouteGuardMode() {
  const mode = normalizeEnvToken(process.env.SERVICE_ROUTE_GUARD_MODE).toLowerCase();
  if (mode === 'off' || mode === 'warn' || mode === 'enforce') {
    return mode;
  }
  return readServiceGuardMode();
}

function readCorsGuardMode() {
  const mode = normalizeEnvToken(process.env.CORS_GUARD_MODE).toLowerCase();
  if (mode === 'off' || mode === 'warn' || mode === 'enforce') {
    return mode;
  }
  return process.env.NODE_ENV === 'production' ? 'enforce' : 'off';
}

function readServiceRuntime() {
  const value = normalizeEnvToken(process.env.SERVICE_RUNTIME).toLowerCase();
  if (value === 'exam-api' || value === 'panel-api' || value === 'ops-api') {
    return value;
  }
  return '';
}

function normalizeRequestPath(req) {
  const raw = safeTrim(req.url || '');
  const withoutQuery = raw.split('?')[0];
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return normalized || '/';
}

function inferRuntimeFromPath(pathname) {
  if (pathname.startsWith('/api/panel/')) return 'panel-api';
  if (pathname.startsWith('/api/notifications/') || pathname.startsWith('/api/ops/')) return 'ops-api';
  if (pathname.startsWith('/api/exam/') || pathname.startsWith('/api/schools/') || pathname === '/api/forms') return 'exam-api';
  return '';
}

function readExpectedHostsForRuntime(runtime) {
  if (runtime === 'exam-api') {
    return splitCsv(process.env.EXPECTED_EXAM_API_HOSTS);
  }
  if (runtime === 'panel-api') {
    return splitCsv(process.env.EXPECTED_PANEL_API_HOSTS);
  }
  if (runtime === 'ops-api') {
    return splitCsv(process.env.EXPECTED_OPS_API_HOSTS);
  }
  return [];
}

function inferRuntimeFromHost(req) {
  const requestHost = normalizeHost(req.headers?.['x-forwarded-host'] || req.headers?.host);
  if (!requestHost) return '';

  if (readExpectedHostsForRuntime('exam-api').includes(requestHost)) {
    return 'exam-api';
  }
  if (readExpectedHostsForRuntime('panel-api').includes(requestHost)) {
    return 'panel-api';
  }
  if (readExpectedHostsForRuntime('ops-api').includes(requestHost)) {
    return 'ops-api';
  }
  return '';
}

function allowedPathPrefixesForRuntime(runtime) {
  if (runtime === 'exam-api') {
    return ['/api/exam/', '/api/schools/', '/api/forms', '/api/health'];
  }
  if (runtime === 'panel-api') {
    return ['/api/panel/', '/api/health'];
  }
  if (runtime === 'ops-api') {
    return ['/api/notifications/', '/api/ops/', '/api/health'];
  }
  return [];
}

function isPathAllowed(pathname, allowedPrefixes) {
  return allowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function readRuntimeCorsEnv(runtime) {
  if (runtime === 'exam-api') return safeTrim(process.env.EXAM_API_CORS_ALLOW_ORIGINS);
  if (runtime === 'panel-api') return safeTrim(process.env.PANEL_API_CORS_ALLOW_ORIGINS);
  if (runtime === 'ops-api') return safeTrim(process.env.OPS_API_CORS_ALLOW_ORIGINS);
  return '';
}

function normalizeOriginList(values) {
  const result = [];
  const seen = new Set();
  for (const item of values) {
    const origin = normalizeOrigin(item);
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    result.push(origin);
  }
  return result;
}

function resolveAllowedCorsOrigins(runtime, allowOriginsOverride = null) {
  if (Array.isArray(allowOriginsOverride) && allowOriginsOverride.length > 0) {
    return normalizeOriginList(allowOriginsOverride);
  }

  const candidates = [
    ...splitCsvPreserveCase(process.env.CORS_ALLOW_ORIGINS),
    ...splitCsvPreserveCase(readRuntimeCorsEnv(runtime)),
    safeTrim(process.env.VITE_SITE_URL),
    safeTrim(process.env.SITE_URL),
    'https://teachera.com.tr',
    'https://www.teachera.com.tr',
  ];

  const expectedServiceHost = normalizeHost(process.env.EXPECTED_SERVICE_HOST);
  if (expectedServiceHost) {
    candidates.push(`https://${expectedServiceHost}`);
  }

  if (safeTrim(process.env.NODE_ENV).toLowerCase() !== 'production') {
    const devPorts = [3000, 4173, 5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
    for (const port of devPorts) {
      candidates.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
    }
  }

  return normalizeOriginList(candidates);
}

function appendVaryHeader(res, value) {
  if (typeof res?.setHeader !== 'function') return;
  const existing = res.getHeader?.('Vary');
  const current = new Set(
    String(existing || '')
      .split(',')
      .map((item) => safeTrim(item))
      .filter(Boolean),
  );
  for (const item of value.split(',')) {
    const normalized = safeTrim(item);
    if (normalized) current.add(normalized);
  }
  res.setHeader('Vary', Array.from(current).join(', '));
}

function readCorsAllowCredentials(runtime, overrideValue) {
  if (typeof overrideValue === 'boolean') return overrideValue;
  const envValue = safeTrim(process.env.CORS_ALLOW_CREDENTIALS);
  if (envValue) return parseBoolean(envValue, false);
  return runtime === 'panel-api';
}

function readCorsAllowMethods(overrideValue) {
  const fallback = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  const source = Array.isArray(overrideValue)
    ? overrideValue
    : splitCsvPreserveCase(overrideValue || process.env.CORS_ALLOW_METHODS);
  if (!Array.isArray(source) || source.length === 0) return fallback.join(', ');

  const normalized = Array.from(
    new Set(
      source
        .map((item) => safeTrim(item).toUpperCase())
        .filter(Boolean),
    ),
  );
  return (normalized.length === 0 ? fallback : normalized).join(', ');
}

function readCorsAllowHeaders(overrideValue) {
  const fallback = [
    'Authorization',
    'Content-Type',
    'Accept',
    'X-Requested-With',
    'X-Exam-Session-Token',
    'X-Worker-Secret',
    'X-Cron-Secret',
  ];

  const source = Array.isArray(overrideValue)
    ? overrideValue
    : splitCsvPreserveCase(overrideValue || process.env.CORS_ALLOW_HEADERS);
  if (!Array.isArray(source) || source.length === 0) return fallback.join(', ');

  const normalized = Array.from(
    new Set(
      source
        .map((item) => safeTrim(item))
        .filter(Boolean),
    ),
  );
  return (normalized.length === 0 ? fallback : normalized).join(', ');
}

function readCorsExposeHeaders(overrideValue) {
  const fallback = [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ];
  const source = Array.isArray(overrideValue)
    ? overrideValue
    : splitCsvPreserveCase(overrideValue || process.env.CORS_EXPOSE_HEADERS);

  if (!Array.isArray(source) || source.length === 0) return fallback.join(', ');
  const normalized = Array.from(
    new Set(
      source
        .map((item) => safeTrim(item))
        .filter(Boolean),
    ),
  );
  return (normalized.length === 0 ? fallback : normalized).join(', ');
}

function applyDefaultSecurityHeaders(res) {
  if (typeof res?.setHeader !== 'function') return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function applyCorsPolicy(req, res, options = {}) {
  const mode = readCorsGuardMode();
  const method = safeTrim(req.method).toUpperCase();
  const requestOrigin = normalizeOrigin(req.headers?.origin);
  const isPreflight = method === 'OPTIONS' && Boolean(safeTrim(req.headers?.['access-control-request-method']));

  if (mode === 'off') {
    if (isPreflight) {
      res.status(204).end();
      return { preflight: true, requestOrigin, originAllowed: true };
    }
    return { preflight: false, requestOrigin, originAllowed: true };
  }

  const pathname = normalizeRequestPath(req);
  const runtime = readServiceRuntime() || inferRuntimeFromPath(pathname) || inferRuntimeFromHost(req);
  const allowedOrigins = resolveAllowedCorsOrigins(runtime, options.allowOrigins || null);
  const originAllowed = !requestOrigin ? true : allowedOrigins.includes(requestOrigin);
  const allowCredentials = readCorsAllowCredentials(runtime, options.allowCredentials);

  appendVaryHeader(res, 'Origin');
  if (isPreflight) {
    appendVaryHeader(res, 'Access-Control-Request-Method, Access-Control-Request-Headers');
  }

  if (requestOrigin && originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Expose-Headers', readCorsExposeHeaders(options.exposeHeaders));
  }

  if (requestOrigin && !originAllowed) {
    if (mode === 'warn') {
      console.warn('[cors_guard_warn_origin_not_allowed]', {
        requestOrigin,
        runtime,
        allowedOrigins,
      });
    } else {
      throw new HttpError(403, 'Request origin is not allowed.', 'origin_not_allowed', {
        request_origin: requestOrigin,
        runtime: runtime || null,
      });
    }
  }

  if (!isPreflight) {
    return { preflight: false, requestOrigin, originAllowed };
  }

  if (!requestOrigin) {
    if (mode === 'warn') {
      console.warn('[cors_guard_warn_missing_origin]');
      res.status(204).end();
      return { preflight: true, requestOrigin, originAllowed };
    }
    throw new HttpError(400, 'CORS preflight request origin is missing.', 'cors_missing_origin');
  }

  if (!originAllowed && mode !== 'warn') {
    throw new HttpError(403, 'CORS preflight origin is not allowed.', 'origin_not_allowed', {
      request_origin: requestOrigin,
      runtime: runtime || null,
    });
  }

  res.setHeader('Access-Control-Allow-Methods', readCorsAllowMethods(options.allowMethods));
  res.setHeader('Access-Control-Allow-Headers', readCorsAllowHeaders(options.allowHeaders));
  res.setHeader('Access-Control-Max-Age', String(clampInt(process.env.CORS_PREFLIGHT_MAX_AGE_SECONDS, 60, 86400, 600)));
  res.status(204).end();
  return { preflight: true, requestOrigin, originAllowed };
}

export function enforceServiceHost(req) {
  const mode = readServiceGuardMode();
  if (mode === 'off') return;

  const expectedServiceHost = normalizeHost(process.env.EXPECTED_SERVICE_HOST);
  const expectedHosts = expectedServiceHost ? [expectedServiceHost] : [];

  const requestHost = normalizeHost(req.headers?.['x-forwarded-host'] || req.headers?.host);

  if (expectedHosts.length === 0) {
    throw new HttpError(
      503,
      'EXPECTED_SERVICE_HOST is required for service host boundary protection.',
      'expected_service_host_missing',
    );
  }

  if (!requestHost) {
    if (mode === 'enforce') {
      throw new HttpError(400, 'Request host header is missing.', 'missing_request_host');
    }
    console.warn('[service_host_guard_warn_missing_request_host]');
    return;
  }

  const isAllowed = expectedHosts.includes(requestHost);
  if (isAllowed) return;

  if (mode === 'enforce') {
    throw new HttpError(421, 'Request host does not match service boundary.', 'service_host_mismatch', {
      request_host: requestHost,
      expected_hosts: expectedHosts,
    });
  }

  console.warn('[service_host_guard_warn_mismatch]', {
    requestHost,
    expectedHosts,
  });
}

export function enforceServiceRoute(req) {
  const mode = readServiceRouteGuardMode();
  if (mode === 'off') return;

  const pathname = normalizeRequestPath(req);
  const runtime = readServiceRuntime() || inferRuntimeFromPath(pathname) || inferRuntimeFromHost(req);
  if (!runtime) {
    if (mode === 'enforce') {
      throw new HttpError(503, 'Service runtime boundary is not configured.', 'service_runtime_not_configured');
    }
    console.warn('[service_route_guard_warn_missing_runtime]');
    return;
  }

  const allowedPrefixes = allowedPathPrefixesForRuntime(runtime);
  if (allowedPrefixes.length === 0) {
    if (mode === 'enforce') {
      throw new HttpError(503, 'Service route boundary is not configured.', 'service_route_guard_not_configured');
    }
    console.warn('[service_route_guard_warn_missing_prefixes]', { runtime });
    return;
  }

  if (isPathAllowed(pathname, allowedPrefixes)) return;

  if (mode === 'enforce') {
    throw new HttpError(421, 'Request route does not match service runtime boundary.', 'service_route_mismatch', {
      runtime,
      request_path: pathname,
      allowed_prefixes: allowedPrefixes,
    });
  }

  console.warn('[service_route_guard_warn_mismatch]', {
    runtime,
    pathname,
    allowedPrefixes,
  });
}

export function enforceServiceBoundary(req) {
  enforceServiceHost(req);
  enforceServiceRoute(req);
}

export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    const parsed = parseJsonSafe(req.body);
    return parsed;
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      resolve(parseJsonSafe(raw));
    });
    req.on('error', () => resolve(null));
  });
}

export async function readRawBody(req, maxBytes = 20 * 1024 * 1024) {
  const boundedMaxBytes = clampInt(maxBytes, 1024, 100 * 1024 * 1024, 20 * 1024 * 1024);

  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > boundedMaxBytes) {
      throw new HttpError(413, 'Request body is too large.', 'payload_too_large', {
        max_bytes: boundedMaxBytes,
      });
    }
    return req.body;
  }

  if (typeof req.body === 'string') {
    const buffer = Buffer.from(req.body, 'utf8');
    if (buffer.length > boundedMaxBytes) {
      throw new HttpError(413, 'Request body is too large.', 'payload_too_large', {
        max_bytes: boundedMaxBytes,
      });
    }
    return buffer;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += nextChunk.length;

      if (total > boundedMaxBytes) {
        reject(
          new HttpError(413, 'Request body is too large.', 'payload_too_large', {
            max_bytes: boundedMaxBytes,
          }),
        );
        return;
      }

      chunks.push(nextChunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(new HttpError(400, 'Request body could not be read.', 'invalid_request_body')));
  });
}

export function methodGuard(req, allowedMethods) {
  const method = safeTrim(req.method).toUpperCase();
  if (!allowedMethods.includes(method)) {
    throw new HttpError(405, 'Method is not allowed for this endpoint.', 'method_not_allowed');
  }
}

export function parseFiltersFromQuery(filtersRaw) {
  if (!filtersRaw) return {};
  if (typeof filtersRaw === 'object') return filtersRaw;
  const parsed = parseJsonSafe(filtersRaw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function parseDateRange(filters = {}) {
  const from = safeTrim(filters.from || filters.start_date || filters.date_from);
  const to = safeTrim(filters.to || filters.end_date || filters.date_to);
  return {
    from: from || null,
    to: to || null,
  };
}

export function parseListQuery(req, allowedSortKeys, defaultSortBy, defaultSortOrder = 'desc', options = {}) {
  const page = clampInt(req.query?.page, 1, 100000, 1);
  const perPage = clampInt(req.query?.per_page, 1, 200, 25);
  const q = safeTrim(req.query?.q);
  const sortByCandidate = safeTrim(req.query?.sort_by);
  const sortOrderCandidate = safeTrim(req.query?.sort_order).toLowerCase();
  const filters = parseFiltersFromQuery(req.query?.filters);

  const strictSortBy = options.strictSortBy !== false;
  if (sortByCandidate && !allowedSortKeys.includes(sortByCandidate) && strictSortBy) {
    throw new HttpError(400, 'Invalid sort_by value.', 'invalid_sort_by', {
      sort_by: sortByCandidate,
      allowed_sort_by: allowedSortKeys,
    });
  }

  const sortBy = allowedSortKeys.includes(sortByCandidate) ? sortByCandidate : defaultSortBy;
  const sortOrder = sortOrderCandidate === 'asc' ? 'asc' : defaultSortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

  return {
    page,
    perPage,
    q,
    filters,
    sortBy,
    sortOrder,
    offset: (page - 1) * perPage,
  };
}

export function normalizeArrayFilter(value, allowedValues = null) {
  if (Array.isArray(value)) {
    const items = value.map((item) => safeTrim(item)).filter(Boolean);
    if (!allowedValues) return items;
    return items.filter((item) => allowedValues.includes(item));
  }

  if (typeof value === 'string') {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!allowedValues) return items;
    return items.filter((item) => allowedValues.includes(item));
  }

  return [];
}

export async function handleRequest(req, res, handler) {
  try {
    applyDefaultSecurityHeaders(res);
    enforceServiceBoundary(req);
    const cors = applyCorsPolicy(req, res);
    if (cors.preflight) return;
    await handler();
  } catch (error) {
    if (isHttpError(error)) {
      fail(res, error.status, error.code, error.message, error.details);
      return;
    }

    console.error('[api_unhandled_error]', error);
    fail(res, 500, 'internal_error', 'Unexpected server error.');
  }
}
