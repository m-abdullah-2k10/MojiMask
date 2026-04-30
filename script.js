/* 
   ==========================================================================
   CONFIG & CONSTANTS
   ==========================================================================
*/

const CONFIG = {
    MAX_IMAGE_DIMENSION: 4096, // Safety cap to prevent canvas memory crash
    MAX_IMAGE_SIZE: 1.0 * 1024 * 1024, // Image itself limited to 1MB
    MAX_ENCRYPTED_SIZE: 1.5 * 1024 * 1024, // Final blob target ~1.5MB
    JPEG_QUALITY: 1.0, // Maximum quality start
    UPLOAD_ENDPOINT: 'https://file.io/',
    UPLOAD_ENDPOINT_B: 'https://tmpfiles.org/api/v1/upload',
    UPLOAD_ENDPOINT_C: 'https://transfer.sh/',
    UPLOAD_ENDPOINT_D: 'https://0x0.st/',
    EXPIRY: '1w',
    FETCH_TIMEOUT: 12000, // 12s timeout for network operations
    CORS_BRIDGES: [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?url=',
        'https://thingproxy.freeboard.io/fetch/'
    ],
    // 256 Safe, single-character emojis for robust mapping
    EMOJI_MAP: [
        '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','🤨','🧐','🤠','🤡','👿','😈','👹','👺','👻','💀','👽','👾','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','♨️','💢','💥','💫','💦','💨','🕳️','💣','💬','🗨️','🗯️','💭','💤','👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','👲','👳','🧕','👮','👷','💂','🕵️','🤵','👰','👸','🤴','👶','🍼','🧸','🧶'
    ]
};

// Pre-computed Reverse Map for Lookups
const EMOJI_TO_INDEX = new Map();
CONFIG.EMOJI_MAP.forEach((emoji, index) => EMOJI_TO_INDEX.set(emoji, index));

/* 
   ==========================================================================
   WEB CRYPTO API — Helpers & Constants
   ==========================================================================
*/

// Version tag prepended to new AES-GCM encrypted blobs.
// Legacy CryptoJS blobs (AES-CBC) will NOT start with this byte,
// allowing automatic format detection during decryption.
const CRYPTO_VERSION = 0x02;

/**
 * Convert a Uint8Array to a Base64 string (handles arbitrarily large arrays).
 */
function uint8ArrayToBase64(uint8Array) {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
        }
    }
    return btoa(binary);
}

/**
 * Convert a Base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Derive an AES-256 CryptoKey from a password via PBKDF2.
 * @param {string} password
 * @param {Uint8Array} salt - 16-byte random salt.
 * @param {Object} opts - { iterations, hash, alg, usages }
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt, opts = {}) {
    const iterations = opts.iterations || 100000;
    const hash       = opts.hash       || 'SHA-256';
    const alg        = opts.alg        || 'AES-GCM';
    const usages     = opts.usages     || ['encrypt', 'decrypt'];

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash },
        keyMaterial,
        { name: alg, length: 256 },
        false,
        usages
    );
}

/* 
   ==========================================================================
   STATE MANAGEMENT
   ==========================================================================
*/

const state = {
    selectedFile: null,
    processedBase64: null,
    encryptedBase64: null,
    emojiKey: null,
    currentMode: 'encrypt',
    extractedSignatures: new Set() // Session guard for "Burn After Reading"
};

/* 
   ==========================================================================
   DOM ELEMENTS
   ==========================================================================
*/

let UI = {};

/**
 * Initializes DOM element references.
 */
function initUI() {
    UI = {
        // Navigation
        navEncrypt: document.getElementById('nav-encrypt'),
        navDecrypt: document.getElementById('nav-decrypt'),
        senderSection: document.getElementById('sender-section'),
        receiverSection: document.getElementById('receiver-section'),

        // Sender Elements
        imagePicker: document.getElementById('image-picker'),
        dropZone: document.getElementById('drop-zone'),
        dropZoneText: document.getElementById('drop-zone-text'),
        previewOverlay: document.getElementById('image-preview-overlay'),
        previewImg: document.getElementById('preview-img'),
        btnPreviewImage: document.getElementById('btn-preview-image'),
        encryptPassword: document.getElementById('encrypt-password'),
        btnInitiate: document.getElementById('btn-initiate'),
        senderOutput: document.getElementById('sender-output'),
        emojiKeyDisplay: document.getElementById('emoji-key-display'),
        btnCopyEmojis: document.getElementById('btn-copy-emojis'),

        // Receiver Elements
        emojiInput: document.getElementById('emoji-input'),
        decryptPassword: document.getElementById('decrypt-password'),
        btnDecrypt: document.getElementById('btn-decrypt'),
        receiverDisplay: document.getElementById('receiver-display'),
        decryptedImage: document.getElementById('decrypted-image'),
        btnDownload: document.getElementById('btn-download'),

        // Global
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
        notificationContainer: document.getElementById('notification-container'),

        // Clear & Toggle Buttons
        btnClearEncryptPass: document.getElementById('btn-clear-encrypt-password'),
        btnClearEmojiInput: document.getElementById('btn-clear-emoji-input'),
        btnClearDecryptPass: document.getElementById('btn-clear-decrypt-password'),
        btnClearEmojis: document.getElementById('btn-clear-emojis'),
        btnClearRestored: document.getElementById('btn-clear-restored'),
        btnClearImage: document.getElementById('btn-clear-image'),
        btnToggleEncryptPass: document.getElementById('btn-toggle-encrypt-password'),
        btnToggleDecryptPass: document.getElementById('btn-toggle-decrypt-password'),
        maxViews: document.getElementById('max-views'),
        maxViewsPreset: document.getElementById('max-views-preset'),
        maxViewsCustom: document.getElementById('max-views-custom')
    };

    // Verify critical elements
    const missing = Object.entries(UI).filter(([key, val]) => !val).map(([key]) => key);
    if (missing.length > 0) {
        console.error("Critical UI elements missing:", missing);
    }

    // Verify Web Crypto API availability
    if (!crypto || !crypto.subtle) {
        console.error("Web Crypto API not available. Encryption will fail.");
        notify("CRITICAL: Encryption engine unavailable. Use HTTPS or a modern browser.", "error");
    }
}

