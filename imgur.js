/**
 * Photo Upload Handler — uses Pixeldrain.com (Primary) and Tmpfiles.org (Backup)
 * Both are completely free, require zero API keys, support CORS,
 * and support images, GIFs, and videos!
 */
window.imgurHandler = {

    async uploadPhoto(dataUrl, directBlob = null) {
        const statusIcon = document.getElementById('upload-status-icon');
        const statusText = document.getElementById('upload-status-text');
        const qrContainer = document.getElementById('qr-container');

        statusIcon.innerText = '☁️';
        statusText.innerText = 'Uploading to Gallery...';
        statusIcon.classList.add('pulse-anim');

        // Prepare file details
        let blob = directBlob;
        let ext = 'jpg';
        let mime = 'image/jpeg';

        try {
            if (!blob && dataUrl) {
                const res = await fetch(dataUrl);
                blob = await res.blob();
                mime = blob.type || 'image/jpeg';
                if (mime.includes('gif')) ext = 'gif';
                else if (mime.includes('png')) ext = 'png';
            } else if (directBlob) {
                mime = directBlob.type || 'image/jpeg';
                if (mime.includes('video')) ext = 'webm';
                else if (mime.includes('gif')) ext = 'gif';
                else if (mime.includes('png')) ext = 'png';
            }
        } catch (prepError) {
            console.error('File prep error:', prepError);
            statusIcon.innerText = '❌';
            statusText.innerText = 'Error preparing photo blob.';
            statusIcon.classList.remove('pulse-anim');
            return;
        }

        // Try Pixeldrain first
        try {
            console.log('Attempting upload to Pixeldrain...');
            const formData = new FormData();
            formData.append('file', blob, `luxemoments_photo.${ext}`);
            formData.append('anonymous', 'true');

            const pixeldrainRes = await fetch('https://pixeldrain.com/api/file', {
                method: 'POST',
                body: formData
            });

            if (!pixeldrainRes.ok) {
                throw new Error(`Pixeldrain response status: ${pixeldrainRes.status}`);
            }

            const resData = await pixeldrainRes.json();
            if (resData.success && resData.id) {
                // Direct file URL from Pixeldrain API
                const fileUrl = `https://pixeldrain.com/api/file/${resData.id}`;
                this.handleUploadSuccess(fileUrl, ext);
                return; // Exit successfully!
            } else {
                throw new Error('Pixeldrain response success was false.');
            }
        } catch (pixeldrainError) {
            console.warn('Pixeldrain upload failed, trying Tmpfiles.org backup...', pixeldrainError);
            
            // Backup: Tmpfiles.org (files deleted after 60 minutes, perfect for immediate downloads)
            try {
                const backupFormData = new FormData();
                backupFormData.append('file', blob, `luxemoments_photo.${ext}`);

                const tmpfilesRes = await fetch('https://tmpfiles.org/api/v1/upload', {
                    method: 'POST',
                    body: backupFormData
                });

                if (!tmpfilesRes.ok) {
                    throw new Error(`Tmpfiles response status: ${tmpfilesRes.status}`);
                }

                const tmpData = await tmpfilesRes.json();
                if (tmpData.status === 'success' && tmpData.data && tmpData.data.url) {
                    // Tmpfiles returns a view URL like "https://tmpfiles.org/12345/file.jpg".
                    // We convert it to a direct download URL by inserting "dl" after the domain:
                    // "https://tmpfiles.org/dl/12345/file.jpg"
                    let directUrl = tmpData.data.url;
                    if (directUrl.includes('tmpfiles.org/')) {
                        directUrl = directUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
                    }
                    this.handleUploadSuccess(directUrl, ext);
                } else {
                    throw new Error('Tmpfiles response did not contain a success status.');
                }
            } catch (backupError) {
                console.error('All upload providers failed:', backupError);
                statusIcon.innerText = '❌';
                statusText.innerText = 'Upload Failed: Both servers are offline. Try again.';
                statusIcon.classList.remove('pulse-anim');
            }
        }
    },

    handleUploadSuccess(fileUrl, ext) {
        const statusIcon = document.getElementById('upload-status-icon');
        const statusText = document.getElementById('upload-status-text');
        const qrContainer = document.getElementById('qr-container');

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
            <img src="${qrUrl}" alt="QR Code to Download Photo" style="border-radius:8px; display:block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <p style="font-size: 0.8rem; margin-top: 6px; color: #94a3b8;">📱 Scan to Download</p>`;
        qrContainer.classList.remove('hidden');
    }
};
