/**
 * Main Application Logic for Photobooth Kiosk
 */
window.app = {
    state: {
        currentScreen: 'home',
        timer: 3,
        mode: 'collage', // 'image' | 'collage' | 'animation' | 'video' | 'wigglegram'
        filter: 'none',
        layout: 'collage', // Set default layout to collage
        theme: 'default', // Background theme
        copies: 1,
        photos: [], // Array of image blobs/dataURLs from current session
        idleTimeout: null,
        adminTaps: 0,
        adminTapTimeout: null,
        
        // Chroma Key (Green Screen) Virtual Background states
        chromaKeyEnabled: false,
        selectedVirtualBg: 'none',
        chromaTolerance: 60,
        chromaSmoothness: 15,
        chromaColor: { r: 0, g: 255, b: 0 },
        capturedVideoBlob: null,
        faceDetectEnabled: false,  // Face detection overlay toggle
    },
    
    config: {
        idleTimeMs: 60000, // 60 seconds to reset to home
        logoUrl: localStorage.getItem('event_logo_url') || '',
        eventName: localStorage.getItem('event_name') || '',
        customBgUrl: localStorage.getItem('custom_bg_url') || '',
    },

    init() {
        this.bindEvents();
        this.resetIdleTimer();
        this.loadSettings();
    },

    bindEvents() {
        // Setup idle reset on click/tap
        document.addEventListener('click', () => {
            this.resetIdleTimer();
        });

        // Filter & Layout Buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.filter = e.currentTarget.dataset.filter;
                if(window.canvasHandler) window.canvasHandler.applyFilterAndLayout();
            });
        });

        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.layout = e.currentTarget.dataset.layout;
                if(window.canvasHandler) window.canvasHandler.applyFilterAndLayout();
            });
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.theme = e.currentTarget.dataset.theme;
                if(window.canvasHandler) window.canvasHandler.changeTheme();
            });
        });

        // Timer Toggle Buttons
        document.querySelectorAll('.toggle-btn[data-timer]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.toggle-btn[data-timer]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.timer = parseInt(e.currentTarget.dataset.timer);
            });
        });

        // Capture Button
        const captureBtn = document.getElementById('capture-btn');
        if(captureBtn) {
            captureBtn.addEventListener('click', () => {
                if(window.cameraHandler) window.cameraHandler.startCaptureSequence();
            });
        }
    },

    handleHomeTouch(e) {
        // Touch anywhere on home screen to trigger action
        if (e.target.closest('.home-top-controls') || e.target.closest('.home-bottom-bar') || e.target.closest('.admin-panel')) {
            return;
        }
        this.startSession();
    },

    openAdmin(e) {
        if(e) e.stopPropagation();
        document.getElementById('overlay-admin').classList.remove('hidden');
    },

    openGallery(e) {
        if(e) e.stopPropagation();
        const galleryOverlay = document.getElementById('overlay-gallery');
        const grid = document.getElementById('gallery-grid');
        
        if (!galleryOverlay || !grid) return;
        
        // Show modal
        galleryOverlay.classList.remove('hidden');
        
        // Load uploads from local storage
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('luxemoments_gallery_history') || '[]');
        } catch (err) {
            console.error(err);
        }
        
        // Clear previous grid items
        grid.innerHTML = '';
        
        if (history.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1.5rem; opacity: 0.5;">
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M20.5 15.5l-4-4a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 1-1.4 0l-2-2a1 1 0 0 0-1.4 0l-3.3 3.3" />
                    </svg>
                    <p style="font-size: 1.2rem; font-weight: 500;">No photos taken yet!</p>
                    <p style="font-size: 0.95rem; margin-top: 0.5rem;">Captures taken during the event will appear here.</p>
                </div>
            `;
            return;
        }
        
        // Render item cards
        history.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'gallery-card glass-panel';
            
            // Format timestamp
            const date = new Date(item.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const isVideo = item.ext === 'webm' || item.ext === 'mp4';
            
            card.innerHTML = `
                <div class="gallery-card-preview">
                    ${isVideo 
                        ? `<video src="${item.url}" muted playsinline loop></video>`
                        : `<img src="${item.url}" alt="Capture Preview" loading="lazy">`
                    }
                    <div class="gallery-card-hover">Tapped to View</div>
                </div>
                <div class="gallery-card-info">
                    <span class="gallery-card-time">${timeStr}</span>
                    <span class="gallery-card-badge">${isVideo ? '🎥 Video' : (item.ext === 'gif' ? '✨ GIF' : '📸 Photo')}</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                this.openGalleryItem(item.url, item.downloadUrl, item.ext);
            });
            
            grid.appendChild(card);
        });
    },

    closeGallery() {
        const galleryOverlay = document.getElementById('overlay-gallery');
        if (galleryOverlay) {
            galleryOverlay.classList.add('hidden');
        }
    },

    openGalleryItem(url, downloadUrl, ext) {
        const itemModal = document.getElementById('gallery-item-modal');
        const mediaContainer = document.getElementById('gallery-item-media');
        const qrContainer = document.getElementById('gallery-item-qr');
        
        if (!itemModal || !mediaContainer || !qrContainer) return;
        
        mediaContainer.innerHTML = '';
        qrContainer.innerHTML = '';
        
        const isVideo = ext === 'webm' || ext === 'mp4';
        if (isVideo) {
            const video = document.createElement('video');
            video.src = url;
            video.autoplay = true;
            video.loop = true;
            video.controls = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            video.style.borderRadius = '12px';
            mediaContainer.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '12px';
            mediaContainer.appendChild(img);
        }
        
        // Generate QR code for mobile scanning
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(downloadUrl)}`;
        qrContainer.innerHTML = `
            <img src="${qrUrl}" alt="Item QR Code" style="border-radius: 8px;">
            <p style="font-size: 0.8rem; margin-top: 5px; color: var(--text-muted);">Scan to Download</p>
        `;
        
        itemModal.classList.remove('hidden');
    },

    closeGalleryItem() {
        const itemModal = document.getElementById('gallery-item-modal');
        if (itemModal) {
            itemModal.classList.add('hidden');
        }
    },

    clearGalleryHistory() {
        if (confirm("Are you sure you want to clear the entire photo gallery history? This cannot be undone.")) {
            localStorage.removeItem('luxemoments_gallery_history');
            alert("Gallery history cleared!");
            this.openGallery(); // reload view
        }
    },

    selectMode(mode, e) {
        if(e) e.stopPropagation();
        this.state.mode = mode;
        
        // Update layout defaults based on mode selection
        if (mode === 'image') {
            this.state.layout = 'single';
            // Set capture controls
            document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-layout="single"]').classList.add('active');
        } else {
            this.state.layout = 'collage';
            document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-layout="collage"]').classList.add('active');
        }

        document.querySelectorAll('.mode-select-btn').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        this.playSound('beep');
    },

    toggleChromaKey(e) {
        if(e) e.stopPropagation();
        this.state.chromaKeyEnabled = !this.state.chromaKeyEnabled;
        
        const toggleBtn = document.getElementById('home-chroma-toggle');
        if (toggleBtn) {
            if (this.state.chromaKeyEnabled) {
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.classList.remove('active');
            }
        }
        
        this.playSound('beep');
    },

    selectVirtualBg(bgName) {
        this.state.selectedVirtualBg = bgName;
        
        // Update Review UI active states
        document.querySelectorAll('.chroma-bg-btn').forEach(btn => {
            if (btn.dataset.bg === bgName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Trigger redraw
        if (window.canvasHandler) {
            window.canvasHandler.applyFilterAndLayout();
        }
        this.playSound('beep');
    },

    updateChromaParams() {
        const tolerance = parseInt(document.getElementById('chroma-slider-tolerance').value);
        const smoothness = parseInt(document.getElementById('chroma-slider-smoothness').value);
        
        this.state.chromaTolerance = tolerance;
        this.state.chromaSmoothness = smoothness;
        
        document.getElementById('chroma-val-tolerance').innerText = tolerance;
        document.getElementById('chroma-val-smoothness').innerText = smoothness;
        
        // Trigger redraw
        if (window.canvasHandler) {
            window.canvasHandler.applyFilterAndLayout();
        }
    },

    updateChromaColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        this.state.chromaColor = { r, g, b };
        document.getElementById('chroma-color-picker').value = hex;
        
        if (window.canvasHandler) {
            window.canvasHandler.applyFilterAndLayout();
        }
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        const screen = document.getElementById(`screen-${screenId}`);
        if (screen) {
            screen.classList.remove('hidden');
            setTimeout(() => {
                screen.classList.add('active');
            }, 50);
        }
        this.state.currentScreen = screenId;
    },

    startSession() {
        this.state.photos = [];
        this.state.capturedVideoBlob = null;
        this.showScreen('capture');
        if(window.cameraHandler) window.cameraHandler.start();
    },

    onCaptureComplete(photos, videoBlob = null) {
        this.state.photos = photos;
        this.state.capturedVideoBlob = videoBlob;
        
        this.showScreen('review');
        if(window.cameraHandler) window.cameraHandler.stop();
        
        // Hide review video loop by default
        const reviewVideo = document.getElementById('review-video-loop');
        const reviewCanvas = document.getElementById('collage-canvas');
        if (reviewVideo) reviewVideo.classList.add('hidden');
        if (reviewCanvas) reviewCanvas.classList.remove('hidden');

        // Show/hide chroma key edit panel depending on chroma status
        const chromaPanel = document.getElementById('chroma-edit-controls');
        if (chromaPanel) {
            if (this.state.chromaKeyEnabled) {
                chromaPanel.classList.remove('hidden');
            } else {
                chromaPanel.classList.add('hidden');
            }
        }
        
        if(window.canvasHandler) window.canvasHandler.init(photos, videoBlob);
    },

    retake() {
        this.startSession();
    },

    goToPrint() {
        this.showScreen('print');
        const finalImage = document.getElementById('final-image');
        const collageCanvas = document.getElementById('collage-canvas');
        if(finalImage && collageCanvas) {
            finalImage.src = collageCanvas.toDataURL('image/jpeg', 0.9);
        }
        
        // Auto-upload using Catbox (no API key required)
        if (window.imgurHandler) {
            if (this.state.mode === 'video' && this.state.capturedVideoBlob) {
                window.imgurHandler.uploadPhoto(null, this.state.capturedVideoBlob);
            } else {
                window.imgurHandler.uploadPhoto(finalImage.src);
            }
        }
    },

    changeCopies(delta) {
        this.state.copies = Math.max(1, Math.min(10, this.state.copies + delta));
        document.getElementById('copies-count').innerText = this.state.copies;
    },

    printPhoto() {
        window.print();
        this.playSound('print');
    },

    resetKiosk() {
        this.state.photos = [];
        this.state.copies = 1;
        document.getElementById('copies-count').innerText = this.state.copies;
        this.state.filter = 'none';
        this.state.layout = 'collage';
        this.state.theme = 'default';
        this.state.mode = 'collage';
        this.state.chromaKeyEnabled = false;
        this.state.selectedVirtualBg = 'none';
        this.state.chromaTolerance = 60;
        this.state.chromaSmoothness = 15;
        this.state.chromaColor = { r: 0, g: 255, b: 0 };
        this.state.capturedVideoBlob = null;
        
        // Reset UI toggles
        document.querySelectorAll('.filter-btn, .layout-btn, .theme-btn, .chroma-bg-btn, .mode-select-btn').forEach(b => b.classList.remove('active'));
        
        const filterNone = document.querySelector('[data-filter="none"]');
        const layoutCollage = document.querySelector('[data-layout="collage"]');
        const themeDefault = document.querySelector('[data-theme="default"]');
        const modeCollage = document.querySelector('.mode-select-btn[data-mode="collage"]');
        const chromaNone = document.querySelector('.chroma-bg-btn[data-bg="none"]');
        
        if (filterNone) filterNone.classList.add('active');
        if (layoutCollage) layoutCollage.classList.add('active');
        if (themeDefault) themeDefault.classList.add('active');
        if (modeCollage) modeCollage.classList.add('active');
        if (chromaNone) chromaNone.classList.add('active');
        
        const toggleBtn = document.getElementById('home-chroma-toggle');
        if (toggleBtn) toggleBtn.classList.remove('active');
        
        const reviewVideo = document.getElementById('review-video-loop');
        if (reviewVideo) {
            reviewVideo.pause();
            reviewVideo.src = "";
            reviewVideo.classList.add('hidden');
        }
        
        document.getElementById('qr-container').classList.add('hidden');
        document.getElementById('upload-status-text').innerText = "Uploading to Gallery...";
        
        this.showScreen('home');
    },

    resetIdleTimer() {
        clearTimeout(this.state.idleTimeout);
        this.state.idleTimeout = setTimeout(() => {
            if (this.state.currentScreen !== 'home') {
                this.resetKiosk();
            }
        }, this.config.idleTimeMs);
    },

    handleAdminTap(e) {
        if(e) e.stopPropagation();
        this.state.adminTaps++;
        clearTimeout(this.state.adminTapTimeout);
        
        if (this.state.adminTaps >= 5) {
            this.state.adminTaps = 0;
            document.getElementById('overlay-admin').classList.remove('hidden');
        }
        
        this.state.adminTapTimeout = setTimeout(() => {
            this.state.adminTaps = 0;
        }, 2000);
    },

    closeAdmin() {
        document.getElementById('overlay-admin').classList.add('hidden');
    },

    saveAdminSettings() {
        const logoUrl = document.getElementById('setting-logo-url').value;
        const eventName = document.getElementById('setting-event-name').value;
        const customBgUrl = document.getElementById('setting-bg-url').value;
        
        localStorage.setItem('event_logo_url', logoUrl);
        localStorage.setItem('event_name', eventName);
        localStorage.setItem('custom_bg_url', customBgUrl);
        
        this.config.logoUrl = logoUrl;
        this.config.eventName = eventName;
        this.config.customBgUrl = customBgUrl;
        
        if (window.canvasHandler) window.canvasHandler.loadBackground();
        
        this.closeAdmin();
        alert('Settings saved!');
    },

    loadSettings() {
        document.getElementById('setting-logo-url').value = this.config.logoUrl;
        document.getElementById('setting-event-name').value = this.config.eventName;
        document.getElementById('setting-bg-url').value = this.config.customBgUrl;
    },

    audioCtx: null,

    playSound(type) {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Browsers suspend audio context until user interaction
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            
            const context = this.audioCtx;
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            
            if (type === 'shutter') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, context.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, context.currentTime + 0.1);
                gain.gain.setValueAtTime(0.5, context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
                osc.start(context.currentTime);
                osc.stop(context.currentTime + 0.1);
            } else if (type === 'beep') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, context.currentTime);
                gain.gain.setValueAtTime(0.5, context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);
                osc.start(context.currentTime);
                osc.stop(context.currentTime + 0.2);
            }
        } catch(e) {
            console.log("Audio not supported or interaction needed");
        }
    },

    toggleFaceDetect(e) {
        if (e) e.stopPropagation();
        this.state.faceDetectEnabled = !this.state.faceDetectEnabled;
        const btn = document.getElementById('face-detect-toggle');
        const lbl = document.getElementById('face-detect-label');
        const overlay = document.getElementById('face-overlay');
        if (this.state.faceDetectEnabled) {
            if (btn) btn.classList.add('active');
            if (lbl) lbl.textContent = 'Detect Face: ON';
            if (overlay) overlay.classList.remove('hidden');
        } else {
            if (btn) btn.classList.remove('active');
            if (lbl) lbl.textContent = 'Detect Face: OFF';
            if (overlay) {
                overlay.classList.add('hidden');
                const ctx = overlay.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
            }
        }
        // Notify camera handler
        if (window.cameraHandler) window.cameraHandler.setFaceDetect(this.state.faceDetectEnabled);
    }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => app.init());
