import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { getTargetCollection } from '../utils/appMode';
import PermitPDFLayout from '../components/PermitPDFLayout';
import HandheldSawPermitPDFLayout from '../components/HandheldSawPermitPDFLayout';
import { Permit, INITIAL_PART_A, INITIAL_PART_B, INITIAL_RECEIVER_CHECKLIST, INITIAL_HANDOVER_CHECKLIST } from '../types';

const CEASE_WORKS_ITEMS = [
    { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
    { id: '2', text: "If the methodology or site conditions change, work must stop..." },
    { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
    { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
];

const nonEmpty = <T,>(arr: unknown, fallback: T[]): T[] => (Array.isArray(arr) && arr.length > 0 ? (arr as T[]) : fallback);

// Public, no-login route. Display only: it renders the same PDF layout and exposes no actions.
const AuditPdfView: React.FC = () => {
    const { permitId } = useParams<{ permitId: string }>();
    const [permit, setPermit] = useState<Permit | null>(null);
    const [error, setError] = useState('');
    const pdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        if (!permitId) { setError('Missing permit reference.'); return; }
        getDoc(doc(db, getTargetCollection(), permitId))
            .then(snap => {
                if (cancelled) return;
                if (!snap.exists()) setError('Permit not found.');
                else setPermit({ ...(snap.data() as Permit), id: snap.id });
            })
            .catch(() => { if (!cancelled) setError('Unable to open this permit.'); });
        return () => { cancelled = true; };
    }, [permitId]);

    if (error) return <div className="p-10 text-center font-bold text-red-700">{error}</div>;
    if (!permit) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
    if (permit.permitType === 'handheld_saw') {
        return (
            <div className="bg-gray-200 min-h-screen overflow-x-auto py-4">
                <div className="bg-amber-100 border-b-2 border-amber-500 text-amber-900 text-center text-xs font-black uppercase p-2 mb-4">Audit copy — read only</div>
                <HandheldSawPermitPDFLayout permit={{ ...permit, id: permit.id || permitId || '' }} />
            </div>
        );
    }

    const handovers = Array.isArray(permit.handoverLogs) ? permit.handoverLogs : [];
    const last = handovers[handovers.length - 1];
    const receiverName = String((last ? last.receiverName : (permit.receiverName || permit.receiverSignature?.name)) || 'Unknown');

    return (
        <div className="bg-gray-200 min-h-screen overflow-x-auto py-4">
            <div className="bg-amber-100 border-b-2 border-amber-500 text-amber-900 text-center text-xs font-black uppercase p-2 mb-4">Audit copy — read only</div>
            <PermitPDFLayout
                permit={permit}
                pdfRef={pdfRef}
                currentReceiverName={receiverName}
                currentReceiverSignature={last ? last.signature : permit.receiverSignature}
                partAItems={nonEmpty(permit.partAChecklist, INITIAL_PART_A)}
                partBItems={nonEmpty(permit.partBChecklist, INITIAL_PART_B)}
                receiverItems={nonEmpty(permit.receiverChecklist, INITIAL_RECEIVER_CHECKLIST)}
                handoverItems={nonEmpty(permit.handoverChecklist, INITIAL_HANDOVER_CHECKLIST)}
                currentHandovers={handovers}
                CEASE_WORKS_ITEMS={CEASE_WORKS_ITEMS}
            />
        </div>
    );
};

export default AuditPdfView;
