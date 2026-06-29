// ARCHIVO: src/pages/NewPermit.tsx
import React, { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom'; // 🚀 Importación clave para atrapar el tipo de permiso
import { ArrowLeft, CheckCircle, AlertOctagon, Info, Camera, ImageIcon, Loader2, Trash2, Briefcase, ShieldCheck, Lock, Users, CloudUpload } from 'lucide-react';
import { Permit, PermitPhoto, INITIAL_PART_A, INITIAL_RECEIVER_CHECKLIST, INITIAL_HANDOVER_CHECKLIST, INITIAL_PART_B } from '../types';
import { generatePermitNumber, savePermit, getPermits } from '../services/storage';
import SignaturePad from '../components/SignaturePad';
import { getUserRole } from '../services/cx';  
import { uploadImageToStorage, db } from '../firebase'; 
import { doc, setDoc } from 'firebase/firestore'; 

interface NewPermitProps {
    onCancel: () => void;
    onComplete: () => void;
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

const NewPermit: React.FC<NewPermitProps> = ({ onCancel, onComplete }) => {
    const location = useLocation();
    // 🚀 Atrapa el tipo de permiso enviado por el Dashboard, por defecto asume BG (Breaking Ground)
    const incomingPermitType = location.state?.permitType || 'BG';

    const [activeTab, setActiveTab] = useState<'engineer' | 'receiver' | 'photos' | 'issuer'>('engineer');

    const [formData, setFormData] = useState<Permit>({
        id: crypto.randomUUID(),
        permitNumber: generatePermitNumber(),
        itwocxNumber: '',
        permitType: incomingPermitType, // 🚀 Guardado automático en el estado
        status: 'active',
        createdAt: new Date().toISOString(),
        location: '',
        revealModelLayer: false, subLayers: false, ebaConstructionLayer: false, asBuiltLayers: false,
        scopeOfWorks: '',
        excavationType: 'mechanical', 
        knownServicesScanned: null,
        servicesMarked: null,
        potholingMarkers: null,
        transpowerDesignation: null,
        watercareWorksOver: null,
        partAChecklist: [...INITIAL_PART_A],
        partAPotholingMethod: '', partAFrequency: '', partAOverheadProtection: '',
        partACloseApproach: { overheadElectricityDist: '', overheadRailDist: '', overheadOtherDist: '', undergroundElectricityDist: '', undergroundFibreDist: '', undergroundGasDist: '', undergroundWaterDist: '', permitsObtained: null },
        partBChecklist: [...INITIAL_PART_B],
        partBHighRiskOptions: { power11kv: false, gasHighPressure: false, mainFibre: false },
        receiverChecklist: [...INITIAL_RECEIVER_CHECKLIST],
        handoverChecklist: [...INITIAL_HANDOVER_CHECKLIST],
        dailyLogs: [], handoverLogs: [], crewMembers: [], otherNotes: '', photos: []
    });

    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false); 
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const isHydro = formData.excavationType === 'hydro' || formData.excavationType === 'hand';

    const sessionRole = getUserRole().toLowerCase();
    const isMaster = sessionRole.includes('master');
    const isIssuer = sessionRole.includes('issuer') || isMaster;

    const updateField = (field: keyof Permit, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

    const updateChecklist = (listName: 'partAChecklist' | 'receiverChecklist', id: string, answer: 'yes' | 'no' | 'n/a' | null, comment?: string) => {
        setFormData(prev => ({ ...prev, [listName]: prev[listName].map(item => item.id === id ? { ...item, answer: answer as any, comment: comment ?? item.comment } : item) }));
    };

    const validateEngineerComplete = (): boolean => {
        if (!formData.itwocxNumber || !formData.location || !formData.scopeOfWorks) return false;
        const pendingA = formData.partAChecklist.find(i => !['4','5','6','7'].includes(i.id) && (!i.answer));
        if (pendingA) return false;
        if (!formData.partAPotholingMethod || !formData.partAFrequency || !formData.partACloseApproach.permitsObtained || !formData.partAOverheadProtection) return false;
        if (!formData.siteEngineerSignature) return false;
        return true;
    };

    const validateReceiverComplete = (): boolean => {
        if (isHydro) return !!formData.receiverSignature; 
        const pendingRec = formData.receiverChecklist.find(i => !i.answer);
        if (pendingRec) return false;
        if (!formData.receiverSignature) return false;
        return true;
    };

    const validateIssuerComplete = (): boolean => {
        if (!formData.knownServicesScanned || !formData.servicesMarked || !formData.potholingMarkers || !formData.transpowerDesignation || !formData.watercareWorksOver) return false;
        if (!formData.issuerSignature) return false;
        return true;
    };

    const isEngineerDone = validateEngineerComplete();
    const isReceiverDone = validateReceiverComplete();
    const isIssuerDone = validateIssuerComplete();

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsUploadingPhoto(true); 
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImage(file); 
            const uniqueFilename = `draft_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
            
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, uniqueFilename);

            const newPhoto: PermitPhoto = { 
                id: crypto.randomUUID(), url: cloudUrl, caption: file.name, uploadedBy: 'Team', date: new Date().toISOString() 
            };
            setFormData(prev => ({ ...prev, photos: [...prev.photos, newPhoto] }));
        } catch (err) { 
            console.error("Upload error:", err);
            alert("Error uploading photo. Ensure you have internet connection."); 
        } finally { 
            setIsUploadingPhoto(false); 
            e.target.value = ''; 
        }
    };

    const removePhoto = (photoId: string) => setFormData(prev => ({ ...prev, photos: prev.photos.filter(p => p.id !== photoId) }));

    const handleSaveProgress = async () => {
        if (!formData.itwocxNumber) {
            alert("⚠️ WARNING:\nPlease enter the ITWOCX Permit Number before syncing to the cloud so others can identify it.");
            return;
        }

        setIsSavingDraft(true);
        try {
            savePermit(formData); 
            const permitRef = doc(db, 'permits', formData.id);
            await setDoc(permitRef, { 
                ...formData, 
                lastUpdated: new Date().toISOString(),
                isDraft: true 
            }, { merge: true });
            
            alert(`✅ DRAFT SYNCED SUCCESSFULLY!\n\nThe permit (PF#${formData.itwocxNumber}) has been saved to the cloud.\nThe rest of the team can now open it and fill out their sections.`);
        } catch (error: any) {
            console.error(error);
            alert(`⚠️ Error syncing with Firebase:\n${error.message}\n\nPlease check your internet connection.`);
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleSaveAndIssue = async () => {
        let errors = [];
        if (!isEngineerDone) errors.push("- Site Engineer section is incomplete or missing signature.");
        if (!isReceiverDone) errors.push("- Receiver checklist is incomplete or missing signature.");
        if (!isIssuerDone) errors.push("- Issuer Verification Checks are incomplete or missing signature.");

        if (errors.length > 0) { 
            alert(`🛑 CANNOT ISSUE PERMIT:\n\nPlease review the following missing information with the team on site:\n\n${errors.join('\n')}`); 
            return; 
        }

        const rawNum = formData.itwocxNumber.replace(/\D/g, "");
        if (getPermits().some(p => (p.itwocxNumber || "").replace(/\D/g, "") === rawNum && p.id !== formData.id)) {
            alert(`⚠️ STOP: Permit PF#${rawNum} already exists in the system!`); return;
        }

        const finalData = { ...formData };
        if (finalData.receiverSignature) {
            finalData.crewMembers = [{ id: crypto.randomUUID(), name: finalData.receiverSignature.name, role: 'Permit Receiver', signature: finalData.receiverSignature, dateInducted: new Date().toISOString() }];
        }
        
        savePermit(finalData);
        setIsSubmitting(true);

        const toast = { success: (msg: string) => alert(`✅ ${msg}`) };
        try {
            const permitRef = doc(db, 'permits', finalData.id);
            
            await setDoc(permitRef, { 
                ...finalData, 
                isDraft: false, 
                sync_status: 'pending',
                syncStatus: 'pending',
                cxSyncPending: 'issue',
                lastUpdated: new Date().toISOString() 
            }, { merge: true });

            toast.success('Permit Saved Locally. The system will sync it in the background.');
            onComplete(); 
        } catch (error: any) {
            alert(`⚠️ Error saving permit to database: ${error.message}`);
            onComplete();
        } finally { setIsSubmitting(false); }
    };

    const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none shadow-sm";

    const ReadOnlyPermitHeader = () => (
        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 flex justify-between items-center shadow-inner">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Active Permit Reference</span>
            <span className="text-xl font-black text-blue-900">PF#{formData.itwocxNumber.replace(/\D/g, "") || 'UNASSIGNED'}</span>
        </div>
    );

    const renderPartAChecklistItem = (id: string) => {
        const item = formData.partAChecklist.find(i => i.id === id);
        if (!item) return null;
        return (
            <div key={item.id} className="p-4 border rounded-lg bg-white mb-4 shadow-sm hover:border-blue-300 transition-colors">
                <p className="font-bold text-gray-800 text-sm mb-3 leading-relaxed">{item.id.replace(/[a-z]/g, '')}. {item.question}</p>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div className="flex flex-wrap gap-4 bg-gray-50 p-2 rounded-lg border w-full sm:w-auto">
                        {(['yes', 'no', 'n/a'] as const).map(opt => (
                            <label key={opt} className="flex items-center space-x-2 cursor-pointer p-1">
                                <input type="radio" checked={item.answer === opt} onChange={() => updateChecklist('partAChecklist', item.id, opt)} className="text-brand-600 h-5 w-5" />
                                <span className="uppercase text-xs font-black">{opt}</span>
                            </label>
                        ))}
                    </div>
                    <input type="text" placeholder="Comments..." value={item.comment || ''} onChange={(e) => updateChecklist('partAChecklist', item.id, item.answer, e.target.value)} className={`${inputClass} flex-1`} />
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 px-2 sm:px-0">
            <div className="flex items-center justify-between mb-6"><button onClick={onCancel} className="text-gray-500 font-bold bg-white px-4 py-2 rounded-lg shadow-sm border"><ArrowLeft size={16} className="inline mr-1" /> Back</button></div>
            
            <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                {/* 🚀 Título Dinámico que muestra el tipo de permiso que se está llenando */}
                <h2 className="text-xl sm:text-2xl font-black uppercase text-gray-800">Draft {incomingPermitType} Permit: PF#{formData.itwocxNumber.replace(/\D/g, "")}</h2>
                <div className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-center flex items-center gap-2">
                    <CloudUpload size={14}/> Cloud Sync Ready
                </div>
            </div>
            
            <div className="flex border-b-4 border-gray-100 bg-white sticky top-0 z-40 shadow-sm overflow-x-auto hide-scrollbar mb-6">
                <button onClick={() => setActiveTab('engineer')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'engineer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Briefcase size={16} /> 1. Engineer {isEngineerDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
                <button onClick={() => setActiveTab('receiver')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'receiver' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Users size={16} /> 2. Receiver {isReceiverDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
                <button onClick={() => setActiveTab('photos')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'photos' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ImageIcon size={16} /> Photos
                </button>
                <button onClick={() => setActiveTab('issuer')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'issuer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> 3. Issuer {isIssuerDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 sm:p-8 mb-6 relative">
                
                <div className={activeTab === 'engineer' ? 'block animate-fade-in' : 'hidden'}>
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">Site Engineer Section</h3>
                    
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6">
                        <p className="text-sm text-amber-900 font-bold">💡 <strong>Collaboration Tip:</strong> Fill in the Permit Number first and click "Save & Sync to Cloud" at the bottom so the rest of the team can join this draft.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">ITWOCX Permit # *</label><input type="text" value={formData.itwocxNumber} onChange={(e) => updateField('itwocxNumber', e.target.value)} className={inputClass} placeholder="e.g. 9130" /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Work Location *</label><input type="text" value={formData.location} onChange={(e) => updateField('location', e.target.value)} className={inputClass} placeholder="Detailed location..." /></div>
                        
                        <div className="md:col-span-2">
                            <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Excavation Type *</label>
                            <select value={formData.excavationType} onChange={(e) => updateField('excavationType', e.target.value)} className={`${inputClass} mb-4`}><option value="mechanical">Mechanical Excavation</option><option value="hydro">Hydro Excavation</option><option value="hand">Hand Digging</option></select>
                        </div>

                        <div className="md:col-span-2 bg-blue-50 p-5 rounded-xl border border-blue-200"><h4 className="font-black text-blue-900 mb-4 text-sm">GIS Layer Validation</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[ { key: 'revealModelLayer', label: 'select the Reveal Model layer' }, { key: 'subLayers', label: 'select all sub layers' }, { key: 'ebaConstructionLayer', label: 'select the EBA construction layer' }, { key: 'asBuiltLayers', label: 'all asbuilt layers underneath' } ].map((item) => (
                                    <label key={item.key} className="flex items-center space-x-3 cursor-pointer bg-white p-3 rounded-lg border shadow-sm"><input type="checkbox" checked={formData[item.key as keyof Permit] as boolean} onChange={(e) => updateField(item.key as keyof Permit, e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" /><span className="text-gray-800 font-bold text-sm">{item.label}</span></label>
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-black text-blue-800 mb-2 uppercase">Scope of works for excavation: *</label>
                            <textarea value={formData.scopeOfWorks} onChange={(e) => updateField('scopeOfWorks', e.target.value)} className={`${inputClass} h-32 resize-none`} placeholder="Detailed scope of works..." />
                        </div>
                    </div>

                    <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Part A: Service Identification</h4>
                    <div className="space-y-6">
                        {renderPartAChecklistItem('1a')}{renderPartAChecklistItem('1b')}{renderPartAChecklistItem('2')}{renderPartAChecklistItem('3')}
                        <div className="mb-6"><label className="block text-xs font-black mb-2 text-gray-700">4. Potholing Method *</label><textarea value={formData.partAPotholingMethod} onChange={(e) => updateField('partAPotholingMethod', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="e.g. Hydrovac, Hand dig..." /></div>
                        <div className="mb-6"><label className="block text-xs font-black mb-2 text-gray-700">5. Frequency of potholing *</label><input type="text" value={formData.partAFrequency} onChange={(e) => updateField('partAFrequency', e.target.value)} className={inputClass} placeholder="e.g. 5 Meters between slots / Not applicable" /></div>
                        <div className="mb-6 bg-gray-50 p-5 rounded-xl border border-gray-200"><label className="block text-xs font-black mb-4 text-gray-700 border-b pb-2">6. Close approach distances & permits.</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-6"><div><span className="font-bold text-gray-500 uppercase tracking-widest block mb-1">Overhead Elec</span><input type="text" className={inputClass} value={formData.partACloseApproach.overheadElectricityDist} onChange={e => updateField('partACloseApproach', {...formData.partACloseApproach, overheadElectricityDist: e.target.value})} placeholder="Dist..." /></div><div><span className="font-bold text-gray-500 uppercase tracking-widest block mb-1">Overhead Rail</span><input type="text" className={inputClass} value={formData.partACloseApproach.overheadRailDist} onChange={e => updateField('partACloseApproach', {...formData.partACloseApproach, overheadRailDist: e.target.value})} placeholder="Dist..." /></div><div><span className="font-bold text-gray-500 uppercase tracking-widest block mb-1">Underground Elec</span><input type="text" className={inputClass} value={formData.partACloseApproach.undergroundElectricityDist} onChange={e => updateField('partACloseApproach', {...formData.partACloseApproach, undergroundElectricityDist: e.target.value})} placeholder="Dist..." /></div><div><span className="font-bold text-gray-500 uppercase tracking-widest block mb-1">Underground Gas</span><input type="text" className={inputClass} value={formData.partACloseApproach.undergroundGasDist} onChange={e => updateField('partACloseApproach', {...formData.partACloseApproach, undergroundGasDist: e.target.value})} placeholder="Dist..." /></div></div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white p-3 rounded-lg border"><span className="font-bold text-sm text-gray-800">Required Permits obtained? *</span><div className="flex space-x-4">{(['yes', 'no', 'n/a'] as const).map(opt => (<label key={opt} className="flex items-center space-x-2"><input type="radio" checked={formData.partACloseApproach.permitsObtained === opt} onChange={() => updateField('partACloseApproach', {...formData.partACloseApproach, permitsObtained: opt})} className="h-5 w-5 text-blue-600"/><span className="uppercase text-xs font-black">{opt}</span></label>))}</div></div>
                        </div>
                        <div className="mb-6"><label className="block text-xs font-black mb-2 text-gray-700">7. Overhead service protection provided? *</label><input type="text" value={formData.partAOverheadProtection} onChange={(e) => updateField('partAOverheadProtection', e.target.value)} className={inputClass} placeholder="Protection measures..." /></div>
                        {renderPartAChecklistItem('8')}
                    </div>

                    <div className="mt-8 border border-gray-300 p-6 rounded-2xl bg-gray-50 shadow-sm">
                        <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-gray-500">Site Engineer Signature</p>
                        <SignaturePad label="Sign here to complete Part A" onSave={(sig) => updateField('siteEngineerSignature', sig)} initialValue={formData.siteEngineerSignature} />
                        
                        <button 
                            onClick={handleSaveProgress} 
                            disabled={isSavingDraft}
                            className="mt-6 w-full py-4 rounded-xl font-black uppercase flex items-center justify-center gap-3 transition-all bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95"
                        >
                            {isSavingDraft ? <Loader2 className="animate-spin" size={24}/> : <CloudUpload size={24}/>}
                            {isSavingDraft ? 'Syncing to Cloud...' : 'Save & Sync to Cloud'}
                        </button>
                    </div>
                </div>

                <div className={activeTab === 'receiver' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">Permit Receiver Section</h3>
                    
                    <div>
                        {!isHydro && (
                            <>
                                <p className="text-red-600 font-bold text-xs bg-red-50 p-3 rounded-lg border border-red-100 uppercase mb-6">Checks to be made BEFORE mechanical digging.</p>
                                <div className="space-y-6 mb-8">
                                    {formData.receiverChecklist.map((item) => (
                                        <div key={item.id} className="p-4 border border-gray-200 rounded-xl shadow-sm bg-white hover:border-blue-300 transition-colors">
                                            <p className="font-bold text-gray-800 text-sm mb-3">{item.id}. {item.question} *</p>
                                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center"><div className="flex flex-wrap gap-4 bg-gray-50 p-2 rounded-lg border w-full sm:w-auto">{(['yes', 'no', 'n/a'] as const).map(opt => (<label key={opt} className="flex items-center space-x-2 cursor-pointer p-1"><input type="radio" checked={item.answer === opt} onChange={() => updateChecklist('receiverChecklist', item.id, opt)} className="text-brand-600 h-5 w-5" /><span className="uppercase text-xs font-black">{opt}</span></label>))}</div><input type="text" placeholder="Supplier info/comment..." value={item.comment || ''} onChange={(e) => updateChecklist('receiverChecklist', item.id, item.answer, e.target.value)} className={`${inputClass} flex-1`} /></div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        
                        <div className="border border-blue-200 p-6 rounded-2xl bg-blue-50 shadow-sm relative">
                            <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-blue-800">Receiver Initial Signature</p>
                            <div>
                                <SignaturePad label="Sign here to receive permit" onSave={(sig) => updateField('receiverSignature', sig)} initialValue={formData.receiverSignature} />
                            </div>
                            
                            <button 
                                onClick={handleSaveProgress} 
                                disabled={isSavingDraft}
                                className="mt-6 w-full py-4 rounded-xl font-black uppercase flex items-center justify-center gap-3 transition-all bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95"
                            >
                                {isSavingDraft ? <Loader2 className="animate-spin" size={24}/> : <CloudUpload size={24}/>}
                                {isSavingDraft ? 'Syncing to Cloud...' : 'Save & Sync to Cloud'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'photos' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 flex items-center gap-2 mb-6"><ImageIcon size={22}/> Site Photos</h3>
                    
                    {formData.photos.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                            {formData.photos.map((photo) => (
                                <div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white relative">
                                    <img src={photo.url} className="aspect-square object-cover w-full" />
                                    <div className="p-3 bg-gray-50 border-t"><p className="text-[10px] font-black uppercase text-gray-700 truncate">{photo.caption}</p></div>
                                    <button onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="border-4 border-dashed border-gray-300 p-8 rounded-[2rem] text-center bg-blue-50/30">
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={() => cameraInputRef.current?.click()} disabled={isUploadingPhoto} className="text-white px-8 py-4 rounded-xl font-black uppercase bg-blue-800 hover:bg-blue-900 shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto">{isUploadingPhoto ? <Loader2 className="animate-spin"/> : <Camera size={20}/>} Take HQ Photo</button>
                            <button onClick={() => galleryInputRef.current?.click()} disabled={isUploadingPhoto} className="text-blue-900 bg-white border-2 border-blue-200 hover:bg-blue-50 px-8 py-4 rounded-xl font-black uppercase flex items-center justify-center gap-2 transition-colors w-full sm:w-auto">{isUploadingPhoto ? <Loader2 className="animate-spin"/> : <ImageIcon size={20}/>} Gallery</button>
                        </div>
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </div>
                </div>

                <div className={activeTab === 'issuer' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">Issuer Authorization</h3>
                    
                    <div className="bg-blue-800 text-white p-3 rounded-t-xl font-black text-sm uppercase text-center mt-6">Issuer Verification Checks</div>
                    <div className="border-2 border-blue-800 border-t-0 rounded-b-xl overflow-hidden divide-y divide-gray-100 mb-8">
                        {[ { key: 'knownServicesScanned', label: 'Has the area for this permit been scanned?' }, { key: 'servicesMarked', label: 'Known active services physically marked out on site?' }, { key: 'potholingMarkers', label: 'If potholing, got depth markers for holes when back filling?' }, { key: 'transpowerDesignation', label: 'Work within Transpower Designation Area & S176 in place?' }, { key: 'watercareWorksOver', label: 'Complied with Watercare\'s "Works Over Approval" form...' } ].map((q) => (
                            <div key={q.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white hover:bg-blue-50 transition-colors gap-3"><span className="font-bold text-sm text-gray-800 w-full sm:w-2/3 leading-snug">{q.label} *</span><div className="flex space-x-3 w-full sm:w-1/3 sm:justify-end bg-gray-50 sm:bg-transparent p-2 sm:p-0 rounded border sm:border-0">{(['yes', 'no', 'n/a'] as const).map(opt => (<label key={opt} className="flex items-center space-x-1 cursor-pointer"><input type="radio" checked={formData[q.key as keyof Permit] === opt} onChange={() => updateField(q.key as keyof Permit, opt)} className="h-5 w-5 text-blue-600" /><span className="uppercase text-xs font-black">{opt}</span></label>))}</div></div>
                        ))}
                    </div>

                    <div className="border-2 border-green-500 p-8 rounded-2xl bg-green-50 shadow-md relative overflow-hidden text-center">
                        {!isIssuer && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 uppercase">Not Authorized</div>}
                        <h4 className="font-black uppercase text-green-900 mb-6 tracking-widest text-lg">Final Issue</h4>
                        
                        <div className={!isIssuer ? 'pointer-events-none opacity-50' : ''}>
                            <SignaturePad label="Issuer Name to Execute Permit *" onSave={(sig) => updateField('issuerSignature', sig)} initialValue={formData.issuerSignature} />
                        </div>

                        <button onClick={handleSaveAndIssue} disabled={isSubmitting} className={`mt-8 w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-300 text-gray-500' : 'bg-green-600 text-white shadow-xl hover:bg-green-700 hover:scale-[1.02]'}`}>
                            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle size={28} />}
                            {isSubmitting ? 'Saving to Database...' : 'Issue Permit to Database'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default NewPermit;