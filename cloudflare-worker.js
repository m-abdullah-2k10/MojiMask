/**
 * ============================================================================
 * MojiMask – Cloudflare Worker with KV Storage
 * ============================================================================
 *
 * Instead of proxying to file.io (which is unreachable from Workers due to
 * Cloudflare-to-Cloudflare routing issues), this Worker stores encrypted data
 * directly in Cloudflare KV — our own ephemeral storage with auto-expiry.
 *
 * SETUP: Bind a KV namespace named "STORE" to this Worker.
 *
 * ROUTES
 * ------
 *   POST  /              → Upload: stores data in KV, returns { success, key }
 *   GET   /file/{key}    → Download: returns stored data, enforces maxDownloads
 *   GET   /download      → CORS proxy for legacy download URLs
 *   OPTIONS *            → CORS preflight
 *   GET   /health        → Health check
 */

// ─── CORS Configuration ─────────────────────────────────────────────────────
// Add your production domain(s) here. While the list is empty, all origins are
// allowed so the tool keeps working during development / local file:// usage.
var ALLOWED_ORIGINS = [
  // 'https://yourdomain.com',
];

var EXPIRY_SECONDS = 604800; // 7 days

var ALLOWED_DOWNLOAD_HOSTS = [
  'file.io', 'www.file.io', 'transfer.sh', 'tmpfiles.org', '0x0.st'
];

// ─── KV Binding Detection ───────────────────────────────────────────────────
// Try multiple common binding names in case the user named it differently
function getKV() {
  if (typeof STORE !== 'undefined' && STORE !== null) return STORE;
  if (typeof store !== 'undefined' && store !== null) return store;
  if (typeof MOJIMASK_STORE !== 'undefined' && MOJIMASK_STORE !== null) return MOJIMASK_STORE;
  if (typeof Mojimask_store !== 'undefined' && Mojimask_store !== null) return Mojimask_store;
  if (typeof KV !== 'undefined' && KV !== null) return KV;
  if (typeof kv !== 'undefined' && kv !== null) return kv;
  if (typeof MY_KV !== 'undefined' && MY_KV !== null) return MY_KV;
  if (typeof DATA !== 'undefined' && DATA !== null) return DATA;
  if (typeof MOJIMASK !== 'undefined' && MOJIMASK !== null) return MOJIMASK;
  return null;
}

function getKVName() {
  if (typeof STORE !== 'undefined' && STORE !== null) return 'STORE';
  if (typeof store !== 'undefined' && store !== null) return 'store';
  if (typeof MOJIMASK_STORE !== 'undefined' && MOJIMASK_STORE !== null) return 'MOJIMASK_STORE';
  if (typeof Mojimask_store !== 'undefined' && Mojimask_store !== null) return 'Mojimask_store';
  if (typeof KV !== 'undefined' && KV !== null) return 'KV';
  if (typeof kv !== 'undefined' && kv !== null) return 'kv';
  if (typeof MY_KV !== 'undefined' && MY_KV !== null) return 'MY_KV';
  if (typeof DATA !== 'undefined' && DATA !== null) return 'DATA';
  if (typeof MOJIMASK !== 'undefined' && MOJIMASK !== null) return 'MOJIMASK';
  return null;
}

// ─── CORS Helpers ───────────────────────────────────────────────────────────
/**
 * Returns the origin to echo back, or null if the request should be rejected.
 * - 'null' origin  → file:// protocol (local development)
 * - localhost/127.x → development servers
 * - ALLOWED_ORIGINS → production whitelist (when configured)
 * - If ALLOWED_ORIGINS is empty, all origins are permitted (dev mode).
 */
function resolveOrigin(request) {
  var origin = request.headers.get('Origin');
  if (!origin) return '*';                 // Same-origin or non-browser client
  if (origin === 'null') return 'null';    // file:// protocol
  if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) return origin;
  if (ALLOWED_ORIGINS.length === 0) return origin;  // No whitelist → allow all
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return origin;
  }
  return null; // Rejected
}

