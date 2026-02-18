/* 
   ==========================================================================
   CONFIG & CONSTANTS
   ==========================================================================
*/

const CONFIG = {
    MAX_IMAGE_DIMENSION: 1200, // Balanced for higher quality
    MAX_IMAGE_SIZE: 0.5 * 1024 * 1024, // Image itself limited to 500KB
    MAX_ENCRYPTED_SIZE: 1.0 * 1024 * 1024, // Final blob target ~1MB
    JPEG_QUALITY: 1.0, // Maximum quality start
    UPLOAD_ENDPOINT: 'https://file.io/',
    UPLOAD_ENDPOINT_B: 'https://tmpfiles.org/api/v1/upload',
    UPLOAD_ENDPOINT_C: 'https://transfer.sh/',
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
        btnToggleDecryptPass: document.getElementById('btn-toggle-decrypt-password')
    };

    // Verify critical elements
    const missing = Object.entries(UI).filter(([key, val]) => !val).map(([key]) => key);
    if (missing.length > 0) {
        console.error("Critical UI elements missing:", missing);
    }

    // Verify Encryption Engine
    if (typeof CryptoJS === 'undefined') {
        console.error("CryptoJS NOT LOADED. Encryption will fail.");
        notify("CRITICAL: Encryption engine failed to load. Retrying...", "error");
        
        // Attempt to dynamically reload the script if it failed
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js";
        script.onload = () => notify("Encryption engine restored.", "success");
        document.head.appendChild(script);
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
function keyToEmojis(key, providerIndex = 0) {
    const signals = ['🛡️', '🛰️', '🛸'];
    const encoder = new TextEncoder();
    const bytes = encoder.encode(key);
    
    const emojis = Array.from(bytes)
        .map(byte => CONFIG.EMOJI_MAP[byte] || '❓')
        .join('');
        
    return signals[providerIndex] + emojis;
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

    const signal = emojis.shift();
    let provider = 0;
    if (signal === '🛰️') provider = 1;
    if (signal === '🛸') provider = 2;

    const bytes = emojis
        .map(emoji => EMOJI_TO_INDEX.get(emoji))
        .filter(index => index !== undefined);

    const decoder = new TextDecoder();
    const key = decoder.decode(new Uint8Array(bytes));

    return { key, provider };
}

/**
 * Robust fetcher with retry logic and timeout (Wormhole Strategy)
 */
async function robustFetch(url, options = {}, retries = 2, timeout = CONFIG.FETCH_TIMEOUT) {
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { 
                ...options, 
                signal: controller.signal 
            });
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
async function uploadData(encryptedBase64) {
    const blob = new Blob([encryptedBase64], { type: 'text/plain' });
    
    // ROUTE 0: Primary (file.io)
    try {
        console.log("Attempting Primary Route (file.io) - Direct...");
        const primaryData = new FormData();
        primaryData.append('file', blob, 'intel.enc');
        primaryData.append('maxDownloads', '1');
        primaryData.append('autoDelete', 'true');

        const response = await robustFetch(CONFIG.UPLOAD_ENDPOINT, { 
            method: 'POST', 
            body: primaryData 
        }, 1, 6000); // Faster failure for first attempt

        const res = await response.json();
        if (res.success) return keyToEmojis(res.key, 0);
    } catch (e) { 
        console.warn("Direct Primary Route Failed. Attempting Relay Backup..."); 
        try {
            // Bridge Attempt for Case 0
            const bridge = CONFIG.CORS_BRIDGES[0]; // Try the primary bridge
            const bridgedUrl = `${bridge}${encodeURIComponent(CONFIG.UPLOAD_ENDPOINT)}`;
            const primaryData = new FormData();
            primaryData.append('file', blob, 'intel.enc');
            primaryData.append('maxDownloads', '1');
            primaryData.append('autoDelete', 'true');
            
            const response = await robustFetch(bridgedUrl, { 
                method: 'POST', 
                body: primaryData 
            }, 0, 8000);
            
            const res = await response.json();
            if (res.success) return keyToEmojis(res.key, 0);
        } catch (bridgeErr) {
            console.warn("Primary Relay Backup also failed. Engaging Alternative Providers..."); 
        }
    }

    // ROUTE 1: Fallback (transfer.sh)
    try {
        console.log("Attempting Fallback Route 1 (transfer.sh)...");
        const responseB = await robustFetch(`${CONFIG.UPLOAD_ENDPOINT_C}intel.enc`, { 
            method: 'PUT',
            body: blob 
        });
        const url = await responseB.text();
        const parts = url.trim().split('/');
        const id = parts[parts.length - 2]; 
        return keyToEmojis(id, 1);
    } catch (e) { console.warn("Fallback Route 1 Failed."); }

    // ROUTE 2: Deep Fallback (tmpfiles.org)
    try {
        console.log("Attempting Deep Fallback (tmpfiles.org)...");
        const fallBackData = new FormData();
        fallBackData.append('file', blob, 'intel.enc');
        
        const responseC = await robustFetch(CONFIG.UPLOAD_ENDPOINT_B, { 
            method: 'POST', 
            body: fallBackData 
        });
        const resC = await responseC.json();
        const id = resC.data.url.split('/').slice(-2, -1)[0]; 
        return keyToEmojis(id, 2);
    } catch (e) { console.warn("Deep Fallback Failed."); }

    throw new Error("ALL DATA ROUTES BLOCKED. This usually happens due to extreme AdBlock settings or size limits.");
}


/**
 * Retrieves encrypted data from cloud provider with CORS-bridge-healing.
 * @param {object} keyData - { key: string, provider: number }
 * @returns {Promise<string>} - The encrypted hex string.
 */
async function downloadData(keyData) {
    const { key, provider } = keyData;
    let url = `https://file.io/${key}`;
    
    if (provider === 1) url = `${CONFIG.UPLOAD_ENDPOINT_C}${key}/intel.enc`;
    if (provider === 2) url = `https://tmpfiles.org/dl/${key}/intel.enc`;

    console.log(`Clearing Path for Decryption: ${url}`);
    
    // 1. Attempt Direct Fetch with short timeout first
    try {
        showLoading("Connecting to Vault...");
        const response = await robustFetch(url, {}, 0, 4000); 
        return await response.text();
    } catch (error) {
        if (error.message.includes("self-destructed")) throw error;
        console.warn("Direct path blocked. Initializing MojiMask Bridge Relay...");
    }

    // 2. Bridge Relay: Try multiple CORS bridges
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

    throw new Error(lastError ? `All decryption routes failed. Check your connection or the key.` : "Connection to intelligence servers failed.");
}



/**
 * Encrypts data using AES-256-CBC with PBKDF2 key derivation.
 * @param {string} data - The data to encrypt.
 * @param {string} password - The encryption password.
 * @returns {string} - Combined Hex string (Salt + IV + Ciphertext).
 */
function encryptData(data, password) {
    const salt = CryptoJS.lib.WordArray.random(128 / 8);
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    
    // Step 5: Derive key using PBKDF2 (5,000 iterations for performance)
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 5000
    });

    // Step 5: Encrypt Base64 string
    const encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: iv,
        padding: CryptoJS.pad.Pkcs7,
        mode: CryptoJS.mode.CBC
    });

    // Step 5: Output: Salt + IV + Ciphertext as a Base64 string
    // Better than Hex as it reduces data size by ~33%
    const combined = salt.clone().concat(iv).concat(encrypted.ciphertext);
    return combined.toString(CryptoJS.enc.Base64);
}

