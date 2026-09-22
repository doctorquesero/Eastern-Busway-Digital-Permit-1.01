// src/utils/appMode.ts

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