import React, { useState } from 'react';
import { getAppMode, setAppMode } from '../utils/appMode';

export const ModeToggle: React.FC = () => {
    const [mode, setMode] = useState<'LIVE' | 'DEMO'>(getAppMode());

    const handleToggle = () => {
        const newMode = mode === 'LIVE' ? 'DEMO' : 'LIVE';
        
        // Medida de seguridad: Confirmación antes de cambiar
        const confirmMessage = newMode === 'DEMO' 
            ? "¿Seguro que quieres pasar a MODO PRUEBA? (Se mostrará un banner naranja en toda la app)" 
            : "¿Seguro que quieres activar el MODO LIVE? (Los permisos irán al servidor oficial de EBA)";
            
        if (window.confirm(confirmMessage)) {
            setAppMode(newMode);
            setMode(newMode);
            // Recargamos la app para que el banner y las variables tomen efecto inmediato
            window.location.reload(); 
        }
    };

    return (
        <div style={{ padding: '20px', border: '2px solid #e5e7eb', borderRadius: '8px', maxWidth: '300px', backgroundColor: '#f9fafb' }}>
            <h3 style={{ marginTop: 0, color: '#111827' }}>⚙️ Modo iTwoCX</h3>
            <p style={{ color: '#4b5563', marginBottom: '15px' }}>Estado actual: <strong style={{ color: mode === 'LIVE' ? '#16a34a' : '#ea580c' }}>{mode}</strong></p>
            <button 
                onClick={handleToggle}
                style={{
                    backgroundColor: mode === 'LIVE' ? '#dc2626' : '#16a34a',
                    color: 'white',
                    padding: '12px 20px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    width: '100%',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}
            >
                Cambiar a {mode === 'LIVE' ? 'DEMO' : 'LIVE'}
            </button>
        </div>
    );
};