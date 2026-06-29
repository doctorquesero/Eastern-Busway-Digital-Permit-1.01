import React, { useState, useRef } from 'react';
import { ArrowLeft, CheckCircle, Camera, ImageIcon, Loader2, Trash2, Briefcase, ShieldCheck, Users, CloudUpload, FileCheck, Plus } from 'lucide-react';
import { Permit, PermitPhoto, MonitoringLogEntry } from '../types';
import { generatePermitNumber, savePermit, getPermits } from '../services/storage';
import SignaturePad from '../components/SignaturePad';
import { issuePermitToCX, getUserRole } from '../services/cx';  
import { uploadImageToStorage, db } from '../firebase'; 
import { doc, setDoc } from 'firebase/firestore'; 

interface NewPumpPermitProps {
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

const NewPumpPermit: React.FC<NewPumpPermitProps> = ({ onCancel, onComplete }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'receiver' | 'photos' | 'issuer' | 'monitoring' | 'closeout'>('details');

    const [formData, setFormData] = useState<Permit>({
        id: crypto.randomUUID(),
        permitNumber: generatePermitNumber(),
        itwocxNumber: '',
        permitType: 'pump',
        status: 'active',
        createdAt: new Date().toISOString(),
        location: '', 
        projectName: 'Eastern Busway',
        requestingCompany: '',
        dewateringLocation: '',
        areaDescription: '',
        personInChargeName: '',
        personInChargeContact: '',
        personInChargePosition: '',
        impurities: '',
        dischargePoint: '',
        pumpSizeRateVolume: '',
        pumpingHours: '',
        startDate: '',
        expiryDate: '',
        pumpInletControls: '',
        pumpOutletControls: '',
        sedimentControlPoint: '',
        dischargeCriteria: '',
        monitoringLocation: '',
        monitoringFrequency: '',
        otherMonitoringRequirements: '',
        personResponsibleForMonitoring: '',
        monitoringLogs: [],
        photos: [],
        dailyLogs: [],
        handoverLogs: [],
        crewMembers: [],
    } as any);

    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false); 
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const sessionRole = getUserRole().toLowerCase();
    const isMaster = sessionRole.includes('master');
    const isIssuer = sessionRole.includes('issuer') || isMaster;