/* 
   ==========================================================================
   UTILITY FUNCTIONS
   ==========================================================================
*/

/**
 * Maps a string key to emojis by converting characters to bytes.
 * This ensures no 1-to-1 alphabet replacement is visible.
 * @param {string} key - The key from provider.
 * @param {number} providerIndex - 0: Primary, 1: Fallback B, 2: Fallback C
 * @returns {string} - The emoji representation.
 */
function keyToEmojis(key, providerIndex = 0, maxViews = 0) {
    const signals = ['🛡️', '🛰️', '🛸'];
    // Encode maxViews as a number emoji 0️⃣-9️⃣ (0 = unlimited, 1-9 = exact count)
    // We cap display at 9; higher values also stored as 9 but unlimited is 0️⃣
    const viewEmojis = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
    // For values > 9, encode as two digits using a pair of number emojis
    let viewPrefix = '';
    if (maxViews === 0) {
        viewPrefix = '0️⃣'; // unlimited
    } else {
        // Encode each digit
        viewPrefix = String(maxViews).split('').map(d => viewEmojis[parseInt(d)]).join('');
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(key);
    
    const emojis = Array.from(bytes)
        .map(byte => CONFIG.EMOJI_MAP[byte] || '❓')
        .join('');
        
    return signals[providerIndex] + viewPrefix + emojis;
}

/**
 * Maps an emoji string back to its provider signal and alphanumeric key.
 * @param {string} emojiString - The string of emojis.
 * @returns {object} - { key: string, provider: number }
 */
function emojisToKey(emojiString) {
    let emojis;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        emojis = Array.from(segmenter.segment(emojiString)).map(s => s.segment);
    } else {
        emojis = Array.from(emojiString);
    }

    // First emoji: provider signal
    const signal = emojis.shift();
    let provider = 0;
    if (signal === '🛰️') provider = 1;
    if (signal === '🛸') provider = 2;

    // Next emoji(s): view count digits (number emojis 0️⃣-9️⃣)
    const NUMBER_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
    let maxViewsStr = '';
    while (emojis.length > 0 && NUMBER_EMOJIS.includes(emojis[0])) {
        maxViewsStr += NUMBER_EMOJIS.indexOf(emojis.shift());
    }
    const maxViews = maxViewsStr === '' ? 0 : parseInt(maxViewsStr);

    // Remaining emojis: the actual key
    const bytes = emojis
        .map(emoji => EMOJI_TO_INDEX.get(emoji))
        .filter(index => index !== undefined);

    const decoder = new TextDecoder();
    const key = decoder.decode(new Uint8Array(bytes));

    return { key, provider, maxViews };
}

/**
 * Robust fetcher with retry logic and timeout (Wormhole Strategy)
 */
