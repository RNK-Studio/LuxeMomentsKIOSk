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
        capturedVideoBlob: null
    },
    
    config: {
        idleTimeMs: 60000, // 60 seconds to reset to home
        clientId: localStorage.getItem('gdrive_client_id') || '1068792669282-lmg1gpngpn1ievar826j36jmo322m0fc.apps.googleusercontent.com',
        folderId: localStorage.getItem('gdrive_folder_id') || '1YZ65mLsdL-rGA7S1wi4c8oxN0dRnLyhT',
        logoUrl: localStorage.getItem('event_logo_url') || '',
        eventName: localStorage.getItem('event_name') || '',
        customBgUrl: localStorage.getItem('custom_bg_url') || '',
        uploadProvider: localStorage.getItem('upload_provider') || 'imgur',
        imgurClientId: localStorage.getItem('imgur_client_id') || ''
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
        this.toggleUploadSettingsVisibility();
    },

    openGallery(e) {
        if(e) e.stopPropagation();
        alert("Online Photo Gallery is coming soon! Access it via the scanned QR codes on printout.");
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
        
        // Auto-upload based on selected provider
        const provider = this.config.uploadProvider;
        if (provider === 'imgur' && window.imgurHandler) {
            if (this.state.mode === 'video' && this.state.capturedVideoBlob) {
                window.imgurHandler.uploadPhoto(null, this.state.capturedVideoBlob);
            } else {
                window.imgurHandler.uploadPhoto(finalImage.src);
            }
        } else if (provider === 'gdrive' && window.driveHandler) {
            if (this.state.mode === 'video' && this.state.capturedVideoBlob) {
                window.driveHandler.uploadPhoto(null, this.state.capturedVideoBlob);
            } else {
                window.driveHandler.uploadPhoto(finalImage.src);
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
        const clientId = document.getElementById('setting-client-id').value;
        const folderId = document.getElementById('setting-folder-id').value || '1YZ65mLsdL-rGA7S1wi4c8oxN0dRnLyhT';
        const logoUrl = document.getElementById('setting-logo-url').value;
        const eventName = document.getElementById('setting-event-name').value;
        const customBgUrl = document.getElementById('setting-bg-url').value;
        const uploadProvider = document.getElementById('setting-upload-provider').value;
        const imgurClientId = document.getElementById('setting-imgur-client-id').value;
        
        localStorage.setItem('gdrive_client_id', clientId);
        localStorage.setItem('gdrive_folder_id', folderId);
        localStorage.setItem('event_logo_url', logoUrl);
        localStorage.setItem('event_name', eventName);
        localStorage.setItem('custom_bg_url', customBgUrl);
        localStorage.setItem('upload_provider', uploadProvider);
        localStorage.setItem('imgur_client_id', imgurClientId);
        
        this.config.clientId = clientId;
        this.config.folderId = folderId;
        this.config.logoUrl = logoUrl;
        this.config.eventName = eventName;
        this.config.customBgUrl = customBgUrl;
        this.config.uploadProvider = uploadProvider;
        this.config.imgurClientId = imgurClientId;
        
        if (window.canvasHandler) window.canvasHandler.loadBackground();
        
        this.closeAdmin();
        alert('Settings saved!');
    },

    loadSettings() {
        document.getElementById('setting-client-id').value = this.config.clientId;
        document.getElementById('setting-folder-id').value = this.config.folderId;
        document.getElementById('setting-logo-url').value = this.config.logoUrl;
        document.getElementById('setting-event-name').value = this.config.eventName;
        document.getElementById('setting-bg-url').value = this.config.customBgUrl;
        document.getElementById('setting-upload-provider').value = this.config.uploadProvider;
        document.getElementById('setting-imgur-client-id').value = this.config.imgurClientId;
        this.toggleUploadSettingsVisibility();
    },

    toggleUploadSettingsVisibility() {
        const provider = document.getElementById('setting-upload-provider').value;
        const imgurGroup = document.getElementById('settings-group-imgur');
        const gdriveGroup = document.getElementById('settings-group-gdrive');
        const gdriveFolderGroup = document.getElementById('settings-group-gdrive-folder');
        const gdriveAuthGroup = document.getElementById('settings-group-gdrive-auth');

        if (provider === 'imgur') {
            imgurGroup.classList.remove('hidden');
            gdriveGroup.classList.add('hidden');
            gdriveFolderGroup.classList.add('hidden');
            gdriveAuthGroup.classList.add('hidden');
        } else {
            imgurGroup.classList.add('hidden');
            gdriveGroup.classList.remove('hidden');
            gdriveFolderGroup.classList.remove('hidden');
            gdriveAuthGroup.classList.remove('hidden');
        }
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
    }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => app.init());
