import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Printer, Users, Briefcase, Lock, ImageIcon, CloudUpload, Loader2, Camera, AlertTriangle, Trash2, ShieldCheck, Info, CheckCircle, FileSignature, CloudOff } from 'lucide-react';
import { Permit, Signature, HandoverLog, DailySignOff, PermitPhoto, CeaseWorksRecord, CrewMember, INITIAL_PART_A, INITIAL_PART_B, INITIAL_RECEIVER_CHECKLIST, INITIAL_HANDOVER_CHECKLIST } from '../types';
import { getPermitById, savePermit } from '../services/storage';
import { submitPermitToCX, issuePermitToCX, getUserRole } from '../services/cx'; 
import SignaturePad from '../components/SignaturePad';
import PermitPDFLayout, { EmergencyProtocolContent } from '../components/PermitPDFLayout';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { uploadImageToStorage } from '../firebase'; 
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

interface PermitDetailProps { id: string; onBack: () => void; }

const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; const MAX_HEIGHT = 1000;
                let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};

const PermitDetail: React.FC<PermitDetailProps> = ({ id, onBack }) => {
    const [permit, setPermit] = useState<Permit | undefined>(getPermitById(id));
    
    const [activeTab, setActiveTab] = useState<'engineer' | 'receiver_checklist' | 'issuer' | 'approver' | 'crew' | 'daily' | 'handover' | 'photos' | 'notes' | 'closure'>('engineer');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    
    const sessionRole = getUserRole().toLowerCase();
    const isMaster = sessionRole.includes('master');
    const isApprover = sessionRole.includes('approver') || isMaster;
    const isReceiver = sessionRole.includes('receiver') || isMaster;
    const isIssuerRole = sessionRole.includes('issuer') || isMaster;

    const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyRecSig, setDailyRecSig] = useState<Signature | null>(null);
    const [dailyOpSig, setDailyOpSig] = useState<Signature | null>(null);
    const [dailySpotSig, setDailySpotSig] = useState<Signature | null>(null);
    const [newCrewDate, setNewCrewDate] = useState(new Date().toISOString().split('T')[0]);
    const [newCrewName, setNewCrewName] = useState('');
    const [newCrewRole, setNewCrewRole] = useState('Labour');
    const [handoverReceiver, setHandoverReceiver] = useState('');
    const [handoverSignature, setHandoverSignature] = useState<Signature | null>(null);
    const [handoverChecks, setHandoverChecks] = useState<Record<string, boolean>>({});
    const [closureReceiverName, setClosureReceiverName] = useState('');
    const [preClosureCheck1, setPreClosureCheck1] = useState(permit?.closureChecklistExcavationSafe || false);
    const [preClosureCheck2, setPreClosureCheck2] = useState(permit?.closureChecklistAsBuiltReturned || false);
    const [preClosureCheck3, setPreClosureCheck3] = useState(permit?.closureChecklistOutstandingWorks || false);
    const [outstandingWorks, setOutstandingWorks] = useState(permit?.closureOutstandingWorksDetails || '');
    const [photoCaption, setPhotoCaption] = useState('');
    const [otherNotes, setOtherNotes] = useState(permit?.otherNotes || '');
    const [ceaseItem, setCeaseItem] = useState<'1' | '2' | '3' | '4' | ''>('');
    const [ceaseAction, setCeaseAction] = useState<'resumed' | 'suspended' | 'cancelled' | ''>('');
    const [ceaseIssuerName, setCeaseIssuerName] = useState('');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const pdfExportRef = useRef<HTMLDivElement>(null);

    if (!permit) return <div className="p-12 text-center text-red-600 font-black">Permit Not Found.</div>;

    const isIssued = permit.status === 'issued'; 
    const isClosed = permit.status === 'closed';
    const isSuspended = permit.ceaseWorksRecord?.actionTaken === 'suspended';
    const isHydro = permit.excavationType === 'hydro' || permit.excavationType === 'hand';
    const hasApproverSigned = !!permit.approverSignature?.data;
    
    const isExecutionBlocked = isIssued && !isHydro && !hasApproverSigned && !isClosed && !isSuspended; 

    const currentHandovers = permit.handoverLogs || [];
    const activeSlotIndex = currentHandovers.length; 
    const currentReceiverName = String((currentHandovers.length > 0 ? currentHandovers[currentHandovers.length - 1].receiverName : permit.receiverSignature?.name) || 'Unknown'); 
    const currentReceiverSignature = currentHandovers.length > 0 ? currentHandovers[currentHandovers.length - 1].signature : permit.receiverSignature;

    useEffect(() => {
        if (!closureReceiverName && currentReceiverName !== 'Unknown') setClosureReceiverName(currentReceiverName);
    }, [currentReceiverName]);

    const partAItems = Array.isArray(permit.partAChecklist) && permit.partAChecklist.length > 0 ? permit.partAChecklist : INITIAL_PART_A;
    const receiverItems = Array.isArray(permit.receiverChecklist) && permit.receiverChecklist.length > 0 ? permit.receiverChecklist : INITIAL_RECEIVER_CHECKLIST;
    const partBItems = Array.isArray(permit.partBChecklist) && permit.partBChecklist.length > 0 ? permit.partBChecklist : INITIAL_PART_B;
    const handoverItems = Array.isArray(permit.handoverChecklist) && permit.handoverChecklist.length > 0 ? permit.handoverChecklist : INITIAL_HANDOVER_CHECKLIST;

    const allHandoverChecksPassed = handoverItems.every(item => handoverChecks[item.id]);
    const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 shadow-sm";

    const syncToFirebase = async (updatedPermit: Permit) => {
        savePermit(updatedPermit); setPermit(updatedPermit);
        try { await setDoc(doc(db, 'permits', updatedPermit.id), updatedPermit, { merge: true }); } catch (e) { console.error(e); }
    };

    const updateField = (field: keyof Permit, value: any) => {
        if (isClosed || (isIssued && ['location', 'excavationType', 'scopeOfWorks', 'siteEngineerSignature', 'receiverSignature'].includes(field))) return;
        syncToFirebase({ ...permit, [field]: value } as Permit);
    };

    const updateChecklist = (listName: 'partAChecklist' | 'receiverChecklist' | 'partBChecklist', itemId: string, field: 'answer' | 'comment', value: string) => {
        if (isClosed) return;
        if (isIssued && (listName === 'partAChecklist' || listName === 'receiverChecklist')) return; 
        
        let currentList = listName === 'partAChecklist' ? partAItems : (listName === 'receiverChecklist' ? receiverItems : partBItems);
        const updatedList = currentList.map(item => item.id === itemId ? { ...item, [field]: value } : item);
        syncToFirebase({ ...permit, [listName]: updatedList } as Permit);
    };

    const handleIssuePermit = async () => {
        if (!permit.siteEngineerSignature || !permit.receiverSignature || !permit.issuerSignature) {
            alert("🛑 CANNOT ISSUE:\n\nEngineer, Receiver, and Issuer signatures are required before issuing to the field."); return;
        }
        if (!isIssuerRole) { alert("Only an authorized Issuer can execute this action."); return; }

        const isConfirmed = confirm("Are you sure you want to ISSUE this permit? \n\nThis will LOCK Part A and Receiver checklists and activate the permit for the site crew.");
        if (!isConfirmed) return;

        setIsSubmitting(true);
        try {
            const updated = { ...permit, isDraft: false, status: 'issued' } as Permit;
            await syncToFirebase(updated);
            
            try {
                await issuePermitToCX(updated);
                await syncToFirebase({ ...updated, cxSyncPending: null, cxSyncError: null } as any);
            } catch (cxError: any) {
                console.error("CX Sync Error (Silent):", cxError);
                await syncToFirebase({ ...updated, cxSyncPending: 'issue', cxSyncError: cxError.message } as any);
            }
            
            alert("✅ PERMIT ISSUED TO SITE!\n\nThe status is now 'ISSUED'. Tabs 1, 2, and 3 are locked.");
            
        } catch (error: any) {
            alert(`🛑 CRITICAL ERROR: Could not save to Firebase. Please check your connection.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproverSign = async (sig: Signature) => {
        if (!isApprover) { alert(`🛑 ACTION DENIED:\n\nOnly an official Permit Approver can sign this section.`); return; }
        syncToFirebase({ ...permit, approverSignature: sig } as Permit);
    };

    const handleSaveDailyLog = async () => {
        if (isClosed || !dailyDate || !dailyRecSig || !dailyOpSig || !dailySpotSig) { alert("Missing signatures or Permit is Closed."); return; }
        const newLog: DailySignOff = { id: crypto.randomUUID(), date: dailyDate, receiverSig: dailyRecSig, excavatorSig: dailyOpSig, spotterSig: dailySpotSig };
        syncToFirebase({ ...permit, dailyLogs: [...(permit.dailyLogs || []), newLog] } as Permit);
        setDailyRecSig(null); setDailyOpSig(null); setDailySpotSig(null); 
    };

    const handleRegisterCrew = async (sig: Signature) => {
        if (isClosed || !newCrewName.trim()) return;
        const newMember: CrewMember = { id: crypto.randomUUID(), name: newCrewName, role: newCrewRole, signature: sig, dateInducted: new Date(newCrewDate + 'T08:00:00').toISOString() };
        syncToFirebase({ ...permit, crewMembers: [...(permit.crewMembers || []), newMember] } as Permit);
        setNewCrewName('');
    };

    const finalizeHandover = async () => {
        if (isClosed || !handoverReceiver || !handoverSignature) return;
        if (!isReceiver) { alert("Only an official Receiver can accept a handover."); return; }
        if (currentHandovers.length >= 7) { alert("Max handovers reached."); return; }
        const newHandover: HandoverLog = { id: crypto.randomUUID(), date: new Date().toISOString(), receiverName: handoverReceiver, signature: handoverSignature, initial: handoverSignature };
        syncToFirebase({ ...permit, handoverLogs: [...currentHandovers, newHandover] } as Permit);
        setHandoverReceiver(''); setHandoverSignature(null); setHandoverChecks({});
    };

    const handleAutomatedCloseAndLodge = async () => {
        if (isExecutionBlocked) { alert("🛑 ERROR: The permit cannot be closed because Part B has not been approved by the Permit Approver."); return; }
        let errors = [];
        if (!preClosureCheck1 && !preClosureCheck3) errors.push("Closure: Select 'Safe' or 'Outstanding'");
        if (preClosureCheck3 && !outstandingWorks.trim()) errors.push("Closure: Detail outstanding works");
        if (!isReceiver) errors.push("You do not have 'Receiver' permissions to close this permit.");
        if (closureReceiverName.trim().toLowerCase() !== currentReceiverName.trim().toLowerCase()) errors.push(`Name must match the active receiver: ${currentReceiverName}`);
        
        if (errors.length > 0) { alert(`🛑 ERRORS:\n\n${errors.join('\n')}`); return; }
        if (!confirm(`🛑 CRITICAL ACTION:\nYou are about to close this permit and finalize the job. Confirm?`)) return;
        
        setIsSubmitting(true);
        const finalNotes = (otherNotes || '') + `\n\n--- SYSTEM AUDIT ---\n* Closed by: Firebase Authenticated Receiver\n* Timestamp: ${new Date().toLocaleString()}`;

        let updatedPermit: Permit = { 
            ...permit, status: 'closed', closureSignature: currentReceiverSignature, closureReceiverName: currentReceiverName, 
            closureDate: new Date().toISOString(), closureChecklistExcavationSafe: preClosureCheck1, closureChecklistAsBuiltReturned: preClosureCheck2, 
            closureChecklistOutstandingWorks: preClosureCheck3, closureOutstandingWorksDetails: outstandingWorks, otherNotes: finalNotes
        };
        
        await syncToFirebase(updatedPermit);
        setOtherNotes(finalNotes);
        
        try {
            if (pdfExportRef.current) {
                await new Promise(resolve => setTimeout(resolve, 800)); 
                const pages = pdfExportRef.current.querySelectorAll('.pdf-page');
                const pdf = new jsPDF('p', 'mm', 'a4');
                for (let i = 0; i < pages.length; i++) {
                    if (i > 0) pdf.addPage();
                    const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297);
                }
                const rawNumber = String(updatedPermit.itwocxNumber || updatedPermit.permitNumber || "").replace(/\D/g, "");
                const pdfBase64 = pdf.output('datauristring').split(',')[1];

                try {
                    const storage = getStorage();
                    const pdfRef = ref(storage, `pdf_backups/PF${rawNumber}_${new Date().getTime()}.pdf`);
                    await uploadString(pdfRef, pdfBase64, 'base64', { contentType: 'application/pdf' });
                    const downloadUrl = await getDownloadURL(pdfRef);
                    updatedPermit = { ...updatedPermit, pdfBackupUrl: downloadUrl } as any;
                    await syncToFirebase(updatedPermit);
                } catch (storageError) {
                    console.error("Backup PDF Error (Silent):", storageError);
                }
                
                try {
                    await submitPermitToCX({ ...updatedPermit, itwocxNumber: rawNumber, issuerSignature: { data: `data:application/pdf;base64,${pdfBase64}` } }, `EB_Permit_PF${rawNumber}_${new Date().getTime()}.pdf`);
                    await syncToFirebase({ ...updatedPermit, cxSyncPending: null, cxSyncError: null } as any);
                } catch (cxError: any) {
                    console.error("CX Lodge Error (Silent):", cxError);
                    await syncToFirebase({ ...updatedPermit, cxSyncPending: 'closure', cxSyncError: cxError.message } as any);
                }
                
                alert(`🎉 SUCCESS!\nPermit successfully closed and saved.`);
            }
        } catch (error: any) { 
            alert(`⚠️ PDF GENERATION FAILED:\n${error.message}\n\nThe permit is saved locally and closed.`); 
        } finally { setIsSubmitting(false); }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isClosed || !e.target.files || e.target.files.length === 0 || !permit) return;
        setIsUploadingPhoto(true); 
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImage(file); 
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, `detail_${permit.itwocxNumber}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`);
            const newPhoto: PermitPhoto = { id: crypto.randomUUID(), url: cloudUrl, caption: photoCaption || file.name, uploadedBy: 'User', date: new Date().toISOString() };
            syncToFirebase({ ...permit, photos: [...(permit.photos || []), newPhoto] } as Permit);
            setPhotoCaption(''); 
        } catch (err) { alert("Error uploading photo to cloud."); } finally { setIsUploadingPhoto(false); e.target.value = ''; }
    };

    // 🚀 FIXED: CEASE WORKS EMERGENCY CLOSURE - USANDO TÉRMINOS SEGUROS
    const handleCeaseWorksSave = async (sig: Signature) => {
        if (isClosed || !permit || !ceaseItem || !ceaseAction || !ceaseIssuerName) { alert("Fill all fields."); return; }

        const isConfirmed = confirm("🚨 EXECUTING CEASE WORKS PROTOCOL\n\nIf you proceed, this permit will be permanently locked and synchronized with iTwoCX as CLOSED. The reasons for the stoppage will be permanently attached. Do you wish to proceed?");
        if (!isConfirmed) return;

        setIsSubmitting(true);
        try {
            const newRecord: CeaseWorksRecord = { id: crypto.randomUUID(), date: new Date().toISOString(), issuerName: ceaseIssuerName, issuerSignature: sig, affectedItemNumber: ceaseItem as any, actionTaken: ceaseAction as any };
            let updatedPermit = { ...permit, ceaseWorksRecord: newRecord };

            if (ceaseAction === 'cancelled') { 
                // 🧠 Diccionario de razones
                const ceaseReasons: Record<string, string> = {
                    '1': "Unidentified service or archaeological items encountered (Strike).",
                    '2': "Methodology or site conditions changed.",
                    '3': "Change in foreman, excavator operator or spotter.",
                    '4': "Asbestos or other contaminates encountered."
                };
                const reasonText = ceaseReasons[ceaseItem] || "Emergency Protocol Triggered";

                // 🚨 Términos seguros ("CLOSED", "EMERGENCY CLOSED") que no alteran el WAF
                updatedPermit.status = 'closed'; 
                updatedPermit.closureDate = new Date().toISOString(); 
                updatedPermit.closureReceiverName = `EMERGENCY CLOSED (${ceaseIssuerName})`;
                updatedPermit.closureSignature = sig; 
                
                updatedPermit.closureChecklistExcavationSafe = false;
                updatedPermit.closureChecklistOutstandingWorks = true;
                updatedPermit.closureOutstandingWorksDetails = `🚨 PERMIT CLOSED DUE TO CEASE WORKS PROTOCOL.\nReason: ${reasonText}`;
                
                updatedPermit.otherNotes = (updatedPermit.otherNotes || '') + `\n\n🚨 EMERGENCY CLOSED VIA CEASE WORKS PROTOCOL by ${ceaseIssuerName}. Reason: ${reasonText}`;
            }
            
            await syncToFirebase(updatedPermit as Permit);

            // 🚀 SINCRONIZACIÓN AUTOMÁTICA CON CX (Con alertas correctas)
            if (ceaseAction === 'cancelled') {
                if (pdfExportRef.current) {
                    await new Promise(resolve => setTimeout(resolve, 800)); 
                    const pages = pdfExportRef.current.querySelectorAll('.pdf-page');
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    for (let i = 0; i < pages.length; i++) {
                        if (i > 0) pdf.addPage();
                        const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
                        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297);
                    }
                    const rawNumber = String(updatedPermit.itwocxNumber || updatedPermit.permitNumber || "").replace(/\D/g, "");
                    const pdfBase64 = pdf.output('datauristring').split(',')[1];

                    // Backup PDF to Storage
                    try {
                        const storage = getStorage();
                        const pdfRef = ref(storage, `pdf_backups/PF${rawNumber}_EMERGENCY_CLOSED_${new Date().getTime()}.pdf`);
                        await uploadString(pdfRef, pdfBase64, 'base64', { contentType: 'application/pdf' });
                        const downloadUrl = await getDownloadURL(pdfRef);
                        updatedPermit = { ...updatedPermit, pdfBackupUrl: downloadUrl } as any;
                        await syncToFirebase(updatedPermit as Permit);
                    } catch (storageError) {
                        console.error("Backup PDF Error (Silent):", storageError);
                    }
                    
                    // Submit to CX
                    try {
                        await submitPermitToCX({ ...updatedPermit, itwocxNumber: rawNumber, issuerSignature: { data: `data:application/pdf;base64,${pdfBase64}` } }, `EB_Permit_PF${rawNumber}_EMERGENCY_CLOSED_${new Date().getTime()}.pdf`);
                        await syncToFirebase({ ...updatedPermit, cxSyncPending: null, cxSyncError: null } as any);
                        
                        // 🟢 Cartel de éxito AHORA SÍ solo sale si no hay error
                        alert("🚨 PROTOCOL COMPLETE: Permit gracefully Closed and Synchronized with iTwoCX.");
                    } catch (cxError: any) {
                        console.error("CX Lodge Error:", cxError);
                        await syncToFirebase({ ...updatedPermit, cxSyncPending: 'closure', cxSyncError: cxError.message } as any);
                        
                        // 🔴 Cartel de alerta si falla el firewall
                        alert(`⚠️ ALERT: Permit was saved locally, but CX Sync Failed.\n\nError: ${cxError.message}`);
                    }
                }
            } else {
                alert("Cease Works record updated (Suspended).");
                setCeaseItem(''); setCeaseAction(''); setCeaseIssuerName(''); 
            }
        } catch (error: any) {
            alert(`⚠️ PROTOCOL FAILED:\n${error.message}`); 
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {isSubmitting && (
                <div className="fixed inset-0 z-[9999] bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-white px-4">
                    <Loader2 size={80} className="animate-spin text-blue-500 mb-6" />
                    <h2 className="text-3xl font-black uppercase tracking-widest text-center">Processing...</h2>
                    <p className="text-gray-300 mt-4 text-center text-lg font-bold">Please do not close the application.</p>
                    <p className="text-gray-400 mt-2 text-center text-sm">Generating PDF and syncing with servers...</p>
                </div>
            )}

            <div className="max-w-6xl mx-auto pb-12 mt-6 print:hidden relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={onBack} className="text-gray-500 font-bold flex items-center gap-1"><ArrowLeft size={16}/> Back to Register</button>
                    <button onClick={() => window.print()} className="bg-gray-900 text-white px-5 py-2 rounded-xl font-bold shadow-lg flex items-center gap-2"><Printer size={18}/> Print Copy</button>
                </div>

                <div className="bg-white rounded-t-2xl border border-gray-200 p-6 md:p-8 flex justify-between shadow-sm items-center relative">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 uppercase mb-2">PF#{String(permit.itwocxNumber || permit.permitNumber).replace(/\D/g, "")}</h1>
                        <div className="flex flex-col md:flex-row md:items-center text-xs text-gray-500 font-bold uppercase tracking-widest gap-2 md:gap-4"><span className="bg-gray-100 px-2 py-1 rounded text-gray-900 w-fit">{permit.location || 'No Location'}</span><span>Active Receiver: <span className="text-blue-700">{currentReceiverName}</span></span></div>
                    </div>
                    <div className={`px-6 py-3 rounded-xl text-sm font-black uppercase text-white h-fit shadow-md ${permit.status === 'closed' ? 'bg-red-600' : (permit.isDraft ? 'bg-orange-500 animate-pulse' : (isExecutionBlocked ? 'bg-amber-500' : 'bg-green-600'))}`}>
                        {permit.status === 'closed' ? 'CLOSED' : (permit.isDraft ? 'DRAFT (Building)' : (isExecutionBlocked ? 'PENDING APPROVAL' : 'ISSUED / ACTIVE'))}
                    </div>
                </div>

                {isMaster && (permit as any).cxSyncPending && (
                    <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-3 mt-4 text-sm font-bold flex justify-between items-center gap-2 shadow-inner">
                        <div className="flex items-center gap-2">
                            <CloudOff size={18} className="shrink-0"/>
                            <span><strong>ADMIN ALERT:</strong> CX Sync Failed ({(permit as any).cxSyncPending === 'issue' ? 'Emission' : 'Closure'}). <span className="font-normal">Error: {(permit as any).cxSyncError || 'Unknown'}</span></span>
                        </div>
                    </div>
                )}

                {isExecutionBlocked && <div className="bg-amber-100 text-amber-800 p-4 text-center font-black uppercase tracking-widest border-b-4 border-amber-300 mt-4">⚠️ Mechanical Work Pending. Awaiting Permit Approver to sign Part B.</div>}

                <div className="flex border-b-4 border-gray-100 bg-white sticky top-0 z-40 shadow-sm overflow-x-auto hide-scrollbar mt-4">
                    <button onClick={() => setActiveTab('engineer')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'engineer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Engineer {isIssued && <Lock size={12}/>}</button>
                    <button onClick={() => setActiveTab('receiver_checklist')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'receiver_checklist' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Receiver Checklist {isIssued && <Lock size={12}/>}</button>
                    <button onClick={() => setActiveTab('issuer')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'issuer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Issuer {isIssued && <CheckCircle size={14} className="text-green-500"/>}</button>
                    
                    {!isHydro && (
                        <button onClick={() => setActiveTab('approver')} disabled={permit.isDraft} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft ? 'opacity-30 cursor-not-allowed' : (activeTab === 'approver' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50')}`}>Approver {hasApproverSigned && <Lock size={12}/>}</button>
                    )}
                    
                    <button onClick={() => setActiveTab('crew')} disabled={permit.isDraft} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft ? 'opacity-30 cursor-not-allowed' : (activeTab === 'crew' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50')}`}>Crew Registration</button>
                    <button onClick={() => setActiveTab('daily')} disabled={permit.isDraft} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft ? 'opacity-30 cursor-not-allowed' : (activeTab === 'daily' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50')}`}>Daily Sign On</button>
                    <button onClick={() => setActiveTab('handover')} disabled={permit.isDraft} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft ? 'opacity-30 cursor-not-allowed' : (activeTab === 'handover' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50')}`}>Handovers</button>
                    <button onClick={() => setActiveTab('photos')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'photos' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Photos</button>
                    <button onClick={() => setActiveTab('notes')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'notes' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Notes</button>
                    <button onClick={() => setActiveTab('closure')} disabled={permit.isDraft || isExecutionBlocked} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft || isExecutionBlocked ? 'opacity-30 cursor-not-allowed' : (activeTab === 'closure' ? 'text-red-700 border-b-4 border-red-600 bg-red-50' : 'text-gray-400 hover:bg-gray-50')}`}>Closure</button>
                </div>

                <div className="bg-white shadow-xl border p-4 md:p-8 min-h-[600px] relative">
                    
                    <div className={activeTab === 'engineer' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Engineer (Part A)</h3>
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 4/12</span>
                        </div>
                        {isIssued && <div className="bg-gray-100 text-gray-600 p-3 rounded-lg mb-6 text-sm font-bold flex items-center gap-2"><Lock size={16}/> This planning section is locked because the permit has been issued.</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Work Location</p><input type="text" className={inputClass} value={permit.location} onChange={e => updateField('location', e.target.value)} disabled={isIssued || isClosed} /></div>
                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Excavation Type</p><select className={inputClass} value={permit.excavationType} onChange={e => updateField('excavationType', e.target.value)} disabled={isIssued || isClosed}><option value="mechanical">Mechanical Excavation</option><option value="hydro">Hydro Excavation</option><option value="hand">Hand Digging</option></select></div>
                            <div className="md:col-span-2 border-t pt-4 mt-2"><p className="text-xs text-gray-500 font-bold uppercase mb-2">Scope of Works</p><textarea className={`${inputClass} h-20`} value={permit.scopeOfWorks} onChange={e => updateField('scopeOfWorks', e.target.value)} disabled={isIssued || isClosed}></textarea></div>
                        </div>

                        <div className="space-y-4 mb-10 border-b border-gray-100 pb-10">
                            {partAItems.map(item => (
                                <div key={item.id} className="flex flex-col md:flex-row gap-4 border-b border-gray-100 pb-4 last:border-0">
                                    <div className="flex-1"><span className="font-black text-blue-600 mr-2">{String(item.id).replace(/[a-z]/g, '')}.</span><span className="text-sm font-bold text-gray-800 leading-relaxed">{item.question}</span></div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-80 shrink-0">
                                        <select className={inputClass + " sm:w-24"} value={item.answer || ''} onChange={(e) => updateChecklist('partAChecklist', item.id, 'answer', e.target.value)} disabled={isIssued || isClosed}><option value="">- PEND -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></select>
                                        <input type="text" placeholder="Comment..." className={inputClass + " flex-1"} value={item.comment || ''} onChange={(e) => updateChecklist('partAChecklist', item.id, 'comment', e.target.value)} disabled={isIssued || isClosed} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                            <div className="bg-gray-50 p-6 rounded-2xl border shadow-sm">
                                <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-gray-500 border-b pb-2">Site Engineer Signature</p>
                                {permit.siteEngineerSignature && isIssued ? (
                                    <div className="text-center"><img src={permit.siteEngineerSignature.data} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase">{permit.siteEngineerSignature.name}</p></div>
                                ) : (
                                    <SignaturePad label="Sign here" onSave={(sig) => updateField('siteEngineerSignature', sig)} initialValue={permit.siteEngineerSignature} />
                                )}
                            </div>
                            
                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200 shadow-sm relative">
                                <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-blue-800 border-b border-blue-200 pb-2">Receiver Initial Signature (Induction)</p>
                                {permit.receiverSignature && isIssued ? (
                                    <div className="text-center"><img src={permit.receiverSignature.data} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase text-blue-900">{permit.receiverSignature.name}</p></div>
                                ) : (
                                    <SignaturePad label="Sign here" onSave={(sig) => updateField('receiverSignature', sig)} initialValue={permit.receiverSignature} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={activeTab === 'receiver_checklist' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Receiver Checklist</h3>
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 6/12</span>
                        </div>
                        {isIssued && <div className="bg-gray-100 text-gray-600 p-3 rounded-lg mb-6 text-sm font-bold flex items-center gap-2"><Lock size={16}/> This pre-work checklist is locked because the permit has been issued.</div>}

                        {isHydro ? (
                            <div className="bg-blue-50 border-4 border-blue-200 p-10 rounded-[2rem] text-center mb-8 shadow-inner animate-fade-in">
                                <Info size={48} className="mx-auto mb-4 text-blue-500" />
                                <h3 className="text-xl font-black text-blue-800 uppercase mb-2">Excavation is Hydro / Hand</h3>
                                <p className="text-blue-700 font-medium">Mechanical checklist is not applicable. Please review Part A in the Engineer tab, ensuring the induction is signed, then proceed to the execution tabs.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 mb-10">
                                <p className="text-red-600 font-bold text-xs bg-red-50 p-3 rounded-lg border border-red-100 uppercase mb-6">Checks to be made BEFORE mechanical digging (Editable by Receiver).</p>
                                {receiverItems.map(item => (
                                    <div key={item.id} className="flex flex-col md:flex-row gap-4 border-b border-gray-100 pb-4 last:border-0">
                                        <div className="flex-1"><span className="font-black text-blue-600 mr-2">{item.id}.</span><span className="text-sm font-bold text-gray-800">{item.question}</span></div>
                                        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-80 shrink-0">
                                            <select className={inputClass + " sm:w-24"} value={item.answer || ''} onChange={(e) => updateChecklist('receiverChecklist', item.id, 'answer', e.target.value)} disabled={isIssued || isClosed}><option value="">- PEND -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></select>
                                            <input type="text" placeholder="Comment..." className={inputClass + " flex-1"} value={item.comment || ''} onChange={(e) => updateChecklist('receiverChecklist', item.id, 'comment', e.target.value)} disabled={isIssued || isClosed} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={activeTab === 'issuer' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Issuer Final Checks</h3>
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 3/12</span>
                        </div>
                        
                        <div className="bg-blue-800 text-white p-3 rounded-t-xl font-black text-sm uppercase text-center">Issuer Verification Checks</div>
                        <div className="border-2 border-blue-800 border-t-0 rounded-b-xl overflow-hidden divide-y divide-gray-100 mb-10">
                            {[ 
                                { key: 'knownServicesScanned', label: 'Has the area for this permit been scanned?' }, 
                                { key: 'servicesMarked', label: 'Known active services physically marked out on site?' }, 
                                { key: 'potholingMarkers', label: 'If potholing, got depth markers for holes when back filling?' }, 
                                { key: 'transpowerDesignation', label: 'Work within Transpower Designation Area & S176 in place?' }, 
                                { key: 'watercareWorksOver', label: 'Complied with Watercare\'s "Works Over Approval" form...' } 
                            ].map((q) => (
                                <div key={q.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white gap-3">
                                    <span className="font-bold text-sm text-gray-800 w-full sm:w-2/3">{q.label} *</span>
                                    <div className="flex space-x-3 w-full sm:w-1/3 sm:justify-end">
                                        {(['yes', 'no', 'n/a'] as const).map(opt => (
                                            <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                                                <input type="radio" checked={permit[q.key as keyof Permit] === opt} onChange={() => updateField(q.key as keyof Permit, opt)} disabled={isIssued || isClosed} className="h-5 w-5 text-blue-600" />
                                                <span className="uppercase text-xs font-black text-gray-600">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="max-w-xl mx-auto border-2 border-green-500 p-8 rounded-2xl bg-green-50 shadow-md text-center">
                            <h4 className="font-black uppercase text-green-900 mb-6 tracking-widest text-lg">Finalize & Issue to Field</h4>
                            {permit.issuerSignature && isIssued ? (
                                <div className="animate-fade-in">
                                    <div className="text-center bg-white p-4 rounded-xl shadow-inner mb-4"><img src={permit.issuerSignature.data} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase">{permit.issuerSignature.name}</p></div>
                                    <div className="bg-green-600 text-white p-3 rounded-lg font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg"><CheckCircle size={20}/> PERMIT ISSUED TO SITE (LOCKED)</div>
                                    <p className="text-xs text-gray-500 mt-3 font-bold">Tabs 1, 2, and 3 are now locked.</p>
                                </div>
                            ) : (
                                <div>
                                    <SignaturePad label="Issuer Signature" onSave={(sig) => updateField('issuerSignature', sig)} initialValue={permit.issuerSignature} />
                                    <button onClick={handleIssuePermit} disabled={isSubmitting} className={`mt-8 w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-green-600 text-white shadow-xl hover:bg-green-700 hover:scale-[1.02]'}`}>
                                        {isSubmitting ? <Loader2 size={28} className="animate-spin" /> : <FileSignature size={28} />}
                                        {isSubmitting ? 'ISSUING...' : 'ISSUE PERMIT (LOCK PLANNING & DRAFT)'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {!isHydro && (
                        <div className={activeTab === 'approver' ? 'block animate-fade-in' : 'hidden'}>
                            <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                <h3 className="font-black text-xl text-blue-900 uppercase">Approver (Part B)</h3>
                                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 5/12</span>
                            </div>
                            
                            <div className="animate-fade-in filter">
                                <p className="text-red-600 font-black text-sm mb-6 bg-red-50 p-3 rounded-lg border border-red-100 uppercase flex items-center gap-2"><ShieldCheck size={18}/> Permit Approver MUST attend site before starting any mechanical excavation.</p>
                                
                                <div className="space-y-4 mb-8">
                                    {partBItems.map(item => (
                                        <div key={item.id} className="flex flex-col md:flex-row gap-4 border-b border-gray-100 pb-4 last:border-0">
                                            <div className="flex-1"><span className="font-black text-blue-600 mr-2">{item.id}.</span><span className="text-sm font-bold text-gray-800 leading-relaxed">{item.question}</span></div>
                                            <div className="w-full md:w-40 shrink-0"><select className={inputClass} value={item.answer || ''} onChange={(e) => updateChecklist('partBChecklist', item.id, 'answer', e.target.value)} disabled={hasApproverSigned || isClosed}><option value="">- PENDING -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></select></div>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-blue-50 p-8 rounded-2xl border-2 border-blue-200 mt-8 max-w-md mx-auto shadow-md">
                                    <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest text-center mb-6 border-b border-blue-200 pb-2">Permit Approver Signature</h4>
                                    {hasApproverSigned ? (
                                        <div className="text-center bg-white p-6 rounded-xl border-2 border-green-500 shadow-inner">
                                            <img src={permit.approverSignature!.data} className="h-16 mx-auto mix-blend-multiply mb-2" alt="sig" />
                                            <p className="font-black uppercase text-gray-900 text-xs">{permit.approverSignature!.name}</p>
                                            <div className="bg-green-600 text-white px-4 py-3 mt-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"><ShieldCheck size={20} /> Mechanical Approved</div>
                                        </div>
                                    ) : (
                                        <SignaturePad label="Approver Name" onSave={handleApproverSign} />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={activeTab === 'crew' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Crew Registration</h3>
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 9/12</span>
                        </div>
                        {!isClosed && (
                            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Name</label><input type="text" className={inputClass} value={newCrewName} onChange={e => setNewCrewName(e.target.value)} placeholder="Full Name" /></div>
                                <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Role</label><select className={inputClass} value={newCrewRole} onChange={e => setNewCrewRole(e.target.value)}><option value="Labour">Labour</option><option value="Operator">Operator</option><option value="Spotter">Spotter</option><option value="Foreman">Foreman</option></select></div>
                                <div className={!newCrewName ? 'opacity-30 pointer-events-none' : ''}><SignaturePad label="Sign & Add to Crew" onSave={handleRegisterCrew} externalName={newCrewName} /></div>
                            </div>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner">
                            <table className="min-w-full text-sm"><thead className="bg-gray-100 text-gray-700 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200"><tr><th className="p-4 text-left">Date</th><th className="p-4 text-left">Name</th><th className="p-4 text-left">Role</th><th className="p-4 text-center">Signature</th></tr></thead><tbody className="divide-y divide-gray-100">{(permit.crewMembers || []).map(m => (<tr key={m.id} className="hover:bg-gray-50 transition-colors"><td className="p-4 font-mono text-xs text-gray-500">{m.dateInducted ? new Date(m.dateInducted).toLocaleDateString() : 'N/A'}</td><td className="p-4 font-black uppercase text-gray-900">{m.name}</td><td className="p-4 font-bold text-blue-800 text-xs uppercase bg-blue-50 rounded px-2">{m.role}</td><td className="p-4">{m.signature?.data && <img src={m.signature.data} className="h-6 mx-auto mix-blend-multiply" />}</td></tr>))}</tbody></table>
                        </div>
                    </div>

                    <div className={activeTab === 'daily' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Daily Sign On</h3>
                        </div>
                        {!isClosed && (
                            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Date</label><input type="date" className={inputClass} value={dailyDate} onChange={e => setDailyDate(e.target.value)} /></div>
                                <div><SignaturePad label="Receiver Sig" onSave={setDailyRecSig} /></div>
                                <div><SignaturePad label="Operator Sig" onSave={setDailyOpSig} /></div>
                                <div><SignaturePad label="Spotter Sig" onSave={setDailySpotSig} /></div>
                                <div className="md:col-span-4 border-t pt-4"><button onClick={handleSaveDailyLog} className="w-full bg-blue-800 hover:bg-blue-900 text-white py-4 rounded-xl font-black uppercase shadow-md flex items-center justify-center gap-2"><CheckCircle size={20}/> Save Daily Sign-off</button></div>
                            </div>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner">
                            <table className="min-w-full text-xs text-center"><thead className="bg-gray-100 text-gray-700 uppercase font-black tracking-widest"><tr><th className="p-4 border-r">Date</th><th className="p-4 border-r">Receiver</th><th className="p-4 border-r">Operator</th><th className="p-4">Spotter</th></tr></thead><tbody className="divide-y divide-gray-100">{(permit.dailyLogs || []).map(log => (<tr key={log.id} className="hover:bg-gray-50 transition-colors"><td className="p-4 font-mono text-gray-600 border-r">{log.date}</td><td className="p-4 border-r">{log.receiverSig?.data ? <img src={log.receiverSig.data} className="h-8 mx-auto mix-blend-multiply" /> : 'N/A'}</td><td className="p-4 border-r">{log.excavatorSig?.data ? <img src={log.excavatorSig.data} className="h-8 mx-auto mix-blend-multiply" /> : 'N/A'}</td><td className="p-4">{log.spotterSig?.data ? <img src={log.spotterSig.data} className="h-8 mx-auto mix-blend-multiply" /> : 'N/A'}</td></tr>))}</tbody></table>
                        </div>
                    </div>

                    <div className={activeTab === 'handover' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Handovers (Shift Change)</h3>
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 8-9/12</span>
                        </div>
                        <div className="overflow-x-auto mb-10 border-2 border-blue-200 rounded-xl shadow-sm"><table className="min-w-full text-xs text-left"><thead className="bg-blue-800 text-white font-black uppercase tracking-wider"><tr><th className="p-3 text-center w-10 border-r border-blue-700">Item</th><th className="p-3 border-r border-blue-700">Check</th><th className="p-3 text-center w-24">Initial {activeSlotIndex + 1}</th></tr></thead><tbody className="divide-y divide-gray-200">
                            {handoverItems.map(item => (<tr key={item.id} className="hover:bg-gray-50"><td className="p-3 text-center font-bold text-gray-500 border-r border-gray-200">{item.id}</td><td className="p-3 font-medium text-gray-800 border-r border-gray-200 leading-relaxed">{item.question}</td><td className="p-3 text-center align-middle">{!isClosed && <input type="checkbox" className="w-6 h-6 text-blue-600 rounded border-gray-300 cursor-pointer shadow-sm" checked={!!handoverChecks[item.id]} onChange={() => setHandoverChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))} />}</td></tr>))}
                        </tbody></table></div>
                        
                        {!isClosed && activeSlotIndex < 7 && allHandoverChecksPassed && (
                            <div className="bg-blue-50 p-8 rounded-2xl border-2 border-blue-200 shadow-md animate-fade-in relative">
                                <h4 className="text-sm font-black uppercase mb-6 text-blue-900 flex items-center gap-2 border-b border-blue-200 pb-2"><Users size={20}/> New Receiver Acknowledgement</h4>
                                <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 items-end`}>
                                    <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">New Receiver Full Name</label><input type="text" className={inputClass} value={handoverReceiver} onChange={e => setHandoverReceiver(e.target.value)} placeholder="Type name here..." /></div>
                                    <div className={!handoverReceiver ? 'opacity-30 pointer-events-none' : ''}><SignaturePad label="Sign here" onSave={setHandoverSignature} externalName={handoverReceiver} /></div>
                                </div>
                                {handoverSignature && <button onClick={finalizeHandover} className="mt-8 w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 hover:scale-[1.01]"><ShieldCheck size={20}/> Confirm Handover Registration</button>}
                            </div>
                        )}
                        
                        <div className="mt-10"><h4 className="font-black text-sm text-gray-700 uppercase tracking-widest mb-4 border-b pb-2">Handover Log</h4><div className="overflow-x-auto border rounded-xl shadow-inner"><table className="min-w-full text-sm text-center"><thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] tracking-widest"><tr><th className="p-3 border-r">#</th><th className="p-3 border-r text-left">Receiver Name</th><th className="p-3 border-r">Signature</th><th className="p-3">Date</th></tr></thead><tbody className="divide-y divide-gray-100">
                            {currentHandovers.map((h, i) => (<tr key={h.id} className="hover:bg-gray-50 transition-colors"><td className="p-3 border-r font-black text-gray-400">{i+1}</td><td className="p-3 border-r uppercase font-bold text-gray-900 text-left">{h.receiverName}</td><td className="p-3 border-r"><img src={h.signature.data} className="h-8 mx-auto mix-blend-multiply" /></td><td className="p-3 font-mono text-xs text-gray-500">{h.date ? new Date(h.date).toLocaleString() : 'N/A'}</td></tr>))}
                        </tbody></table></div></div>
                    </div>

                    <div className={activeTab === 'photos' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                            <h3 className="font-black text-xl text-blue-900 uppercase">Photographic Evidence</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                            {(permit.photos || []).map(photo => (<div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white relative animate-fade-in"><img src={photo.url} className="aspect-square object-cover w-full" /><div className="p-3 border-t"><p className="text-[10px] font-black uppercase text-gray-700 line-clamp-2" title={photo.caption}>{photo.caption || 'No caption'}</p></div>{!isClosed && <button onClick={() => syncToFirebase({...permit, photos: permit.photos?.filter(p => p.id !== photo.id)} as Permit)} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg"><Trash2 size={14}/></button>}</div>))}
                        </div>
                        {!isClosed && (
                            <div className="border-4 border-dashed border-gray-300 p-8 rounded-[2rem] text-center bg-gray-50/50 hover:bg-gray-50 transition-colors animate-fade-in relative z-10">
                                <input type="text" placeholder="Type a descriptive caption for the photo..." className={inputClass + " mb-6 max-w-md mx-auto text-center"} value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} />
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <button onClick={() => cameraInputRef.current?.click()} disabled={isUploadingPhoto} className="text-white px-8 py-4 rounded-xl font-black uppercase bg-blue-800 hover:bg-blue-900 shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">{isUploadingPhoto ? <Loader2 className="animate-spin"/> : <Camera size={20}/>} Take / Upload Photo</button>
                                </div>
                                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                            </div>
                        )}
                    </div>

                    <div className={activeTab === 'notes' ? 'block animate-fade-in' : 'hidden'}>
                        <div className="mt-4 bg-red-50 border-4 border-red-600 p-8 rounded-[2rem] shadow-inner mb-10 animate-fade-in relative">
                            <h3 className="font-black text-2xl mb-6 text-red-700 uppercase flex items-center gap-3 tracking-tighter"><AlertTriangle size={32} className="shrink-0"/> CEASE WORKS PROTOCOL (Pg 7)</h3>
                            <div className="space-y-4 mb-8">
                                {[
                                    { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
                                    { id: '2', text: "If the methodology or site conditions change, work must stop..." },
                                    { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
                                    { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
                                ].map(item => (
                                    <label key={item.id} className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${ceaseItem === item.id || permit.ceaseWorksRecord?.affectedItemNumber === item.id ? 'border-red-600 bg-red-100 shadow-md' : 'border-red-200 bg-white hover:bg-red-50'}`}>
                                        {!permit.ceaseWorksRecord && <input type="radio" name="ceaseCondition" value={item.id} checked={ceaseItem === item.id} onChange={(e) => setCeaseItem(e.target.value as any)} className="w-5 h-5 mt-0.5 text-red-600 focus:ring-red-500" />}
                                        <div className="flex gap-3 leading-relaxed"><span className="font-black text-red-700 text-lg">{item.id}.</span><span className="text-sm font-medium text-gray-900 leading-relaxed" dangerouslySetInnerHTML={{__html: item.text.replace(/must stop/g, '<strong>must stop</strong>')}}></span></div>
                                    </label>
                                ))}
                            </div>
                            {ceaseItem && !permit.ceaseWorksRecord && (
                                <div className="bg-white p-8 rounded-2xl border-2 border-red-300 shadow-xl animate-fade-in">
                                    <h4 className="text-red-800 font-black uppercase tracking-widest mb-6 border-b border-red-100 pb-2">Execute Cease Works PROTOCOL</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Action Required</label><select className={inputClass} value={ceaseAction} onChange={e => setCeaseAction(e.target.value as any)}><option value="">- Select Action -</option><option value="cancelled">Cancel / Revoke Permit immediately</option></select></div>
                                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Issuer Name</label><input type="text" className={inputClass} value={ceaseIssuerName} onChange={e => setCeaseIssuerName(e.target.value)} placeholder="Authorizing Issuer..." /></div>
                                    </div>
                                    {(ceaseAction && ceaseIssuerName) && <SignaturePad label="Issuer Signature to Confirm Protocol" onSave={handleCeaseWorksSave} externalName={ceaseIssuerName} />}
                                </div>
                            )}
                        </div>
                        <h3 className="font-black text-xl mb-2 text-blue-900 border-b-2 border-blue-200 pb-2 uppercase mt-10">Job Notes</h3>
                        <textarea className={`${inputClass} mb-4 h-32 text-sm leading-relaxed`} value={otherNotes} onChange={e => setOtherNotes(e.target.value)} disabled={isClosed} placeholder="Additional job details, incidents, toolbox meeting notes, or non-conditional comments..."></textarea>
                        {!isClosed && <button onClick={() => { syncToFirebase({...permit, otherNotes} as Permit); alert("Notes saved successfully."); }} className="bg-blue-800 hover:bg-blue-900 text-white px-8 py-3 rounded-xl font-black text-xs uppercase shadow-md transition-all hover:scale-[1.02]">Save Notes</button>}
                    </div>

                    <div className={activeTab === 'closure' ? 'block animate-fade-in' : 'hidden'}>
                        {isClosed ? (
                            <div className="bg-red-600 p-12 rounded-[3rem] text-center text-white shadow-inner animate-fade-in">
                                <Lock size={80} className="mx-auto mb-6 opacity-90" />
                                <h2 className="text-4xl font-black uppercase tracking-tighter">Permit Closed & Uploaded</h2>
                                <p className="font-bold opacity-80 mt-2">By {permit.closureReceiverName}</p>
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto border-2 border-blue-900 rounded-2xl overflow-hidden bg-white shadow-xl mb-12 animate-fade-in">
                                <div className="bg-blue-900 p-4 text-white font-black text-lg uppercase tracking-widest flex items-center justify-between"><div className="flex items-center gap-3"><Lock size={20}/> PERMIT CLOSURE</div><span className="text-xs bg-blue-800 px-3 py-1.5 rounded-full font-bold shadow-inner flex items-center gap-1.5"><ImageIcon size={14}/> Will include final PDF</span></div>
                                <div className="p-8">
                                    <div className="space-y-5 mb-8">
                                        <label className="flex items-start gap-4 cursor-pointer group p-3 border rounded-xl hover:bg-gray-50 transition-colors"><input type="checkbox" checked={preClosureCheck1} onChange={e => { setPreClosureCheck1(e.target.checked); if(e.target.checked) setPreClosureCheck3(false); }} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The authorised excavation has been completed and the work site has been left in a safe condition.</span></label>
                                        <label className="flex items-start gap-4 cursor-pointer group p-3 border rounded-xl hover:bg-gray-50 transition-colors"><input type="checkbox" checked={preClosureCheck2} onChange={e => setPreClosureCheck2(e.target.checked)} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The site services plan has been accurately As Built for all new services and returned to the Site Services Coordinator.</span></label>
                                        <div className="flex flex-col gap-3 p-3 border rounded-xl hover:bg-gray-50 transition-colors relative"><label className="flex items-start gap-4 cursor-pointer group"><input type="checkbox" checked={preClosureCheck3} onChange={e => { setPreClosureCheck3(e.target.checked); if(e.target.checked) setPreClosureCheck1(false); }} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The work has not been completed and the following remains outstanding:</span></label>{preClosureCheck3 && (<textarea className="ml-9 text-sm border-2 border-blue-200 rounded-lg p-3 bg-white focus:ring-2 outline-none animate-in fade-in" rows={3} placeholder="Please detail outstanding works..." value={outstandingWorks} onChange={e => setOutstandingWorks(e.target.value)} />)}</div>
                                    </div>
                                    <div className="border-t-2 border-gray-100 pt-8">
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Identify to Close (Type Full Name of Active Receiver)</label>
                                        <input type="text" className={inputClass + " mb-6 py-3 text-lg text-center uppercase border-gray-400"} placeholder={currentReceiverName} value={closureReceiverName} onChange={e => setClosureReceiverName(e.target.value)} />
                                        <button onClick={handleAutomatedCloseAndLodge} disabled={isSubmitting} className={`w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-200 text-gray-500 shadow-none' : 'bg-red-600 text-white shadow-xl hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]'}`}>
                                            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <CloudUpload size={28} />}
                                            {isSubmitting ? 'Generating PDF & Syncing...' : 'Close Permit & Finalize'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
                <EmergencyProtocolContent isPdf={false} />
            </div>
            
            <div className="absolute -left-[10000px] top-0 print:static print:left-0 w-[210mm] print:w-[210mm] z-[-50] print:z-auto">
                <div ref={pdfExportRef} className="bg-white">
                    <PermitPDFLayout permit={permit} pdfRef={pdfExportRef} currentReceiverName={currentReceiverName} currentReceiverSignature={currentReceiverSignature} partAItems={partAItems} partBItems={partBItems} receiverItems={receiverItems} handoverItems={handoverItems} currentHandovers={currentHandovers} CEASE_WORKS_ITEMS={[
                                    { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
                                    { id: '2', text: "If the methodology or site conditions change, work must stop..." },
                                    { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
                                    { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
                                ]} />
                </div>
            </div>
        </>
    );
};
export default PermitDetail;