async function robustFetch(url, options = {}, retries = 2, timeout = CONFIG.FETCH_TIMEOUT) {
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const fetchOptions = { ...options, signal: controller.signal };
            if (options.headers && Object.keys(options.headers).length > 0) {
                fetchOptions.headers = options.headers;
            }
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            
            if (response.ok) return response;
            if (response.status === 404) throw new Error("Intelligence expired or self-destructed.");
            throw new Error(`Server returned ${response.status}`);
        } catch (err) {
            clearTimeout(timeoutId);
            const isAbort = err.name === 'AbortError';
            const message = isAbort ? `Timeout after ${timeout}ms` : err.message;
            
            if (i === retries) throw new Error(message);
            
            console.warn(`Fetch attempt ${i + 1} failed (${message}). Retrying...`);
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        }
    }
}
async function uploadData(encryptedBase64, maxViews = 1) {
    const blob = new Blob([encryptedBase64], { type: 'text/plain' });

    // Helper: build the FormData payload for file.io-compatible endpoints
    function buildFileIoFormData() {
        const fd = new FormData();
        fd.append('file', blob, 'intel.enc');
        if (maxViews > 0) {
            fd.append('maxDownloads', maxViews.toString());
            fd.append('autoDelete', 'true');
        } else {
            fd.append('expires', CONFIG.EXPIRY || '1w');
        }
        return fd;
    }

    // ── ROUTE 0-A: Cloudflare Worker (direct POST, worker forwards to file.io internally) ──
    // The worker already knows the target; do NOT append the file.io URL to its path.
    const CF_WORKER_URL = 'https://fileio-proxy.codegenious-2k10.workers.dev/';
    try {
        console.log(`[Cloudflare Worker] Uploading via primary proxy (${maxViews} views)...`);
        const cfResponse = await robustFetch(CF_WORKER_URL, {
            method: 'POST',
            body: buildFileIoFormData()
        }, 1, 12000);

        let cfRes;
        try { cfRes = await cfResponse.json(); } catch (_) { cfRes = null; }

        if (cfRes && cfRes.success && cfRes.key) {
            console.log('✅ Upload succeeded via Cloudflare Worker.');
            return keyToEmojis(cfRes.key, 0, parseInt(maxViews));
        }
        console.warn('[Cloudflare Worker] Returned success=false or bad JSON. Trying CORS bridges...');
    } catch (err) {
        console.warn(`[Cloudflare Worker] Failed: ${err.message}. Trying CORS bridges...`);
    }

    // ── ROUTE 0-B: Public CORS bridges → file.io ──────────────────────────────────────────
    // These bridges act as server-side relay: they accept a target URL and forward the
    // request, so CORS is not an issue. The file.io URL is passed as a query param.
    let bridgeAttempt = 0;
    for (const bridge of CONFIG.CORS_BRIDGES) {
        bridgeAttempt++;
        try {
            const proxiedUrl = `${bridge}${encodeURIComponent(CONFIG.UPLOAD_ENDPOINT)}`;
            console.log(`[CORS Bridge ${bridgeAttempt}/${CONFIG.CORS_BRIDGES.length}] Trying: ${bridge}`);

            const response = await robustFetch(proxiedUrl, {
                method: 'POST',
                body: buildFileIoFormData()
            }, 0, 8000);

            let res;
            try { res = await response.json(); } catch (_) {
                console.warn(`[CORS Bridge ${bridgeAttempt}] Non-JSON response. Trying next...`);
                continue;
            }

            if (res && res.success && res.key) {
                console.log(`✅ Upload succeeded via CORS Bridge ${bridgeAttempt}.`);
                return keyToEmojis(res.key, 0, parseInt(maxViews));
            }
            console.warn(`[CORS Bridge ${bridgeAttempt}] success=false or missing key. Trying next...`);
        } catch (err) {
            console.warn(`[CORS Bridge ${bridgeAttempt}] Failed: ${err.message}.${bridgeAttempt < CONFIG.CORS_BRIDGES.length ? ' Trying next...' : ' All bridges exhausted.'}`);
        }
    }
    console.warn('All file.io routes failed. Engaging alternative providers...');

    // ── ROUTE 1: Fallback A (transfer.sh) ──────────────────────────────────────────────────
    try {
        console.log('Attempting Fallback Route 1 (transfer.sh)...');
        const headers = { 'Max-Days': '7' };
        if (maxViews > 0) headers['Max-Downloads'] = maxViews.toString();

        const responseB = await robustFetch(`${CONFIG.UPLOAD_ENDPOINT_C}intel.enc`, {
            method: 'PUT',
            body: blob,
            headers: headers
        }, 1, 8000);
        const url = await responseB.text();
        const parts = url.trim().split('/');
        const id = parts[parts.length - 2];
        if (id) return keyToEmojis(id, 1, parseInt(maxViews));
    } catch (e) { console.warn('Fallback Route 1 (transfer.sh) Failed:', e.message); }

    // ── ROUTE 2: Fallback B (0x0.st) ───────────────────────────────────────────────────────
    // No server-side download limit; view enforcement falls back to client-side localStorage.
    try {
        console.log('Attempting Fallback Route 2 (0x0.st)...');
        const zeroXData = new FormData();
        zeroXData.append('file', blob, 'intel.enc');
        zeroXData.append('secret', '');

        const responseD = await robustFetch(CONFIG.UPLOAD_ENDPOINT_D, {
            method: 'POST',
            body: zeroXData
        }, 1, 10000);
        const urlD = await responseD.text();
        const trimmedUrl = urlD.trim();
        if (trimmedUrl.startsWith('http')) {
            const key0x0 = encodeURIComponent(trimmedUrl);
            if (maxViews > 0) {
                notify(`⚠️ Primary providers unreachable. Upload succeeded via fallback. View limit (${maxViews}) is enforced locally on this device.`, 'info');
            }
            return keyToEmojis(key0x0, 3, parseInt(maxViews));
        }
    } catch (e) { console.warn('Fallback Route 2 (0x0.st) Failed:', e.message); }

    // ── ROUTE 3: Deep Fallback (tmpfiles.org) ──────────────────────────────────────────────
    try {
        console.log('Attempting Deep Fallback (tmpfiles.org)...');
        const fallBackData = new FormData();
        fallBackData.append('file', blob, 'intel.enc');

        const responseC = await robustFetch(CONFIG.UPLOAD_ENDPOINT_B, {
            method: 'POST',
            body: fallBackData
        }, 1, 10000);
        const resC = await responseC.json();
        const id = resC.data.url.split('/').slice(-2, -1)[0];
        if (id) {
            if (maxViews > 0) {
                notify(`⚠️ Primary providers unreachable. Upload succeeded via fallback. View limit (${maxViews}) is enforced locally on this device.`, 'info');
            }
            return keyToEmojis(id, 2, parseInt(maxViews));
        }
    } catch (e) { console.warn('Deep Fallback (tmpfiles.org) Failed:', e.message); }

    throw new Error('ALL DATA ROUTES BLOCKED. Check your network/AdBlock settings and try again.');
}


