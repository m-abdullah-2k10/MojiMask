/* 
   ==========================================================================
   CONFIG & CONSTANTS
   ==========================================================================
*/

const CONFIG = {
    MAX_IMAGE_DIMENSION: 800,
    JPEG_QUALITY: 0.7,
    UPLOAD_ENDPOINT: 'https://file.io/?expires=1w',
    EMOJI_MAP: [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
        '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
        '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺',
        '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚',
        '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈',
        '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀',
        '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👵', '👴', '👲', '👳', '🧕', '👮', '👷', '💂', '🕵️', '👩‍⚕️', '👨‍⚕️', '👩‍🌾', '👨‍🌾', '👩‍🍳', '👨‍🍳', '👩‍🎓', '👨‍🎓', '👩‍🎤', '👨‍🎤',
        '👩‍🏫', '👨‍🏫', '👩‍🏭', '👨‍🏭', '👩‍💻', '👨‍💻', '👩‍💼', '👨‍💼', '👩‍🔧', '👨‍🔧', '👩‍🔬', '👨‍🔬', '👩‍🎨', '👨‍🎨', '👩‍🚒', '👨‍🚒', '👩‍✈️', '👨‍✈️', '👩‍🚀', '👨‍🚀', '👩‍⚖️', '👨‍⚖️', '👰', '🤵', '👸', '🤴', '🧚', '🧞', '🧜', '🧟', '🧙', '🧛'
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
        loadingText: document.getElementById('loading-text')
    };

    // Verify critical elements
    const missing = Object.entries(UI).filter(([key, val]) => !val).map(([key]) => key);
    if (missing.length > 0) {
        console.error("Critical UI elements missing:", missing);
    }
}

/* 
   ==========================================================================
   UTILITY FUNCTIONS
   ==========================================================================
*/

/**
 * Maps an alphanumeric string (the cloud key) to a short emoji string.
 * @param {string} key - The alphanumeric key.
 * @returns {string} - The emoji representation.
 */
function keyToEmojis(key) {
    return Array.from(key)
        .map(char => CONFIG.EMOJI_MAP[char.charCodeAt(0)] || '❓')
        .join('');
}

/**
 * Maps an emoji string back to its alphanumeric key.
 * @param {string} emojiString - The string of emojis.
 * @returns {string} - The alphanumeric key.
 */
function emojisToKey(emojiString) {
    let emojis;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        emojis = Array.from(segmenter.segment(emojiString)).map(s => s.segment);
    } else {
        emojis = Array.from(emojiString);
    }

    return emojis
        .map(emoji => {
            const index = EMOJI_TO_INDEX.get(emoji);
            return index !== undefined ? String.fromCharCode(index) : '';
        })
        .join('');
}

/**
 * Uploads encrypted data to file.io for ephemeral storage.
 * @param {string} encryptedHex - The encrypted data to upload.
 * @returns {Promise<string>} - The file.io access key.
 */
async function uploadData(encryptedHex) {
    const formData = new FormData();
    // Create a Blob from the hex string to upload as a "file"
    const blob = new Blob([encryptedHex], { type: 'text/plain' });
    formData.append('file', blob, 'intelligence.enc');

    const response = await fetch(CONFIG.UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Cloud upload failed with status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.message || "Failed to retrieve access key from cloud.");
    }

    return result.key; // e.g., "jR8kLm"
}

/**
 * Retrieves encrypted data from file.io.
 * @param {string} key - The file.io access key.
 * @returns {Promise<string>} - The encrypted hex string.
 */
async function downloadData(key) {
    const response = await fetch(`https://file.io/${key}`);

    if (response.status === 404) {
        throw new Error("Intelligence self-destructed or link expired.");
    }

    if (!response.ok) {
        throw new Error(`Intelligence retrieval failed: ${response.status}`);
    }

    return await response.text();
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
    const password = UI.encryptPassword?.value;
    
    if (!state.selectedFile) {
        alert("🚨 Intelligence data missing. Please capture an image.");
        return;
    }
    
    if (!password) {
        alert("🚨 Security clearance required. Please define an access code.");
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
        // Step 6: Ephemeral Upload
        state.fileIOKey = await uploadData(state.encryptedHex);
        
        showLoading("Generating Phantom Key...");
        // Step 7: Key-to-Emoji Mapping
        state.emojiKey = keyToEmojis(state.fileIOKey);
        
        // Display Result
        UI.emojiKeyDisplay.textContent = state.emojiKey;
        UI.senderOutput.classList.remove('hidden');
        
        hideLoading();
        console.log("Intelligence Phase Complete. Phantom Key:", state.emojiKey);

    } catch (error) {
        console.error("Encryption Phase Error:", error);
        alert("🚨 Encryption failed: " + error.message);
        hideLoading();
    }
}

async function handleDecryption() {
    const emojiString = UI.emojiInput.value.trim();
    const password = UI.decryptPassword.value;

    if (!emojiString) {
        alert("🚨 Phantom Key missing. Please provide the emojis.");
        return;
    }

    if (!password) {
        alert("🚨 Security clearance required. Please provide the access code.");
        return;
    }

    try {
        showLoading("Decoding Phantom Key...");
        
        // Step 8: Emoji-to-Key Decoding
        const fileKey = emojisToKey(emojiString);
        
        if (!fileKey) {
            throw new Error("Invalid Phantom Key format.");
        }

        showLoading("Fetching Intelligence...");
        
        // Step 9: Intelligence Retrieval
        state.encryptedHex = await downloadData(fileKey);
        
        showLoading("Decrypting Intelligence...");
        
        // Step 10: AES Decryption
        state.processedBase64 = decryptData(state.encryptedHex, password);
        
        // Step 11: Render & Display
        UI.decryptedImage.src = state.processedBase64;
        UI.receiverDisplay.classList.remove('hidden');
        
        hideLoading();
        
        // Internal analytics/log
        console.log("Intelligence successfully restored.");

    } catch (error) {
        console.error("Decryption Phase Error:", error);
        alert("🚨 " + error.message);
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
        
        navigator.clipboard.writeText(state.emojiKey).then(() => {
            const originalText = UI.btnCopyEmojis.textContent;
            UI.btnCopyEmojis.textContent = '✅';
            setTimeout(() => {
                UI.btnCopyEmojis.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            alert('Failed to copy. Please select and copy manually.');
        });
    });

    // 7. Initial State
    switchMode('encrypt');
    console.log("Intelligence Tool Booted.");
});

