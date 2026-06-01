/**
 * Camera and Capture Logic
 */
window.cameraHandler = {
    stream: null,
    videoEl: null,
    canvasEl: null,
    countdownEl: null,
    isCapturing: false,
    isStreaming: false,

    async start() {
        this.videoEl = document.getElementById('camera-feed');
        this.canvasEl = document.getElementById('camera-canvas');
        this.countdownEl = document.getElementById('countdown-overlay');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("Camera API not supported or requires HTTPS");
            alert("Camera access denied or unsupported. Are you accessing via IP address? You must use HTTPS or localhost.");
            return;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: "user"
                }, 
                audio: true // Record audio for video mode
            });
            this.videoEl.srcObject = this.stream;
            this.isStreaming = true;
            
            await this.videoEl.play().catch(e => console.error("Play prevented", e));
            
            // Start real-time preview render loop
            this.previewLoop();
        } catch (err) {
            console.error("Error accessing webcam:", err);
            // Fallback to video only if audio permission fails
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, 
                    audio: false 
                });
                this.videoEl.srcObject = this.stream;
                this.isStreaming = true;
                await this.videoEl.play();
                this.previewLoop();
            } catch (fallbackErr) {
                alert("Could not access the webcam. Please ensure permissions are granted.");
            }
        }
    },

    stop() {
        this.isStreaming = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },

    previewLoop() {
        if (!this.stream || !this.isStreaming) return;
        
        if (window.app.state.chromaKeyEnabled) {
            this.videoEl.classList.add('hidden');
            this.canvasEl.classList.remove('hidden');
            
            this.canvasEl.width = this.videoEl.videoWidth || 640;
            this.canvasEl.height = this.videoEl.videoHeight || 480;
            
            const ctx = this.canvasEl.getContext('2d');
            
            ctx.translate(this.canvasEl.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            this.applyChromaKeyToContext(ctx, this.canvasEl.width, this.canvasEl.height);
        } else {
            this.videoEl.classList.remove('hidden');
            this.canvasEl.classList.add('hidden');
        }
        
        requestAnimationFrame(() => this.previewLoop());
    },

    applyChromaKeyToContext(ctx, w, h) {
        const frameData = ctx.getImageData(0, 0, w, h);
        const data = frameData.data;
        
        ctx.clearRect(0, 0, w, h);
        
        const bgImg = window.canvasHandler ? window.canvasHandler.bgImage : null;
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, w, h);
        } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, w, h);
        }
        
        const keyColor = window.app.state.chromaColor;
        const tolerance = window.app.state.chromaTolerance;
        const smoothness = window.app.state.chromaSmoothness;
        
        const keyHsl = this.rgbToHsl(keyColor.r, keyColor.g, keyColor.b);
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            const hsl = this.rgbToHsl(r, g, b);
            
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
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCanvas.getContext('2d').putImageData(frameData, 0, 0);
        
        ctx.drawImage(tempCanvas, 0, 0);
    },
    
    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    },

    async startCaptureSequence() {
        if (this.isCapturing) return;
        
        try {
            this.isCapturing = true;
            const btnCircle = document.querySelector('.capture-btn .inner-circle');
            if(btnCircle) btnCircle.style.backgroundColor = '#ec4899';

            const photos = [];
            const mode = window.app.state.mode;

            // Video Mode
            if (mode === 'video') {
                await this.runCountdown(window.app.state.timer);
                
                let recorder;
                const chunks = [];
                try {
                    const options = { mimeType: 'video/webm;codecs=vp8,opus' };
                    recorder = new MediaRecorder(this.stream, options);
                } catch(e) {
                    recorder = new MediaRecorder(this.stream);
                }
                
                recorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };
                
                recorder.onstop = () => {
                    const videoBlob = new Blob(chunks, { type: 'video/webm' });
                    window.app.playSound('beep');
                    this.isCapturing = false;
                    if(btnCircle) btnCircle.style.backgroundColor = 'white';
                    
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = this.videoEl.videoWidth || 640;
                    tempCanvas.height = this.videoEl.videoHeight || 480;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.translate(tempCanvas.width, 0);
                    tempCtx.scale(-1, 1);
                    tempCtx.drawImage(this.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
                    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
                    const frameDataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
                    
                    window.app.onCaptureComplete([frameDataUrl], videoBlob);
                };
                
                this.countdownEl.innerText = "REC";
                this.countdownEl.classList.remove('hidden');
                recorder.start();
                
                setTimeout(() => {
                    recorder.stop();
                    this.countdownEl.classList.add('hidden');
                }, 5000);
                return;
            }

            // Wigglegram Mode (Rapid-fire sequence with ONE countdown)
            if (mode === 'wigglegram') {
                await this.runCountdown(window.app.state.timer);
                for (let i = 0; i < 4; i++) {
                    const photoData = this.captureFrame();
                    this.triggerFlash();
                    window.app.playSound('shutter');
                    photos.push(photoData);
                    await new Promise(r => setTimeout(r, 150));
                }
            } else {
                // Image / Collage / Animation Mode
                const numShots = mode === 'image' ? 1 : 4;
                for (let i = 0; i < numShots; i++) {
                    await this.runCountdown(window.app.state.timer);
                    const photoData = this.captureFrame();
                    this.triggerFlash();
                    window.app.playSound('shutter');
                    photos.push(photoData);
                    
                    if (i < numShots - 1) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            this.isCapturing = false;
            if(btnCircle) btnCircle.style.backgroundColor = 'white';
            window.app.onCaptureComplete(photos);
        } catch (e) {
            console.error("Capture sequence failed:", e);
            alert("An error occurred during capture: " + e.message);
            this.isCapturing = false;
            const btnCircle = document.querySelector('.capture-btn .inner-circle');
            if(btnCircle) btnCircle.style.backgroundColor = 'white';
        }
    },

    runCountdown(seconds) {
        return new Promise((resolve) => {
            this.countdownEl.classList.remove('hidden');
            let timeLeft = seconds;
            
            const tick = () => {
                if (timeLeft > 0) {
                    this.countdownEl.innerText = timeLeft;
                    window.app.playSound('beep');
                    timeLeft--;
                    setTimeout(tick, 1000);
                } else {
                    this.countdownEl.classList.add('hidden');
                    resolve();
                }
            };
            tick();
        });
    },

    captureFrame() {
        this.canvasEl.width = this.videoEl.videoWidth || 1920;
        this.canvasEl.height = this.videoEl.videoHeight || 1080;
        
        const ctx = this.canvasEl.getContext('2d');
        ctx.translate(this.canvasEl.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        return this.canvasEl.toDataURL('image/jpeg', 0.9);
    },

    triggerFlash() {
        const flash = document.getElementById('flash-effect');
        if (!flash) return;
        flash.classList.remove('hidden');
        flash.classList.add('flash-anim');
        
        setTimeout(() => {
            flash.classList.remove('flash-anim');
            flash.classList.add('hidden');
        }, 500);
    }
};
