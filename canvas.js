/**
 * Canvas Image Processing and Layouts
 */
window.canvasHandler = {
    canvasEl: null,
    ctx: null,
    loadedImages: [],
    bgImage: null,
    animationTimer: null,

    async init(photoDataUrls, videoBlob = null) {
        this.canvasEl = document.getElementById('collage-canvas');
        this.ctx = this.canvasEl.getContext('2d');
        
        await this.loadBackground();

        // Load all data URLs into Image objects
        this.loadedImages = await Promise.all(photoDataUrls.map(url => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (err) => {
                    console.error("Failed to load image into canvas", err);
                    resolve(img);
                };
                img.src = url;
            });
        }));

        const mode = window.app.state.mode;

        // Handle Mode Preview Loops
        if (mode === 'video' && videoBlob) {
            this.stopAnimationLoop();
            const reviewCanvas = document.getElementById('collage-canvas');
            const reviewVideo = document.getElementById('review-video-loop');
            if (reviewCanvas) reviewCanvas.classList.add('hidden');
            if (reviewVideo) {
                reviewVideo.classList.remove('hidden');
                reviewVideo.src = URL.createObjectURL(videoBlob);
                reviewVideo.play();
            }
            // Render print background canvas
            this.applyFilterAndLayout();
        } else if (mode === 'animation' || mode === 'wigglegram') {
            this.applyFilterAndLayout();
            this.startAnimationLoop();
        } else {
            this.stopAnimationLoop();
            this.applyFilterAndLayout();
        }
        
        // Sample color picker on canvas click
        this.canvasEl.onclick = (e) => this.handleCanvasClick(e);
    },

    async loadBackground() {
        // If theme is 'none', clear the background image and bail
        if (!window.app.config.customBgUrl && window.app.state.theme === 'none') {
            this.bgImage = null;
            if (this.ctx && this.loadedImages.length > 0) this.applyFilterAndLayout();
            return;
        }

        let bgSrc = 'bg.png'; // default
        
        if (window.app.config.customBgUrl) {
            bgSrc = window.app.config.customBgUrl;
            // Bypass CORS issues on custom background image URLs by routing through images.weserv.nl CORS proxy
            if (bgSrc.startsWith('http')) {
                bgSrc = `https://images.weserv.nl/?url=${encodeURIComponent(bgSrc)}`;
            }
        } else if (window.app.state.theme === 'neon') {
            bgSrc = 'bg_neon.png';
        } else if (window.app.state.theme === 'classic') {
            bgSrc = 'bg_classic.png';
        }

        this.bgImage = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = (e) => {
                console.error("Failed to load background frame image:", bgSrc, e);
                resolve(null);
            };
            img.src = bgSrc;
        });
        
        if (this.ctx && this.loadedImages.length > 0) {
            this.applyFilterAndLayout();
        }
    },

    changeTheme() {
        this.loadBackground();
    },


    applyFilterAndLayout() {
        const layout = window.app.state.layout;
        const filter = window.app.state.filter;
        
        const baseWidth = 1800;
        const baseHeight = 1200;

        this.canvasEl.width = baseWidth;
        this.canvasEl.height = baseHeight;

        // Background Collage Frame
        if (this.bgImage) {
            this.ctx.drawImage(this.bgImage, 0, 0, baseWidth, baseHeight);
        } else {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, baseWidth, baseHeight);
        }

        this.applyContextFilter(filter);

        if (layout === 'single') {
            this.drawSingleLayout(baseWidth, baseHeight);
        } else if (layout === 'strip-2x2') {
            this.drawStripLayout(baseWidth, baseHeight);
        } else if (layout === 'collage') {
            this.drawCollageLayout(baseWidth, baseHeight);
        }

        this.ctx.filter = 'none';
        this.addBranding(baseWidth, baseHeight);
    },

    applyContextFilter(filter) {
        switch(filter) {
            case 'vintage':
                this.ctx.filter = 'sepia(0.6) contrast(1.1) brightness(0.9) saturate(1.2)';
                break;
            case 'bw':
                this.ctx.filter = 'grayscale(1) contrast(1.2)';
                break;
            case 'contrast':
                this.ctx.filter = 'contrast(1.5) saturate(1.5)';
                break;
            default:
                this.ctx.filter = 'none';
        }
    },

    drawSingleLayout(width, height) {
        if (!this.loadedImages[0]) return;
        const img = this.loadedImages[0];
        
        const margin = 50;
        const drawWidth = width - (margin * 2);
        const drawHeight = (drawWidth / img.width) * img.height;
        const drawY = (height - drawHeight) / 2;

        this.drawChromaPhotoInBox(img, margin, drawY, drawWidth, drawHeight);
    },

    drawStripLayout(width, height) {
        const photos = [];
        for(let i=0; i<4; i++) {
            photos.push(this.loadedImages[i % this.loadedImages.length]);
        }
        
        const margin = 40;
        const stripWidth = (width - (margin * 3)) / 2;
        const stripHeight = height - (margin * 2);
        
        // Card Background for Strips
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(margin, margin, stripWidth, stripHeight);
        this.ctx.fillRect(width - margin - stripWidth, margin, stripWidth, stripHeight);
        
        const photoW = stripWidth - 60;
        const photoH = (stripHeight - 120) / 4;
        
        for (let i = 0; i < 4; i++) {
            const yOffset = margin + 30 + (i * (photoH + 15));
            this.drawChromaPhotoInBox(photos[i], margin + 30, yOffset, photoW, photoH);
            this.drawChromaPhotoInBox(photos[i], width - margin - stripWidth + 30, yOffset, photoW, photoH);
        }
    },

    drawChromaPhotoInBox(img, x, y, w, h) {
        if (!img) return;

        // Process image inside offscreen canvas
        const offCanvas = document.createElement('canvas');
        offCanvas.width = img.width;
        offCanvas.height = img.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(img, 0, 0);

        if (window.app.state.chromaKeyEnabled && window.app.state.selectedVirtualBg !== 'none') {
            const frameData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
            const data = frameData.data;

            offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
            this.drawProceduralBg(offCtx, offCanvas.width, offCanvas.height, window.app.state.selectedVirtualBg);

            const keyColor = window.app.state.chromaColor;
            const tolerance = window.app.state.chromaTolerance;
            const smoothness = window.app.state.chromaSmoothness;
            const keyHsl = window.cameraHandler ? window.cameraHandler.rgbToHsl(keyColor.r, keyColor.g, keyColor.b) : { h: 0.33, s: 0.8, l: 0.5 };

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];

                const hsl = window.cameraHandler ? window.cameraHandler.rgbToHsl(r, g, b) : { h: 0.33, s: 0.8, l: 0.5 };

                const dh = Math.min(Math.abs(hsl.h - keyHsl.h), 1 - Math.abs(hsl.h - keyHsl.h));
                const ds = Math.abs(hsl.s - keyHsl.s);
                const dl = Math.abs(hsl.l - keyHsl.l);

                const distance = Math.sqrt(dh * dh * 4 + ds * ds + dl * dl) * 255;

                if (distance < tolerance) {
                    if (distance > tolerance - smoothness && smoothness > 0) {
                        const ratio = (distance - (tolerance - smoothness)) / smoothness;
                        data[i+3] = Math.round(ratio * 255);
                    } else {
                        data[i+3] = 0;
                    }
                }
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = offCanvas.width;
            tempCanvas.height = offCanvas.height;
            tempCanvas.getContext('2d').putImageData(frameData, 0, 0);
            offCtx.drawImage(tempCanvas, 0, 0);
        }

        this.ctx.save();
        
        // Border frame
        this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetX = 5;
        this.ctx.shadowOffsetY = 5;
        this.ctx.fillStyle = '#ffb3c6';
        this.ctx.fillRect(x - 15, y - 15, w + 30, h + 30);
        
        this.ctx.shadowColor = 'transparent';
        
        const scale = Math.max(w / offCanvas.width, h / offCanvas.height);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (offCanvas.width - sw) / 2;
        const sy = (offCanvas.height - sh) / 2;

        this.ctx.drawImage(offCanvas, sx, sy, sw, sh, x, y, w, h);
        
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(x, y, w, h);
        
        this.ctx.restore();
    },

    drawCollageLayout(width, height) {
        const photos = [];
        for(let i=0; i<4; i++) {
            photos.push(this.loadedImages[i % this.loadedImages.length]);
        }
        
        this.drawChromaPhotoInBox(photos[0], 50, 50, 1000, 700);
        this.drawChromaPhotoInBox(photos[1], 1100, 50, 650, 500);
        this.drawChromaPhotoInBox(photos[2], 50, 800, 500, 350);
        this.drawChromaPhotoInBox(photos[3], 600, 800, 500, 350);
    },

    drawProceduralBg(ctx, w, h, bgName) {
        if (bgName === 'none') {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(0, 0, w, h);
            return;
        }
        
        if (bgName === 'classic') {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 6;
            const size = 60;
            for (let x = -w; x < w + h; x += size) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke();
            }
            return;
        }
        
        if (bgName === 'neon') {
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#1e3a8a');
            grad.addColorStop(0.5, '#8b5cf6');
            grad.addColorStop(1, '#3b82f6');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            const step = 40;
            for (let x = 0; x < w; x += step) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            }
            for (let y = 0; y < h; y += step) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
            return;
        }
        
        if (bgName === 'pastel') {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#ffc8dd');
            grad.addColorStop(0.5, '#ffafcc');
            grad.addColorStop(1, '#bde0fe');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                const cx = (w / 5) * i + Math.sin(i) * 30;
                const cy = h / 2 + Math.cos(i) * 50;
                ctx.arc(cx, cy, 60 + i * 10, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }
        
        if (bgName === 'tropical') {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#fdba74');
            grad.addColorStop(0.4, '#f97316');
            grad.addColorStop(1, '#a855f7');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(w / 2, h - 80, 100, 0, Math.PI, true);
            ctx.fill();
            
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(w * 0.2, h - 60);
            ctx.lineTo(w * 0.3, h - 30);
            ctx.lineTo(w * 0.6, h - 80);
            ctx.lineTo(w * 0.8, h - 45);
            ctx.lineTo(w, h);
            ctx.fill();
            return;
        }
        
        if (bgName === 'disco') {
            const grad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w);
            grad.addColorStop(0, '#f472b6');
            grad.addColorStop(0.5, '#db2777');
            grad.addColorStop(1, '#4c0519');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            for (let i = 0; i < 25; i++) {
                const cx = Math.random() * w;
                const cy = Math.random() * h;
                const r = Math.random() * 40 + 15;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }
    },

    startAnimationLoop() {
        this.stopAnimationLoop();
        
        const mode = window.app.state.mode;
        if (mode !== 'animation' && mode !== 'wigglegram') return;
        
        const interval = mode === 'wigglegram' ? 100 : 500;
        let frameIndex = 0;
        
        this.animationTimer = setInterval(() => {
            if (!this.loadedImages.length) return;
            
            const img = this.loadedImages[frameIndex % this.loadedImages.length];
            frameIndex++;
            
            const baseWidth = 1800;
            const baseHeight = 1200;
            this.canvasEl.width = baseWidth;
            this.canvasEl.height = baseHeight;
            
            if (this.bgImage) {
                this.ctx.drawImage(this.bgImage, 0, 0, baseWidth, baseHeight);
            } else {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, baseWidth, baseHeight);
            }
            
            this.applyContextFilter(window.app.state.filter);
            
            const margin = 50;
            const drawWidth = baseWidth - (margin * 2);
            const drawHeight = (drawWidth / img.width) * img.height;
            const drawY = (baseHeight - drawHeight) / 2;
            
            this.drawChromaPhotoInBox(img, margin, drawY, drawWidth, drawHeight);
            
            this.ctx.filter = 'none';
            this.addBranding(baseWidth, baseHeight);
        }, interval);
    },
    
    stopAnimationLoop() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }
    },

    handleCanvasClick(e) {
        if (!window.app.state.chromaKeyEnabled) return;
        
        const rect = this.canvasEl.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * this.canvasEl.width;
        const y = ((e.clientY - rect.top) / rect.height) * this.canvasEl.height;
        
        try {
            const pixel = this.ctx.getImageData(x, y, 1, 1).data;
            const hex = "#" + ("000000" + ((pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16)).slice(-6);
            window.app.updateChromaColor(hex);
        } catch(err) {
            console.error("Failed to sample color:", err);
        }
    },

    addBranding(width, height) {
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 40px Inter';
        this.ctx.textAlign = 'center';
        
        const dateStr = new Date().toLocaleDateString();
        const customName = window.app.config.eventName;
        const text = customName ? customName : `Snap & Shine - ${dateStr}`;

        if (window.app.state.layout === 'strip-2x2') {
            const margin = 40;
            const stripWidth = (width - (margin * 3)) / 2;
            this.ctx.fillText(text, margin + (stripWidth/2), height - 80);
            this.ctx.fillText(text, width - margin - (stripWidth/2), height - 80);
        } else if (window.app.state.layout === 'collage') {
            this.ctx.font = 'bold 70px Outfit';
            this.ctx.fillStyle = '#fff';
            this.ctx.shadowColor = '#1e3a8a';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 3;
            this.ctx.shadowOffsetY = 3;
            this.ctx.fillText(text, 1450, 1050);
            this.ctx.shadowColor = 'transparent';
        } else {
            this.ctx.fillText(text, width / 2, height - 80);
        }
    }
};
