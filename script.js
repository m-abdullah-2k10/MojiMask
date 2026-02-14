/* 
   ==========================================================================
   CONFIG & CONSTANTS
   ==========================================================================
*/

const CONFIG = {
    MAX_IMAGE_DIMENSION: 800,
    JPEG_QUALITY: 0.7,
    UPLOAD_ENDPOINT: 'https://file.io/',
    UPLOAD_ENDPOINT_B: 'https://tmpfiles.org/api/v1/upload',
    UPLOAD_ENDPOINT_C: 'https://transfer.sh/',
    EXPIRY: '1w',
    CORS_BRIDGE: 'https://api.allorigins.win/raw?url=',
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
    encryptedHex: null,
    fileIOKey: null,
    emojiKey: null,
    currentMode: 'encrypt' // 'encrypt' or 'decrypt'
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
        notificationContainer: document.getElementById('notification-container')
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
 * Uploads encrypted data to file.io for ephemeral storage.
 * @param {string} encryptedHex - The encrypted data to upload.
 * @returns {Promise<string>} - The file.io access key.
 */
async function uploadData(encryptedHex) {
    const blob = new Blob([encryptedHex], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'intel.enc');
    formData.append('expires', CONFIG.EXPIRY);

    // ROUTE 0: Primary (file.io)
    try {
        const response = await fetch(CONFIG.UPLOAD_ENDPOINT, { method: 'POST', body: formData });
        if (response.ok) {
            const res = await response.json();
            if (res.success) return keyToEmojis(res.key, 0);
        }
    } catch (e) { console.warn("Route 0 Blocked."); }

    // ROUTE 1: Fallback (tmpfiles.org)
    try {
        const responseB = await fetch(CONFIG.UPLOAD_ENDPOINT_B, { method: 'POST', body: formData });
        if (responseB.ok) {
            const resB = await responseB.json();
            const id = resB.data.url.split('/').slice(-2, -1)[0]; 
            return keyToEmojis(id, 1);
        }
    } catch (e) { console.warn("Route 1 Blocked."); }

    // ROUTE 2: Deep Fallback (transfer.sh)
    try {
        const responseC = await fetch(CONFIG.UPLOAD_ENDPOINT_C, { 
            method: 'PUT', // transfer.sh uses PUT
            body: blob 
        });
        if (responseC.ok) {
            const url = await responseC.text();
            const id = url.trim().split('/').slice(-2).join('/'); // e.g. "ID/intel.enc"
            return keyToEmojis(id, 2);
        }
    } catch (e) { console.warn("Route 2 Blocked."); }

    throw new Error("ALL CLOUD ROUTES BLOCKED. Please check your internet or try Incognito mode.");
}

/**
 * Retrieves encrypted data from cloud provider with CORS-bridge-healing.
 * @param {object} keyData - { key: string, provider: number }
 * @returns {Promise<string>} - The encrypted hex string.
 */
async function downloadData(keyData) {
    const { key, provider } = keyData;
    let url = `https://file.io/${key}`;
    
    if (provider === 1) url = `https://tmpfiles.org/dl/${key}/intel.enc`;
    if (provider === 2) url = `${CONFIG.UPLOAD_ENDPOINT_C}${key}`;

    console.log(`Initial Fetch Request: ${url}`);
    
    try {
        const response = await fetch(url);
        if (response.ok) return await response.text();
        throw new Error("Standard route failed.");
    } catch (error) {
        console.warn("Standard download blocked by CORS. Initializing Secure Bridge...");
        // Healing: Try again via CORS bridge
        const bridgeUrl = `${CONFIG.CORS_BRIDGE}${encodeURIComponent(url)}`;
        const bridgeResponse = await fetch(bridgeUrl);
        
        if (!bridgeResponse.ok) {
            throw new Error("Intelligence self-destructed or all access bridges are down.");
        }
        return await bridgeResponse.text();
    }
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
    
    // Step 5: Derive key using PBKDF2 (10,000 iterations)
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 10000
    });

    // Step 5: Encrypt Base64 string
    const encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: iv,
        padding: CryptoJS.pad.Pkcs7,
        mode: CryptoJS.mode.CBC
    });

    // Step 5: Output: Salt + IV + Ciphertext as a Hex string
    const combined = salt.clone().concat(iv).concat(encrypted.ciphertext);
    return combined.toString(CryptoJS.enc.Hex);
}

/**
 * Decrypts data using AES-256-CBC with PBKDF2 key derivation.
 * @param {string} combinedHex - Combined Hex string (Salt + IV + Ciphertext).
 * @param {string} password - The decryption password.
 * @returns {string} - Decrypted Base64 string.
 */
function decryptData(combinedHex, password) {
    const combined = CryptoJS.enc.Hex.parse(combinedHex);
    
    // Step 10: Split Hex blob (Salt: 128 bit, IV: 128 bit)
    const salt = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4));
    const iv = CryptoJS.lib.WordArray.create(combined.words.slice(4, 8));
    const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(8));

    // Step 10: Derive key using PBKDF2 (10,000 iterations)
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 10000
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
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Step 4: Keep uploads under 500KB by resizing to max 800px
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

                // Step 4: Convert to Base64 (JPEG format, 0.7 quality)
                const base64 = canvas.toDataURL('image/jpeg', CONFIG.JPEG_QUALITY);
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

// Clear invalid state on input
document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') {
        e.target.classList.remove('invalid');
    }
});

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
        state.encryptedHex = encryptData(state.processedBase64, password);
        
        showLoading("Vanishing to Cloud...");
        // Step 6 & 7: Ephemeral Upload + Encoding Combined
        state.emojiKey = await uploadData(state.encryptedHex);
        
        // Display Result
        UI.emojiKeyDisplay.textContent = state.emojiKey;
        UI.senderOutput.classList.remove('hidden');
        
        hideLoading();
        notify("Intelligence encrypted and vanished to cloud.", "success");
        console.log("Intelligence Phase Complete. Phantom Key:", state.emojiKey);

    } catch (error) {
        console.error("Encryption Phase Error:", error);
        notify("Encryption failed: " + error.message, "error");
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
        state.encryptedHex = await downloadData(keyData);
        
        showLoading("Decrypting Intelligence...");
        
        // Step 10: AES Decryption
        state.processedBase64 = decryptData(state.encryptedHex, password);
        
        // Step 11: Render & Display
        UI.decryptedImage.src = state.processedBase64;
        UI.receiverDisplay.classList.remove('hidden');
        
        hideLoading();
        notify("Intelligence restored successfully.", "success");
        
        // Internal analytics/log
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
        const dropZoneText = UI.dropZone.querySelector('p');
        dropZoneText.textContent = `Captured: ${file.name}`;
        UI.dropZone.style.borderColor = 'var(--primary-color)';
    }
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