function corsHeaders(request) {
  var origin = resolveOrigin(request);
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400'
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// NOTE: CORS headers are added centrally by handleRequest(), so helpers
// only need to set Content-Type.
function jsonError(message, status) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonOk(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function generateKey() {
  // Generate a short, URL-safe key similar to file.io's format
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  var key = '';
  for (var i = 0; i < arr.length; i++) {
    key += chars[arr[i] % chars.length];
  }
  return key;
}

// ─── Upload Handler: POST / ─────────────────────────────────────────────────
async function handleUpload(request) {
  var KV = getKV();
  if (!KV) {
    return jsonError('KV storage not configured. Bind a KV namespace to this Worker (any name works).', 500);
  }

  try {
    var formData = await request.formData();
    var file = formData.get('file');

    if (!file) {
      return jsonError('No file provided.', 400);
    }

    // Read file content as text
    var data = await file.text();

    // Get upload options
    var maxDownloads = parseInt(formData.get('maxDownloads') || '0');
    var autoDelete = formData.get('autoDelete') === 'true';

    // Generate unique key
    var key = generateKey();

    // Ensure key doesn't already exist (extremely unlikely but safe)
    var existing = await KV.get(key);
    if (existing !== null) {
      key = generateKey() + generateKey().substring(0, 4);
    }

    // Store in KV with expiry and metadata
    var metadata = {
      maxDownloads: maxDownloads,
      downloads: 0,
      autoDelete: autoDelete,
      created: Date.now(),
      name: file.name || 'intel.enc',
      size: data.length
    };

    await KV.put(key, data, {
      expirationTtl: EXPIRY_SECONDS,
      metadata: metadata
    });

    // Return response in file.io-compatible format
    return jsonOk({
      success: true,
      status: 200,
      key: key,
      name: metadata.name,
      size: metadata.size,
      maxDownloads: maxDownloads,
      autoDelete: autoDelete,
      expiry: '7d',
      link: 'https://fileio-proxy.codegenious-2k10.workers.dev/file/' + key
    });

  } catch (err) {
    return jsonError('Upload failed: ' + (err.message || String(err)), 500);
  }
}

// ─── Peek (read-only, no counter change): GET /peek/{key} ─────────────────
// Returns the encrypted payload WITHOUT decrementing the download counter or
// deleting the file. Used by the client to test the password first.
async function handleFilePeek(key) {
  var KV = getKV();
  if (!KV) {
    return jsonError('KV storage not configured.', 500);
  }

  try {
    var result = await KV.getWithMetadata(key);

    if (result.value === null) {
      return jsonError('File not found. It may have expired or been deleted.', 404);
    }

    var meta = result.metadata || {};
    var maxDl = meta.maxDownloads || 0;
    var currentDl = meta.downloads || 0;

    // Still respect the exhausted-limit check so callers see 404 properly
    if (maxDl > 0 && currentDl >= maxDl) {
      await KV.delete(key);
      return jsonError('File has been deleted after reaching max downloads.', 404);
    }

    // Return the raw data — counter is NOT changed
    return new Response(result.value, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Downloads': String(currentDl),
        'X-Max-Downloads': String(maxDl),
        'X-Peek': 'true'
      }
    });

  } catch (err) {
    return jsonError('Peek failed: ' + (err.message || String(err)), 500);
  }
}

// ─── File Download: GET /file/{key} ─────────────────────────────────────────
async function handleFileDownload(key) {
  var KV = getKV();
  if (!KV) {
    return jsonError('KV storage not configured.', 500);
  }

  try {
    var result = await KV.getWithMetadata(key);

    if (result.value === null) {
      return jsonError('File not found. It may have expired or been deleted.', 404);
    }

    var meta = result.metadata || {};
    var maxDl = meta.maxDownloads || 0;
    var currentDl = meta.downloads || 0;

    // Check download limit
    if (maxDl > 0 && currentDl >= maxDl) {
      // Already exhausted — delete and return 404
      await KV.delete(key);
      return jsonError('File has been deleted after reaching max downloads.', 404);
    }

    // Increment download count
    var newCount = currentDl + 1;
    var shouldDelete = maxDl > 0 && newCount >= maxDl;

    if (shouldDelete) {
      // This was the last allowed download — delete after serving
      await KV.delete(key);
    } else {
      // Update the counter (re-put with same TTL)
      var age = Date.now() - (meta.created || Date.now());
      var remainingTtl = Math.max(60, EXPIRY_SECONDS - Math.floor(age / 1000));

      meta.downloads = newCount;
      await KV.put(key, result.value, {
        expirationTtl: remainingTtl,
        metadata: meta
      });
    }

    // Return the raw data with CORS headers
    return new Response(result.value, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Downloads': String(newCount),
        'X-Max-Downloads': String(maxDl)
      }
    });

  } catch (err) {
    return jsonError('Download failed: ' + (err.message || String(err)), 500);
  }
}