/**
 * Retrieves encrypted data from cloud provider with CORS-bridge-healing.
 *
 * Download strategy depends on whether the key has a view limit:
 *
 * LIMITED KEYS (file.io / transfer.sh with maxDownloads set):
 *   A direct browser GET is CORS-blocked, but the server STILL processes
 *   the request and counts it against maxDownloads — wasting a view slot.
 *   We skip the direct attempt entirely and go straight to a CORS bridge,
 *   which performs a clean server-to-server request (one slot, one view).
 *
 * UNLIMITED KEYS / tmpfiles.org:
 *   No download counter at risk. Try direct first (fastest), then bridges.
 *
 * @param {object} keyData - { key: string, provider: number, maxViews: number }
 * @returns {Promise<string>} - The encrypted Base64 string.
 */
async function downloadData(keyData) {
    const { key, provider, maxViews } = keyData;
    const CF_WORKER_BASE = 'https://fileio-proxy.codegenious-2k10.workers.dev';

    // ── Provider 0: Our Cloudflare Worker KV Storage ─────────────────────────
    // Data is stored directly in our Worker's KV. No CORS bridge needed.
    if (provider === 0) {
        try {
            showLoading("Connecting to Secure Vault...");
            const url = `${CF_WORKER_BASE}/file/${key}`;
            const response = await robustFetch(url, {}, 1, 12000);
            console.log('✅ Download succeeded via Cloudflare Worker KV.');
            return await response.text();
        } catch (error) {
            console.warn(`[Worker KV Download] Failed: ${error.message}`);
            throw new Error(
                error.message.includes("not found") || error.message.includes("404")
                    ? "Intelligence expired or self-destructed."
                    : `Download failed: ${error.message}`
            );
        }
    }

    // ── Providers 1-3: External services (transfer.sh, tmpfiles, 0x0.st) ────
    let url;
    if (provider === 1) url = `${CONFIG.UPLOAD_ENDPOINT_C}${key}/intel.enc`;
    else if (provider === 2) url = `https://tmpfiles.org/dl/${key}/intel.enc`;
    else if (provider === 3) url = decodeURIComponent(key); // 0x0.st: key is full encoded URL
    else url = `https://file.io/${key}`; // Legacy fallback

    // Cache-buster so proxies don't serve a stale cached copy
    url += `?cb=${Date.now()}`;

    console.log(`Vault path: ${url}`);

    // Determine whether this provider tracks server-side download counts.
    const hasDownloadQuota = (provider === 1) && maxViews > 0;

    if (!hasDownloadQuota) {
        // Safe to attempt direct (no quota to waste), fall back to bridges.
        try {
            showLoading("Connecting to Vault...");
            const response = await robustFetch(url, {}, 0, 4000);
            return await response.text();
        } catch (error) {
            if (error.message.includes("self-destructed")) throw error;
            console.warn("Direct path blocked. Initializing Bridge Relay...");
        }
    } else {
        console.log(`Limited key (${maxViews} max views) — routing through relay.`);
        showLoading("Opening Secure Relay...");
    }

    // ── Bridge Relay: Cloudflare Worker proxy ────────────────────────────────
    const CF_DOWNLOAD_URL = `${CF_WORKER_BASE}/download`;
    try {
        showLoading("Connecting via Secure Relay...");
        const workerUrl = `${CF_DOWNLOAD_URL}?url=${encodeURIComponent(url)}`;
        const workerResponse = await robustFetch(workerUrl, {}, 0, 12000);
        console.log('✅ Download succeeded via Cloudflare Worker relay.');
        return await workerResponse.text();
    } catch (e) {
        console.warn(`[Worker Download Proxy] Failed: ${e.message}. Trying public bridges...`);
    }

    // ── Bridge Relay: Public CORS Bridges (last resort) ─────────────────────
    let lastError = null;
    let bridgeCount = 1;
    for (const bridge of CONFIG.CORS_BRIDGES) {
        try {
            showLoading("Processing...");
            const bridgeUrl = `${bridge}${encodeURIComponent(url)}`;
            const bridgeResponse = await robustFetch(bridgeUrl, {}, 0, 8000);
            return await bridgeResponse.text();
        } catch (e) {
            console.warn(`Bridge ${bridgeCount} failed: ${e.message}`);
            lastError = e;
            bridgeCount++;
            continue;
        }
    }

    throw new Error(lastError
        ? `All decryption routes failed. Check your connection or verify the key is still valid.`
        : "Connection to intelligence servers failed."
    );
}



/**
 * Encrypts data using AES-256-GCM with PBKDF2 key derivation (Web Crypto API).
 * AES-GCM provides built-in authentication (HMAC), preventing padding-oracle
 * and bit-flipping attacks that plague unauthenticated AES-CBC.
 *
 * Output format: [version(1)] + [salt(16)] + [iv(12)] + [ciphertext + 16-byte auth tag]
 * Encoded as Base64.
 *
 * @param {string} data - The plaintext to encrypt.
 * @param {string} password - The encryption password.
 * @returns {Promise<string>} - Base64-encoded encrypted blob.
 */
async function encryptData(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV is optimal for GCM

    const key = await deriveKey(password, salt, {
        iterations: 100000,
        hash: 'SHA-256',
        alg: 'AES-GCM',
        usages: ['encrypt']
    });

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(data)
    );

    // Assemble: version(1) + salt(16) + iv(12) + ciphertext+tag
    const ctBytes  = new Uint8Array(ciphertext);
    const combined = new Uint8Array(1 + 16 + 12 + ctBytes.length);
    combined[0] = CRYPTO_VERSION;
    combined.set(salt, 1);
    combined.set(iv, 17);
    combined.set(ctBytes, 29);

    return uint8ArrayToBase64(combined);
}

