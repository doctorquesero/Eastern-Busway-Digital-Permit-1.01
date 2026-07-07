import React, { useState, useEffect } from 'react';
import { getAppMode, setAppMode } from '../utils/appMode';

export const ModeToggle: React.FC = () => {
    const [isLive, setIsLive] = useState<boolean>(true);

    useEffect(() => {
        setIsLive(getAppMode() === 'LIVE');
    }, []);

    const handleToggle = () => {
        const newIsLive = !isLive;
        
        const confirmMessage = newIsLive 
            ? "Are you sure you want to activate LIVE MODE? (Data will be saved to the live database and synced to iTwoCX)" 
            : "Are you sure you want to switch to DEMO MODE? (Data will be saved to a separate test database and synced to the EB-DEMO iTwoCX project)";
            
        if (window.confirm(confirmMessage)) {
            setAppMode(newIsLive ? 'LIVE' : 'DEMO');
            setIsLive(newIsLive);
            window.location.reload();
        }
    };

    return (
        <div style={{ padding: '20px', border: '2px solid #e5e7eb', borderRadius: '8px', maxWidth: '350px', backgroundColor: '#f9fafb' }}>
            <h3 style={{ marginTop: 0, color: '#111827', fontWeight: 'bold' }}>System Data Mode</h3>
            <p style={{ color: '#4b5563', marginBottom: '15px', fontSize: '14px' }}>
                Current State: <strong style={{ color: isLive ? '#16a34a' : '#ea580c' }}>
                    {isLive ? 'LIVE MODE (Production)' : 'DEMO MODE (Testing)'}
                </strong>
            </p>
            <button 
                onClick={handleToggle}
                style={{
                    backgroundColor: isLive ? '#dc2626' : '#16a34a',
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
                SWITCH TO {isLive ? 'DEMO MODE' : 'LIVE MODE'}
            </button>
        </div>
    );
};