    const updateField = (field: keyof Permit, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

    const addMonitoringLog = () => {
        const newLog: MonitoringLogEntry = {
            id: crypto.randomUUID(),
            time: new Date().toTimeString().split(' ')[0].substring(0, 5),
            mon: '', tue: '', wed: '', thu: '', fri: '',
            staffMember: '', monitoringLocation: '', comments: ''
        };
        setFormData(prev => ({ ...prev, monitoringLogs: [...(prev.monitoringLogs || []), newLog] }));
    };

    const updateMonitoringLog = (logId: string, field: keyof MonitoringLogEntry, value: any) => {
        setFormData(prev => ({ ...prev, monitoringLogs: (prev.monitoringLogs || []).map(log => log.id === logId ? { ...log, [field]: value } : log) }));
    };

    const removeMonitoringLog = (logId: string) => {
        setFormData(prev => ({ ...prev, monitoringLogs: (prev.monitoringLogs || []).filter(log => log.id !== logId) }));
    };

    const validateDetailsComplete = (): boolean => {
        if (!formData.itwocxNumber || !formData.dewateringLocation || !formData.projectName || !formData.requestingCompany) return false;
        if (!formData.siteEngineerSignature) return false;
        return true;
    };

    const validateReceiverComplete = (): boolean => {
        return !!formData.receiverSignature; 
    };

    const validateIssuerComplete = (): boolean => {
        return !!formData.issuerSignature;
    };

    const isDetailsDone = validateDetailsComplete();
    const isReceiverDone = validateReceiverComplete();
    const isIssuerDone = validateIssuerComplete();

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsUploadingPhoto(true); 
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImage(file); 
            const uniqueFilename = `draft_pump_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
            
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
        if (!isDetailsDone) errors.push("- Details section is incomplete or missing signature.");
        if (!isReceiverDone) errors.push("- Receiver is missing signature.");
        if (!isIssuerDone) errors.push("- Issuer is missing signature.");

        if (errors.length > 0) { 
            alert(`🛑 CANNOT ISSUE PERMIT:\n\nPlease review the following missing information:\n\n${errors.join('\n')}`); 
            return; 
        }

        const rawNum = formData.itwocxNumber?.replace(/\D/g, "") || "";
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

            toast.success('Permit Saved Locally');
            onComplete(); 
        } catch (error: any) {
            alert(`⚠️ Error saving permit to database: ${error.message}`);
            onComplete();
        } finally { setIsSubmitting(false); }
    };

    const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none shadow-sm";

    const ReadOnlyPermitHeader = () => (
        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 flex justify-between items-center shadow-inner">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Active Pump Permit Ref</span>
            <span className="text-xl font-black text-blue-900">PF#{formData.itwocxNumber?.replace(/\D/g, "") || 'UNASSIGNED'}</span>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto pb-12 px-2 sm:px-0">
            <div className="flex items-center justify-between mb-6"><button onClick={onCancel} className="text-gray-500 font-bold bg-white px-4 py-2 rounded-lg shadow-sm border"><ArrowLeft size={16} className="inline mr-1" /> Back</button></div>
            
            <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-black uppercase text-gray-800">Draft Pump Permit: PF#{formData.itwocxNumber?.replace(/\D/g, "") || ''}</h2>
                <div className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-center flex items-center gap-2">
                    <CloudUpload size={14}/> Cloud Sync Ready
                </div>
            </div>
            
            <div className="flex border-b-4 border-gray-100 bg-white sticky top-0 z-40 shadow-sm overflow-x-auto hide-scrollbar mb-6">
                <button onClick={() => setActiveTab('details')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'details' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Briefcase size={16} /> 1. Details {isDetailsDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
                <button onClick={() => setActiveTab('receiver')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'receiver' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <Users size={16} /> 2. Receiver {isReceiverDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
                <button onClick={() => setActiveTab('photos')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'photos' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ImageIcon size={16} /> Site Plan
                </button>
                <button onClick={() => setActiveTab('issuer')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'issuer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> 3. Issuer {isIssuerDone && <CheckCircle size={14} className="text-green-500"/>}
                </button>
                <button onClick={() => setActiveTab('monitoring')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'monitoring' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <FileCheck size={16} /> Daily Monitoring
                </button>
                <button onClick={() => setActiveTab('closeout')} className={`px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'closeout' ? 'text-red-700 border-b-4 border-red-600 bg-red-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> Closeout
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 sm:p-8 mb-6 relative">
                
                <div className={activeTab === 'details' ? 'block animate-fade-in' : 'hidden'}>
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 mb-6">General Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">ITWOCX Permit # *</label><input type="text" value={formData.itwocxNumber} onChange={(e) => updateField('itwocxNumber', e.target.value)} className={inputClass} placeholder="e.g. 9130" /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Project Name *</label><input type="text" value={formData.projectName} onChange={(e) => updateField('projectName', e.target.value)} className={inputClass} /></div>
                        
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Requesting Company *</label><input type="text" value={formData.requestingCompany} onChange={(e) => updateField('requestingCompany', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Location to be dewatered *</label><input type="text" value={formData.dewateringLocation} onChange={(e) => { updateField('dewateringLocation', e.target.value); updateField('location', e.target.value); }} className={inputClass} /></div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Description of area *</label>
                            <textarea value={formData.areaDescription} onChange={(e) => updateField('areaDescription', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="Describe the area..." />
                        </div>
                    </div>

                    <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Person in Charge</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Name</label><input type="text" value={formData.personInChargeName} onChange={(e) => updateField('personInChargeName', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Contact Number</label><input type="text" value={formData.personInChargeContact} onChange={(e) => updateField('personInChargeContact', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Position</label><input type="text" value={formData.personInChargePosition} onChange={(e) => updateField('personInChargePosition', e.target.value)} className={inputClass} /></div>
                    </div>

                    <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Pumping Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Impurities other than sediment</label><input type="text" value={formData.impurities} onChange={(e) => updateField('impurities', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Final Discharge Point</label><input type="text" value={formData.dischargePoint} onChange={(e) => updateField('dischargePoint', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Size of Pump / Rate / Volume</label><input type="text" value={formData.pumpSizeRateVolume} onChange={(e) => updateField('pumpSizeRateVolume', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pumping hours of operation</label><input type="text" value={formData.pumpingHours} onChange={(e) => updateField('pumpingHours', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Start Date</label><input type="date" value={formData.startDate} onChange={(e) => updateField('startDate', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Expiry Date</label><input type="date" value={formData.expiryDate} onChange={(e) => updateField('expiryDate', e.target.value)} className={inputClass} /></div>
                    </div>

                    <h4 className="font-black text-lg text-gray-800 mb-4 border-b pb-2">Controls and Monitoring</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pump Inlet Controls</label><input type="text" value={formData.pumpInletControls} onChange={(e) => updateField('pumpInletControls', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Pump Outlet Controls</label><input type="text" value={formData.pumpOutletControls} onChange={(e) => updateField('pumpOutletControls', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Sediment control intermediate</label><input type="text" value={formData.sedimentControlPoint} onChange={(e) => updateField('sedimentControlPoint', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Discharge criteria</label><input type="text" value={formData.dischargeCriteria} onChange={(e) => updateField('dischargeCriteria', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Monitoring Location</label><input type="text" value={formData.monitoringLocation} onChange={(e) => updateField('monitoringLocation', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Monitoring Frequency</label><input type="text" value={formData.monitoringFrequency} onChange={(e) => updateField('monitoringFrequency', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Other Monitoring Requirements</label><input type="text" value={formData.otherMonitoringRequirements} onChange={(e) => updateField('otherMonitoringRequirements', e.target.value)} className={inputClass} /></div>
                        <div><label className="block text-xs font-black mb-2 text-gray-600 uppercase">Person responsible for monitoring</label><input type="text" value={formData.personResponsibleForMonitoring} onChange={(e) => updateField('personResponsibleForMonitoring', e.target.value)} className={inputClass} /></div>
                    </div>

                    <div className="mt-8 border border-gray-300 p-6 rounded-2xl bg-gray-50 shadow-sm">
                        <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-gray-500">Requester Signature</p>
                        <SignaturePad label="Sign here to complete Details" onSave={(sig) => updateField('siteEngineerSignature', sig)} initialValue={formData.siteEngineerSignature} />
                        
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
                    
                    <div className="border border-blue-200 p-6 rounded-2xl bg-blue-50 shadow-sm relative">
                        <p className="text-sm font-bold text-gray-700 mb-6 text-center italic">
                            "As the Person in Charge of Work I understand that I am responsible for informing the personnel under my control of the content and limits of this Permit. I confirm that the specified environmental requirements have been taken and authorise this Permit to go into effect."
                        </p>
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

                <div className={activeTab === 'photos' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-blue-900 flex items-center gap-2 mb-6"><ImageIcon size={22}/> Site Layout Plan (Upload)</h3>
                    
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
                    
                    <div className="border-2 border-green-500 p-8 rounded-2xl bg-green-50 shadow-md relative overflow-hidden text-center">
                        {!isIssuer && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 uppercase">Not Authorized</div>}
                        <h4 className="font-black uppercase text-green-900 mb-4 tracking-widest text-lg">Final Issue</h4>
                        
                        <p className="text-sm font-bold text-gray-700 mb-6 italic max-w-lg mx-auto">
                            "The person authorising this permit must understand the project resource consents and ESCPs or Regional Plan Rules."
                        </p>
                        
                        <div className={!isIssuer ? 'pointer-events-none opacity-50' : ''}>
                            <SignaturePad label="Issuer Name to Execute Permit *" onSave={(sig) => updateField('issuerSignature', sig)} initialValue={formData.issuerSignature} />
                        </div>

                        <button onClick={handleSaveAndIssue} disabled={isSubmitting} className={`mt-8 w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-300 text-gray-500' : 'bg-green-600 text-white shadow-xl hover:bg-green-700 hover:scale-[1.02]'}`}>
                            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle size={28} />}
                            {isSubmitting ? 'Lodging PDF to iTwoCX...' : 'Issue Permit to CX'}
                        </button>
                    </div>
                </div>

                <div className={activeTab === 'monitoring' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="font-black text-xl text-gray-800 uppercase mb-2">Daily Monitoring</h3>
                        <button onClick={addMonitoringLog} className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shrink-0">
                            <Plus size={16}/> Add Log Entry
                        </button>
                    </div>

                    <div className="border border-gray-300 mb-6 bg-white shadow-sm overflow-hidden text-sm">
                        <div className="grid grid-cols-[200px_1fr] border-b border-gray-300">
                            <div className="bg-green-200 font-bold p-3 border-r border-gray-300">Monitoring requirements</div>
                            <div className="p-3 bg-gray-50 flex flex-col gap-2">
                                <label className="flex items-center gap-2 cursor-pointer font-bold">
                                    <input type="checkbox" checked={formData.reqClarity || false} onChange={e => updateField('reqClarity', e.target.checked)} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                    Clarity {'>'}100mm visibility
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer font-bold">
                                    <input type="checkbox" checked={formData.reqPh || false} onChange={e => updateField('reqPh', e.target.checked)} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                    pH is between 5.5 & 8.5
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer font-bold">
                                    <input type="checkbox" checked={formData.reqSheen || false} onChange={e => updateField('reqSheen', e.target.checked)} className="w-4 h-4 text-green-600 rounded bg-green-200 border-green-400" /> 
                                    No oily sheen, discolouration or odour
                                </label>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-[200px_1fr] border-b border-gray-300">
                            <div className="bg-green-200 font-bold p-3 border-r border-gray-300">Monitoring frequency</div>
                            <div className="p-0">
                                <input type="text" value={formData.monitoringFrequency || ''} onChange={e => updateField('monitoringFrequency', e.target.value)} className="w-full h-full p-3 bg-white outline-none" placeholder="Enter frequency..." />
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
                                        <th className="p-2 border border-gray-300 bg-green-200 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(formData.monitoringLogs || []).map(log => (
                                        <tr key={log.id} className="hover:bg-blue-50/50">
                                            <td className="p-1 border border-gray-300"><input type="time" value={log.time} onChange={e => updateMonitoringLog(log.id, 'time', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.mon} onChange={e => updateMonitoringLog(log.id, 'mon', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.tue} onChange={e => updateMonitoringLog(log.id, 'tue', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.wed} onChange={e => updateMonitoringLog(log.id, 'wed', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.thu} onChange={e => updateMonitoringLog(log.id, 'thu', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.fri} onChange={e => updateMonitoringLog(log.id, 'fri', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.staffMember} onChange={e => updateMonitoringLog(log.id, 'staffMember', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.monitoringLocation} onChange={e => updateMonitoringLog(log.id, 'monitoringLocation', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300"><input type="text" value={log.comments} onChange={e => updateMonitoringLog(log.id, 'comments', e.target.value)} className="w-full p-1 text-xs outline-none bg-transparent"/></td>
                                            <td className="p-1 border border-gray-300 text-center">
                                                <button onClick={() => removeMonitoringLog(log.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!formData.monitoringLogs || formData.monitoringLogs.length === 0) && (
                                        <tr><td colSpan={10} className="p-8 text-center text-gray-400 font-bold border border-gray-300">No monitoring logs recorded yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'closeout' ? 'block animate-fade-in' : 'hidden'}>
                    <ReadOnlyPermitHeader />
                    <h3 className="text-xl font-black border-b border-gray-100 pb-2 uppercase text-gray-800 mb-6">Permit Closeout</h3>
                    
                    <div className="bg-gray-50 border-2 border-gray-200 p-8 rounded-2xl relative">
                        <div className="text-center bg-cyan-200 text-black p-2 font-bold mb-4">
                            <div className="font-black text-lg">Permit closeout person</div>
                            <div>in Charge of Work to complete and return closed out permits and monitoring records to the Authoriser</div>
                        </div>
                        <div className="text-center bg-cyan-200 text-black p-2 font-bold mb-8">
                            As the Person in Charge of Work I confirm that pumping activities described in this permit have now been completed.
                        </div>

                        <div>
                            <div className="mb-4">
                                <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Closeout Operator Name *</label>
                                <input 
                                    type="text" 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                    value={formData.closureReceiverName || ''} 
                                    onChange={(e) => updateField('closureReceiverName', e.target.value)} 
                                />
                            </div>
                            <div className="mb-8">
                                <label className="block text-xs font-black mb-2 text-gray-600 uppercase">Closeout Date *</label>
                                <input 
                                    type="date" 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                    value={formData.closureDate ? formData.closureDate.split('T')[0] : ''} 
                                    onChange={(e) => updateField('closureDate', new Date(e.target.value).toISOString())} 
                                />
                            </div>
                            <SignaturePad label="Closeout Signature *" onSave={(sig) => updateField('closureSignature', sig)} initialValue={formData.closureSignature} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default NewPumpPermit;
