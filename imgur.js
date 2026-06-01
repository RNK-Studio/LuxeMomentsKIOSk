/**
 * Photo Upload Handler — uses Catbox.moe
 * No API key, no account, no login required.
 * Supports images (jpg, png, gif) and videos.
 * Files are hosted permanently at files.catbox.moe
 */
window.imgurHandler = {

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
                else if (mime.includes('png')) ext = 'png';
            } else if (directBlob) {
                mime = directBlob.type || 'video/webm';
                if (mime.includes('video')) ext = 'webm';
                else if (mime.includes('gif')) ext = 'gif';
                else if (mime.includes('png')) ext = 'png';
            }

            // Build multipart form for Catbox
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', blob, `luxemoments_photo.${ext}`);

            const uploadRes = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) {
                throw new Error(`Upload server error (${uploadRes.status}). Please try again.`);
            }

            const fileUrl = (await uploadRes.text()).trim();

            if (!fileUrl || !fileUrl.startsWith('http')) {
                throw new Error('Upload failed — invalid response from server. Please try again.');
            }

            // Upload success!
            statusIcon.innerText = '✅';
            statusText.innerText = 'Saved to Gallery!';
            statusIcon.classList.remove('pulse-anim');

            // Build download page URL — fall back to production URL when running locally
            let basePath = window.location.origin + window.location.pathname;
            if (basePath.endsWith('index.html')) basePath = basePath.slice(0, -10);
            if (!basePath.endsWith('/')) basePath += '/';
            if (basePath.includes('localhost') || basePath.includes('127.0.0.1') || basePath.startsWith('file://')) {
                basePath = 'https://rnk-studio.github.io/LuxeMomentsKIOSk/';
            }

            const downloadPageUrl = `${basePath}download.html?url=${encodeURIComponent(fileUrl)}&ext=${ext}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(downloadPageUrl)}`;

            qrContainer.innerHTML = `
                <img src="${qrUrl}" alt="QR Code to Download Photo" style="border-radius:8px; display:block; margin: 0 auto;">
                <p style="font-size: 0.8rem; margin-top: 6px; color: #94a3b8;">📱 Scan to Download</p>`;
            qrContainer.classList.remove('hidden');

        } catch (error) {
            console.error('Upload error:', error);
            statusIcon.innerText = '❌';
            statusText.innerText = `Upload Failed: ${error.message || 'Unknown error. Check internet connection.'}`;
            statusIcon.classList.remove('pulse-anim');
        }
    }
};
