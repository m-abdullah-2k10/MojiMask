🕵️ Project Blueprint: Emoji Spy V2 (Phantom Gallery)
1. Project Overview

A "Zero-Knowledge" image sharing tool that operates entirely in the browser.

    Sender: Encrypts a photo locally, uploads the encrypted blob to a temporary host, and generates a string of emojis as the "Key."

    Receiver: Pastes the emojis to fetch, decrypt, and view the photo.

    Core Feature: The server (File.io) never sees the image. The image automatically self-destructs after few views.

2. Technical Stack

    Frontend: HTML5, CSS3 (Cyberpunk/Dark Theme).

    Logic: Vanilla JavaScript.

    Encryption Library: CryptoJS (AES-256).

    Storage API: File.io (Free, Ephemeral, CORS-friendly).

        Backup API if File.io fails: JSONBin.io (Free tier).

3. Detailed Logic Flow (The "Algorithm")
Phase A: The Sender (Encryption & Upload)

    Input: User selects an image file (<input type="file">).

    Compression (Crucial):

        Create an HTML <canvas> element in memory.

        Draw the image onto the canvas with a max width of 800px (to keep file size low, ~100KB-300KB).

        Convert canvas to Base64 string: canvas.toDataURL('image/jpeg', 0.7).

    Encryption:

        let the user generate a password.

        Encrypt the Base64 string using CryptoJS.AES.encrypt(base64).

        Result: A long string of encrypted text (Ciphertext).

    Upload:

        Create a FormData object. Append the Ciphertext as a text file (e.g., secret.txt).

        POST request to https://file.io.

        Response: The API returns a JSON object with a link or key (e.g., f.io/7h9xYz).

    Emoji Encoding:

    

        Map the link or key to Emojis (using your existing mapping logic).

        Output: A string of emojis.

Phase B: The Receiver (Download & Decryption)

    Input: User pastes the emojis and the password that was generated at the time of encryption

    Decoding:

        Convert emojis back to the String: 7h9xYz.
        

    Fetch:

        GET request to https://file.io/7h9xYz.

        Note: File.io deletes the file immediately after this request!

    Decryption:

        Take the downloaded text (Ciphertext).

        Decrypt using CryptoJS.AES.decrypt(ciphertext, password).

        Result: The original Base64 image string.

    Display:

        Set an <img> tag source: img.src = base64String.

4. API Reference (For the AI)

Endpoint: https://file.io Method: POST Headers: None required for free tier. Body: FormData containing the file. Constraint: Files are deleted after 1 download or 14 days.

Code Snippet for Upload (Copy this logic):
JavaScript

async function uploadToCloud(encryptedString) {
    const blob = new Blob([encryptedString], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'secret.txt');

    try {
        const response = await fetch('https://file.io/?expires=1w', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            return data.key; // This is the short code we turn into emojis
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert("Upload failed. Try again.");
    }
}

5. Security & Privacy Rules (The "Spy" Standard)

    Client-Side Only: The unencrypted image never leaves the browser.

    Ephemeral Storage: We rely on File.io's auto-delete feature. Once the receiver views it, the link dies.

    Error Handling: If the receiver tries to open a link that has already been viewed, show a cool spy message: "This message has self-destructed."

📝 Instruction for Antigravity AI

    "Using the plan above, generate the index.html, style.css, and script.js files. Focus on the script.js logic to handle the async Fetch requests and ensure the 'Emoji Mapping' function supports the characters used in the File.io keys (usually letters a-z, A-Z, and numbers 0-9)."


    i have some basic code for the conversion of the text to emoji in script.js file , use that code and modify it according to the plan.