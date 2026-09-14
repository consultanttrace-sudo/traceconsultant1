// Daftar mirror Overpass publik. Bisa di-override lewat env var
// OVERPASS_MIRRORS (pisahkan pakai koma) tanpa perlu ubah kode ini.
const DEFAULT_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const OVERPASS = (process.env.OVERPASS_MIRRORS
  ? process.env.OVERPASS_MIRRORS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_OVERPASS);

// Opsional: kalau OVERPASS_PROXY_URL di-set (misal alamat Cloudflare Worker),
// semua request Overpass dilewatkan lewat proxy itu supaya tidak kena
// blokir IP data-center Netlify. Kalau kosong, request langsung seperti biasa.
const OVERPASS_PROXY_URL = process.env.OVERPASS_PROXY_URL || '';

function resolveFetchUrl(targetUrl) {
  if (!OVERPASS_PROXY_URL) return targetUrl;
  return `${OVERPASS_PROXY_URL}?target=${encodeURIComponent(targetUrl)}`;
}

const PROVIDER_TIMEOUT_MS = Math.max(1000, Number(process.env.OVERPASS_PROVIDER_TIMEOUT_MS || 9000));
const GLOBAL_DEADLINE_MS = Math.max(PROVIDER_TIMEOUT_MS + 500, Number(process.env.OVERPASS_GLOBAL_DEADLINE_MS || 12000));
const PROVIDER_CONCURRENCY = Math.max(1, Math.min(OVERPASS.length, Number(process.env.OVERPASS_CONCURRENCY || 3)));

const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

async function callProvider(url, query, timeoutMs, signal) {
  const startedAt = Date.now();

  try {
    const body = new URLSearchParams({ data: query }).toString();
    const response = await fetchWithTimeout(
      resolveFetchUrl(url),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json, text/plain, */*',
          'user-agent': 'TRACE-Consultant-OS/1.0',
        },
        body,
        signal,
      },
      timeoutMs,
    );

    const text = await response.text();

    return {
      provider: url,
      ok: response.ok && !!text,
      status: response.status,
      text,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      provider: url,
      ok: false,
      status: 0,
      text: '',
      elapsedMs: Date.now() - startedAt,
      timeout: error?.name === 'AbortError',
      networkError:
        error?.name === 'AbortError'
          ? undefined
          : error?.message || String(error),
    };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...cors(event), 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'POST only' }),
    };
  }

  const auth = await requireAuth(event);
  if (!auth.ok) {
    return {
      statusCode: auth.statusCode,
      headers: { ...cors(event), 'content-type': 'application/json' },
      body: JSON.stringify({ error: auth.error }),
    };
  }

  const query = event.body || '';
  if (!query.trim()) {
    return {
      statusCode: 400,
      headers: { ...cors(event), 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Empty Overpass query' }),
    };
  }

  const startedAt = Date.now();
  console.log(JSON.stringify({
    stage: 'overpass_parallel_start',
    providers: OVERPASS,
    providerTimeoutMs: PROVIDER_TIMEOUT_MS,
  }));

  // Bounded parallelism + hard global deadline. This prevents one discovery request
  // from spawning seven long-lived provider requests and hanging past the job budget.
  const globalController = new AbortController();
  const globalTimer = setTimeout(() => globalController.abort(), GLOBAL_DEADLINE_MS);
  const allResults = [];
  try {
    for (let offset = 0; offset < OVERPASS.length && !globalController.signal.aborted; offset += PROVIDER_CONCURRENCY) {
      const batch = OVERPASS.slice(offset, offset + PROVIDER_CONCURRENCY);
      const attempts = batch.map(async (url) => {
        console.log(JSON.stringify({ stage: 'overpass_attempt', provider: url, timeoutMs: PROVIDER_TIMEOUT_MS }));
        const result = await callProvider(url, query, PROVIDER_TIMEOUT_MS, globalController.signal);
        allResults.push(result);
        if (result.ok) {
          console.log(JSON.stringify({ stage: 'overpass_success', provider: url, status: result.status, elapsedMs: result.elapsedMs }));
          return result;
        }
        console.warn(JSON.stringify({ stage: 'overpass_failure', provider: url, status: result.status, timeout: !!result.timeout, networkError: result.networkError, elapsedMs: result.elapsedMs, detail: result.text ? result.text.slice(0, 300) : undefined }));
        throw result;
      });
      try {
        const success = await Promise.any(attempts);
        globalController.abort();
        return { statusCode: 200, headers: { ...cors(event), 'content-type': 'application/json', 'x-overpass-provider': success.provider }, body: success.text };
      } catch {
        if (globalController.signal.aborted) break;
      }
    }

    const results = allResults;
    const reason = results.some((x) => x.status === 429)
      ? 'rate_limited'
      : globalController.signal.aborted && (Date.now() - startedAt) >= GLOBAL_DEADLINE_MS
        ? 'global_timeout'
        : results.some((x) => x.timeout)
          ? 'timeout'
          : results.some((x) => x.status >= 500)
            ? 'server_error'
            : results.some((x) => x.status === 406)
              ? 'request_rejected'
              : results.some((x) => x.networkError)
                ? 'network_error'
                : 'unknown';
    console.error(JSON.stringify({ stage: 'overpass_all_failed', elapsedMs: Date.now() - startedAt, reason, providerConcurrency: PROVIDER_CONCURRENCY, globalDeadlineMs: GLOBAL_DEADLINE_MS, attempts: results.map((result) => ({ provider: result.provider, status: result.status, timeout: !!result.timeout, networkError: result.networkError, detail: result.text ? result.text.slice(0, 300) : undefined })) }));
    return { statusCode: reason === 'global_timeout' ? 504 : 502, headers: { ...cors(event), 'content-type': 'application/json' }, body: JSON.stringify({ error: 'All Overpass providers failed', reason, elapsedMs: Date.now() - startedAt, providerConcurrency: PROVIDER_CONCURRENCY, globalDeadlineMs: GLOBAL_DEADLINE_MS, attempts: results.map((result) => ({ provider: result.provider, status: result.status, timeout: !!result.timeout, networkError: result.networkError, detail: result.text ? result.text.slice(0, 300) : undefined })) }) };
  } finally {
    clearTimeout(globalTimer);
  }

};
