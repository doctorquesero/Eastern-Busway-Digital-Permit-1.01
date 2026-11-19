// src/utils/appMode.ts

// Deep links (e.g. emailed "Close permit" links) may carry ?mode=live|demo; apply it before any mode read.
if (typeof window !== 'undefined') {
    try {
        const requested = new URLSearchParams(window.location.search).get('mode')?.toUpperCase();
        if (requested === 'LIVE' || requested === 'DEMO') {
            localStorage.setItem('eba_app_mode', requested);
            const params = new URLSearchParams(window.location.search);
            params.delete('mode');
            const query = params.toString();
            window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
        }
    } catch {
        // storage unavailable: fall through to the default mode
    }
}

export const getAppMode = (): 'LIVE' | 'DEMO' => {
    const storedMode = localStorage.getItem('eba_app_mode') as 'LIVE' | 'DEMO' | null;
    if (storedMode === 'LIVE' || storedMode === 'DEMO') return storedMode;

    const hostname = window.location.hostname;
    const isLocalDevelopmentHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
    return isLocalDevelopmentHost ? 'DEMO' : 'LIVE';
};

export const setAppMode = (mode: 'LIVE' | 'DEMO') => {
    localStorage.setItem('eba_app_mode', mode);
};

// 🚀 ESTA ES LA MAGIA: Devuelve EB o EB-DEMO automáticamente
export const getProjectCode = (): string => {
    return getAppMode() === 'DEMO' ? 'EB-DEMO' : 'EB';
};

// Colección dual
export const getTargetCollection = (): string => {
    return getAppMode() === 'LIVE' ? 'permits' : 'permits_demo';
};