/**
 * Decrypts data — auto-detects format (new AES-GCM vs legacy CryptoJS AES-CBC).
 * @param {string} combinedBase64 - Base64-encoded encrypted blob.
 * @param {string} password - The decryption password.
 * @returns {Promise<string>} - Decrypted plaintext.
 */
async function decryptData(combinedBase64, password) {
    const combined = base64ToUint8Array(combinedBase64);

    if (combined[0] === CRYPTO_VERSION) {
        return decryptGCM(combined, password);
    }
    // Legacy: CryptoJS AES-256-CBC format (Salt16 + IV16 + Ciphertext)
    return decryptLegacyCBC(combined, password);
}

/**
 * Decrypts new-format AES-256-GCM blobs.
 */
async function decryptGCM(combined, password) {
    const salt       = combined.slice(1, 17);
    const iv         = combined.slice(17, 29);
    const ciphertext = combined.slice(29);

    const key = await deriveKey(password, salt, {
        iterations: 100000,
        hash: 'SHA-256',
        alg: 'AES-GCM',
        usages: ['decrypt']
    });

    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    } catch (_) {
        throw new Error("Decryption failed. Incorrect password or corrupted data.");
    }
}

/**
 * Decrypts legacy CryptoJS AES-256-CBC blobs for backward compatibility.
 * CryptoJS 4.x default: PBKDF2 with SHA-256, 5000 iterations (as set in old code).
 */
async function decryptLegacyCBC(combined, password) {
    const salt       = combined.slice(0, 16);
    const iv         = combined.slice(16, 32);
    const ciphertext = combined.slice(32);

    const key = await deriveKey(password, salt, {
        iterations: 5000,
        hash: 'SHA-256',
        alg: 'AES-CBC',
        usages: ['decrypt']
    });

    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv },
            key,
            ciphertext
        );
        const result = new TextDecoder().decode(decrypted);
        if (!result) {
            throw new Error("Empty result");
        }
        return result;
    } catch (_) {
        throw new Error("Decryption failed. Incorrect password or corrupted data.");
    }
}

/**
 * Resizes an image and converts it to a optimized Base64 JPEG string.
 * @param {File} file - The image file to process.
 * @returns {Promise<string>} - Base64 encoded JPEG.
 */
