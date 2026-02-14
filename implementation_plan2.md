# Goal: Emoji Spy V2 - Phantom Gallery Implementation Plan

Build a premium, high-security image sharing tool where images are encrypted locally and stored ephemerally.

## Core Architectural Change

Unlike V1, V2 does NOT convert the image into emojis. It converts the **File.io Access Key** into emojis. This reduces the emoji string from 10,000+ characters to just **6-10 emojis**.

## Detailed Multi-Step Plan

### Phase 1: Cyberpunk UI Infrastructure

**Step 1: Structural Skeleton (index.html) [COMPLETED]**

- Implement a responsive dual-pane layout: **SENDER (Encrypt)** and **RECEIVER (Decrypt)**.
- **SEO & Meta**: Include proper Title, Meta Description, and OpenGraph tags for a "Premium Privacy Tool".
- **Sender Inputs**: File picker (`accept="image/*"`), Password field (`type="password"`).
- **Receiver Inputs**: Emoji input (`placeholder="Paste decoded emojis here..."`), Password field.
- **Action Buttons**: Premium CSS-animated buttons for "🔒 Initiate Encryption" and "🔓 Decrypt Intelligence".
- **Feedback Areas**: Containers for the short emoji key (with a "Copy" button) and an image previewer for decrypted files.

**Step 2: Theme & Typography (style.css) [COMPLETED]**

- Set global dark theme with a curated palette: `Background: #050505`, `Primary: #00ff41`, `Accent: #00d2ff`.
- Use 'Outfit' for UI and 'Fira Code' for technical data.
- Implement glassmorphism containers with `backdrop-filter`.
- **Added**: Implemented a dedicated navigation menu to toggle between "Encrypt" and "Decrypt" modes as requested.

**Step 3: Advanced Visuals & Micro-animations (style.css) [COMPLETED]**

- Hover effects for buttons (glow and slight scale).
- Glitch animation for the logo.
- Loading states (shimmer effects) for "Encryption in Progress".

---

### Phase 2: Sender Logic (Encryption & Upload)

**Step 4: Image Processing (script.js) [COMPLETED]**

- Capture file, check size against threshold (1MB).
- If internal limit exceeded: Resize on canvas (max 1200px) and convert to JPEG (0.7 quality).
- If within limit: Use original image quality and dimensions.

**Step 5: AES-256 Encryption (script.js) [COMPLETED]**

- Generate Salt and IV.
- Derive key using PBKDF2 (10,000 iterations).
- Encrypt Base64 string.
- Output: `Salt + IV + Ciphertext` as a Hex string.

**Step 6: Ephemeral Upload (script.js) [COMPLETED]**

- POST Hex string to `https://file.io/?expires=1w`.
- Extract the `key` (e.g., `jR8kLm`).

**Step 7: Key-to-Emoji Mapping (script.js) [COMPLETED]**

- Map each character of the alphanumeric key to a unique emoji from `EMOJI_MAP`.
- Result: A short, shareable emoji string.

---

### Phase 3: Receiver Logic (Download & Decryption)

**Step 8: Emoji-to-Key Decoding (script.js) [COMPLETED]**

- Reverse the mapping to get the `file.io` alphanumeric key.

**Step 9: Intelligence Retrieval (script.js) [COMPLETED]**

- Fetch data from `https://file.io/{key}`.
- Handle 404: Display "Message Self-Destructed" UI.

**Step 10: AES Decryption (script.js) [COMPLETED]**

- Split Hex blob into Salt, IV, and Ciphertext.
- Derive key and decrypt.

**Step 11: Render & Display (script.js) [COMPLETED]**

- Inject Base64 into `<img>` tag with a fade-in animation.

---

### Phase 4: Polish

**Step 12: UX Patterns [COMPLETED]**

- Clipboard API integration for copying emojis.
- Error validation (empty fields, invalid password).
- "Burn After Reading" status indicator.

**Step 13: Final Audit [COMPLETED]**

- Test on mobile and desktop: Responsive layout and touch-optimized interactions implemented.
- Verify security headers (CORS): Fetch calls configured for external ephemeral storage.
- **Project Complete**: All features of the Phantom Gallery Intel tool are operational.
