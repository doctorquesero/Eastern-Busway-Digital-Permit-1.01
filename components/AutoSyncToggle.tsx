import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Loader2 } from 'lucide-react';
import { getCurrentUserEmail } from '../services/cx';

export const AutoSyncToggle: React.FC = () => {
    const [enableCxSync, setEnableCxSync] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const currentUser = getCurrentUserEmail().toLowerCase();
    const isMaster = currentUser.includes('master') || currentUser.includes('dietrich') || currentUser.includes('eba-dt');

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const docRef = doc(db, 'settings', 'config');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setEnableCxSync(docSnap.data().enableCxSync !== false); // default true
                } else {
                    setEnableCxSync(true); // Default
                }
            } catch (e) {
                console.error("Error fetching config:", e);
                setEnableCxSync(true);
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleToggle = async () => {
        if (!isMaster) return alert("Access Denied: Master Clearance Required.");
        const newValue = !enableCxSync;
        
        const confirmMessage = newValue 
            ? "Are you sure you want to ENABLE Auto-Sync from iTwoCX?" 
            : "Are you sure you want to DISABLE Auto-Sync from iTwoCX? (Incoming webhooks will be ignored)";
            
        if (window.confirm(confirmMessage)) {
            setIsLoading(true);
            try {
                await setDoc(doc(db, 'settings', 'config'), { enableCxSync: newValue }, { merge: true });
                setEnableCxSync(newValue);
            } catch (e) {
                console.error("Error updating config:", e);
                alert("Failed to update auto-sync mode.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    if (isLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
    if (!isMaster) return null;

    return (
        <div style={{ padding: '20px', border: '2px solid #e5e7eb', borderRadius: '8px', maxWidth: '350px', backgroundColor: '#f9fafb' }}>
            <h3 style={{ marginTop: 0, color: '#111827', fontWeight: 'bold' }}>Auto-Sync from iTwoCX</h3>
            <p style={{ color: '#4b5563', marginBottom: '15px', fontSize: '14px' }}>
                Current State: <strong style={{ color: enableCxSync ? '#16a34a' : '#ea580c' }}>
                    {enableCxSync ? 'ENABLED' : 'DISABLED'}
                </strong>
            </p>
            <button 
                onClick={handleToggle}
                disabled={isLoading}
                style={{
                    backgroundColor: enableCxSync ? '#dc2626' : '#16a34a',
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
                {enableCxSync ? 'DISABLE AUTO-SYNC' : 'ENABLE AUTO-SYNC'}
            </button>
        </div>
    );
};
