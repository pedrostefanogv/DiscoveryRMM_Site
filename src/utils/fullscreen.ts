// Utilitário de fullscreen com fallbacks para browsers antigos (webkit/ms) e
// listener de mudança de estado (cobre Esc/API). Mantém a assinatura anterior
// (request/exit) e adiciona isFullscreen/toggle/onChange.
type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
};
type FullscreenDocument = Document & {
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

function requestNative(el: FullscreenElement): Promise<void> | void {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject(new Error('Fullscreen API não suportada'));
}

function exitNative(doc: FullscreenDocument): Promise<void> | void {
    if (doc.exitFullscreen) return doc.exitFullscreen();
    if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
    if (doc.msExitFullscreen) return doc.msExitFullscreen();
    return Promise.resolve();
}

export const fullscreenApi = {
    isFullscreen(): boolean {
        const doc = document as FullscreenDocument;
        return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
    },
    async request(el: HTMLElement): Promise<boolean> {
        try {
            await requestNative(el as FullscreenElement);
            return true;
        } catch {
            return false;
        }
    },
    async exit(): Promise<boolean> {
        try {
            await exitNative(document as FullscreenDocument);
            return true;
        } catch {
            return false;
        }
    },
    async toggle(el: HTMLElement): Promise<boolean> {
        if (this.isFullscreen()) return this.exit();
        return this.request(el);
    },
    onChange(cb: (isFullscreen: boolean) => void): () => void {
        const handler = () => cb(this.isFullscreen());
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
        return () => {
            document.removeEventListener('fullscreenchange', handler);
            document.removeEventListener('webkitfullscreenchange', handler);
        };
    },
};