/**
 * Decrypts data using AES-256-CBC with PBKDF2 key derivation.
 * @param {string} combinedBase64 - Combined Base64 string (Salt + IV + Ciphertext).
 * @param {string} password - The decryption password.
 * @returns {string} - Decrypted Base64 string (Image Data).
 */
function decryptData(combinedBase64, password) {
    const combined = CryptoJS.enc.Base64.parse(combinedBase64);
    
    // Step 10: Split (Salt: 128 bit, IV: 128 bit)
    // WordArray words are 32-bit (4 bytes) each. 128 bit = 4 words.
    const salt = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4));
    const iv = CryptoJS.lib.WordArray.create(combined.words.slice(4, 8));
    const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(8));

    // Step 10: Derive key using PBKDF2 (5,000 iterations)
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 5000
    });

    // Step 10: Decrypt
    const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext },
        key,
        {
            iv: iv,
            padding: CryptoJS.pad.Pkcs7,
            mode: CryptoJS.mode.CBC
        }
    );

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) {
        throw new Error("Decryption failed. Incorrect password or corrupted data.");
    }
    return result;
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
                let width = img.width;
                let height = img.height;

                // Resize to max dimensions
                if (width > height) {
                    if (width > CONFIG.MAX_IMAGE_DIMENSION) {
                        height *= CONFIG.MAX_IMAGE_DIMENSION / width;
                        width = CONFIG.MAX_IMAGE_DIMENSION;
                    }
                } else {
                    if (height > CONFIG.MAX_IMAGE_DIMENSION) {
                        width *= CONFIG.MAX_IMAGE_DIMENSION / height;
                        height = CONFIG.MAX_IMAGE_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Optimized Binary Search for maximum quality under 500KB
                let low = 0.1;
                let high = 1.0;
                let quality = 0.95;
                let base64 = canvas.toDataURL('image/jpeg', quality);
                
                // If initial quality is already okay, skip loop
                if (base64.length * 0.75 > CONFIG.MAX_IMAGE_SIZE) {
                    // Only run binary search if needed (max 5 iterations for precision)
                    for (let i = 0; i < 5; i++) {
                        quality = (low + high) / 2;
                        base64 = canvas.toDataURL('image/jpeg', quality);
                        if (base64.length * 0.75 > CONFIG.MAX_IMAGE_SIZE) {
                            high = quality;
                        } else {
                            low = quality;
                        }
                    }
                    // Final pass at the 'low' value to ensure we are under the limit
                    quality = low;
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }
                
                console.log(`Optimization complete: Quality=${quality.toFixed(2)}, Image Size=${(base64.length * 0.75 / 1024).toFixed(2)}KB`);
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
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '✨'}</span>
        <span class="toast-msg">${message}</span>
    `;
    
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
    
    if (typeof CryptoJS === 'undefined') {
        notify("Encryption engine unavailable. Please refresh or check connection.", "error");
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
        state.encryptedBase64 = encryptData(state.processedBase64, password);
        
        showLoading("Processing...");
        // Step 6 & 7: Ephemeral Upload + Encoding Combined
        state.emojiKey = await uploadData(state.encryptedBase64);
        
        // Display Result
        UI.emojiKeyDisplay.textContent = state.emojiKey;
        UI.senderOutput.classList.remove('hidden');
        
        hideLoading();
        notify("Encryption completed.", "success");
        
        console.log("Intelligence Phase Complete. Phantom Key:", state.emojiKey);

    } catch (error) {
        console.error("Encryption Phase Error:", error);
        const errorMsg = error.message.includes("timeout") ? "Intelligence upload timed out. Try a smaller image." : error.message;
        notify("Encryption failed: " + errorMsg, "error");
        hideLoading();
    }
}

async function handleDecryption() {
    if (typeof CryptoJS === 'undefined') {
        notify("Decryption engine unavailable. Please refresh or check connection.", "error");
        return;
    }

    const emojiString = UI.emojiInput.value.trim();
    const password = UI.decryptPassword.value;

    if (!emojiString) {
        notify("Phantom Key missing. Please provide the emojis.", "error");
        shake(UI.emojiInput);
        return;
    }

    if (!password) {
        notify("Security clearance required. Please provide the access code.", "error");
        shake(UI.decryptPassword);
        return;
    }

    try {
        showLoading("Decoding Phantom Key...");
        
        // Step 8: Emoji-to-Key Decoding
        const keyData = emojisToKey(emojiString);
        
        if (!keyData.key) {
            throw new Error("Invalid Phantom Key format.");
        }

        showLoading("Fetching Intelligence...");
        
        // Step 9: Intelligence Retrieval
        state.encryptedBase64 = await downloadData(keyData);
        
        // Session Guard: Prevent re-extraction in the same session
        const signature = btoa(state.encryptedBase64.substring(0, 100)); // Sample start of data
        if (state.extractedSignatures.has(signature)) {
            throw new Error("Intelligence has already been extracted and self-destructed.");
        }

        showLoading("Decrypting Intelligence...");
        
        // Step 10: AES Decryption
        state.processedBase64 = decryptData(state.encryptedBase64, password);
        
        // Mark as extracted
        state.extractedSignatures.add(signature);

        // Step 11: Render & Display
        UI.decryptedImage.src = state.processedBase64;
        UI.receiverDisplay.classList.remove('hidden');
        
        hideLoading();
        notify("Intelligence restored successfully.", "success");
        
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
    dropZoneLabel.textContent = 'Upload or Drag Image';
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
        notify("Phantom Key copied to clipboard.", "success");
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

