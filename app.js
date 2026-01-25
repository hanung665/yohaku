class TextareaEditor {
    constructor() {
        this.elements = {
            content: document.getElementById('content'),
            editor: document.getElementById('editor'),
            status: document.getElementById('status'),
            statusText: document.getElementById('statusText'),
            qrModal: document.getElementById('qrModal'),
            qrCanvas: document.getElementById('qrCanvas'),
            closeQr: document.getElementById('closeQr'),
            helpBtn: document.getElementById('helpBtn'),
            helpPanel: document.getElementById('helpPanel'),
            themeBtn: document.getElementById('themeBtn')
        };

        this.saveTimeout = null;
        this.localStorageKey = 'yohaku_content';
        this.localStorageStyleKey = 'yohaku_style';
        this.themeKey = 'yohaku_theme';
        
        this.init();
    }

    init() {
        this.loadTheme();
        this.loadContent();
        this.bindEvents();
        this.observeStyleChanges();
    }

    loadTheme() {
        const savedTheme = localStorage.getItem(this.themeKey);
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(this.themeKey, newTheme);
        
        this.showStatus(newTheme === 'dark' ? 'Dark mode' : 'Light mode');
    }

    bindEvents() {
        this.elements.content.addEventListener('input', () => {
            this.scheduleSave();
            this.updateTitle();
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        this.saveToUrl();
                        break;
                    case 'q':
                        e.preventDefault();
                        this.showQrCode();
                        break;
                    case 'l':
                        e.preventDefault();
                        this.copyLink();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.toggleTheme();
                        break;
                }
            }
        });

        this.elements.closeQr.addEventListener('click', () => this.hideQrCode());
        this.elements.qrModal.querySelector('.modal-backdrop').addEventListener('click', () => this.hideQrCode());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideQrCode();
        });

        this.elements.helpBtn.addEventListener('click', () => {
            this.elements.helpPanel.classList.toggle('hidden');
        });

        this.elements.themeBtn.addEventListener('click', () => this.toggleTheme());

        document.addEventListener('click', (e) => {
            if (!this.elements.helpBtn.contains(e.target) && !this.elements.helpPanel.contains(e.target)) {
                this.elements.helpPanel.classList.add('hidden');
            }
        });

        window.addEventListener('hashchange', () => this.loadFromUrl());

        this.elements.content.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.elements.content.selectionStart;
                const end = this.elements.content.selectionEnd;
                const value = this.elements.content.value;
                this.elements.content.value = value.substring(0, start) + '\t' + value.substring(end);
                this.elements.content.selectionStart = this.elements.content.selectionEnd = start + 1;
                this.scheduleSave();
            }
        });
    }

    observeStyleChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style') {
                    this.scheduleSave();
                }
            });
        });

        observer.observe(this.elements.editor, {
            attributes: true,
            attributeFilter: ['style']
        });
    }

    compress(text) {
        try {
            const compressed = pako.deflate(text);
            return this.uint8ToBase64(compressed);
        } catch (e) {
            console.error('Compression error:', e);
            return null;
        }
    }

    decompress(base64) {
        try {
            const compressed = this.base64ToUint8(base64);
            const decompressed = pako.inflate(compressed);
            return new TextDecoder().decode(decompressed);
        } catch (e) {
            console.error('Decompression error:', e);
            return null;
        }
    }

    uint8ToBase64(uint8) {
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    base64ToUint8(base64) {
        base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        
        const binary = atob(base64);
        const uint8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            uint8[i] = binary.charCodeAt(i);
        }
        return uint8;
    }

    scheduleSave() {
        clearTimeout(this.saveTimeout);
        this.showStatus('Editing...');
        
        this.saveTimeout = setTimeout(() => {
            this.saveToUrl();
            this.saveToLocalStorage();
        }, 1000);
    }

    saveToUrl() {
        const text = this.elements.content.value;
        const style = this.elements.editor.getAttribute('style') || '';
        
        if (!text && !style) {
            history.replaceState(null, '', window.location.pathname);
            this.showStatus('Cleared');
            return;
        }

        const data = { t: text };
        if (style) data.s = style;

        const json = JSON.stringify(data);
        const compressed = this.compress(json);
        
        if (compressed) {
            history.replaceState(null, '', '#' + compressed);
            this.showStatus('Saved');
        } else {
            this.showStatus('Error saving');
        }
    }

    saveToLocalStorage() {
        const text = this.elements.content.value;
        const style = this.elements.editor.getAttribute('style') || '';
        
        localStorage.setItem(this.localStorageKey, text);
        if (style) {
            localStorage.setItem(this.localStorageStyleKey, style);
        } else {
            localStorage.removeItem(this.localStorageStyleKey);
        }
    }

    loadContent() {
        const hash = window.location.hash.slice(1);
        
        if (hash) {
            this.loadFromUrl();
        } else {
            this.loadFromLocalStorage();
        }
        
        this.updateTitle();
    }

    loadFromUrl() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;

        const json = this.decompress(hash);
        if (!json) {
            this.showStatus('Invalid data');
            return;
        }

        try {
            const data = JSON.parse(json);
            this.elements.content.value = data.t || '';
            
            if (data.s) {
                this.elements.editor.setAttribute('style', data.s);
            }
            
            this.saveToLocalStorage();
            this.updateTitle();
            this.showStatus('Loaded');
        } catch (e) {
            this.elements.content.value = json;
            this.saveToLocalStorage();
            this.updateTitle();
            this.showStatus('Loaded');
        }
    }

    loadFromLocalStorage() {
        const text = localStorage.getItem(this.localStorageKey);
        const style = localStorage.getItem(this.localStorageStyleKey);
        
        if (text) {
            this.elements.content.value = text;
        }
        
        if (style) {
            this.elements.editor.setAttribute('style', style);
        }
        
        if (text || style) {
            this.showStatus('Restored from local');
        }
    }

    updateTitle() {
        const text = this.elements.content.value;
        const firstLine = text.split('\n')[0];
        
        const match = firstLine.match(/^#\s+(.+)$/);
        if (match) {
            document.title = match[1] + ' — 余白';
        } else {
            document.title = '余白 yohaku';
        }
    }

    showStatus(message) {
        this.elements.statusText.textContent = message;
        this.elements.status.classList.add('visible');
        
        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            this.elements.status.classList.remove('visible');
        }, 2000);
    }

    async copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            this.showStatus('Link copied!');
        } catch (e) {
            const input = document.createElement('input');
            input.value = window.location.href;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            this.showStatus('Link copied!');
        }
    }

    showQrCode() {
        this.generateQrCode(window.location.href);
        this.elements.qrModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideQrCode() {
        this.elements.qrModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    generateQrCode(text) {
        const canvas = this.elements.qrCanvas;
        const ctx = canvas.getContext('2d');
        const size = 256;
        canvas.width = size;
        canvas.height = size;

        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, text, { width: size, margin: 2 });
        } else {
            this.loadQrLibrary().then(() => {
                if (typeof QRCode !== 'undefined') {
                    QRCode.toCanvas(canvas, text, { width: size, margin: 2 });
                } else {
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(0, 0, size, size);
                    ctx.fillStyle = '#e8e4dc';
                    ctx.font = '14px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('QR Code', size/2, size/2 - 10);
                    ctx.fillText('(library loading...)', size/2, size/2 + 10);
                }
            });
        }
    }

    loadQrLibrary() {
        return new Promise((resolve) => {
            if (typeof QRCode !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
            script.onload = () => {
                window.QRCode = {
                    toCanvas: (canvas, text, options) => {
                        const qr = qrcode(0, 'M');
                        qr.addData(text);
                        qr.make();
                        
                        const ctx = canvas.getContext('2d');
                        const size = options.width || 256;
                        const margin = options.margin || 2;
                        const cellCount = qr.getModuleCount();
                        const cellSize = (size - margin * 2) / cellCount;
                        
                        ctx.fillStyle = '#faf8f5';
                        ctx.fillRect(0, 0, size, size);
                        
                        ctx.fillStyle = '#1a1a2e';
                        for (let row = 0; row < cellCount; row++) {
                            for (let col = 0; col < cellCount; col++) {
                                if (qr.isDark(row, col)) {
                                    ctx.fillRect(
                                        margin + col * cellSize,
                                        margin + row * cellSize,
                                        cellSize,
                                        cellSize
                                    );
                                }
                            }
                        }
                    }
                };
                resolve();
            };
            script.onerror = () => resolve();
            document.head.appendChild(script);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TextareaEditor();
});
