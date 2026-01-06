
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Printer, Users, Briefcase, Lock, Phone, ShieldCheck, AlertCircle, Check, Camera, MessageSquare, Plus, Trash2, UserPlus, ClipboardCheck, Edit3, Loader2, Pencil, X, Image as ImageIcon } from 'lucide-react';
import { Permit, ChecklistItem, Signature, DailyLog, HandoverLog, PermitNote, PermitPhoto, CrewMember } from '../types';
import { getPermitById, savePermit } from '../services/storage';
import SignaturePad from '../components/SignaturePad';

interface PermitDetailProps {
  id: string;
  onBack: () => void;
}

interface DailyGroup {
    crew: DailyLog[];
    keyRoles: Record<string, DailyLog | null>;
}

interface UploadingPhoto {
    id: string;
    name: string;
    progress: number;
    success: boolean;
    error?: string;
}

// Helper Components
const ChecklistDisplay: React.FC<{ items: ChecklistItem[], title: string, renderExtra?: (item: ChecklistItem) => React.ReactNode }> = ({ items, title, renderExtra }) => (
    <div className="mb-6 break-inside-avoid bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h4 className="font-black text-brand-900 border-b-2 border-brand-200 mb-4 pb-2 text-sm uppercase tracking-widest">{title}</h4>
        <div className="space-y-2">
            {items.map(item => (
                <div key={item.id} className="flex flex-col border-b border-gray-50 pb-2 last:border-0">
                    <div className="flex gap-2 text-xs items-start">
                        <div className="w-8 font-black text-gray-400">{item.id.replace('a','').replace('b','')}.</div>
                        <div className="flex-1 text-gray-900 font-bold leading-tight">{item.question}</div>
                        <div className={`w-12 font-black uppercase text-center rounded px-1 ${item.answer === 'yes' ? 'bg-green-100 text-green-700' : item.answer === 'no' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{item.answer || '-'}</div>
                        {item.comment && <div className="w-1/3 text-gray-500 italic text-[10px] bg-white p-1 rounded font-medium border-l-2 border-gray-200 ml-2 shadow-sm">{item.comment}</div>}
                    </div>
                    {renderExtra && renderExtra(item)}
                </div>
            ))}
        </div>
    </div>
);

const SignatureDisplay: React.FC<{ sig?: Signature, title: string }> = ({ sig, title }) => (
    <div className="border-2 border-gray-100 p-3 rounded-xl bg-white break-inside-avoid text-center shadow-sm">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter mb-2 border-b pb-1">{title}</p>
        {sig ? (
            <div className="py-1">
                {sig.type === 'draw' ? (
                    <img src={sig.data} alt="Signature" className="h-10 mx-auto object-contain" />
                ) : (
                    <p className="font-script text-xl italic text-brand-800">{sig.name}</p>
                )}
                <p className="text-[10px] font-black text-gray-900 mt-1">{sig.name}</p>
                <p className="text-[9px] text-gray-400 font-mono">{new Date(sig.date).toLocaleDateString()}</p>
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center py-4">
                <Loader2 className="animate-spin text-gray-200 mb-1" size={16} />
                <p className="text-gray-300 italic text-[10px] font-bold uppercase tracking-tighter">Pending</p>
            </div>
        )}
    </div>
);

const PermitDetail: React.FC<PermitDetailProps> = ({ id, onBack }) => {
  const [permit, setPermit] = useState<Permit | undefined>(getPermitById(id));
  const [activeTab, setActiveTab] = useState<'details' | 'daily' | 'handover' | 'closure' | 'notes'>('details');

  // Daily Sign-On State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editRole, setEditRole] = useState<'operator'|'spotter'|'foreman' | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState('');
  
  // Crew Registry State
  const [isRegisteringCrew, setIsRegisteringCrew] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [newCrewRole, setNewCrewRole] = useState('Crew');

  // Handover State
  const [handoverReceiver, setHandoverReceiver] = useState('');
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingHandoverSignature, setPendingHandoverSignature] = useState<Signature | undefined>();

  // Closure State
  const [closureReceiverName, setClosureReceiverName] = useState('');
  const [preClosureCheck1, setPreClosureCheck1] = useState(false);
  const [preClosureCheck2, setPreClosureCheck2] = useState(false);
  const [preClosureCheck3, setPreClosureCheck3] = useState(false);
  const [outstandingWorks, setOutstandingWorks] = useState('');

  // Note/Photo inputs
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAuthor, setNewNoteAuthor] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadQueue, setUploadQueue] = useState<UploadingPhoto[]>([]);
  
  // Editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!permit) return <div className="p-12 text-center text-red-600 font-black bg-white rounded-xl shadow-xl">Permit Data Failure: Not Found.</div>;

  const isClosed = permit.status === 'closed';
  const isHydro = permit.excavationType === 'hydro' || permit.excavationType === 'hand';
  
  // High contrast white background for all fields
  const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow disabled:bg-gray-50 disabled:cursor-not-allowed shadow-sm";

  // Calculate Current Receiver (Latest Handover or Initial)
  const getCurrentReceiver = (p: Permit) => {
      if (p.handoverLogs && p.handoverLogs.length > 0) {
          return p.handoverLogs[p.handoverLogs.length - 1].receiverName;
      }
      return p.receiverSignature?.name || 'Unknown Receiver';
  };
  const currentReceiver = getCurrentReceiver(permit);

  const refreshPermit = () => setPermit(getPermitById(id));

  // --- CREW REGISTRY HANDLERS ---
  const handleRegisterCrew = (sig: Signature) => {
      if (isClosed) return;
      if (!newCrewName.trim() || !permit) return;
      
      const isDuplicate = permit.crewMembers?.some(m => m.name.toLowerCase() === newCrewName.trim().toLowerCase());
      if (isDuplicate) {
          alert(`Worker "${newCrewName}" is already registered.`);
          return;
      }
      
      const newMember: CrewMember = {
          id: crypto.randomUUID(),
          name: newCrewName,
          role: newCrewRole,
          signature: sig,
          dateInducted: new Date().toISOString()
      };
      
      const updated = { ...permit, crewMembers: [...(permit.crewMembers || []), newMember] };
      savePermit(updated);
      setNewCrewName('');
      setNewCrewRole('Crew');
      setIsRegisteringCrew(false);
      refreshPermit();
  };

  // --- DAILY LOG HANDLERS ---
  const signOnCrewMember = (memberId: string) => {
      if (isClosed || !permit) return;
      const member = permit.crewMembers?.find(m => m.id === memberId);
      if (!member) return;

      const alreadySigned = permit.dailyLogs.some(l => 
          l.role === 'crew' && 
          l.name === member.name && 
          new Date(l.date).toDateString() === new Date(selectedDate).toDateString()
      );
      if (alreadySigned) return;

      const newLog: DailyLog = {
          id: crypto.randomUUID(),
          date: new Date(selectedDate + 'T08:00:00').toISOString(),
          name: member.name,
          role: 'crew',
          signature: member.signature 
      };

      const updated = { ...permit, dailyLogs: [...permit.dailyLogs, newLog] };
      savePermit(updated);
      refreshPermit();
  };

  const assignRole = () => {
      if (isClosed || !permit || !selectedCrewId || !editRole) return;
      const member = permit.crewMembers?.find(m => m.id === selectedCrewId);
      if (!member) return;

      const filteredLogs = permit.dailyLogs.filter(l => 
          !(l.role === editRole && new Date(l.date).toDateString() === new Date(selectedDate).toDateString())
      );

      const newLog: DailyLog = {
          id: crypto.randomUUID(),
          date: new Date(selectedDate + 'T08:00:00').toISOString(),
          name: member.name,
          role: editRole,
          signature: member.signature
      };
      
      const updated = { ...permit, dailyLogs: [...filteredLogs, newLog] };
      savePermit(updated);
      setSelectedCrewId('');
      setEditRole(null);
      refreshPermit();
  };

  const signOnReceiver = () => {
      if (isClosed || !permit) return;
      
      let sig: Signature | undefined;
      const lastHandover = permit.handoverLogs[permit.handoverLogs.length - 1];
      if (lastHandover) {
          sig = lastHandover.signature;
      } else {
          sig = permit.receiverSignature;
      }

      if (!sig) return;

      const alreadySigned = permit.dailyLogs.some(l => 
          l.role === 'receiver' && 
          new Date(l.date).toDateString() === new Date(selectedDate).toDateString()
      );
      if(alreadySigned) return;

      const newLog: DailyLog = {
          id: crypto.randomUUID(),
          date: new Date(selectedDate + 'T08:00:00').toISOString(),
          name: currentReceiver,
          role: 'receiver',
          signature: sig
      };
      
      const updated = { ...permit, dailyLogs: [...permit.dailyLogs, newLog] };
      savePermit(updated);
      refreshPermit();
  };

  const deleteDailyLog = (role: DailyLog['role']) => {
      if (isClosed || !permit) return;
      const updatedLogs = permit.dailyLogs.filter(l => 
          !(l.role === role && new Date(l.date).toDateString() === new Date(selectedDate).toDateString())
      );
      const updated = { ...permit, dailyLogs: updatedLogs };
      savePermit(updated);
      refreshPermit();
  };

  // --- HANDOVER & CLOSURE ---
  const addHandover = () => {
    if(isClosed || !handoverReceiver || !pendingHandoverSignature || !permit) return;
    
    const isInRegistry = permit.crewMembers?.some(m => m.name.toLowerCase() === handoverReceiver.toLowerCase());
    
    if (!isInRegistry) {
        alert(`ACCESS DENIED: "${handoverReceiver}" must be registered in the Work Crew Registry first.`);
        return;
    }

    const now = new Date();
    const timeString = `T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;
    const logDate = new Date(handoverDate + timeString).toISOString();
    
    const newHandover: HandoverLog = {
        id: crypto.randomUUID(),
        date: logDate,
        receiverName: handoverReceiver,
        signature: pendingHandoverSignature
    };
    
    const updated = { ...permit, handoverLogs: [...permit.handoverLogs, newHandover] };
    savePermit(updated);
    setHandoverReceiver('');
    setPendingHandoverSignature(undefined);
    refreshPermit();
  };

  const handleClosePermit = (sig: Signature) => {
    if(isClosed || !permit || !closureReceiverName) return;
    
    if (closureReceiverName.trim().toLowerCase() !== currentReceiver.toLowerCase()) {
        alert(`SECURITY ERROR: Only the current authorised receiver (${currentReceiver}) can close this permit.`);
        return;
    }

    if (!preClosureCheck1 || !preClosureCheck2 || !preClosureCheck3) {
        alert("MANDATORY: All pre-closure verification items must be compulsorily ticked before closing the permit.");
        return;
    }

    const updated: Permit = { 
        ...permit, 
        status: 'closed', 
        closureSignature: sig,
        closureReceiverName: closureReceiverName,
        closureDate: new Date().toISOString(),
        closureChecklistExcavationSafe: preClosureCheck1,
        closureChecklistAsBuiltReturned: preClosureCheck2,
        closureChecklistOutstandingWorks: preClosureCheck3,
        closureOutstandingWorksDetails: outstandingWorks
    };
    savePermit(updated);
    refreshPermit();
  };
  
  // --- HELPERS ---
  const updatePartBChecklist = (id: string, answer: 'yes' | 'no' | 'n/a') => {
      if (isClosed || !permit) return;
      const updatedChecklist = permit.partBChecklist.map(item => 
          item.id === id ? { ...item, answer } : item
      );
      setPermit({ ...permit, partBChecklist: updatedChecklist });
  };
  
  const updatePartBComment = (id: string, comment: string) => {
      if (isClosed || !permit) return;
      const updatedChecklist = permit.partBChecklist.map(item => 
          item.id === id ? { ...item, comment } : item
      );
      setPermit({ ...permit, partBChecklist: updatedChecklist });
  };

  const updatePartBHighRisk = (key: keyof Permit['partBHighRiskOptions'], value: boolean) => {
      if (isClosed || !permit) return;
      setPermit({ 
          ...permit, 
          partBHighRiskOptions: { 
              ...permit.partBHighRiskOptions, 
              [key]: value 
          } 
      });
  };

  const handlePartBApproval = (sig: Signature) => {
    if(isClosed || !permit) return;
    const updated: Permit = { 
        ...permit, 
        approverSignature: sig
    };
    savePermit(updated);
    refreshPermit();
  };

  const addNote = () => {
      if(isClosed || !newNoteText || !newNoteAuthor || !permit) return;
      const note: PermitNote = {
          id: crypto.randomUUID(),
          text: newNoteText,
          author: newNoteAuthor,
          role: 'Contributor',
          date: new Date().toISOString()
      };
      const updated = { ...permit, notes: [...(permit.notes || []), note] };
      savePermit(updated);
      setNewNoteText('');
      setNewNoteAuthor('');
      refreshPermit();
  };

  const deleteNote = (noteId: string) => {
      if (isClosed || !permit) return;
      if (confirm("Permanently delete this comment?")) {
          const updated = { ...permit, notes: permit.notes.filter(n => n.id !== noteId) };
          savePermit(updated);
          refreshPermit();
          setEditingNoteId(null);
      }
  };

  const deletePhoto = (photoId: string) => {
      if (isClosed || !permit) return;
      if (confirm("Permanently delete this photo?")) {
        const updated = { ...permit, photos: (permit.photos || []).filter(p => p.id !== photoId) };
        savePermit(updated);
        refreshPermit();
        setEditingPhotoId(null);
      }
  };

  const readFile = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isClosed) return;
      if (e.target.files && permit) {
          const currentCount = (permit.photos || []).length;
          const filesToAdd = Array.from(e.target.files) as File[];
          
          if (currentCount + filesToAdd.length > 10) {
              alert(`Maximum 10 photos. Existing: ${currentCount}, Adding: ${filesToAdd.length}.`);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          const initialQueue: UploadingPhoto[] = filesToAdd.map(f => ({ 
              id: crypto.randomUUID(),
              name: f.name, 
              progress: 0, 
              success: false 
          }));
          setUploadQueue(initialQueue);

          const newlyUploaded: PermitPhoto[] = [];
          
          for (let i = 0; i < filesToAdd.length; i++) {
              const file = filesToAdd[i];
              const queueId = initialQueue[i].id;
              
              try {
                setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 15 } : item));
                const dataUrl = await readFile(file);
                setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 50 } : item));
                await new Promise(r => setTimeout(r, 400));
                setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 90 } : item));
                await new Promise(r => setTimeout(r, 200));

                const photo: PermitPhoto = {
                    id: crypto.randomUUID(),
                    url: dataUrl,
                    caption: photoCaption ? `${photoCaption} (${file.name})` : file.name,
                    uploadedBy: 'User',
                    date: new Date().toISOString()
                };
                newlyUploaded.push(photo);
                setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 100, success: true } : item));
              } catch (err) {
                setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 0, success: false, error: 'Failed' } : item));
              }
          }
          
          if (newlyUploaded.length > 0) {
            const updated = { ...permit, photos: [...(permit.photos || []), ...newlyUploaded] };
            savePermit(updated);
            setPhotoCaption('');
            refreshPermit();
            setTimeout(() => setUploadQueue([]), 4000);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const dailyGroups = permit.dailyLogs.reduce<Record<string, DailyGroup>>((acc, log) => {
    const dateKey = new Date(log.date).toDateString();
    if (!acc[dateKey]) acc[dateKey] = { crew: [], keyRoles: { receiver: null, operator: null, spotter: null, foreman: null } };
    
    if (log.role === 'crew') {
        acc[dateKey].crew.push(log);
    } else {
        acc[dateKey].keyRoles[log.role] = log;
    }
    return acc;
  }, {});

  const currentDailyGroup = dailyGroups[new Date(selectedDate).toDateString()] || { crew: [], keyRoles: { receiver: null, operator: null, spotter: null, foreman: null } };

  return (
    <div className="max-w-5xl mx-auto pb-12 print:pb-0">
      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 flex items-center font-bold">
          <ArrowLeft size={16} className="mr-1" /> Back to Register
        </button>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => window.print()} 
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-black shadow-lg transition-all font-bold active:scale-95"
          >
            <Printer size={18} /> Print Permit
          </button>
        </div>
      </div>

      <div className="bg-white rounded-t-2xl border border-gray-200 p-8 flex justify-between items-start print:border-none print:p-0 print:mb-6 shadow-sm">
        <div>
            <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="text-brand-600" size={32} />
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                    {permit.itwocxNumber ? `ITWOcx: ${permit.itwocxNumber}` : 'No ITWOcx #'}
                </h1>
            </div>
            <div className="text-lg text-gray-500 font-black font-mono">
                {permit.permitNumber}
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-3 font-bold uppercase tracking-widest">
                <span className="bg-gray-100 px-2 py-1 rounded text-gray-900 mr-4 shadow-sm">{permit.location}</span>
                <span className="text-gray-300">|</span>
                <span className="mx-4">Issued: {new Date(permit.createdAt).toLocaleDateString()}</span>
                <span className="text-gray-300">|</span>
                <span className="ml-4 text-brand-700">Authorised Receiver: {currentReceiver}</span>
            </div>
        </div>
        <div className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-inner ${permit.status === 'active' ? 'bg-green-600 text-white animate-pulse' : 'bg-gray-800 text-white'}`}>
            {permit.status}
        </div>
      </div>

      <div className="flex border-b-4 border-gray-100 bg-white no-print overflow-x-auto sticky top-16 z-40 shadow-sm">
        {[
            { id: 'details', label: 'Permit Specs', icon: ClipboardCheck },
            { id: 'daily', label: 'Daily Sign-On', icon: Users },
            { id: 'handover', label: 'Handovers', icon: Briefcase },
            { id: 'notes', label: 'Photos & Notes', icon: ImageIcon },
            { id: 'closure', label: 'Permit Closure', icon: Lock }
        ].map(tab => (
            <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`px-8 py-5 text-xs font-black uppercase tracking-widest flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === tab.id ? 'text-brand-700 border-b-4 border-brand-600 bg-brand-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
                <tab.icon size={16} /> {tab.label}
            </button>
        ))}
      </div>

      <div className="bg-white shadow-xl border-x border-b border-gray-200 p-8 min-h-[700px] print:border-none print:shadow-none print:p-0 print:min-h-0">
        
        {/* VIEW: DETAILS */}
        <div className={`${activeTab === 'details' ? 'block' : 'hidden'} print-force-show animate-in fade-in duration-300`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                <div className="bg-white p-6 rounded-2xl border-2 border-gray-100 shadow-sm">
                    <h3 className="text-[10px] font-black text-brand-700 uppercase tracking-[0.3em] mb-4 border-b-2 border-brand-100 pb-1">Scope of Works</h3>
                    <p className="text-sm font-bold text-gray-800 leading-relaxed whitespace-pre-wrap">{permit.scopeOfWorks}</p>
                </div>
                <div>
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 border-b-2 border-gray-100 pb-1">Authorisation</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <SignatureDisplay title="Engineer" sig={permit.siteEngineerSignature} />
                        <SignatureDisplay title="Issuer" sig={permit.issuerSignature} />
                        <SignatureDisplay title="Receiver" sig={permit.receiverSignature} />
                        <SignatureDisplay title="Approver" sig={permit.approverSignature} />
                    </div>
                </div>
            </div>

            {!isClosed && !isHydro && permit.status === 'active' && !permit.approverSignature && (
                <div className="mb-10 bg-white border-4 border-red-600 rounded-3xl p-8 no-print shadow-2xl">
                    <div className="flex items-start gap-5 mb-6">
                        <div className="p-4 bg-red-600 rounded-full text-white shadow-lg">
                             <ShieldCheck size={32} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-red-800 uppercase tracking-tighter">Part B Approval Required</h3>
                            <p className="text-sm text-red-700 font-bold">Mechanical excavation checks required for permit activation.</p>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl border-2 border-red-100 mb-6 shadow-sm">
                        <div className="space-y-4">
                            {permit.partBChecklist.map(item => (
                                <div key={item.id} className="border-b border-gray-50 pb-4 last:border-0">
                                    <p className="text-sm text-gray-900 font-bold mb-2">{item.id}. {item.question}</p>
                                    
                                    {item.id === '5' && (
                                        <div className="ml-4 mb-3 flex flex-wrap gap-4 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                            <label className="flex items-center text-xs cursor-pointer group">
                                                <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" checked={permit.partBHighRiskOptions.power11kv} onChange={(e) => updatePartBHighRisk('power11kv', e.target.checked)} />
                                                <span className="font-black text-gray-700 group-hover:text-red-600">{'>'}11kV Mains Power</span>
                                            </label>
                                            <label className="flex items-center text-xs cursor-pointer group">
                                                <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" checked={permit.partBHighRiskOptions.gasHighPressure} onChange={(e) => updatePartBHighRisk('gasHighPressure', e.target.checked)} />
                                                <span className="font-black text-gray-700 group-hover:text-red-600">High Pressure Gas</span>
                                            </label>
                                            <label className="flex items-center text-xs cursor-pointer group">
                                                <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" checked={permit.partBHighRiskOptions.mainFibre} onChange={(e) => updatePartBHighRisk('mainFibre', e.target.checked)} />
                                                <span className="font-black text-gray-700 group-hover:text-red-600">Main Fibre</span>
                                            </label>
                                        </div>
                                    )}

                                    <div className="flex space-x-6 mb-3 px-2">
                                        {(['yes', 'no', 'n/a'] as const).map(opt => (
                                            <label key={opt} className="flex items-center space-x-2 cursor-pointer">
                                                <input type="radio" name={`approve-partB-${item.id}`} checked={item.answer === opt} onChange={() => updatePartBChecklist(item.id, opt)} className="text-brand-600 focus:ring-brand-500 bg-white border border-gray-300 h-5 w-5" />
                                                <span className="uppercase text-xs font-black text-gray-900">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <input type="text" placeholder="Add verification comment..." value={item.comment || ''} onChange={(e) => updatePartBComment(item.id, e.target.value)} className={inputClass} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="max-w-md bg-white p-6 rounded-2xl shadow-xl border-2 border-red-100">
                         <SignaturePad label="Approver Signature" onSave={handlePartBApproval} />
                    </div>
                </div>
            )}
            
            <div className="mb-8 border-2 border-gray-100 p-6 rounded-2xl bg-white break-inside-avoid shadow-sm">
                <h4 className="text-xs font-black text-brand-900 mb-4 uppercase tracking-widest border-b-2 border-brand-100 pb-1">Site Risks</h4>
                 {[
                    { label: 'Has area been scanned?', val: permit.knownServicesScanned, cmt: permit.knownServicesScannedComment },
                    { label: 'Services marked?', val: permit.servicesMarked, cmt: permit.servicesMarkedComment },
                    { label: 'Potholing markers present?', val: permit.potholingMarkers, cmt: permit.potholingMarkersComment },
                    { label: 'Transpower designation?', val: permit.transpowerDesignation, cmt: permit.transpowerDesignationComment },
                    { label: 'Watercare works over?', val: permit.watercareWorksOver, cmt: permit.watercareWorksOverComment }
                ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs border-b border-gray-100 py-3 last:border-0">
                        <span className="text-gray-900 font-black w-1/2 uppercase tracking-tighter">{item.label}</span>
                        <div className="w-1/2 flex flex-col items-end">
                            <span className={`font-black uppercase px-2 py-0.5 rounded ${item.val === 'yes' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>{item.val || '-'}</span>
                            {item.cmt && <span className="text-gray-500 font-bold italic mt-2 text-right bg-white p-2 rounded border border-gray-100 text-[10px] shadow-sm">{item.cmt}</span>}
                        </div>
                    </div>
                ))}
            </div>

            <ChecklistDisplay title="Part A: Service Identification" items={permit.partAChecklist} />
            <div className="page-break" />
            
            <div className="mb-10 border-2 border-gray-100 p-6 rounded-2xl bg-white break-inside-avoid shadow-md">
                <h4 className="text-xs font-black text-brand-900 mb-4 uppercase tracking-widest border-b-2 border-brand-100 pb-1">Close Approach Safety</h4>
                <div className="overflow-x-auto rounded-xl border-2 border-gray-100 shadow-inner">
                    <table className="min-w-full text-xs text-left bg-white">
                        <thead className="bg-gray-800 font-black uppercase text-white">
                            <tr>
                                <th className="px-3 py-3 border-r border-gray-700">Overhead Hazard</th>
                                <th className="px-3 py-3 border-r border-gray-700 text-center">Distance</th>
                                <th className="px-3 py-3 border-r border-gray-700">Underground Hazard</th>
                                <th className="px-3 py-3 text-center">Distance</th>
                            </tr>
                        </thead>
                        <tbody className="font-bold">
                            <tr className="border-b border-gray-100">
                                <td className="px-3 py-2 border-r bg-white">Electricity</td>
                                <td className="px-3 py-2 border-r text-center">{permit.partACloseApproach.overheadElectricityDist || '-'}</td>
                                <td className="px-3 py-2 border-r bg-white">Electricity</td>
                                <td className="px-3 py-2 text-center">{permit.partACloseApproach.undergroundElectricityDist || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="px-3 py-2 border-r bg-white">Rail</td>
                                <td className="px-2 py-2 border-r text-center">{permit.partACloseApproach.overheadRailDist || '-'}</td>
                                <td className="px-3 py-2 border-r bg-white">Fibre</td>
                                <td className="px-3 py-2 text-center">{permit.partACloseApproach.undergroundFibreDist || '-'}</td>
                            </tr>
                            <tr>
                                <td className="px-3 py-2 border-r bg-white">Other</td>
                                <td className="px-3 py-2 border-r text-center">{permit.partACloseApproach.overheadOtherDist || '-'}</td>
                                <td className="px-3 py-2 border-r bg-white">Gas</td>
                                <td className="px-3 py-2 text-center">{permit.partACloseApproach.undergroundGasDist || '-'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {isHydro ? (
                <div className="p-10 bg-white rounded-3xl text-center text-sm font-black text-gray-400 border-4 border-dashed border-gray-100 my-10 uppercase tracking-widest shadow-sm">
                    Mechanical Modules B & Receiver Checklist Inactive
                </div>
            ) : (
                <>
                    <ChecklistDisplay title="Part B: Mechanical Verification" items={permit.partBChecklist} />
                    <div className="page-break" />
                    <ChecklistDisplay title="Receiver Verification Checklist" items={permit.receiverChecklist} />
                </>
            )}
        </div>

        {/* VIEW: DAILY SIGN ON */}
        <div className={`${activeTab === 'daily' ? 'block' : 'hidden'} print-force-show animate-in slide-in-from-right-10 duration-300`}>
            <div className="mb-12 border-b-2 border-gray-100 pb-10 no-print">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Crew Master Register</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-tighter">Induct workers once here before sign-on.</p>
                    </div>
                    {!isClosed && (
                      <button onClick={() => setIsRegisteringCrew(!isRegisteringCrew)} className="flex items-center gap-2 text-xs bg-gray-900 text-white font-black uppercase tracking-widest px-5 py-3 rounded-xl hover:bg-black shadow-lg transition-all active:scale-95">
                          <UserPlus size={16} /> {isRegisteringCrew ? 'Cancel' : 'Register Member'}
                      </button>
                    )}
                </div>

                {isRegisteringCrew && !isClosed && (
                    <div className="bg-white p-6 rounded-2xl border-4 border-brand-200 mb-8 shadow-2xl animate-in zoom-in-95">
                        <div className="flex flex-col sm:flex-row gap-5 mb-5">
                            <input type="text" placeholder="Worker Full Name" className={inputClass} value={newCrewName} onChange={e => setNewCrewName(e.target.value)} />
                            <select className={inputClass} value={newCrewRole} onChange={e => setNewCrewRole(e.target.value)}>
                                <option value="Crew">Crew Member</option>
                                <option value="Foreman">Foreman</option>
                                <option value="Operator">Operator</option>
                                <option value="Spotter">Spotter</option>
                                <option value="Permit Receiver">Permit Receiver</option>
                            </select>
                        </div>
                        <div className="bg-white p-4 rounded-xl border-2 border-gray-100 shadow-inner">
                            <SignaturePad label="Induction Signature" onSave={handleRegisterCrew} externalName={newCrewName} />
                        </div>
                    </div>
                )}
                
                <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 shadow-md">
                    <table className="min-w-full divide-y divide-gray-100 bg-white">
                         <thead className="bg-gray-900 text-[10px] font-black uppercase text-white tracking-widest">
                            <tr><th className="px-6 py-4 text-left">Name</th><th className="px-6 py-4 text-left">Role</th><th className="px-6 py-4 text-left">Signature</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                             {permit.crewMembers?.map(member => (
                                 <tr key={member.id} className="hover:bg-brand-50/20 transition-colors">
                                     <td className="px-6 py-4 text-sm font-black text-gray-900 uppercase tracking-tighter">{member.name}</td>
                                     <td className="px-6 py-4 text-xs font-bold text-gray-600 uppercase">{member.role}</td>
                                     <td className="px-6 py-4"><img src={member.signature.data} className="h-6 grayscale opacity-50" alt="Sig" /></td>
                                 </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-gray-900 uppercase tracking-tighter">Daily Sign-off Cycle</h3>
            <div className="bg-brand-50 border-2 border-brand-200 p-6 rounded-2xl mb-10 no-print shadow-inner">
                <div className="flex flex-col sm:flex-row gap-6 items-end">
                    <div className="w-full sm:w-auto">
                        <label className="block text-[10px] font-black text-brand-800 uppercase mb-2 ml-1 tracking-widest">Date Selection</label>
                        <input type="date" className={inputClass} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} disabled={isClosed} />
                    </div>
                    {!isClosed && (
                      <div className="w-full sm:w-auto flex-1">
                           <button onClick={signOnReceiver} disabled={currentDailyGroup.keyRoles.receiver !== null} className={`w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 ${currentDailyGroup.keyRoles.receiver ? 'bg-green-600 text-white cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
                               {currentDailyGroup.keyRoles.receiver ? <><Check size={18}/> Reviewed by {currentDailyGroup.keyRoles.receiver.name}</> : `Initial Receiver Review as ${currentReceiver}`}
                           </button>
                      </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 no-print">
                {(['receiver', 'operator', 'spotter', 'foreman'] as const).map(role => {
                    const assigned = currentDailyGroup.keyRoles[role];
                    const isEditing = !isClosed && editRole === role;
                    
                    return (
                        <div key={role} className={`border-2 rounded-2xl p-5 transition-all relative shadow-md bg-white ${assigned ? 'border-green-300' : 'border-gray-100 hover:border-brand-200'}`}>
                             <div className="flex justify-between items-start mb-4">
                                 <h4 className="font-black text-xs uppercase tracking-widest text-gray-500">{role} Review</h4>
                                 {assigned && (
                                     <button onClick={() => deleteDailyLog(role)} className="p-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors shadow-sm" title="Clear/Edit Sign-on">
                                         <X size={14} />
                                     </button>
                                 )}
                             </div>
                             {assigned ? (
                                 <div className="flex items-center gap-4">
                                     <div className="bg-white p-1 rounded border shadow-sm"><img src={assigned.signature.data} className="h-10 w-24 object-contain grayscale" alt="sig" /></div>
                                     <p className="font-black text-xs text-gray-900 tracking-tighter uppercase">{assigned.name}</p>
                                 </div>
                             ) : (
                                 !isClosed && !isEditing && (
                                     <button onClick={() => setEditRole(role)} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-[10px] font-black uppercase tracking-widest hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 transition-all flex items-center justify-center gap-2">
                                         <Edit3 size={14} /> Tap to Assign
                                     </button>
                                 )
                             )}
                             {isEditing && (
                                 <div className="mt-2 bg-white p-4 rounded-2xl shadow-2xl border-4 border-brand-200 absolute left-0 right-0 z-50 animate-in zoom-in-95">
                                     <select className={inputClass} value={selectedCrewId} onChange={e => setSelectedCrewId(e.target.value)} autoFocus>
                                        <option value="">-- Choose From Crew --</option>
                                        {permit.crewMembers?.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()} ({m.role})</option>)}
                                     </select>
                                     <div className="flex gap-3 mt-4">
                                         <button onClick={assignRole} disabled={!selectedCrewId} className="flex-1 bg-brand-600 text-white text-[10px] font-black uppercase py-3 rounded-lg shadow-lg hover:bg-brand-700">Confirm</button>
                                         <button onClick={() => setEditRole(null)} className="flex-1 bg-gray-100 text-gray-600 text-[10px] font-black uppercase py-3 rounded-lg hover:bg-gray-200">Cancel</button>
                                     </div>
                                 </div>
                             )}
                        </div>
                    );
                })}
            </div>
            
            <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 mb-10 shadow-lg">
                <table className="min-w-full divide-y divide-gray-100 bg-white text-center">
                    <thead className="bg-gray-900 text-[9px] font-black uppercase text-white tracking-widest">
                        <tr><th className="px-6 py-4 text-left">Date</th><th>Receiver</th><th>Operator</th><th>Spotter</th><th>Foreman</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {Object.entries(dailyGroups).map(([date, group]: [string, DailyGroup]) => (
                            <tr key={date} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 text-xs font-black text-gray-900 text-left">{date}</td>
                                {['receiver', 'operator', 'spotter', 'foreman'].map(r => (
                                    <td key={r} className="py-2">
                                        {group.keyRoles[r] ? <img src={group.keyRoles[r]?.signature.data} className="h-6 mx-auto grayscale opacity-40" /> : <span className="text-gray-100 font-bold uppercase text-[8px]">Pending</span>}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* VIEW: NOTES & PHOTOS */}
        <div className={`${activeTab === 'notes' ? 'block' : 'hidden'} print-force-show animate-in zoom-in-95 duration-300`}>
             <h3 className="text-2xl font-black mb-8 text-gray-900 uppercase tracking-tighter">Site Evidence & Comments</h3>
             
             <div className="mb-12">
                 <div className="space-y-6">
                     {permit.notes.map(note => (
                         <div key={note.id} className="group bg-white p-6 rounded-2xl border-2 border-gray-100 shadow-md relative">
                             {!isClosed && (
                                 <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button onClick={() => setEditingNoteId(editingNoteId === note.id ? null : note.id)} className="p-2 bg-gray-900 text-white rounded-xl shadow-lg hover:bg-brand-600"><Pencil size={14} /></button>
                                 </div>
                             )}
                             <p className="text-sm font-bold text-gray-900 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                             <div className="mt-4 flex justify-between text-[10px] text-gray-400 font-black uppercase tracking-widest">
                                 <span className="bg-gray-50 px-2 py-0.5 rounded text-gray-500 border border-gray-100">{note.author}</span>
                                 <span className="font-mono">{new Date(note.date).toLocaleString()}</span>
                             </div>
                             {editingNoteId === note.id && (
                                 <div className="mt-4 pt-4 border-t-2 border-red-50 flex justify-end">
                                     <button onClick={() => deleteNote(note.id)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-100 hover:bg-red-100 transition-colors"><Trash2 size={14} /> Remove Comment</button>
                                 </div>
                             )}
                         </div>
                     ))}
                 </div>
                 
                 {!isClosed && permit.status === 'active' && (
                     <div className="mt-8 bg-white p-6 rounded-2xl border-4 border-brand-50 no-print shadow-sm">
                         <h5 className="text-[10px] font-black uppercase mb-4 text-brand-900 tracking-widest ml-1">New Site Comment</h5>
                         <div className="space-y-4">
                            <input type="text" placeholder="Author Name" className={inputClass} value={newNoteAuthor} onChange={e => setNewNoteAuthor(e.target.value)} />
                            <textarea placeholder="Record methodology changes or general site notes..." className={`${inputClass} h-32 resize-none`} value={newNoteText} onChange={e => setNewNoteText(e.target.value)} />
                            <button onClick={addNote} className="px-8 py-3 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-brand-700 transition-all flex items-center gap-2"><Plus size={16}/> Record Entry</button>
                         </div>
                     </div>
                 )}
             </div>

             <div>
                 <div className="flex justify-between items-end border-b-2 border-gray-100 mb-6 pb-2">
                    <h4 className="font-black text-[10px] text-gray-500 uppercase tracking-widest">Photographic Evidence Logs</h4>
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full border border-gray-200 bg-white shadow-sm">{(permit.photos || []).length} / 10 MAX</span>
                 </div>

                 {uploadQueue.length > 0 && (
                     <div className="mb-8 space-y-3 no-print">
                         {uploadQueue.map((item) => (
                             <div key={item.id} className="bg-white border-2 border-gray-50 rounded-2xl p-4 shadow-md">
                                 <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                                     <span className="truncate max-w-[200px] text-gray-900 tracking-tighter">{item.name}</span>
                                     {item.success ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100 shadow-sm animate-pulse">SUCCESS!</span> : <span className="text-brand-600">{item.progress}%</span>}
                                 </div>
                                 <div className="w-full bg-white border border-gray-100 h-2 rounded-full overflow-hidden shadow-inner">
                                     <div className={`h-full transition-all duration-300 ${item.success ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${item.progress}%` }} />
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                     {permit.photos.map(photo => (
                         <div key={photo.id} className="group bg-white border-2 border-gray-100 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all relative">
                             <div className="relative aspect-video bg-gray-900">
                                <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                {!isClosed && (
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditingPhotoId(editingPhotoId === photo.id ? null : photo.id)} className="p-2 bg-gray-900 text-white rounded-xl shadow-2xl hover:bg-brand-600 active:scale-95"><Pencil size={14} /></button>
                                    </div>
                                )}
                                {editingPhotoId === photo.id && (
                                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-300 backdrop-blur-sm">
                                        <div className="bg-white rounded-2xl p-6 w-full shadow-2xl scale-100 animate-in zoom-in-95">
                                            <div className="flex justify-between items-center mb-5 border-b pb-2">
                                                <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Media Control</span>
                                                <button onClick={() => setEditingPhotoId(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400"/></button>
                                            </div>
                                            <button onClick={() => deletePhoto(photo.id)} className="w-full flex items-center justify-center gap-3 py-4 bg-red-600 text-white rounded-xl shadow-lg hover:bg-red-700 transition-all font-black uppercase tracking-widest text-xs active:scale-95"><Trash2 size={18} /> Wipe Image Record</button>
                                        </div>
                                    </div>
                                )}
                             </div>
                             <div className="p-5">
                                 <p className="text-sm font-black text-gray-900 line-clamp-2 uppercase tracking-tighter leading-tight mb-2">{photo.caption}</p>
                                 <div className="flex justify-between items-center mt-auto pt-3 border-t border-gray-50">
                                    <p className="text-[9px] text-gray-400 font-mono font-bold uppercase">{new Date(photo.date).toLocaleDateString()}</p>
                                    <span className="text-[9px] bg-brand-50 px-2 py-0.5 rounded-full text-brand-700 font-black uppercase tracking-widest">Media Verified</span>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>

                 {!isClosed && permit.status === 'active' && (permit.photos || []).length < 10 && (
                     <div className="mt-12 bg-white p-10 rounded-[3rem] border-4 border-dashed border-gray-200 no-print hover:border-brand-400 hover:shadow-2xl transition-all duration-500 shadow-sm">
                         <div className="max-w-lg mx-auto text-center">
                            <div className="mb-8">
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest ml-1 text-left">Evidence Context (Optional)</label>
                                <input type="text" placeholder="Description of photographic evidence..." className={`${inputClass} text-center py-4 bg-white border-2 border-gray-200 shadow-md rounded-2xl focus:border-brand-500`} value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} />
                            </div>
                            <div onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-16 bg-white rounded-[2.5rem] border-4 border-gray-50 cursor-pointer shadow-xl hover:shadow-brand-200/50 hover:border-brand-500 transition-all active:scale-[0.97] group">
                                <div className="p-8 bg-brand-50 text-brand-600 rounded-full mb-8 shadow-inner group-hover:scale-110 transition-transform"><Camera size={72} /></div>
                                <span className="text-2xl font-black text-gray-900 mb-3 tracking-tighter uppercase">Launch Evidence Capture</span>
                                <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto mb-8 uppercase tracking-tighter">Device will prompt for <strong className="text-gray-600">Rear Camera</strong>, <strong className="text-gray-600">Gallery</strong>, or <strong className="text-gray-600">Files</strong></p>
                                <div className="flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl hover:bg-brand-600">
                                    <Plus size={20} /> Select Multi-Shot Evidence
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                            </div>
                         </div>
                     </div>
                 )}
             </div>
        </div>

        {/* VIEW: HANDOVER */}
        <div className={`${activeTab === 'handover' ? 'block' : 'hidden'} print-force-show animate-in slide-in-from-left-10 duration-300`}>
             <h3 className="text-2xl font-black mb-8 text-gray-900 uppercase tracking-tighter">Transfer of Operational Control</h3>
             <div className="rounded-2xl overflow-hidden mb-10 border-2 border-gray-100 shadow-xl">
                <table className="min-w-full divide-y divide-gray-100 bg-white">
                    <thead className="bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest">
                        <tr><th className="px-6 py-4 text-left">Sequence</th><th className="px-6 py-4 text-left">New Receiver</th><th className="px-6 py-4 text-left">Timestamp</th><th className="px-6 py-4 text-left">Sign-Off</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-black uppercase text-xs">
                         {permit.handoverLogs.length === 0 ? <tr><td colSpan={4} className="p-12 text-center text-gray-300 uppercase tracking-widest">No Control Transfers Recorded.</td></tr> : permit.handoverLogs.map((log, idx) => (
                             <tr key={log.id} className="hover:bg-brand-50/20"><td className="px-6 py-4 text-gray-300">{idx + 1}</td><td className="px-6 py-4 text-gray-900">{log.receiverName}</td><td className="px-6 py-4 text-gray-500">{new Date(log.date).toLocaleString()}</td><td className="px-6 py-4"><img src={log.signature.data} className="h-8 grayscale opacity-50" alt="Sig" /></td></tr>
                         ))}
                    </tbody>
                </table>
             </div>
             {!isClosed && permit.status === 'active' && (
                 <div className="bg-white p-8 rounded-3xl border-4 border-brand-50 max-w-xl mx-auto no-print shadow-2xl">
                    <h4 className="font-black text-xl text-brand-900 mb-6 text-center uppercase tracking-tighter">Control Acceptance Form</h4>
                    <div className="mb-6">
                        <select className={inputClass} value={handoverReceiver} onChange={e => setHandoverReceiver(e.target.value)}>
                            <option value="">-- Select Inducted Receiver --</option>
                            {permit.crewMembers?.map(m => <option key={m.id} value={m.name}>{m.name.toUpperCase()} ({m.role})</option>)}
                        </select>
                    </div>
                    <div className="mb-8"><input type="date" className={inputClass} value={handoverDate} onChange={e => setHandoverDate(e.target.value)} /></div>
                    <div className="mb-8 bg-white p-2 rounded-2xl border-2 border-brand-50 shadow-inner"><SignaturePad label="Receiver Acceptance Signature" onSave={setPendingHandoverSignature} externalName={handoverReceiver} /></div>
                    <button onClick={addHandover} disabled={!pendingHandoverSignature || !handoverReceiver} className="w-full py-5 bg-brand-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 disabled:opacity-30">Execute Control Transfer</button>
                 </div>
             )}
        </div>

        {/* VIEW: CLOSURE */}
        <div className={`${activeTab === 'closure' ? 'block' : 'hidden'} print-force-show animate-in fade-in duration-500`}>
            <h3 className="text-2xl font-black mb-8 text-gray-900 uppercase tracking-tighter">Formal Permit Decommissioning</h3>
            
            {isClosed ? (
                <div className="bg-green-600 p-12 rounded-[3rem] text-center text-white shadow-2xl border-8 border-green-500/50">
                    <div className="inline-block p-6 bg-white/20 rounded-full mb-6 shadow-inner"><Lock className="text-white" size={48} /></div>
                    <h3 className="text-4xl font-black mb-2 uppercase tracking-tighter">Operational Record Terminated</h3>
                    <p className="text-lg font-bold opacity-80 mb-10">Compliance Cycle Completed and Sealed.</p>
                    <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-2xl text-gray-900">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 border-b pb-2">Master Log Closure</p>
                        <div className="space-y-4 text-left">
                            <div><p className="text-[10px] font-black text-gray-400 uppercase">Authorised Closer</p><p className="text-xl font-black uppercase tracking-tighter">{permit.closureReceiverName}</p></div>
                            <div><p className="text-[10px] font-black text-gray-400 uppercase">Timestamp</p><p className="text-sm font-mono font-bold">{new Date(permit.closureDate!).toLocaleString()}</p></div>
                        </div>
                        {permit.closureSignature && <div className="mt-6 border-t pt-4"><img src={permit.closureSignature.data} className="h-20 mx-auto grayscale" alt="Sig" /></div>}
                    </div>
                </div>
            ) : (
                <div className="max-w-2xl mx-auto">
                    <div className="mb-10 text-center animate-pulse">
                        <p className="text-red-600 font-black text-lg uppercase tracking-tighter border-4 border-red-600 p-4 rounded-2xl bg-white shadow-xl">
                            ONLY THE CURRENT RECEIVER ({currentReceiver.toUpperCase()}) IS AUTHORISED TO CLOSE THIS PERMIT
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-[2rem] border-4 border-gray-100 text-gray-900 mb-10 shadow-xl">
                        <h4 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-3 border-b-4 border-gray-50 pb-2"><ShieldCheck className="text-brand-600" /> Pre-Closure Verification Checklist</h4>
                        <div className="space-y-6">
                            <label className="flex items-start gap-4 p-4 rounded-2xl bg-white border-2 border-gray-50 shadow-sm hover:border-brand-200 cursor-pointer transition-all">
                                <input type="checkbox" className="h-6 w-6 mt-1 rounded border-gray-300 text-brand-600" checked={preClosureCheck1} onChange={e => setPreClosureCheck1(e.target.checked)} />
                                <span className="text-sm font-black text-gray-700 uppercase tracking-tighter">1. The authorised excavation has been completed and the work site has been left in a safe condition.</span>
                            </label>
                            <label className="flex items-start gap-4 p-4 rounded-2xl bg-white border-2 border-gray-50 shadow-sm hover:border-brand-200 cursor-pointer transition-all">
                                <input type="checkbox" className="h-6 w-6 mt-1 rounded border-gray-300 text-brand-600" checked={preClosureCheck2} onChange={e => setPreClosureCheck2(e.target.checked)} />
                                <span className="text-sm font-black text-gray-700 uppercase tracking-tighter">2. The site services plan has been accurately As‑Built for all new services and returned to the Site Services Coordinator.</span>
                            </label>
                            <div className="p-4 rounded-2xl bg-white border-2 border-gray-50 shadow-sm">
                                <label className="flex items-start gap-4 cursor-pointer mb-4">
                                    <input type="checkbox" className="h-6 w-6 mt-1 rounded border-gray-300 text-brand-600" checked={preClosureCheck3} onChange={e => setPreClosureCheck3(e.target.checked)} />
                                    <span className="text-sm font-black text-gray-700 uppercase tracking-tighter">3. The work has not been completed and the following remains outstanding:</span>
                                </label>
                                <textarea placeholder="Enter details of outstanding works or site state..." className={`${inputClass} h-32 resize-none border-2`} value={outstandingWorks} onChange={e => setOutstandingWorks(e.target.value)} />
                            </div>
                        </div>
                    </div>
                    
                    <div className="mb-10">
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest text-center">Confirm Legal Identity</label>
                        <select className={`${inputClass} text-lg py-4 text-center border-4 border-gray-100 shadow-xl focus:border-red-500`} value={closureReceiverName} onChange={e => setClosureReceiverName(e.target.value)}>
                            <option value="">-- SELECT IDENTITY --</option>
                            <option value={currentReceiver}>{currentReceiver.toUpperCase()} (AUTHORISED RECEIVER)</option>
                            {permit.crewMembers?.filter(m => m.name !== currentReceiver).map(m => <option key={m.id} value={m.name}>{m.name.toUpperCase()} (INDUCTED CREW - UNAUTHORISED)</option>)}
                        </select>
                        {closureReceiverName && closureReceiverName !== currentReceiver && <div className="mt-6 p-5 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl flex items-center gap-4 shadow-2xl animate-bounce-subtle"><X size={32} /> Identity Mismatch: Access Refused. Only {currentReceiver.toUpperCase()} is permitted to close.</div>}
                    </div>

                    <div className={(!closureReceiverName || closureReceiverName !== currentReceiver || !preClosureCheck1 || !preClosureCheck2 || !preClosureCheck3) ? 'opacity-10 pointer-events-none grayscale' : 'animate-in fade-in duration-500'}>
                        <div className="bg-white p-6 rounded-[2.5rem] border-4 border-gray-50 shadow-2xl"><SignaturePad label="Receiver Final Sign-off" onSave={handleClosePermit} externalName={closureReceiverName} /></div>
                        <p className="text-center text-[10px] font-black text-red-600 uppercase tracking-widest mt-6 bg-red-50 py-2 rounded-xl border border-red-100">Warning: Digital signature will permanently terminate permit cycle</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="mt-12 bg-gray-900 text-white p-10 rounded-[3rem] shadow-2xl no-print relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Phone size={120} /></div>
          <h3 className="font-black text-2xl mb-8 flex items-center text-red-500 uppercase tracking-tighter"><Phone className="mr-3" size={32} /> EMERGENCY RESPONSE PROTOCOL</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
              <div className="bg-black/20 p-8 rounded-3xl border border-white/5">
                  <p className="font-black text-xs uppercase tracking-widest mb-6 text-red-400 border-b border-red-900/50 pb-2">Utility Strike Actions</p>
                  <ul className="space-y-5 text-sm font-bold uppercase tracking-tighter">
                      <li className="flex items-start gap-4"><div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0 shadow-lg">1</div> <span>Cease all operations immediately.</span></li>
                      <li className="flex items-start gap-4"><div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0 shadow-lg">2</div> <span>Evacuate to safe muster zone.</span></li>
                      <li className="flex items-start gap-4"><div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0 shadow-lg">3</div> <span>Seal area from public/personnel.</span></li>
                      <li className="flex items-start gap-4"><div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0 shadow-lg">4</div> <span>Dispatch emergency utility contact.</span></li>
                  </ul>
              </div>
              <div className="bg-black/40 p-8 rounded-3xl border border-white/5 backdrop-blur-sm">
                  <p className="font-black text-[10px] uppercase tracking-widest mb-6 text-gray-500 border-b border-white/5 pb-2">24/7 Asset Dispatch</p>
                  <table className="w-full text-xs">
                      <tbody className="divide-y divide-white/5 font-black uppercase tracking-tighter">
                          <tr><td className="py-4 text-gray-400">Vector Gas Emergency</td><td className="text-right font-mono text-brand-400">0800 764 764</td></tr>
                          <tr><td className="py-4 text-gray-400">Vector Power Faults</td><td className="text-right font-mono text-brand-400">0508 832 867</td></tr>
                          <tr><td className="py-4 text-gray-400">Watercare Operations</td><td className="text-right font-mono text-brand-400">09 442 2222</td></tr>
                          <tr><td className="py-4 text-gray-400">Chorus Damage Desk</td><td className="text-right font-mono text-brand-400">0800 463 896</td></tr>
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
    </div>
  );
};

export default PermitDetail;
