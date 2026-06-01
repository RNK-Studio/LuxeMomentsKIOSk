/**
 * Imgur API Integration for Anonymous Uploads
 */
window.imgurHandler = {
    get clientId() {
        return (window.app && window.app.config && window.app.config.imgurClientId) || '44c93a2164c8d5a';
    },

    async uploadPhoto(dataUrl, directBlob = null) {
        const statusIcon = document.getElementById('upload-status-icon');
        const statusText = document.getElementById('upload-status-text');
        const qrContainer = document.getElementById('qr-container');

        statusIcon.innerText = "☁️";
        statusText.innerText = "Uploading to Gallery...";
        statusIcon.classList.add('pulse-anim');

        try {
            let blob = directBlob;
            let ext = 'jpg';
            let mime = 'image/jpeg';
            
            if (!blob && dataUrl) {
                const res = await fetch(dataUrl);
                blob = await res.blob();
            } else if (directBlob) {
                mime = directBlob.type;
                if (mime.includes('video')) ext = 'webm';
                else if (mime.includes('gif')) ext = 'gif';
            }

            const formData = new FormData();
            formData.append('image', blob);
            formData.append('type', 'file');

            const uploadRes = await fetch('https://api.imgur.com/3/image', {
                method: 'POST',
                headers: {
                    'Authorization': 'Client-ID ' + this.clientId
                },
                body: formData
            });

            if (!uploadRes.ok) {
                const errBody = await uploadRes.json().catch(() => ({}));
                const errMsg = (errBody.data && errBody.data.error) || `Status ${uploadRes.status}`;
                throw new Error(errMsg);
            }

            const resData = await uploadRes.json();
            const imageUrl = resData.data.link;

            // Upload success!
            statusIcon.innerText = "✅";
            statusText.innerText = "Saved to Gallery!";
            statusIcon.classList.remove('pulse-anim');

            // Generate QR Code pointing to the custom download page (fallback local hosts to production url)
            let basePath = window.location.origin + window.location.pathname;
            if (basePath.endsWith('index.html')) {
                basePath = basePath.slice(0, -10);
            }
            if (!basePath.endsWith('/')) {
                basePath += '/';
            }
            
            if (basePath.includes('localhost') || basePath.includes('127.0.0.1')) {
                basePath = 'https://rnk-studio.github.io/LuxeMomentsKIOSk/';
            }

            const downloadPageUrl = `${basePath}download.html?url=${encodeURIComponent(imageUrl)}&ext=${ext}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(downloadPageUrl)}`;
            
            qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code to Download Photo">
                                     <p style="font-size: 0.8rem; margin-top: 5px;">Scan to Download</p>`;
            qrContainer.classList.remove('hidden');

        } catch (error) {
            console.error("Error uploading to Imgur:", error);
            statusIcon.innerText = "❌";
            statusText.innerText = `Upload Failed: ${error.message || error}`;
            statusIcon.classList.remove('pulse-anim');
        }
    }
};
