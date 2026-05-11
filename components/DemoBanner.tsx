// src/components/DemoBanner.tsx
import React from 'react';
import { getAppMode } from '../utils/appMode';

export const DemoBanner: React.FC = () => {
    const currentMode = getAppMode();

    // Si estamos en LIVE, la barra se vuelve invisible y no estorba
    if (currentMode === 'LIVE') return null;

    return (
        <div style={{
            backgroundColor: '#ea580c', // Naranja brillante de alerta
            color: 'white',
            textAlign: 'center',
            padding: '12px',
            fontWeight: '900',
            fontSize: '16px',
            position: 'relative',
            zIndex: 9999, // Asegura que esté por encima de todo
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            letterSpacing: '1px'
        }}>
            ⚠️ DEMO MODE ACTIVE - THESE PERMITS ARE NOT OFFICIAL ⚠️
        </div>
    );
};