async function processImage(file) {
    const isLarge = file.size > CONFIG.MAX_IMAGE_SIZE;
    
    if (!isLarge) {
        console.log(`Intelligence within limits (${(file.size / 1024).toFixed(2)}KB). Using original capture.`);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    console.log(`Optimizing Large Intelligence Payload (${(file.size / 1024).toFixed(2)}KB)...`);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;

                // Initial safety cap to prevent browser canvas crash on extreme images
                const maxSafeDim = CONFIG.MAX_IMAGE_DIMENSION;
                if (Math.max(w, h) > maxSafeDim) {
                    const ratio = maxSafeDim / Math.max(w, h);
                    w = Math.floor(w * ratio);
                    h = Math.floor(h * ratio);
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                let quality = 0.95;
                let base64 = canvas.toDataURL('image/jpeg', quality);
                
                // First optimization pass: Binary Search on JPEG Quality (Minimum 0.6)
                if (base64.length * 0.75 > CONFIG.MAX_IMAGE_SIZE) {
                    let lowQ = 0.6;
                    let highQ = 0.95;
                    for (let i = 0; i < 5; i++) {
                        let midQ = (lowQ + highQ) / 2;
                        let testBase64 = canvas.toDataURL('image/jpeg', midQ);
                        if (testBase64.length * 0.75 > CONFIG.MAX_IMAGE_SIZE) {
                            highQ = midQ;
                        } else {
                            lowQ = midQ;
                            base64 = testBase64;
                        }
                    }
                    quality = lowQ;
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }
                
                // Second optimization pass: Iterative Dimension Reduction if still too large
                while (base64.length * 0.75 > CONFIG.MAX_IMAGE_SIZE && w > 500) {
                    w = Math.floor(w * 0.85); // Reduce resolution by 15%
                    h = Math.floor(h * 0.85);
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }

                console.log(`Optimization complete: Quality=${quality.toFixed(2)}, Dimensions=${w}x${h}, Image Size=${(base64.length * 0.75 / 1024).toFixed(2)}KB`);
                resolve(base64);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showLoading(text) {
    UI.loadingText.textContent = text;
    UI.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    UI.loadingOverlay.classList.add('hidden');
}

/**
 * Modern notification system to replace alerts (Step 12 UX)
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', or 'info'.
 */
function notify(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Choose icon based on type
    const icons = {
        success: '✅',
        error: '🚨',
        info: 'ℹ️'
    };
    
    // Use textContent (not innerHTML) to prevent XSS
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || '✨';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    
    UI.notificationContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Visual feedback for validation errors (Step 12 UX)
 * @param {HTMLElement} element - The element to shake.
 */
function shake(element) {
    if (!element) return;
    element.classList.add('shake', 'invalid');
    setTimeout(() => {
        element.classList.remove('shake');
        // Keep 'invalid' until they type again
    }, 400);
}

// Clear invalid state and toggle clear buttons on input
document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') {
        e.target.classList.remove('invalid');
        
        // Handle clear button visibility
        if (e.target === UI.encryptPassword) toggleClearButton(UI.encryptPassword, UI.btnClearEncryptPass);
        if (e.target === UI.emojiInput) toggleClearButton(UI.emojiInput, UI.btnClearEmojiInput);
        if (e.target === UI.decryptPassword) toggleClearButton(UI.decryptPassword, UI.btnClearDecryptPass);
    }
});

/**
 * Toggles the visibility of a clear button based on input value.
 * @param {HTMLInputElement} input 
 * @param {HTMLElement} btn 
 */
function toggleClearButton(input, btn) {
    if (!input || !btn) return;
    if (input.value.length > 0) {
        btn.classList.add('visible');
    } else {
        btn.classList.remove('visible');
    }
}

/**
 * Toggles the visibility of a password input.
 * @param {HTMLInputElement} input 
 * @param {HTMLElement} btn 
 */
function togglePasswordVisibility(input, btn) {
    if (!input || !btn) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.textContent = isPassword ? '🙈' : '👁️';
    btn.classList.toggle('active', isPassword);
    
    // Maintain focus
    input.focus();
}

/* 
   ==========================================================================
   CORE LOGIC & EVENT HANDLERS
   ==========================================================================
*/

function switchMode(mode) {
    state.currentMode = mode;
    if (mode === 'encrypt') {
        UI.navEncrypt.classList.add('active');
        UI.navDecrypt.classList.remove('active');
        UI.senderSection.classList.add('active');
        UI.receiverSection.classList.remove('active');
    } else {
        UI.navDecrypt.classList.add('active');
        UI.navEncrypt.classList.remove('active');
        UI.receiverSection.classList.add('active');
        UI.senderSection.classList.remove('active');
    }
}

async function handleEncryption() {
    console.log("Encryption initiated...");
    
    if (!crypto || !crypto.subtle) {
        notify("Encryption engine unavailable. Use HTTPS or a modern browser.", "error");
        return;
    }

    const password = UI.encryptPassword?.value;
    
    if (!state.selectedFile) {
        notify("Intelligence data missing. Please capture an image.", "error");
        shake(UI.dropZone);
        return;
    }
    
    if (!password) {
        notify("Security clearance required. Please define an access code.", "error");
        shake(UI.encryptPassword);
        return;
    }

    try {
        showLoading("Processing Intelligence...");
        // Small delay to allow BIOS/UI to update
        await new Promise(r => setTimeout(r, 100));

        // Step 4: Image Processing
        state.processedBase64 = await processImage(state.selectedFile);
        
        showLoading("Locking Intelligence...");
        // Step 5: AES-256 Encryption
        state.encryptedBase64 = await encryptData(state.processedBase64, password);
        
        showLoading("Processing...");
        // Step 6 & 7: Ephemeral Upload + Encoding Combined
        const maxViews = parseInt(UI.maxViews?.value) || 1;
        state.emojiKey = await uploadData(state.encryptedBase64, maxViews);
        
        // Display Result
        UI.emojiKeyDisplay.textContent = state.emojiKey;
        UI.senderOutput.classList.remove('hidden');

        // Dynamically update the status message to reflect the actual view limit chosen
        const statusMsg = UI.senderOutput.querySelector('.status-msg');
        if (statusMsg) {
            if (maxViews === 0) {
                statusMsg.textContent = '⚠️ Unlimited views — expires after 7 days.';
            } else {
                statusMsg.textContent = `⚠️ Self-destructs after ${maxViews} view${maxViews > 1 ? 's' : ''}.`;
            }
        }

        hideLoading();
        notify("Encryption completed.", "success");
        
        console.log("Intelligence Phase Complete.");

    } catch (error) {
        console.error("Encryption Phase Error:", error);
        const errorMsg = error.message.includes("timeout") ? "Intelligence upload timed out. Try a smaller image." : error.message;
        notify("Encryption failed: " + errorMsg, "error");
        hideLoading();
    }
}

async function handleDecryption() {
    if (!crypto || !crypto.subtle) {
        notify("Decryption engine unavailable. Use HTTPS or a modern browser.", "error");
        return;
    }

    const emojiString = UI.emojiInput.value.trim();
    const password = UI.decryptPassword.value;

    if (!emojiString) {
        notify("Emoji Key missing. Please provide the emojis.", "error");
        shake(UI.emojiInput);
        return;
    }

    if (!password) {
        notify("Security clearance required. Please provide the access code.", "error");
        shake(UI.decryptPassword);
        return;
    }

    try {
        showLoading("Decoding Emoji Key...");
        
        // Step 8: Emoji-to-Key Decoding
        const keyData = emojisToKey(emojiString);
        
        if (!keyData.key) {
            throw new Error("Invalid Emoji Key format.");
        }

        // ── View-Count Enforcement ──────────────────────────────────────────
        // The max-view limit is encoded in the emoji key itself (client-side).
        // We store a counter in localStorage keyed by the file key.
        const storageKey = `mojimask_views_${keyData.key}`;
        const maxViews = keyData.maxViews; // 0 = unlimited

        if (maxViews > 0) {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const usedViews = stored.count || 0;

            if (usedViews >= maxViews) {
                throw new Error(`Access denied. This intelligence has been viewed ${maxViews} time(s) and has self-destructed.`);
            }
            
            const remaining = maxViews - usedViews - 1;
            console.log(`View ${usedViews + 1} of ${maxViews}. ${remaining} remaining after this.`);
        }
        // ────────────────────────────────────────────────────────────────────

        // ── STEP 1: PEEK — fetch encrypted data WITHOUT consuming a view ──────
        // For provider 0 (Cloudflare KV) we call the read-only /peek/ endpoint.
        // This returns the encrypted payload but does NOT decrement the download
        // counter or trigger auto-delete — so a wrong password costs nothing.
        // For providers 1-3 (external services), a plain GET doesn't decrement
        // their server-side quota, so we download freely and only count locally
        // after a confirmed successful decryption.
        const CF_WORKER_BASE = 'https://fileio-proxy.codegenious-2k10.workers.dev';
        let encryptedPayload;

        if (keyData.provider === 0) {
            showLoading("Fetching Intelligence...");
            try {
                const peekUrl = `${CF_WORKER_BASE}/peek/${keyData.key}`;
                const peekResponse = await robustFetch(peekUrl, {}, 1, 12000);
                encryptedPayload = await peekResponse.text();
                console.log('✅ Peek succeeded (view not yet consumed).');
            } catch (peekError) {
                throw new Error(
                    peekError.message.includes("not found") || peekError.message.includes("404")
                        ? "Intelligence expired or self-destructed."
                        : `Download failed: ${peekError.message}`
                );
            }
        } else {
            encryptedPayload = await downloadData(keyData);
        }

        // ── STEP 2: Verify password BEFORE consuming the view ────────────────
        // decryptData() throws "Decryption failed. Incorrect password..." on a
        // bad password — so a wrong attempt never reaches Step 3.
        showLoading("Decrypting...");
        state.processedBase64 = await decryptData(encryptedPayload, password);

        // ── STEP 3: Password correct — NOW officially consume the view ────────
        if (keyData.provider === 0) {
            showLoading("Confirming Access...");
            try {
                const consumeResponse = await robustFetch(
                    `${CF_WORKER_BASE}/file/${keyData.key}`, {}, 1, 12000
                );
                await consumeResponse.text(); // response body not needed
                console.log('✅ View consumed via /file/ endpoint.');
            } catch (consumeError) {
                // Non-fatal: image already decrypted; log and continue.
                console.warn(`[Consume] Failed to register view: ${consumeError.message}`);
            }
        }

        // ── STEP 4: Render & Display ──────────────────────────────────────────
        state.encryptedBase64 = encryptedPayload;
        UI.decryptedImage.src = state.processedBase64;
        UI.receiverDisplay.classList.remove('hidden');
        
        hideLoading();

        // ── Increment local view counter (success only) ───────────────────────
        if (maxViews > 0) {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const newCount = (stored.count || 0) + 1;
            localStorage.setItem(storageKey, JSON.stringify({ count: newCount, max: maxViews }));

            const remaining = maxViews - newCount;
            if (remaining === 0) {
                notify(`Intelligence restored. ⚠️ This was the FINAL view — key is now destroyed.`, "success");
            } else {
                notify(`Intelligence restored. ${remaining} view(s) remaining before self-destruct.`, "success");
            }
        } else {
            notify("Intelligence restored successfully.", "success");
        }
        // ────────────────────────────────────────────────────────────────────
        
        console.log("Intelligence successfully restored.");

    } catch (error) {
        console.error("Decryption Phase Error:", error);
        notify(error.message, "error");
        hideLoading();
    }
}

/**
 * Trigger a download of the decrypted intelligence image.
 */
function downloadIntelligence() {
    if (!state.processedBase64) return;

    const link = document.createElement('a');
    link.href = state.processedBase64;
    link.download = `intelligence_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleFileSelect(e) {
    const file = e.target.files[0] || (e.dataTransfer && e.dataTransfer.files[0]);
    if (file && file.type.startsWith('image/')) {
        state.selectedFile = file;
        
        // Visual feedback for drop zone
        const dropZoneLabel = UI.dropZoneText.querySelector('p');
        dropZoneLabel.textContent = `Captured: ${file.name}`;
        UI.dropZone.style.borderColor = 'var(--primary-color)';
        UI.btnClearImage.classList.add('visible');
        UI.btnPreviewImage.classList.add('visible');

        // Prepare preview source
        const reader = new FileReader();
        reader.onload = (re) => {
            UI.previewImg.src = re.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function togglePreview(e) {
    if (e) e.stopPropagation();
    if (!state.selectedFile) return;

    const isShowing = !UI.previewOverlay.classList.contains('hidden');
    if (isShowing) {
        UI.previewOverlay.classList.add('hidden');
        UI.btnPreviewImage.classList.remove('active');
        UI.btnPreviewImage.textContent = '👁️';
    } else {
        UI.previewOverlay.classList.remove('hidden');
        UI.btnPreviewImage.classList.add('active');
        UI.btnPreviewImage.textContent = '🕶️'; // Change to "masked" eye while viewing
    }
}

function clearImageSelection() {
    state.selectedFile = null;
    UI.imagePicker.value = '';
    const dropZoneLabel = UI.dropZoneText.querySelector('p');
    dropZoneLabel.textContent = 'Upload, Drag, or Paste Image';
    UI.dropZone.style.borderColor = 'var(--border-color)';
    UI.btnClearImage.classList.remove('visible');
    UI.btnPreviewImage.classList.remove('visible');
    UI.btnPreviewImage.classList.remove('active');
    UI.btnPreviewImage.textContent = '👁️';
    UI.previewOverlay.classList.add('hidden');
    UI.previewImg.src = '';
    notify("Intelligence data removed.", "info");
}

/* 
   ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ==========================================================================
*/

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI references
    initUI();

    // 2. Mode Switching
    UI.navEncrypt.addEventListener('click', () => switchMode('encrypt'));
    UI.navDecrypt.addEventListener('click', () => switchMode('decrypt'));

    // 3. File Selection
    UI.imagePicker.addEventListener('change', handleFileSelect);

    // 4. Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        UI.dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    UI.dropZone.addEventListener('drop', (e) => {
        handleFileSelect(e);
    });

    // 4.1 Paste Image
    document.addEventListener('paste', (e) => {
        if (state.currentMode !== 'encrypt') return;
        
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    // Pass a synthetic event object that handleFileSelect expects
                    handleFileSelect({ target: { files: [file] } });
                }
                break;
            }
        }
    });

    // 5. Action Buttons
    UI.btnInitiate.addEventListener('click', handleEncryption);
    UI.btnDecrypt.addEventListener('click', handleDecryption);
    UI.btnDownload.addEventListener('click', downloadIntelligence);

    // 5.1 Clear Buttons
    UI.btnClearEncryptPass.addEventListener('click', () => {
        UI.encryptPassword.value = '';
        toggleClearButton(UI.encryptPassword, UI.btnClearEncryptPass);
        UI.encryptPassword.focus();
    });

    UI.btnClearEmojiInput.addEventListener('click', () => {
        UI.emojiInput.value = '';
        toggleClearButton(UI.emojiInput, UI.btnClearEmojiInput);
        UI.emojiInput.focus();
    });

    UI.btnClearDecryptPass.addEventListener('click', () => {
        UI.decryptPassword.value = '';
        toggleClearButton(UI.decryptPassword, UI.btnClearDecryptPass);
        UI.decryptPassword.focus();
    });

    // 5.2 Toggle Password Buttons
    UI.btnToggleEncryptPass.addEventListener('click', () => {
        togglePasswordVisibility(UI.encryptPassword, UI.btnToggleEncryptPass);
    });

    UI.btnToggleDecryptPass.addEventListener('click', () => {
        togglePasswordVisibility(UI.decryptPassword, UI.btnToggleDecryptPass);
    });

    // 5.3 Max Views Hybrid Logic
    if (UI.maxViewsPreset && UI.maxViewsCustom) {
        UI.maxViewsPreset.addEventListener('change', () => {
            const val = UI.maxViewsPreset.value;
            if (val === 'custom') {
                UI.maxViewsCustom.classList.remove('hidden');
                UI.maxViewsCustom.focus();
                UI.maxViews.value = UI.maxViewsCustom.value || 1;
            } else {
                UI.maxViewsCustom.classList.add('hidden');
                UI.maxViews.value = val;
                
                const label = UI.maxViewsPreset.options[UI.maxViewsPreset.selectedIndex].text;
                notify(`Self-destruct set to ${label}`, "info");
            }
        });

        UI.maxViewsCustom.addEventListener('input', () => {
            let val = parseInt(UI.maxViewsCustom.value);
            
            // Fallback to 1 if invalid
            if (isNaN(val) || val < 1) val = 1;
            
            if (val > 1000) {
                val = 1000;
                UI.maxViewsCustom.value = 1000;
                notify("View limit cannot be set more than 1000", "info");
            }
            
            UI.maxViews.value = val;
        });
    }

    UI.btnClearEmojis.addEventListener('click', () => {
        state.emojiKey = null;
        UI.emojiKeyDisplay.textContent = '';
        UI.senderOutput.classList.add('hidden');
        notify("Encryption result cleared.", "info");
    });

    UI.btnClearImage.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid triggering file picker
        clearImageSelection();
    });

    UI.btnPreviewImage.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePreview(e);
    });

    UI.previewOverlay.addEventListener('click', (e) => {
        togglePreview(e);
    });

    UI.btnClearRestored.addEventListener('click', () => {
        state.processedBase64 = null;
        UI.decryptedImage.src = '';
        UI.receiverDisplay.classList.add('hidden');
        notify("Decryption result cleared.", "info");
    });

    // 6. Copy to Clipboard
    UI.btnCopyEmojis.addEventListener('click', () => {
        if (!state.emojiKey) return;
        
        const keyToCopy = state.emojiKey;
        
        // Robust copy with fallback
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(keyToCopy).then(() => {
                onCopySuccess();
            }).catch(err => {
                console.error('Clipboard API failed, using fallback:', err);
                fallbackCopy(keyToCopy);
            });
        } else {
            fallbackCopy(keyToCopy);
        }
    });

    function onCopySuccess() {
        notify("Emoji Key copied to clipboard.", "success");
        const originalText = UI.btnCopyEmojis.textContent;
        UI.btnCopyEmojis.textContent = '✅';
        UI.btnCopyEmojis.style.boxShadow = '0 0 15px var(--primary-glow)';
        
        setTimeout(() => {
            UI.btnCopyEmojis.textContent = originalText;
            UI.btnCopyEmojis.style.boxShadow = '';
        }, 2000);
    }

    function fallbackCopy(text) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) onCopySuccess();
            else throw new Error("Fallback copy failed");
        } catch (err) {
            console.error('Fallback copy failed:', err);
            notify('Failed to copy. Please select and copy manually.', 'error');
        }
    }

    // 7. Initial State
    switchMode('encrypt');
    console.log("Intelligence Tool Booted.");
});

