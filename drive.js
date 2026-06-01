/**
 * Google Drive API Integration and Upload Logic
 */
window.driveHandler = {
    get folderId() {
        return (window.app && window.app.config && window.app.config.folderId) || '1YZ65mLsdL-rGA7S1wi4c8oxN0dRnLyhT';
    },
    tokenClient: null,
    accessToken: null,
    isInitialized: false,

    init() {
        // This is called when the GIS library is loaded
        const clientId = window.app.config.clientId;
        
        if (!clientId) {
            console.warn("Google Drive Client ID not set. Uploads will be disabled.");
            return;
        }

        try {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse) => {
                    if (tokenResponse.error !== undefined) {
                        throw (tokenResponse);
                    }
                    this.accessToken = tokenResponse.access_token;
                    this.isInitialized = true;
                },
            });
            
            // Optionally, we can request the token silently or via popup.
            // For a kiosk, an admin should authorize it once on setup.
        } catch(e) {
            console.error("Failed to initialize Google Identity Services", e);
        }
    },

    requestAuthorization() {
        if (!this.tokenClient) {
            alert("Please set the Google Drive Client ID in Admin settings first.");
            return;
        }
        this.tokenClient.requestAccessToken({prompt: 'consent'});
    },

    async uploadPhoto(dataUrl, directBlob = null) {
        const statusIcon = document.getElementById('upload-status-icon');
        const statusText = document.getElementById('upload-status-text');
        const qrContainer = document.getElementById('qr-container');

        if (!this.accessToken) {
            statusIcon.innerText = "⚠️";
            statusText.innerText = "Google Drive not authorized. Skip upload.";
            return;
        }

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

            const metadata = {
                'name': `Photobooth_${new Date().getTime()}.${ext}`,
                'mimeType': mime,
                'parents': [this.folderId]
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + this.accessToken }),
                body: form
            });

            if (!uploadRes.ok) throw new Error("Upload failed");

            const fileData = await uploadRes.json();
            
            // Upload success!
            statusIcon.innerText = "✅";
            statusText.innerText = "Saved to Gallery!";
            statusIcon.classList.remove('pulse-anim');

            // Generate QR Code pointing to the custom download landing page (works for local testing and production)
            let basePath = window.location.origin + window.location.pathname;
            if (basePath.endsWith('index.html')) {
                basePath = basePath.slice(0, -10);
            }
            if (!basePath.endsWith('/')) {
                basePath += '/';
            }
            
            // If running locally, fall back to live URL so phone scans work
            if (basePath.includes('localhost') || basePath.includes('127.0.0.1')) {
                basePath = 'https://rnk-studio.github.io/LuxeMomentsKIOSk/';
            }
            
            const downloadPageUrl = `${basePath}download.html?id=${fileData.id}&ext=${ext}`;
            
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(downloadPageUrl)}`;
            qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code to Download Photo">
                                     <p style="font-size: 0.8rem; margin-top: 5px;">Scan to Download</p>`;
            qrContainer.classList.remove('hidden');

        } catch (error) {
            console.error("Error uploading to drive:", error);
            statusIcon.innerText = "❌";
            statusText.innerText = "Upload Failed.";
            statusIcon.classList.remove('pulse-anim');
        }
    }
};

// Hook into GIS load
window.onload = function() {
    // If google is already loaded, init. Otherwise wait.
    if(window.google && window.google.accounts) {
        window.driveHandler.init();
    } else {
        // Wait for it (in a real app, bind to the callback in the script tag)
        setTimeout(() => {
            if(window.google && window.google.accounts) window.driveHandler.init();
        }, 1000);
    }
};
