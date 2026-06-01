/**
 * Imgur API Integration for Anonymous Uploads
 * Uses the Imgur anonymous upload API (no user login required).
 * The Client ID identifies the *app*, not the user.
 * Register your own free at: https://api.imgur.com/oauth2/addclient (select "Anonymous usage without user authorization")
 */
window.imgurHandler = {
    // Default public Client ID — works for low-volume kiosk use.
    // Override in Admin Settings for dedicated/high-volume use.
    DEFAULT_CLIENT_ID: 'b2f7870c3b1e43a',

    get clientId() {
        const saved = window.app && window.app.config && window.app.config.imgurClientId;
        return (saved && saved.trim()) ? saved.trim() : this.DEFAULT_CLIENT_ID;
    },

    async uploadPhoto(dataUrl, directBlob = null) {
        const statusIcon = document.getElementById('upload-status-icon');
        const statusText = document.getElementById('upload-status-text');
        const qrContainer = document.getElementById('qr-container');

        statusIcon.innerText = '☁️';
        statusText.innerText = 'Uploading to Gallery...';
        statusIcon.classList.add('pulse-anim');

        try {
            let blob = directBlob;
            let ext = 'jpg';
            let mime = 'image/jpeg';

            if (!blob && dataUrl) {
                const res = await fetch(dataUrl);
                blob = await res.blob();
                mime = blob.type || 'image/jpeg';
                if (mime.includes('gif')) ext = 'gif';
            } else if (directBlob) {
                mime = directBlob.type;
                if (mime.includes('video')) ext = 'webm';
                else if (mime.includes('gif')) ext = 'gif';
            }

            // Imgur does not support video uploads via anonymous API — show a clear message
            if (ext === 'webm' || mime.includes('video')) {
                throw new Error('Video uploads are not supported by Imgur. Please switch to Google Drive for video mode.');
            }

            const formData = new FormData();
            formData.append('image', blob, `photo.${ext}`);
            formData.append('type', 'file');

            const uploadRes = await fetch('https://api.imgur.com/3/image', {
                method: 'POST',
                headers: {
                    'Authorization': 'Client-ID ' + this.clientId
                },
                body: formData
            });

            // Parse response body for readable errors
            const resData = await uploadRes.json().catch(() => ({}));

            if (!uploadRes.ok) {
                const status = uploadRes.status;
                let errMsg = '';
                if (resData.data && resData.data.error) {
                    errMsg = resData.data.error;
                } else if (status === 403) {
                    errMsg = 'Invalid Imgur Client ID. Set a valid one in Admin Settings.';
                } else if (status === 429) {
                    errMsg = 'Imgur rate limit reached. Please wait a moment.';
                } else if (status === 503 || status === 500) {
                    errMsg = `Imgur server error (${status}). Check your Client ID in Admin Settings or try again.`;
                } else {
                    errMsg = `Upload failed (HTTP ${status})`;
                }
                throw new Error(errMsg);
            }

            const imageUrl = resData.data.link;

            // Upload success!
            statusIcon.innerText = '✅';
            statusText.innerText = 'Saved to Gallery!';
            statusIcon.classList.remove('pulse-anim');

            // Build download page URL — fall back to production URL when running locally
            let basePath = window.location.origin + window.location.pathname;
            if (basePath.endsWith('index.html')) {
                basePath = basePath.slice(0, -10);
            }
            if (!basePath.endsWith('/')) {
                basePath += '/';
            }
            if (basePath.includes('localhost') || basePath.includes('127.0.0.1') || basePath.includes('file://')) {
                basePath = 'https://rnk-studio.github.io/LuxeMomentsKIOSk/';
            }

            const downloadPageUrl = `${basePath}download.html?url=${encodeURIComponent(imageUrl)}&ext=${ext}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(downloadPageUrl)}`;

            qrContainer.innerHTML = `
                <img src="${qrUrl}" alt="QR Code to Download Photo" style="border-radius:8px;">
                <p style="font-size: 0.8rem; margin-top: 6px; color: #94a3b8;">📱 Scan to Download</p>`;
            qrContainer.classList.remove('hidden');

        } catch (error) {
            console.error('Error uploading to Imgur:', error);
            statusIcon.innerText = '❌';
            statusText.innerText = `Upload Failed: ${error.message || error}`;
            statusIcon.classList.remove('pulse-anim');
        }
    }
};
