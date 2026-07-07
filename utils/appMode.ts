// src/utils/appMode.ts

// Por defecto, la app arranca en modo LIVE por seguridad.
export const getAppMode = (): 'LIVE' | 'DEMO' => {
    return (localStorage.getItem('eba_app_mode') as 'LIVE' | 'DEMO') || 'LIVE';
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