import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, Save, Printer, Plus, CheckCircle, Droplets, ShieldCheck, FileCheck, Check, Trash2, Users, ImageIcon, CloudUpload, Camera } from 'lucide-react';
import { Permit, MonitoringLogEntry, PermitPhoto } from '../types';
import { getPermitById, savePermit } from '../services/storage';
import SignaturePad from '../components/SignaturePad';
import { submitPermitToCX, issuePermitToCX, getUserRole } from '../services/cx';
import { uploadImageToStorage, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import ReactDOM from 'react-dom/client';
import PumpPermitPDFLayout from '../components/PumpPermitPDFLayout';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getTargetCollection } from '../utils/appMode';

interface PumpPermitDetailProps {
    id: string;
    onBack: () => void;
}

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

const PumpPermitDetail: React.FC<PumpPermitDetailProps> = ({ id, onBack }) => {
    const [permit, setPermit] = useState<Permit | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    
    // Default to details tab
    const [activeTab, setActiveTab] = useState<'details' | 'receiver' | 'photos' | 'issuer' | 'monitoring' | 'closeout'>('details');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const sessionRole = getUserRole().toLowerCase();
    const isMaster = sessionRole.includes('master');
    const isIssuer = sessionRole.includes('issuer') || isMaster;

    useEffect(() => {
        const fetchPermit = async () => {
            const localPermit = getPermitById(id);
            if (localPermit) {
                setPermit(localPermit);
                setLoading(false);
            }
            try {
                const docRef = doc(db, getTargetCollection(), id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setPermit(docSnap.data() as Permit);
                }
            } catch (error) {
                console.error("Error fetching permit from cloud:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPermit();
    }, [id]);

    const handleSave = async (updatedPermit: Permit) => {
        setIsSaving(true);
        try {
            savePermit(updatedPermit);
            const docRef = doc(db, getTargetCollection(), updatedPermit.id);
            await setDoc(docRef, { ...updatedPermit, lastUpdated: new Date().toISOString() }, { merge: true });
            setPermit(updatedPermit);
        } catch (error) {
            console.error(error);
            alert("Failed to save to cloud.");
        } finally {
            setIsSaving(false);
        }
    };

    const updateField = (field: keyof Permit, value: any) => {
        if (!permit) return;
        const updated = { ...permit, [field]: value };
        setPermit(updated);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !permit) return;
        setIsUploadingPhoto(true); 
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImage(file); 
            const uniqueFilename = `draft_pump_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
            
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, uniqueFilename);

            const newPhoto: PermitPhoto = { 
                id: crypto.randomUUID(), url: cloudUrl, caption: file.name, uploadedBy: 'Team', date: new Date().toISOString() 
            };
            const updated = { ...permit, photos: [...permit.photos, newPhoto] };
            setPermit(updated);
            handleSave(updated);
        } catch (err) { 
            console.error("Upload error:", err);
            alert("Error uploading photo. Ensure you have internet connection."); 
        } finally { 
            setIsUploadingPhoto(false); 
            e.target.value = ''; 
        }
    };

    const removePhoto = (photoId: string) => {
        if (!permit) return;
        const updated = { ...permit, photos: permit.photos.filter(p => p.id !== photoId) };
        setPermit(updated);
        handleSave(updated);
    };

    const handleSaveAndIssue = async () => {
        if (!permit) return;
        
        const isDetailsDone = permit.itwocxNumber && permit.dewateringLocation && permit.projectName && permit.requestingCompany && permit.siteEngineerSignature;
        const isReceiverDone = !!permit.receiverSignature;
        const isIssuerDone = !!permit.issuerSignature;

        let errors = [];
        if (!isDetailsDone) errors.push("- Details section is incomplete or missing signature.");
        if (!isReceiverDone) errors.push("- Receiver is missing signature.");
        if (!isIssuerDone) errors.push("- Issuer is missing signature.");

        if (errors.length > 0) { 
            alert(`🛑 CANNOT ISSUE PERMIT:\n\nPlease review the following missing information:\n\n${errors.join('\n')}`); 
            return; 
        }

        const rawNum = permit.itwocxNumber?.replace(/\D/g, "") || "";
        const finalData = { ...permit, status: 'issued', isDraft: false, syncStatus: 'pending', sync_status: 'pending', cxSyncPending: 'issue', cxSyncError: null } as any;
        
        setIsSubmitting(true);
        try {
            const permitRef = doc(db, getTargetCollection(), finalData.id);
            await setDoc(permitRef, { ...finalData, lastUpdated: new Date().toISOString() }, { merge: true });

            savePermit(finalData);
            setPermit(finalData);
            alert(`✅ Permit Saved Successfully\n\nPump Permit Issued and securely saved to Firebase.`);
        } catch (error: any) {
            alert(`⚠️ Error saving permit to Firebase: ${error.message}`);
        } finally { setIsSubmitting(false); }
    };

    const addMonitoringLog = () => {
        if (!permit) return;
        const newLog: MonitoringLogEntry = {
            id: crypto.randomUUID(),
            time: new Date().toTimeString().split(' ')[0].substring(0, 5),
            mon: '',
            tue: '',
            wed: '',
            thu: '',
            fri: '',
            staffMember: '',
            monitoringLocation: '',
            comments: ''
        };
        const updated = { ...permit, monitoringLogs: [...(permit.monitoringLogs || []), newLog] };
        setPermit(updated);
    };

    const updateMonitoringLog = (logId: string, field: keyof MonitoringLogEntry, value: any) => {
        if (!permit) return;
        const updatedLogs = (permit.monitoringLogs || []).map(log => 
            log.id === logId ? { ...log, [field]: value } : log
        );
        setPermit({ ...permit, monitoringLogs: updatedLogs });
    };

    const removeMonitoringLog = (logId: string) => {
        if (!permit) return;
        const updatedLogs = (permit.monitoringLogs || []).filter(log => log.id !== logId);
        setPermit({ ...permit, monitoringLogs: updatedLogs });
    };

    const generateAndUploadPDF = async (permitData: Permit) => {
        const pdfContainer = document.createElement('div');
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.top = '0';
        document.body.appendChild(pdfContainer);

        const root = ReactDOM.createRoot(pdfContainer);
        
        return new Promise<void>((resolve, reject) => {
            root.render(<PumpPermitPDFLayout permit={permitData} />);
            
            setTimeout(async () => {
                try {
                    const canvas = await html2canvas(pdfContainer, { scale: 2, useCORS: true, logging: false });
                    const imgData = canvas.toDataURL('image/jpeg', 0.8);
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                    
                    let position = 0;
                    let heightLeft = pdfHeight;
                    
                    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                    heightLeft -= pdf.internal.pageSize.getHeight();

                    while (heightLeft >= 0) {
                        position = heightLeft - pdfHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                        heightLeft -= pdf.internal.pageSize.getHeight();
                    }
                    
                    const rawNumber = String(permitData.itwocxNumber || permitData.permitNumber || "").replace(/\D/g, "");
                    const pdfBase64 = pdf.output('datauristring').split(',')[1];

                    let finalUpdatedPermit = { ...permitData, syncStatus: 'pending', sync_status: 'pending', cxSyncPending: 'closure', cxSyncError: null } as any;

                    try {
                        const storage = getStorage();
                        const pdfRef = ref(storage, `pdf_backups/PF${rawNumber}_${new Date().getTime()}.pdf`);
                        await uploadString(pdfRef, pdfBase64, 'base64', { contentType: 'application/pdf' });
                        const downloadUrl = await getDownloadURL(pdfRef);
                        finalUpdatedPermit = { ...finalUpdatedPermit, pdfBackupUrl: downloadUrl };
                    } catch (storageError) { console.error("Backup PDF Error:", storageError); }

                    const docRef = doc(db, getTargetCollection(), finalUpdatedPermit.id);
                    await setDoc(docRef, { ...finalUpdatedPermit, lastUpdated: new Date().toISOString() }, { merge: true });
                    savePermit(finalUpdatedPermit);
                    setPermit(finalUpdatedPermit);
                    
                    root.unmount();
                    document.body.removeChild(pdfContainer);
                    resolve();
                } catch (error) {
                    root.unmount();
                    document.body.removeChild(pdfContainer);
                    reject(error);
                }
            }, 1000);
        });
    };

    const handleCloseout = async (signature: any, receiverName: string, dateStr: string) => {
        if (!permit) return;
        if (!signature || !receiverName) {
            alert("Please provide both name and signature to close the permit.");
            return;
        }

        setIsSaving(true);
        const updatedPermit: Permit = {
            ...permit,
            status: 'closed',
            closureSignature: signature,
            closureReceiverName: receiverName,
            closureDate: dateStr || new Date().toISOString()
        };

        try {
            await handleSave(updatedPermit);
            
            alert("Permit closed. Generating PDF and securing to Firebase...");
            await generateAndUploadPDF(updatedPermit);
            
            alert("✅ Permit Saved Successfully\n\nPermit closed and securely saved to Firebase.");
            onBack();
        } catch (error: any) {
            console.error(error);
            alert(`⚠️ Error saving permit to Firebase: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
    if (!permit) return <div className="text-center p-12 text-red-600 font-bold">Permit not found.</div>;

    const currentStatus = permit?.status?.toUpperCase() || '';
    const isIssued = currentStatus === 'ISSUED' || currentStatus === 'ACTIVE';
    const isClosed = currentStatus === 'CLOSED';
    const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none shadow-sm disabled:bg-gray-100";

    return (
        <div className="max-w-5xl mx-auto pb-12 px-2 sm:px-0">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="text-gray-500 font-bold bg-white px-4 py-2 rounded-lg shadow-sm border"><ArrowLeft size={16} className="inline mr-1" /> Back</button>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 border">
                        <Printer size={16} /> Print
                    </button>
                    {!isClosed && (
                        <button onClick={() => handleSave(permit)} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2">
                            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Progress
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black uppercase text-gray-800">Pump Permit: PF#{permit.itwocxNumber?.replace(/\D/g, "") || 'UNASSIGNED'}</h2>
                    <p className="text-gray-500 font-bold">{permit.projectName} - {permit.dewateringLocation}</p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${isClosed ? 'bg-red-100 text-red-800' : (isIssued ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800')}`}>
                    {isClosed ? 'CLOSED' : (isIssued ? 'ISSUED' : 'DRAFT')}
                </div>
            </div>

            <div className="flex border-b-4 border-gray-100 bg-white sticky top-0 z-40 shadow-sm overflow-x-auto hide-scrollbar mb-6">
                <button onClick={() => setActiveTab('details')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'details' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Droplets size={16} /> 1. Details
                </button>
                <button onClick={() => setActiveTab('receiver')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'receiver' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Users size={16} /> 2. Receiver
                </button>
                <button onClick={() => setActiveTab('photos')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'photos' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ImageIcon size={16} /> Site Plan
                </button>
                <button onClick={() => setActiveTab('issuer')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'issuer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> 3. Issuer
                </button>
                <button onClick={() => setActiveTab('monitoring')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'monitoring' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <FileCheck size={16} /> Daily Monitoring
                </button>
                <button onClick={() => setActiveTab('closeout')} className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'closeout' ? 'text-red-700 border-b-4 border-red-600 bg-red-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> Closeout {isClosed && <CheckCircle size={14} className="text-green-500"/>}
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8">
                
                {activeTab === 'details' && (
                    <div className="animate-fade-in">
                        <div className={(isIssued || isClosed) ? 'pointer-events-none opacity-95' : ''}>
                        <fieldset disabled={isIssued || isClosed} className="border-0 p-0 m-0 min-w-0">
                        <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">General Details</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">ITWOCX Permit # *</label><input type="text" value={permit.itwocxNumber} onChange={(e) => updateField('itwocxNumber', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Project Name *</label><input type="text" value={permit.projectName} onChange={(e) => updateField('projectName', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Requesting Company *</label><input type="text" value={permit.requestingCompany} onChange={(e) => updateField('requestingCompany', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Location to be dewatered *</label><input type="text" value={permit.dewateringLocation} onChange={(e) => { updateField('dewateringLocation', e.target.value); updateField('location', e.target.value); }} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Description of area *</label>
                                <textarea value={permit.areaDescription} onChange={(e) => updateField('areaDescription', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={`${inputClass} h-24 resize-none`} />
                            </div>
                        </div>

                        <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Person in Charge</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Name</label><input type="text" value={permit.personInChargeName} onChange={(e) => updateField('personInChargeName', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Contact Number</label><input type="text" value={permit.personInChargeContact} onChange={(e) => updateField('personInChargeContact', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Position</label><input type="text" value={permit.personInChargePosition} onChange={(e) => updateField('personInChargePosition', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                        </div>

                        <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Pumping Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Impurities other than sediment</label><input type="text" value={permit.impurities} onChange={(e) => updateField('impurities', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Final Discharge Point</label><input type="text" value={permit.dischargePoint} onChange={(e) => updateField('dischargePoint', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Size of Pump / Rate / Volume</label><input type="text" value={permit.pumpSizeRateVolume} onChange={(e) => updateField('pumpSizeRateVolume', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pumping hours of operation</label><input type="text" value={permit.pumpingHours} onChange={(e) => updateField('pumpingHours', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Start Date</label><input type="date" value={permit.startDate} onChange={(e) => updateField('startDate', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Expiry Date</label><input type="date" value={permit.expiryDate} onChange={(e) => updateField('expiryDate', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                        </div>

                        <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Controls and Monitoring</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pump Inlet Controls</label><input type="text" value={permit.pumpInletControls} onChange={(e) => updateField('pumpInletControls', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pump Outlet Controls</label><input type="text" value={permit.pumpOutletControls} onChange={(e) => updateField('pumpOutletControls', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Sediment control intermediate</label><input type="text" value={permit.sedimentControlPoint} onChange={(e) => updateField('sedimentControlPoint', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Discharge criteria</label><input type="text" value={permit.dischargeCriteria} onChange={(e) => updateField('dischargeCriteria', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Monitoring Location</label><input type="text" value={permit.monitoringLocation} onChange={(e) => updateField('monitoringLocation', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Monitoring Frequency</label><input type="text" value={permit.monitoringFrequency} onChange={(e) => updateField('monitoringFrequency', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Other Monitoring Requirements</label><input type="text" value={permit.otherMonitoringRequirements} onChange={(e) => updateField('otherMonitoringRequirements', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                            <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Person responsible for monitoring</label><input type="text" value={permit.personResponsibleForMonitoring} onChange={(e) => updateField('personResponsibleForMonitoring', e.target.value)} disabled={isClosed || isIssued} readOnly={isClosed || isIssued} className={inputClass} /></div>
                        </div>

                        <div className="mt-8 border border-gray-300 p-6 rounded-2xl bg-gray-50 shadow-sm">
                            <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-gray-500">Requester Signature</p>
                            {permit.siteEngineerSignature && (isIssued || isClosed) ? (
                                <div className="text-center"><img src={permit.siteEngineerSignature.dataUrl} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase">{permit.siteEngineerSignature.name}</p></div>
                            ) : (
                                <SignaturePad label="Sign here to complete Details" onSave={(sig) => updateField('siteEngineerSignature', sig)} initialValue={permit.siteEngineerSignature} readOnly={isIssued || isClosed} />
                            )}
                        </div>
                        </fieldset>
                        </div>
                    </div>
                )}

                {activeTab === 'receiver' && (
                    <div className="animate-fade-in">
                        <div className={(isIssued || isClosed) ? 'pointer-events-none opacity-95' : ''}>
                        <fieldset disabled={isIssued || isClosed} className="border-0 p-0 m-0 min-w-0">
                        <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">Permit Receiver Section</h3>
                        
                        <div className="border border-blue-200 p-6 rounded-2xl bg-blue-50 shadow-sm relative">
                            <p className="text-sm font-bold text-gray-700 mb-6 text-center italic">
                                "As the Person in Charge of Work I understand that I am responsible for informing the personnel under my control of the content and limits of this Permit. I confirm that the specified environmental requirements have been taken and authorise this Permit to go into effect."
                            </p>
                            <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-blue-800">Receiver Initial Signature</p>
                            {permit.receiverSignature && (isIssued || isClosed) ? (
                                <div className="text-center"><img src={permit.receiverSignature.dataUrl} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase text-blue-900">{permit.receiverSignature.name}</p></div>
                            ) : (
                                <SignaturePad label="Sign here to receive permit" onSave={(sig) => updateField('receiverSignature', sig)} initialValue={permit.receiverSignature} readOnly={isIssued || isClosed} />
                            )}
                        </div>
                        </fieldset>
                        </div>
                    </div>
                )}

                {activeTab === 'photos' && (
                    <div className="animate-fade-in">
                        <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 flex items-center gap-2 mb-6"><ImageIcon size={22}/> Site Layout Plan (Upload)</h3>
                        
                        {permit.photos.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                                {permit.photos.map((photo) => (
                                    <div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white relative">
                                        <img src={photo.url} className="aspect-square object-cover w-full" />
                                        <div className="p-3 bg-gray-50 border-t"><p className="text-[10px] font-black uppercase text-gray-700 truncate">{photo.caption}</p></div>
                                        {!isClosed && <button onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg"><Trash2 size={16}/></button>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {!isClosed && (
                            <div className="border-4 border-dashed border-gray-300 p-8 rounded-[2rem] text-center bg-blue-50/30">
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <button onClick={() => cameraInputRef.current?.click()} disabled={isUploadingPhoto} className="text-white px-8 py-4 rounded-xl font-black uppercase bg-blue-800 hover:bg-blue-900 shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto">{isUploadingPhoto ? <Loader2 className="animate-spin"/> : <Camera size={20}/>} Take HQ Photo</button>
                                    <button onClick={() => galleryInputRef.current?.click()} disabled={isUploadingPhoto} className="text-blue-900 bg-white border-2 border-blue-200 hover:bg-blue-50 px-8 py-4 rounded-xl font-black uppercase flex items-center justify-center gap-2 transition-colors w-full sm:w-auto">{isUploadingPhoto ? <Loader2 className="animate-spin"/> : <ImageIcon size={20}/>} Gallery</button>
                                </div>
                                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                                <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'issuer' && (
                    <div className="animate-fade-in">
                        <div className={(isIssued || isClosed) ? 'pointer-events-none opacity-95' : ''}>
                        <fieldset disabled={isIssued || isClosed} className="border-0 p-0 m-0 min-w-0">
                        <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">Issuer Authorization</h3>
                        
                        <div className="border-2 border-green-500 p-8 rounded-2xl bg-green-50 shadow-md relative overflow-hidden text-center">
                            {!isIssuer && !isIssued && !isClosed && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 uppercase">Not Authorized</div>}
                            <h4 className="font-black uppercase text-green-900 mb-4 tracking-widest text-lg">Final Issue</h4>
                            
                            <p className="text-sm font-bold text-gray-700 mb-6 italic max-w-lg mx-auto">
                                "The person authorising this permit must understand the project resource consents and ESCPs or Regional Plan Rules."
                            </p>
                            
                            <div className={(!isIssuer || isIssued || isClosed) ? 'pointer-events-none opacity-50' : ''}>
                                {permit.issuerSignature && (isIssued || isClosed) ? (
                                    <div className="text-center"><img src={permit.issuerSignature.dataUrl} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase">{permit.issuerSignature.name}</p></div>
                                ) : (
                                    <SignaturePad label="Issuer Name to Execute Permit *" onSave={(sig) => updateField('issuerSignature', sig)} initialValue={permit.issuerSignature} readOnly={isIssued || isClosed} />
                                )}
                            </div>

                            {!isIssued && !isClosed && (
                                <button onClick={handleSaveAndIssue} disabled={isSubmitting} className={`mt-8 w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-300 text-gray-500' : 'bg-green-600 text-white shadow-xl hover:bg-green-700 hover:scale-[1.02]'}`}>
                                    {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle size={28} />}
                                    {isSubmitting ? 'Lodging PDF to iTwoCX...' : 'Issue Permit to CX'}
                                </button>
                            )}
                            
                            {(isIssued || isClosed) && (
                                <div className="mt-6 bg-green-600 text-white p-3 rounded-lg font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg">
                                    <CheckCircle size={20}/> PERMIT ISSUED TO SITE
                                </div>
                            )}
                        </div>
                        </fieldset>
                        </div>
                    </div>
                )}

                {activeTab === 'monitoring' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="font-black text-xl text-gray-800 uppercase mb-2">Daily Monitoring</h3>
                            {!isClosed && (
                                <button onClick={addMonitoringLog} className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shrink-0">
                                    <Plus size={16}/> Add Log Entry
                                </button>
                            )}
                        </div>

                        <div className="border border-gray-300 mb-6 bg-white shadow-sm overflow-hidden text-sm">
                            <div className="grid grid-cols-[200px_1fr] border-b border-gray-300">
                                <div className="bg-green-200 font-bold p-3 border-r border-gray-300">Monitoring requirements</div>
                                <div className="p-3 bg-gray-50 flex flex-col gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer font-bold">
                                        <input type="checkbox" checked={permit.reqClarity || false} onChange={e => updateField('reqClarity', e.target.checked)} disabled={isClosed} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                        Clarity {'>'}100mm visibility
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer font-bold">
                                        <input type="checkbox" checked={permit.reqPh || false} onChange={e => updateField('reqPh', e.target.checked)} disabled={isClosed} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                        pH is between 5.5 & 8.5
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer font-bold">
                                        <input type="checkbox" checked={permit.reqSheen || false} onChange={e => updateField('reqSheen', e.target.checked)} disabled={isClosed} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                        No oily sheen, discolouration or odour
                                    </label>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-[200px_1fr] border-b border-gray-300">
                                <div className="bg-green-200 font-bold p-3 border-r border-gray-300">Monitoring frequency</div>
                                <div className="p-0">
                                    <input type="text" value={permit.monitoringFrequency || ''} onChange={e => updateField('monitoringFrequency', e.target.value)} disabled={isClosed} className="w-full h-full p-3 bg-white outline-none" placeholder="Enter frequency..." />
                                </div>
                            </div>

                            <div className="bg-green-200 font-bold p-3 border-b border-gray-300">
                                <div className="mb-1">Water quality required</div>
                                <div className="font-normal text-sm">If criteria are not met - stop pumping and contact the permit authoriser immediately.</div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-800 text-[11px] font-bold">
                                            <th className="p-2 border border-gray-300 bg-green-200 min-w-[80px]">Time</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-24">Mon Clarity/ pH</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-24">Tues Clarity/ pH</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-24">Wed Clarity/ pH</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-24">Thus Clarity/ pH</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-24">Fri Clarity/ pH</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-32">Staff member undertaking monitoring</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-32">Monitoring location</th>
                                            <th className="p-2 border border-gray-300 bg-green-200 w-32">Comments</th>
                                            {!isClosed && <th className="p-2 border border-gray-300 bg-green-200 w-10"></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(permit.monitoringLogs || []).map(log => (
                                            <tr key={log.id} className="hover:bg-blue-50/50">
                                                <td className="p-1 border border-gray-300"><input type="time" disabled={isClosed} value={log.time} onChange={e => updateMonitoringLog(log.id, 'time', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.mon} onChange={e => updateMonitoringLog(log.id, 'mon', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.tue} onChange={e => updateMonitoringLog(log.id, 'tue', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.wed} onChange={e => updateMonitoringLog(log.id, 'wed', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.thu} onChange={e => updateMonitoringLog(log.id, 'thu', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.fri} onChange={e => updateMonitoringLog(log.id, 'fri', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.staffMember} onChange={e => updateMonitoringLog(log.id, 'staffMember', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.monitoringLocation} onChange={e => updateMonitoringLog(log.id, 'monitoringLocation', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                <td className="p-1 border border-gray-300"><input type="text" disabled={isClosed} value={log.comments} onChange={e => updateMonitoringLog(log.id, 'comments', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                                {!isClosed && (
                                                    <td className="p-1 border border-gray-300 text-center">
                                                        <button onClick={() => removeMonitoringLog(log.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14}/></button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                        {(!permit.monitoringLogs || permit.monitoringLogs.length === 0) && (
                                            <tr><td colSpan={10} className="p-8 text-center text-gray-400 font-bold border border-gray-300">No monitoring logs recorded yet.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'closeout' && (
                    <div className="animate-fade-in max-w-2xl mx-auto">
                        <h3 className="font-black text-2xl text-center text-gray-800 uppercase mb-8">Permit Closeout</h3>
                        
                        {isClosed ? (
                            <div className="bg-green-50 border-2 border-green-500 p-8 rounded-2xl text-center">
                                <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
                                <h4 className="text-2xl font-black text-green-900 uppercase mb-2">Permit Closed</h4>
                                <p className="text-green-700 font-bold mb-6">This permit was closed on {new Date(permit.closureDate!).toLocaleDateString()}</p>
                                
                                <div className="bg-white p-4 rounded-xl border mb-4 inline-block mx-auto text-left">
                                    <p className="text-xs font-black text-gray-500 uppercase mb-1">Closed By</p>
                                    <p className="font-bold text-lg">{permit.closureReceiverName}</p>
                                    {permit.closureSignature && <img src={permit.closureSignature.dataUrl} className="h-16 mt-2 mix-blend-multiply" />}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gray-50 border-2 border-gray-200 p-8 rounded-2xl relative">
                                {!isIssuer && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 uppercase rounded-bl-lg">Issuer Only</div>}
                                
                                <div className="text-center bg-cyan-200 text-black p-2 font-bold mb-4">
                                    <div className="font-black text-lg">Permit closeout person</div>
                                    <div>in Charge of Work to complete and return closed out permits and monitoring records to the Authoriser</div>
                                </div>
                                <div className="text-center bg-cyan-200 text-black p-2 font-bold mb-8">
                                    As the Person in Charge of Work I confirm that pumping activities described in this permit have now been completed.
                                </div>

                                <div className={!isIssuer ? 'pointer-events-none opacity-50' : ''}>
                                    <div className="mb-4">
                                        <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Closeout Operator Name *</label>
                                        <input 
                                            type="text" 
                                            id="closeoutName"
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                            placeholder="Enter your name" 
                                        />
                                    </div>
                                    <div className="mb-6">
                                        <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Date of Completion *</label>
                                        <input 
                                            type="date" 
                                            id="closeoutDate"
                                            defaultValue={new Date().toISOString().split('T')[0]}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                        />
                                    </div>

                                    <SignaturePad 
                                        label="Sign here to close permit *" 
                                        onSave={(sig) => {
                                            const name = (document.getElementById('closeoutName') as HTMLInputElement).value;
                                            const date = (document.getElementById('closeoutDate') as HTMLInputElement).value;
                                            handleCloseout(sig, name, date);
                                        }} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PumpPermitDetail;
