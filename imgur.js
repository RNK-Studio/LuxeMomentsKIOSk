/**
 * Photo Upload Handler — uses Pixeldrain.com (Primary) and Tmpfiles.org (Backup)
 * Both are completely free, require zero API keys, support CORS,
 * and support images, GIFs, and videos!
 */
window.imgurHandler = {

    // Synchronous conversion of base64 data URL to Blob to avoid browser 'Failed to fetch' errors
    dataURLtoBlob(dataurl) {
        try {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
        } catch (e) {
            console.error("Base64 to Blob conversion failed:", e);
            return null;
        }
    },

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
                // Use synchronous base64-to-blob conversion to prevent "Failed to fetch" errors on data: URIs
                blob = this.dataURLtoBlob(dataUrl);
                if (!blob) {
                    throw new Error("Could not convert image data to uploadable file.");
                }
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
            statusText.innerText = `Error preparing file: ${prepError.message || prepError}`;
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
                throw new Error(`Pixeldrain server returned status ${pixeldrainRes.status}`);
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
                    throw new Error(`Tmpfiles server returned status ${tmpfilesRes.status}`);
                }

                const tmpData = await tmpfilesRes.json();
                if (tmpData.status === 'success' && tmpData.data && tmpData.data.url) {
                    // Tmpfiles returns a view URL like "https://tmpfiles.org/12345/file.jpg".
                    // Convert to direct download by inserting "dl"
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
                statusText.innerText = `Upload Failed: ${pixeldrainError.message || 'CORS or Connection Error'}`;
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

        // Save successfully uploaded photo info to local gallery history
        try {
            const historyStr = localStorage.getItem('luxemoments_gallery_history') || '[]';
            const history = JSON.parse(historyStr);
            history.unshift({
                url: fileUrl,
                downloadUrl: downloadPageUrl,
                ext: ext,
                timestamp: Date.now()
            });
            localStorage.setItem('luxemoments_gallery_history', JSON.stringify(history));
            console.log('Saved upload to event gallery history:', fileUrl);
        } catch (e) {
            console.error('Error saving to gallery history:', e);
        }
    }
};