// ─── CORS Download Proxy: GET /download?url=... ─────────────────────────────
async function handleProxyDownload(request) {
  var reqUrl = new URL(request.url);
  var targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) return jsonError('Missing "url" parameter.', 400);

  var parsedTarget;
  try { parsedTarget = new URL(targetUrl); } catch (e) {
    return jsonError('Invalid target URL.', 400);
  }

  var isAllowed = false;
  for (var i = 0; i < ALLOWED_DOWNLOAD_HOSTS.length; i++) {
    if (parsedTarget.hostname === ALLOWED_DOWNLOAD_HOSTS[i] ||
        parsedTarget.hostname.endsWith('.' + ALLOWED_DOWNLOAD_HOSTS[i])) {
      isAllowed = true;
      break;
    }
  }
  if (!isAllowed) return jsonError('Host not allowed.', 403);

  try {
    var upstream = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
    var headers = new Headers();
    var ct = upstream.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
    return new Response(upstream.body, { status: upstream.status, headers: headers });
  } catch (err) {
    return jsonError('Proxy download failed: ' + (err.message || String(err)), 500);
  }
}

// ─── Main Router ────────────────────────────────────────────────────────────
addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  var url = new URL(request.url);
  var method = request.method.toUpperCase();
  var path = url.pathname;

  // CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Route to the appropriate handler
  var response = await routeRequest(request, method, path);

  // Centrally inject CORS header into every response
  var origin = resolveOrigin(request);
  var newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', origin || 'null');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

async function routeRequest(request, method, path) {
  // Upload: POST /
  if (method === 'POST' && (path === '/' || path === '')) {
    return handleUpload(request);
  }

  // Peek (read-only, no counter change): GET /peek/{key}
  if (method === 'GET' && path.startsWith('/peek/')) {
    var peekKey = path.substring(6);
    if (peekKey) return handleFilePeek(peekKey);
  }

  // File download: GET /file/{key}
  if (method === 'GET' && path.startsWith('/file/')) {
    var key = path.substring(6);
    if (key) return handleFileDownload(key);
  }

  // CORS proxy download: GET /download?url=...
  if (method === 'GET' && path === '/download') {
    return handleProxyDownload(request);
  }

  // Health: GET /health
  if (method === 'GET' && path === '/health') {
    var kvName = getKVName();
    return jsonOk({
      status: 'ok',
      service: 'MojiMask Proxy v3 (KV Storage)',
      kvStore: kvName ? 'connected (binding: ' + kvName + ')' : 'NOT_CONFIGURED — add a KV Namespace binding in Worker Settings',
      corsMode: ALLOWED_ORIGINS.length > 0 ? 'whitelist' : 'open (configure ALLOWED_ORIGINS for production)',
      timestamp: new Date().toISOString()
    });
  }

  // Root GET
  if (method === 'GET' && path === '/') {
    var kvName2 = getKVName();
    return jsonOk({
      service: 'MojiMask Proxy v3',
      status: 'running',
      storage: kvName2 ? 'KV connected (' + kvName2 + ')' : 'KV NOT configured',
      routes: ['POST /', 'GET /peek/{key}', 'GET /file/{key}', 'GET /download?url=...', 'GET /health']
    });
  }

  return jsonError('Route not found.', 404);
}
