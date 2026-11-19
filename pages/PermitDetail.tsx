// ARCHIVO: src/pages/PermitDetail.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DebouncedInput, DebouncedTextArea, SyncedSelect, flushPendingFields } from '../components/DebouncedFields';
import { addDaysISO, formatDateTime } from '../utils/dateUtils';
import { ArrowLeft, Printer, Users, Briefcase, Lock, ImageIcon, CloudUpload, Loader2, Camera, AlertTriangle, ShieldCheck, Info, CheckCircle, FileSignature, CloudOff, Wifi, Trash2 } from 'lucide-react';
import { Permit, PermitNote, Signature, HandoverLog, DailySignOff, PermitPhoto, CeaseWorksRecord, CrewMember, INITIAL_PART_A, INITIAL_PART_B, INITIAL_RECEIVER_CHECKLIST, INITIAL_HANDOVER_CHECKLIST } from '../types';
import { getPermitById, savePermit } from '../services/storage';
import { getUserRole } from '../services/cx';
import SignaturePad from '../components/SignaturePad';
import AclSignature from '../components/AclSignature';
import { AclUser } from '../utils/acl';
import { getActiveReceiver, activeReceiverKey, isCurrentUserActiveReceiver } from '../utils/receiverOwnership';
import { hasLockedPreworkChanges, isPreworkLocked } from '../utils/permitLock';
import PermitPDFLayout, { EmergencyProtocolContent } from '../components/PermitPDFLayout';
import jsPDF from 'jspdf';
import { uploadImageToStorage } from '../firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { sanitizeForFirestore } from '../utils/firestore';
import { getDisplayNameFromEmail } from '../utils/userNames';
import { generateId } from '../utils/id';
import { compressImageToJpeg, compressPermitImagesForPdf } from '../utils/image';
import { renderPagesToPdf, loadImageAsCompressedJpeg } from '../utils/pdf';
import { getTargetCollection } from '../utils/appMode';
import { buildAuditPdfUrl } from '../utils/auditUrl';

interface PermitDetailProps { id: string; onBack: () => void; }

type ReceiverAclUser = AclUser;

const appendClosureEvidencePagesToPdf = async (pdf: jsPDF, permit: Permit) => {
    const evidence = [
        { title: 'Daily Sign Off Photo', url: permit.dailySignOffUrl },
        { title: 'Crew Registration Photo', url: permit.crewRegistrationUrl }
    ].filter((item, i, arr) => !(i === 1 && item.url && item.url === arr[0].url));
    if (evidence[0]?.url && evidence[0].url === permit.crewRegistrationUrl) evidence[0].title = 'Daily Sign Off & Crew Registration Photo';

    for (const item of evidence) {
        if (!item.url) continue;

        try {
            const imgData = await loadImageAsCompressedJpeg(item.url);
            pdf.addPage();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const page = pdf.getCurrentPageInfo().pageNumber;
            pdf.setPage(page);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.text(item.title, 15, 20);

            const imgProps = pdf.getImageProperties(imgData);
            const maxWidth = pageWidth - 30;
            const maxHeight = pageHeight - 60;
            let width = imgProps.width;
            let height = imgProps.height;
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;

            pdf.addImage(imgData, 'JPEG', (pageWidth - width) / 2, 30, width, height, undefined, 'FAST');
        } catch (error) {
            console.error(`Failed to append closure evidence photo to PDF: ${item.title}`, error);
        }
    }
};

interface PrintPermitButtonProps {
  className?: string;
  // Optional synchronous hook run before printing; return false to cancel
  onBeforePrint?: () => boolean | void;
}

export const PrintPermitButton: React.FC<PrintPermitButtonProps> = ({ className, onBeforePrint }) => {
  const handlePrint = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // 1. Remove focus to prevent iOS keyboard/UI interference
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (onBeforePrint && onBeforePrint() === false) return;

    // 2. Synchronous execution with Safari-specific fallback
    try {
      // iOS Safari often requires execCommand to trigger the native print spooler synchronously
      const passed = document.execCommand('print', false, undefined);
      if (!passed) {
        window.print();
      }
    } catch (err) {
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={`print:hidden flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-sm transition-colors active:scale-95 ${className || ''}`}
    >
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
      </svg>
      PRINT PERMIT
    </button>
  );
};

const PermitDetail: React.FC<PermitDetailProps> = ({ id, onBack }) => {
    const [permit, setPermit] = useState<Permit | undefined>(getPermitById(id));
    const [isLoading, setIsLoading] = useState(!getPermitById(id)); // Loading state for Firebase fetch

    const [activeTab, setActiveTab] = useState<'engineer' | 'receiver_checklist' | 'issuer' | 'approver' | 'crew' | 'daily' | 'handover' | 'photos' | 'notes' | 'closure'>('engineer');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [duplicatePermitError, setDuplicatePermitError] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isUploadingApproverPhoto, setIsUploadingApproverPhoto] = useState(false);

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const sessionRole = String(getUserRole() || '').toLowerCase();
    const currentUser = getAuth().currentUser as any;
    const userEmail = (currentUser?.email || '').toLowerCase().trim();
    const isMaster = userEmail === 'dietrich.truchsess@easternbusway.nz';
    const isIssuerRole = sessionRole.includes('issuer') || isMaster;

    const currentUserDisplayName = currentUser?.displayName || currentUser?.name || getDisplayNameFromEmail(currentUser?.email) || currentUser?.email || 'Unknown user';
    const [aclUsers, setAclUsers] = useState<ReceiverAclUser[]>([]);
    const [aclError, setAclError] = useState('');
    useEffect(() => {
        return onSnapshot(doc(db, 'appSettings', 'global'), snapshot => {
                const assignments = snapshot.data()?.roleAssignments;
                if (!snapshot.exists() || !Array.isArray(assignments)) {
                    setAclUsers([]);
                    setAclError('Unable to verify Receiver access. Reload the page and try again.');
                    return;
                }
                setAclUsers(assignments);
                setAclError('');
            }, error => {
                console.error('Failed to load receiver directory:', error);
                setAclUsers([]);
                setAclError('Unable to verify Receiver access. Reload the page and try again.');
            });
    }, []);
    // Local state for the five fields that need smooth typing
    const [location, setLocation] = useState(permit?.location || '');
    const [issuedDate, setIssuedDate] = useState(permit?.issuedDate || '');
    const [commencementDate, setCommencementDate] = useState(permit?.commencementDate || '');
    const [endDate, setEndDate] = useState(permit?.endDate || '');
    const [scopeOfWorks, setScopeOfWorks] = useState(permit?.scopeOfWorks || '');
    const toPermitNumber = (value: unknown): number | null => {
        const parsed = parseInt(String(value ?? '').replace(/\D/g, ''), 10);
        return Number.isNaN(parsed) ? null : parsed;
    };
    const [itwocxNumber, setItwocxNumber] = useState<number | null>(toPermitNumber(permit?.itwocxNumber));
    const [excavationType, setExcavationType] = useState<string>(permit?.excavationType || '');
    // Sync local state with permit when it changes
    useEffect(() => {
        if (permit) {
            setLocation(permit.location || '');
            setIssuedDate(permit.issuedDate || '');
            setCommencementDate(permit.commencementDate || '');
            setEndDate(permit.endDate || '');
            setScopeOfWorks(permit.scopeOfWorks || '');
            setItwocxNumber(toPermitNumber(permit.itwocxNumber));
            setExcavationType(permit.excavationType || '');
        }
    }, [permit?.id]);
    const [dailyRecSig, setDailyRecSig] = useState<Signature | null>(null);
    const [dailyOpSig, setDailyOpSig] = useState<Signature | null>(null);
    const [dailySpotSig, setDailySpotSig] = useState<Signature | null>(null);
    const [newCrewName, setNewCrewName] = useState('');
    const [newCrewRole, setNewCrewRole] = useState('Labour');
    const [handoverSignature, setHandoverSignature] = useState<Signature | null>(null);
    const [handoverChecks, setHandoverChecks] = useState<Record<string, boolean>>({});
    const [closureReceiverName, setClosureReceiverName] = useState('');
    const [preClosureCheck1, setPreClosureCheck1] = useState(permit?.closureChecklistExcavationSafe || false);
    const [preClosureCheck2, setPreClosureCheck2] = useState(permit?.closureChecklistAsBuiltReturned || false);
    const [preClosureCheck3, setPreClosureCheck3] = useState(permit?.closureChecklistOutstandingWorks || false);
    const [outstandingWorks, setOutstandingWorks] = useState(permit?.closureOutstandingWorksDetails || '');
    const [photoCaption, setPhotoCaption] = useState('');
    const [otherNotes, setOtherNotes] = useState(permit?.otherNotes || '');
    const [noteDraft, setNoteDraft] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    // Fetch permit from Firebase if not available in local cache
    useEffect(() => {
        if (!permit) {
            const fetchPermit = async () => {
                try {
                    setIsLoading(true);
                    const docRef = doc(db, getTargetCollection(), id);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const firebasePermit = docSnap.data() as Permit;
                        permitRef.current = firebasePermit;
                        setPermit(firebasePermit);
                    } else {
                        console.warn(`Permit with id ${id} not found in Firebase`);
                    }
                } catch (error) {
                    console.error("Error fetching permit from Firebase:", error);
                } finally {
                    setIsLoading(false);
                }
            };

            fetchPermit();
        } else {
            // Permit is already available in local cache
            setIsLoading(false);
        }
    }, [id, permit]);
    const [ceaseItem, setCeaseItem] = useState<'1' | '2' | '3' | '4' | ''>('');
    const [ceaseAction, setCeaseAction] = useState<'resumed' | 'suspended' | 'cancelled' | ''>('');
    const [ceaseIssuerName, setCeaseIssuerName] = useState('');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const approverCameraRef = useRef<HTMLInputElement>(null);
    const approverGalleryRef = useRef<HTMLInputElement>(null);
    const dailySignOffUploadRef = useRef<HTMLInputElement>(null);
    const dailySignOffGalleryRef = useRef<HTMLInputElement>(null);
    const pdfExportRef = useRef<HTMLDivElement>(null);
    // Always holds the newest permit (updated synchronously on every sync) so back-to-back flushes never overwrite each other with a stale closure copy
    const permitRef = useRef<Permit | undefined>(permit);
    // The heavy hidden PDF layout is only mounted on demand (iOS Safari memory limits)
    // Used ONLY by the iTwoCX closure/PDF-backup paths; the local print button has its own container below.
    const [isPreparingPDF, setIsPreparingPDF] = useState(false);
    // Downscaled copy of the permit used only to render the PDF; never written to Firestore.
    const [pdfPermit, setPdfPermit] = useState<Permit | null>(null);
    const [closureStage, setClosureStage] = useState<1 | 2 | 3 | null>(null);
    const mountPDFLayout = async () => {
        setIsPreparingPDF(true);
        for (let i = 0; i < 50 && !pdfExportRef.current; i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 300));
        return pdfExportRef.current;
    };

    // Local print only: native window.print() of a print-only block in normal flow (separate ref/state, never touches the Cx PDF pipeline)
    const printLayoutRef = useRef<HTMLDivElement>(null);
    const [isPrintMounted, setIsPrintMounted] = useState(false);
    // Pre-mount the print block shortly after load so its images are ready, and window.print() can be fired right inside the tap (iOS blocks print() after long async waits)
    useEffect(() => {
        const t = setTimeout(() => setIsPrintMounted(true), 1500);
        return () => clearTimeout(t);
    }, []);

    // Debug console: only rendered when the URL contains ?debug=true
    const debugEnabled = typeof window !== 'undefined' && window.location.search.includes('debug=true');
    const [isDebugOpen, setIsDebugOpen] = useState(true);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const logDebugError = (context: string, error: unknown) => {
        console.error(context, error);
        const err = error as any;
        const detail = err?.code ? `${err.code}: ${err.message}` : (err?.message || String(error));
        setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${context} - ${detail}`]);
    };

    // Defers the heavy tab/checklist/signature-pad render by one paint so iOS Safari isn't hit with one huge synchronous mount
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setIsLayoutReady(true), 50);
        return () => clearTimeout(t);
    }, []);

    // Hooks must run before any early return so the hook count is identical on every render
    const activeReceiver = getActiveReceiver(permit);
    const lastHandoverLog = activeReceiver.handover;
    const activeReceiverName = String(activeReceiver.names.find(name => String(name || '').trim()) || getDisplayNameFromEmail(activeReceiver.email) || 'Unknown');
    const activeReceiverEmail = activeReceiver.email;
    // Keep the "Identify to Close" field in sync with the active receiver, including after a handover
    useEffect(() => {
        if (activeReceiverName !== 'Unknown') setClosureReceiverName(activeReceiverName.toUpperCase());
    }, [activeReceiverName]);

    if (!permit) {
        if (isLoading) return <div className="p-12 text-center text-gray-600 font-black flex items-center justify-center gap-3"><Loader2 className="animate-spin" /> Loading Permit...</div>;
        return <div className="p-12 text-center text-red-600 font-black">Permit Not Found.</div>;
    }
    if (!isLayoutReady) return <div className="p-12 text-center text-gray-600 font-black flex items-center justify-center gap-3"><Loader2 className="animate-spin" /> Preparing permit...</div>;
    const pType = permit.permitType?.toUpperCase();
    if (pType && pType !== 'BG' && pType !== 'EXCAVATION') {
        return <div className="p-12 text-center text-red-600 font-black">Template for this Permit Type is not yet implemented.</div>;
    }

    // LÓGICA DE ESTADO CORREGIDA
    const isClosed = permit?.status?.toLowerCase() === 'closed';
    // Si isDraft es true, isIssued SIEMPRE será falso.
    const isIssued = permit?.isDraft === false && !isClosed;
    const isIssuedPermit = isIssued || (permit.isDraft !== true && ['active', 'issued'].includes(String(permit.status || '').toLowerCase()));
    const isPartAReadOnly = isPreworkLocked(permit);
    const isSuspended = permit.ceaseWorksRecord?.actionTaken === 'suspended';
    const isHydro = permit.excavationType === 'hydro' || permit.excavationType === 'hand';
    const hasApproverSigned = !!permit.approverSignature?.data;
    const arePermitDatesLocked = isPartAReadOnly;

    const isExecutionBlocked = isIssued && !isHydro && !hasApproverSigned && !isClosed && !isSuspended;

    const currentHandovers = Array.isArray(permit.handoverLogs) ? permit.handoverLogs : [];
    const activeSlotIndex = currentHandovers.length;
    const currentReceiverName = activeReceiverName;
    // After a handover only the last receiver in the history may close the permit
    const HANDOVER_CLOSURE_DENIED_MESSAGE = `Action Denied: Only the currently active Receiver (${activeReceiverName}) or a Master user can close this permit.`;
    const isCurrentActiveReceiver = isCurrentUserActiveReceiver(permit, currentUser, aclUsers);
    const isClosureDeniedByHandover = !isCurrentActiveReceiver && !isMaster;
    // Silent auto-detection: digital logs replace the matching photo evidence
    const hasDigitalCrew = !!permit.crewMembers && permit.crewMembers.length > 0;
    const hasDigitalDaily = !!permit.dailyLogs && permit.dailyLogs.length > 0;
    const isRegistrationEvidenceReady = (hasDigitalCrew || !!permit.crewRegistrationUrl) && (hasDigitalDaily || !!permit.dailySignOffUrl);
    const currentReceiverSignature = lastHandoverLog?.signature || permit.receiverSignature;

    const partAItems = Array.isArray(permit.partAChecklist) && permit.partAChecklist.length > 0 ? permit.partAChecklist : INITIAL_PART_A;
    const receiverItems = Array.isArray(permit.receiverChecklist) && permit.receiverChecklist.length > 0 ? permit.receiverChecklist : INITIAL_RECEIVER_CHECKLIST;
    const partBItems = Array.isArray(permit.partBChecklist) && permit.partBChecklist.length > 0 ? permit.partBChecklist : INITIAL_PART_B;
    const handoverItems = Array.isArray(permit.handoverChecklist) && permit.handoverChecklist.length > 0 ? permit.handoverChecklist : INITIAL_HANDOVER_CHECKLIST;

    const allHandoverChecksPassed = handoverItems.every(item => handoverChecks[item.id]);
    // Runs synchronously inside the tap (no timers) so iOS keeps the trusted user gesture; returning false aborts the print
    const prepareForPrint = (): boolean => {
        if (!permit?.id || !Array.isArray(partAItems) || !Array.isArray(partBItems) || !Array.isArray(receiverItems)) {
            alert('Permit data is not fully loaded yet. Please wait a moment and try again.');
            return false;
        }
        // Make sure the print block is in the DOM if the user taps before the pre-mount timer fires
        flushSync(() => setIsPrintMounted(true));
        return true;
    };
    const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 shadow-sm";
    const requiredInputClass = (missing: boolean) => `${inputClass} ${missing ? '!border-red-500 !bg-red-50/60 ring-2 ring-red-200' : ''}`;

    // Flushes every pending debounced field and returns the newest permit with the local input values applied
    const flushAndBuildPermit = (): Permit => {
        flushPendingFields();
        const base = (permitRef.current || permit) as Permit;
        const merged: Permit = { ...base };
        if (!isPartAReadOnly) {
            merged.location = location;
            merged.scopeOfWorks = scopeOfWorks;
            if (itwocxNumber === null) delete merged.itwocxNumber; else merged.itwocxNumber = itwocxNumber;
            merged.excavationType = excavationType as Permit['excavationType'];
            if (!arePermitDatesLocked) {
                merged.issuedDate = issuedDate;
                merged.commencementDate = commencementDate;
                merged.endDate = endDate;
            }
        }
        return merged;
    };

    const validateRequiredEngineerFields = (candidate: Permit) => {
        const requiredEngineerFields = [
            { key: 'itwocxNumber', value: candidate.itwocxNumber },
            { key: 'location', value: candidate.location },
            { key: 'issuedDate', value: candidate.issuedDate },
            { key: 'commencementDate', value: candidate.commencementDate },
            { key: 'endDate', value: candidate.endDate },
            { key: 'excavationType', value: candidate.excavationType },
            { key: 'scopeOfWorks', value: candidate.scopeOfWorks }
        ];
        const missingFields = requiredEngineerFields.reduce<Record<string, boolean>>((errors, field) => {
            if (!String(field.value || '').trim()) errors[field.key] = true;
            return errors;
        }, {});
        if (Object.keys(missingFields).length > 0) {
            alert('Please fill in all required fields highlighted in red.');
            return false;
        }
        return true;
    };

    const hasDuplicatePermitNumber = async (updatedPermit: Permit) => {
        const candidate = String(updatedPermit.itwocxNumber || updatedPermit.permitNumber || '').trim();
        if (!candidate) return false;

        const candidateDigits = candidate.replace(/\D/g, '');
        const snapshot = await getDocs(collection(db, getTargetCollection()));
        return snapshot.docs.some(existingDoc => {
            if (existingDoc.id === updatedPermit.id) return false;
            const existingPermit = existingDoc.data() as Permit;
            const existingNumber = String(existingPermit.itwocxNumber || existingPermit.permitNumber || '').trim();
            return existingNumber === candidate || (candidateDigits && existingNumber.replace(/\D/g, '') === candidateDigits);
        });
    };

    const syncToFirebase = async (updatedPermit: Permit) => {
        const previousPermit = permitRef.current;
        permitRef.current = updatedPermit;
        try {
            if (await hasDuplicatePermitNumber(updatedPermit)) {
                if (permitRef.current === updatedPermit) permitRef.current = previousPermit;
                setDuplicatePermitError(true);
                alert('Error: Permit number already exists.');
                return false;
            }
            setDuplicatePermitError(false);
            if (permitRef.current === updatedPermit) {
                savePermit(updatedPermit);
                setPermit(updatedPermit);
            }
            const permitDoc = doc(db, getTargetCollection(), updatedPermit.id);
            const committed = await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(permitDoc);
                if (!snapshot.exists()) {
                    transaction.set(permitDoc, sanitizeForFirestore(updatedPermit));
                    return updatedPermit;
                }
                const latest = snapshot.data() as Permit;
                if (String(latest.status || '').toLowerCase() === 'closed') throw new Error('Permit is already closed.');
                if (latest.isDraft === false && updatedPermit.isDraft !== false) throw new Error('Permit has already been issued. Reload before saving.');
                if (hasLockedPreworkChanges(latest, updatedPermit)) throw new Error('Issued permit planning details and initial signatures are locked.');
                const { dailyLogs, crewMembers, handoverLogs, ...fields } = updatedPermit;
                transaction.set(permitDoc, sanitizeForFirestore(fields), { merge: true });
                return { ...latest, ...fields } as Permit;
            });
            if (permitRef.current === updatedPermit) {
                permitRef.current = committed;
                savePermit(committed);
                setPermit(committed);
            }
            return true;
        } catch (e) {
            if (permitRef.current === updatedPermit && previousPermit) {
                permitRef.current = previousPermit;
                savePermit(previousPermit);
                setPermit(previousPermit);
            }
            logDebugError('Firebase write failed', e);
            throw e;
        }
    };

    // Fire-and-forget wrapper for non-explicit updates so a rejected write never becomes an unhandled rejection
    const syncQuietly = (updatedPermit: Permit) => { syncToFirebase(updatedPermit).catch(() => undefined); };

    const handleSaveDraft = async () => {
        if (isSubmitting) return;
        if (isPartAReadOnly) return;
        if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
        setSaveSuccess(false);
        setSaveError('');
        try {
            const candidate = flushAndBuildPermit();
            if (!validateRequiredEngineerFields(candidate)) return;
            setIsSubmitting(true);
            const permitToSave: Permit = isIssuedPermit ? candidate : { ...candidate, isDraft: true, status: 'draft' };
            const saved = await syncToFirebase(permitToSave);
            if (saved) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 4000);
            }
        } catch (error: any) {
            logDebugError('Save & Sync Permit failed', error);
            setSaveError(`Error saving permit: ${error?.message || 'Unknown error'}. Your entries are still on screen - please try again.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const normalizeName = (value?: string) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const requiredEngineerValues: Record<string, string | number | null> = {
        itwocxNumber, location, issuedDate, commencementDate, endDate, excavationType, scopeOfWorks
    };
    const isMissing = (value: unknown) => !String(value ?? '').trim();
    const missingEngineerFields = Object.keys(requiredEngineerValues).filter(field => isMissing(requiredEngineerValues[field]));
    const missingPartAItems = partAItems.filter(item => isMissing(item.answer));
    const receiverChecklistApplies = excavationType !== 'hydro' && excavationType !== 'hand';
    const missingReceiverItems = receiverChecklistApplies ? receiverItems.filter(item => isMissing(item.answer)) : [];
    const engineerMissingCount = missingEngineerFields.length + missingPartAItems.length;
    const receiverSignBlockers = [
        ...(missingEngineerFields.length ? ['Site Engineer (Part A) details'] : []),
        ...(missingPartAItems.length ? ['Site Engineer (Part A) checklist'] : []),
        ...(missingReceiverItems.length ? ['Receiver checklist'] : [])
    ];
    const canReceiverSign = receiverSignBlockers.length === 0;
    const receiverSignWarning = `Complete the applicable sections before the Receiver can sign. Missing: ${receiverSignBlockers.join(', ')}.`;
    const requiredBadge = <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-700">Required</span>;
    const missingField = (field: string) => isMissing(requiredEngineerValues[field]);

    const updateField = async (field: keyof Permit, value: any): Promise<boolean> => {
        if (field === 'receiverSignature' && value && !canReceiverSign) {
            alert(receiverSignWarning);
            return false;
        }
        if (
            isClosed ||
            (arePermitDatesLocked && ['issuedDate', 'commencementDate', 'endDate'].includes(field)) ||
            (isPartAReadOnly && ['siteEngineerSignature', 'receiverSignature', 'issuerSignature', 'location', 'excavationType', 'scopeOfWorks'].includes(field))
        ) return false;
        const base = field === 'receiverSignature' || field === 'issuerSignature' ? flushAndBuildPermit() : (permitRef.current || permit) as Permit;
        if (field === 'issuerSignature' && value) {
            if (!validateRequiredEngineerFields(base) || !canReceiverSign) {
                if (!canReceiverSign) alert(receiverSignWarning);
                return false;
            }
            if (!base.siteEngineerSignature?.data || !base.receiverSignature?.data) {
                alert('Engineer and Receiver signatures are required before the Issuer signs.');
                return false;
            }
            if (['knownServicesScanned', 'servicesMarked', 'potholingMarkers', 'transpowerDesignation', 'watercareWorksOver'].some(key => !base[key as keyof Permit])) {
                alert('All five Issuer verification checks are required before signing.');
                return false;
            }
        }
        const otherRoleSignature = field === 'receiverSignature' ? base.issuerSignature : field === 'issuerSignature' ? base.receiverSignature : null;
        if (otherRoleSignature && value?.name && (normalizeName(value.name) === normalizeName(otherRoleSignature.name) || (value.email && value.email === String(otherRoleSignature.email || (field === 'receiverSignature' ? base.issuerEmail : base.receiverEmail) || '').trim().toLowerCase()))) {
            alert("🛑 ROLE CONFLICT:\n\nAn Issuer cannot also be the Receiver on the same permit. Please use a different person.");
            return false;
        }
        try {
            return await syncToFirebase({
                ...base,
                [field]: value,
                ...(field === 'receiverSignature' && value?.email
                    ? { receiverEmail: value.email, receiverName: value.name, receiver: value.name, receiverId: undefined, receiverUid: undefined }
                    : {})
            } as Permit);
        } catch {
            alert('Unable to save the permit change. Please try again.');
            return false;
        }
    };

    const updateChecklist = (listName: 'partAChecklist' | 'receiverChecklist' | 'partBChecklist', itemId: string, field: 'answer' | 'comment', value: string) => {
        if (isClosed) return;
        if (isPartAReadOnly && (listName === 'partAChecklist' || listName === 'receiverChecklist')) return;

        const latest = (permitRef.current || permit) as Permit;
        const latestList = latest[listName];
        const currentList = Array.isArray(latestList) && latestList.length > 0
            ? latestList
            : listName === 'partAChecklist' ? partAItems : (listName === 'receiverChecklist' ? receiverItems : partBItems);
        const updatedList = currentList.map(item => item.id === itemId ? { ...item, [field]: value } : item);
        const updated = { ...latest, [listName]: updatedList } as Permit;
        if (listName === 'partAChecklist' || listName === 'receiverChecklist') {
            setPermit(updated);
            syncToFirebase(updated).then(saved => {
                if (!saved) setPermit(current => current === updated ? latest : current);
            }).catch(() => {
                if (permitRef.current === updated) permitRef.current = latest;
                setPermit(current => current === updated ? latest : current);
                alert('Unable to save the checklist. Please try again.');
            });
        } else {
            syncQuietly(updated);
        }
    };

    const updateApproverComment = (itemId: string, value: string) => {
        if (hasApproverSigned || isClosed) return;
        const latest = (permitRef.current || permit) as Permit;
        syncQuietly({ ...latest, approverComments: { ...(latest.approverComments || {}), [itemId]: value } });
    };

    const updateIssuerComment = (key: string, value: string) => {
        if (isIssuedPermit || isClosed || permit.issuerSignature?.data) return;
        const latest = (permitRef.current || permit) as Permit;
        syncQuietly({ ...latest, issuerComments: { ...(latest.issuerComments || {}), [key]: value } });
    };

    const handleIssuePermit = async () => {
        if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
        const candidate = flushAndBuildPermit();

        if (!validateRequiredEngineerFields(candidate)) return;

        // CANDADO DE EMISIÓN: VALIDA LOS RADIO BUTTONS
        const missingIssuerChecks = [
            'knownServicesScanned',
            'servicesMarked',
            'potholingMarkers',
            'transpowerDesignation',
            'watercareWorksOver'
        ].filter(key => !candidate[key as keyof Permit]);

        if (missingIssuerChecks.length > 0) {
            alert("🛑 CANNOT ISSUE:\n\nAll 5 Issuer Verification Checks (radio buttons) must be completed before issuing to the field.");
            return;
        }

        if (!candidate.siteEngineerSignature || !candidate.receiverSignature || !candidate.issuerSignature) {
            alert("🛑 CANNOT ISSUE:\n\nEngineer, Receiver, and Issuer signatures are required before issuing to the field."); return;
        }
        if (!isIssuerRole) { alert("Only an authorized Issuer can execute this action."); return; }

        const isConfirmed = confirm("Are you sure you want to ISSUE this permit? \n\nThis will LOCK Part A and Receiver checklists and activate the permit for the site crew.");
        if (!isConfirmed) return;

        setIsSubmitting(true);
        try {
            const updated = { ...candidate, isDraft: false, status: 'issued', syncStatus: 'pending', sync_status: 'pending', cxSyncPending: 'issue', cxSyncError: null } as any;
            const saved = await syncToFirebase(updated);
            if (!saved) return;

            alert("Permit successfully issued.");
        } catch (error: any) {
            alert(`⚠️ Error saving permit: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // One photo of the shared paper sheet satisfies both Crew Registration and Daily Sign Off
    const handleClosureEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isClosed || !e.target.files || e.target.files.length === 0 || !permit) return;
        if (!isOnline) { alert("🛑 NO INTERNET\n\nYou must be connected to the internet to upload the required closure evidence."); e.target.value = ''; return; }

        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImageToJpeg(file);
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, `closureEvidence_${permit.itwocxNumber || permit.permitNumber || 'permit'}_${Date.now()}.jpg`);
            await syncToFirebase({ ...(permitRef.current || permit), dailySignOffUrl: cloudUrl, crewRegistrationUrl: cloudUrl } as Permit);
        } catch (err) {
            alert('Error uploading Daily Sign Off & Crew Registration evidence. Check internet connection.');
        } finally { e.target.value = ''; }
    };

    const handleAddNote = async () => {
        const text = noteDraft.trim();
        if (!text || isClosed || isSavingNote || !permit) return;
        setIsSavingNote(true);
        try {
            const base = (permitRef.current || permit) as Permit;
            const timestamp = new Date().toISOString();
            const legacyText = String(base.otherNotes || '').trim();
            const history: PermitNote[] = Array.isArray(base.notesHistory) ? [...base.notesHistory] : [];
            // Preserve pre-existing single-field notes as the first read-only entry
            if (history.length === 0 && legacyText) {
                history.push({ text: legacyText, author: String(base.notesAuthor || 'Unknown user'), timestamp: String(base.notesUpdatedAt || base.createdAt || timestamp) });
            }
            history.push({ text, author: currentUserDisplayName, timestamp });
            // otherNotes mirrors the history so the PDF and closure audit keep working
            const mirrored = `${legacyText ? legacyText + '\n' : ''}[${new Date(timestamp).toLocaleString()}] ${currentUserDisplayName}: ${text}`;
            const ok = await syncToFirebase({ ...base, notesHistory: history, otherNotes: mirrored, notesAuthor: currentUserDisplayName, notesUpdatedAt: timestamp } as Permit);
            if (ok) { setOtherNotes(mirrored); setNoteDraft(''); }
        } catch (err) {
            alert('Could not save the note. Check your connection and try again.');
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleClosureEvidenceDelete = async () => {
        if (isClosed || !permit || isSubmitting) return;
        if (!confirm('Remove this photo? You can upload a new one afterwards.')) return;
        try {
            // Empty strings (not undefined) so the Firestore merge actually overwrites the stored URLs
            await syncToFirebase({ ...(permitRef.current || permit), dailySignOffUrl: '', crewRegistrationUrl: '' } as Permit);
        } catch (err) {
            alert('Could not remove the photo. Check internet connection.');
        }
    };

    const handleApproverPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isClosed || !e.target.files || e.target.files.length === 0 || !permit) return;
        if (!isOnline) { alert("🛑 NO INTERNET\n\nYou must be connected to the internet to upload photos securely to the vault."); e.target.value = ''; return; }

        setIsUploadingApproverPhoto(true);
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImageToJpeg(file);
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, `approver_${permit.itwocxNumber}_${Date.now()}.jpg`);
            const approverPhoto: PermitPhoto = {
                id: generateId(),
                url: cloudUrl,
                caption: 'Approver site inspection',
                uploadedBy: currentUserDisplayName,
                date: new Date().toISOString()
            };
            await syncToFirebase({ ...permit, approverPhoto: cloudUrl, photos: [...(permit.photos || []), approverPhoto] });
        } catch (err) {
            alert("Error uploading approver photo to cloud. Check internet connection.");
        } finally { setIsUploadingApproverPhoto(false); e.target.value = ''; }
    };

    const handleApproverSign = async (sig: Signature) => {
        if (!(permit as any).approverPhoto) { alert("🛑 MANDATORY PHOTO REQUIRED:\n\nYou must upload a photo of your physical site inspection before signing."); return false; }
        return syncToFirebase({ ...permit, approverSignature: sig } as Permit);
    };

    const handleSaveDailyLog = async () => {
        if (isSubmitting) return;
        if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
        if (isClosed || !dailyRecSig || !dailyOpSig || !dailySpotSig) { alert("Missing signatures or Permit is Closed."); return; }
        const newLog: DailySignOff = { id: generateId(), date: new Date().toISOString(), receiverSig: dailyRecSig, excavatorSig: dailyOpSig, spotterSig: dailySpotSig };
        setIsSubmitting(true);
        try {
            await appendOperationalEntry('dailyLogs', newLog);
            setDailyRecSig(null); setDailyOpSig(null); setDailySpotSig(null);
        } catch (error) {
            logDebugError('Daily sign-on failed', error);
            alert('Unable to save the sign-on entry. Please try again.');
        } finally { setIsSubmitting(false); }
    };

    const appendOperationalEntry = async (field: 'dailyLogs' | 'crewMembers' | 'handoverLogs', entry: DailySignOff | CrewMember | HandoverLog) => {
        const permitDoc = doc(db, getTargetCollection(), permit.id);
        const updated = await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(permitDoc);
            if (!snapshot.exists()) throw new Error('Permit no longer exists.');
            const latest = snapshot.data() as Permit;
            if (String(latest.status || '').toLowerCase() === 'closed') throw new Error('Permit is closed.');
            const entries = Array.isArray(latest[field]) ? latest[field] : [];
            if (field === 'handoverLogs' && entries.length >= 7) throw new Error('Maximum handovers reached.');
            const next = [...entries, entry];
            transaction.update(permitDoc, { [field]: sanitizeForFirestore(next) });
            return { ...latest, [field]: next } as Permit;
        });
        permitRef.current = updated;
        savePermit(updated);
        setPermit(updated);
    };

    const handleRegisterCrew = async (sig: Signature) => {
        const crewName = sig.name.trim();
        if (isClosed || !crewName) return false;
        const newMember: CrewMember = { id: generateId(), name: crewName, role: newCrewRole, signature: sig, dateInducted: new Date().toISOString() };
        try {
            await appendOperationalEntry('crewMembers', newMember);
            setNewCrewName('');
            return true;
        } catch (error) {
            logDebugError('Crew registration failed', error);
            alert('Unable to register the crew member. Please try again.');
            return false;
        }
    };

    const finalizeHandover = async () => {
        const newReceiverName = (handoverSignature?.name || '').trim();
        if (isClosed || !newReceiverName || !handoverSignature?.email) return;
        if (handoverSignature.email === String(permit.issuerEmail || '').trim().toLowerCase()) { alert("The Issuer cannot be the Receiver on the same permit."); return; }
        if (currentHandovers.length >= 7) { alert("Max handovers reached."); return; }
        const newHandover: HandoverLog = { id: generateId(), date: new Date().toISOString(), receiverName: newReceiverName, receiverEmail: handoverSignature.email, signature: handoverSignature, initial: handoverSignature };
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await appendOperationalEntry('handoverLogs', newHandover);
            setHandoverSignature(null); setHandoverChecks({});
        } catch (error) {
            logDebugError('Handover registration failed', error);
            alert('Unable to register the handover. Please try again.');
        } finally { setIsSubmitting(false); }
    };

    // CIERRE LOBOTOMIZADO: GUARDA DE INMEDIATO EN FIREBASE PARA ACTIVAR EL BACKEND
    const handleAutomatedCloseAndLodge = async () => {
        if (!isOnline) {
            alert("🛑 INTERNET CONNECTION REQUIRED\n\nClosing a permit generates a heavy 12-page PDF file with all signatures and photos. You must have an active internet connection to secure this document in the cloud. Please find a 4G/WiFi signal before closing.");
            return;
        }

        if (isClosureDeniedByHandover) {
            alert(`Only the assigned Receiver (${activeReceiverEmail || permit?.receiverEmail || activeReceiverName || permit?.receiverName || permit?.receiver || 'Unknown'}) or a Master user can close this permit.`);
            return;
        }

        if (isExecutionBlocked && !isMaster) { alert("🛑 ERROR: The permit cannot be closed because Part B has not been approved by the Permit Approver."); return; }

        let errors = [];
        if (permit.ceaseWorksRecord) {
            errors.push("A Cease Works protocol has been triggered on this permit. Only an authorized Issuer can execute a safety closure.");
        }
        if (!preClosureCheck1 && !preClosureCheck3) errors.push("Closure: Select 'Safe' or 'Outstanding'");
        if (preClosureCheck3 && !outstandingWorks.trim()) errors.push("Closure: Detail outstanding works");
        if (!hasDigitalDaily && !permit.dailySignOffUrl) errors.push("Daily Sign Off evidence is required before this permit can be closed.");
        if (!hasDigitalCrew && !permit.crewRegistrationUrl) errors.push("Crew Registration evidence is required before this permit can be closed.");
        if (errors.length > 0) { alert(`🛑 ERRORS:\n\n${errors.join('\n')}`); return; }
        if (!confirm(`🛑 CRITICAL ACTION:\nYou are about to close this permit and finalize the job. Confirm?`)) return;

        const closureDoc = doc(db, getTargetCollection(), permit.id);
        setIsSubmitting(true);
        setClosureStage(1);
        // Yield so iOS Safari can paint the processing state before the heavy work locks the main thread.
        await new Promise(resolve => setTimeout(resolve, 300));
        const finalNotes = (otherNotes || '') + `\n\n--- SYSTEM AUDIT ---\n* Closed by: Firebase Authenticated Receiver\n* Timestamp: ${new Date().toLocaleString()}`;

        let updatedPermit: Permit = {
            ...permit, status: 'closed', closureSignature: currentReceiverSignature, closureReceiverName: currentReceiverName,
            closureDate: new Date().toISOString(), closureChecklistExcavationSafe: preClosureCheck1, closureChecklistAsBuiltReturned: preClosureCheck2,
            closureChecklistOutstandingWorks: preClosureCheck3, closureOutstandingWorksDetails: outstandingWorks, otherNotes: finalNotes
        } as any;

        // Generate and secure the closure PDF before writing the closed permit.
        try {
            const compressedForPdf = await compressPermitImagesForPdf(updatedPermit);
            setPdfPermit(compressedForPdf);
            await new Promise(resolve => setTimeout(resolve, 50));
            const pdfNode = await mountPDFLayout();
            if (!pdfNode) throw new Error('PDF layout could not be prepared.');
            await new Promise(resolve => setTimeout(resolve, 800));
            const pdf = await renderPagesToPdf(pdfNode);
            await appendClosureEvidencePagesToPdf(pdf, {
                ...updatedPermit,
                dailySignOffUrl: compressedForPdf.dailySignOffUrl,
                crewRegistrationUrl: compressedForPdf.crewRegistrationUrl
            } as Permit);

            const rawNumber = String(updatedPermit.itwocxNumber || updatedPermit.permitNumber || "").replace(/\D/g, "");
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            const storage = getStorage();
            const pdfRef = ref(storage, `pdf_backups/PF${rawNumber}_${new Date().getTime()}.pdf`);
            setClosureStage(2);
            await new Promise(resolve => setTimeout(resolve, 50));
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    uploadString(pdfRef, pdfBase64, 'base64', { contentType: 'application/pdf' }),
                    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('PDF backup upload timed out.')), 15000); })
                ]);
            } finally {
                if (timeout) clearTimeout(timeout);
            }
            const downloadUrl = await getDownloadURL(pdfRef);
            updatedPermit = { ...updatedPermit, pdfBackupUrl: downloadUrl };
        } catch (error) {
            console.error('Error securing closure PDF:', error);
            alert('Unable to secure the closure PDF. The permit was not closed; please try again.');
            setIsSubmitting(false);
            setClosureStage(null);
            return;
        } finally {
            setIsPreparingPDF(false);
            setPdfPermit(null);
        }

        setClosureStage(3);
        // 2. Apply Filtering Rule for 'Breaking Ground' family and finalize sync
        const pTypeCheck = String(updatedPermit.permitType || '').toUpperCase();
        const isBreakingGround = ['BG', 'BGP', 'BE', 'EXCAVATION'].includes(pTypeCheck);

        if (isBreakingGround) {
            updatedPermit = {
                ...updatedPermit,
                syncStatus: 'pending',
                sync_status: 'pending',
                cxSyncPending: 'closure',
                cxSyncError: null
            } as any;
        }

        try {
            if (await hasDuplicatePermitNumber(updatedPermit)) {
                setDuplicatePermitError(true);
                alert('Error: Permit number already exists.');
                return;
            }
            const closedPermit = await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(closureDoc);
                if (!snapshot.exists()) throw new Error('Permit no longer exists.');
                const latest = snapshot.data() as Permit;
                if (String(latest.status || '').toLowerCase() === 'closed' || latest.isDraft === true || latest.ceaseWorksRecord) {
                    throw new Error('Permit status or cease-works state has changed.');
                }
                const aclSnapshot = await transaction.get(doc(db, 'appSettings', 'global'));
                const latestAcl = aclSnapshot.data()?.roleAssignments;
                if (!isMaster && (!Array.isArray(latestAcl) || !isCurrentUserActiveReceiver(latest, currentUser, latestAcl))) {
                    throw new Error('Receiver access could not be verified.');
                }
                if (activeReceiverKey(latest) !== activeReceiverKey(permit)) {
                    throw new Error('The active Receiver has changed.');
                }
                const latestHydro = latest.excavationType === 'hydro' || latest.excavationType === 'hand';
                if (!latestHydro && !latest.approverSignature?.data && !isMaster) {
                    throw new Error('Mechanical excavation requires Part B approval.');
                }
                if (!(latest.dailyLogs?.length || latest.dailySignOffUrl) || !(latest.crewMembers?.length || latest.crewRegistrationUrl)) {
                    throw new Error('Closure evidence is no longer available.');
                }
                const closureFields = {
                    status: updatedPermit.status,
                    closureSignature: updatedPermit.closureSignature,
                    closureReceiverName: updatedPermit.closureReceiverName,
                    closureDate: updatedPermit.closureDate,
                    closureChecklistExcavationSafe: updatedPermit.closureChecklistExcavationSafe,
                    closureChecklistAsBuiltReturned: updatedPermit.closureChecklistAsBuiltReturned,
                    closureChecklistOutstandingWorks: updatedPermit.closureChecklistOutstandingWorks,
                    closureOutstandingWorksDetails: updatedPermit.closureOutstandingWorksDetails,
                    otherNotes: (latest.otherNotes || '') + `\n\n--- SYSTEM AUDIT ---\n* Closed by: Firebase Authenticated Receiver\n* Timestamp: ${new Date().toLocaleString()}`,
                    pdfBackupUrl: updatedPermit.pdfBackupUrl,
                    ...(isBreakingGround ? { syncStatus: 'pending', sync_status: 'pending', cxSyncPending: 'closure', cxSyncError: null } : {})
                };
                transaction.set(closureDoc, sanitizeForFirestore(closureFields), { merge: true });
                return { ...latest, ...closureFields } as Permit;
            });
            permitRef.current = closedPermit;
            setPermit(closedPermit);
            setOtherNotes(closedPermit.otherNotes);
            alert("Permit successfully closed.");
        } catch (error) {
            console.error('Error saving permit closure:', error);
            alert(`Unable to save the permit closure: ${error instanceof Error ? error.message : 'Unknown error'}. Reload the permit before retrying.`);
        } finally {
            setIsSubmitting(false);
            setClosureStage(null);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isClosed || !e.target.files || e.target.files.length === 0 || !permit) return;
        if (!isOnline) { alert("🛑 NO INTERNET\n\nYou must be connected to the internet to upload photos."); e.target.value = ''; return; }

        setIsUploadingPhoto(true);
        try {
            const file = e.target.files[0];
            const compressedDataUrl = await compressImageToJpeg(file);
            const cloudUrl = await uploadImageToStorage(compressedDataUrl, `detail_${permit.itwocxNumber}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`);
            const newPhoto: PermitPhoto = { id: generateId(), url: cloudUrl, caption: photoCaption || file.name, uploadedBy: 'User', date: new Date().toISOString() };
            syncQuietly({ ...permit, photos: [...(permit.photos || []), newPhoto] } as Permit);
            setPhotoCaption('');
        } catch (err) { alert("Error uploading photo to cloud."); } finally { setIsUploadingPhoto(false); e.target.value = ''; }
    };

    const handleCeaseWorksSave = async (sig: Signature) => {
        const issuerNameForCease = (ceaseIssuerName.trim() || sig.name || '').trim();
        if (isClosed || !permit || !ceaseItem || !ceaseAction || !issuerNameForCease) { alert("Fill all fields."); return; }
        if (ceaseAction === 'cancelled' && !isOnline) {
            alert("🛑 INTERNET CONNECTION REQUIRED\n\nExecuting this protocol generates a heavy PDF report. You must be connected to the internet to secure this document in the cloud. Please find signal."); return;
        }
        if (ceaseAction === 'cancelled' && !isIssuerRole) {
            alert("🛑 ACTION DENIED:\n\nA Cease Works protocol has been triggered. ONLY an authorized 'Issuer' has the authority to trigger the safety closure.");
            return;
        }

        const isConfirmed = confirm("🚨 EXECUTING CEASE WORKS PROTOCOL\n\nIf you proceed, this permit will be permanently locked and synchronized with iTwoCX as CLOSED. The reasons for the stoppage will be permanently attached. Do you wish to proceed?");
        if (!isConfirmed) return;

        setIsSubmitting(true);

        const newRecord: CeaseWorksRecord = { id: generateId(), date: new Date().toISOString(), issuerName: issuerNameForCease, issuerSignature: sig, affectedItemNumber: ceaseItem as any, actionTaken: ceaseAction as any };
        let updatedPermit: any = { ...permit, ceaseWorksRecord: newRecord };

        if (ceaseAction === 'cancelled') {
            const ceaseReasons: Record<string, string> = {
                '1': "Unidentified service or archaeological items encountered (Strike).",
                '2': "Methodology or site conditions changed.",
                '3': "Change in foreman, excavator operator or spotter.",
                '4': "Asbestos or other contaminates encountered."
            };
            const reasonText = ceaseReasons[ceaseItem] || "Emergency Protocol Triggered";

            updatedPermit.status = 'closed';
            updatedPermit.closureDate = new Date().toISOString();
            updatedPermit.closureReceiverName = `EMERGENCY CLOSED (${issuerNameForCease})`;
            updatedPermit.closureSignature = sig;

            updatedPermit.closureChecklistExcavationSafe = false;
            updatedPermit.closureChecklistOutstandingWorks = true;
            updatedPermit.closureOutstandingWorksDetails = `🚨 PERMIT CLOSED DUE TO CEASE WORKS PROTOCOL.\nReason: ${reasonText}`;

            updatedPermit.otherNotes = (updatedPermit.otherNotes || '') + `\n\n🚨 EMERGENCY CLOSED VIA CEASE WORKS PROTOCOL by ${issuerNameForCease}. Reason: ${reasonText}`;

            // 1. Generate PDF and upload to Firebase Storage BEFORE finalizing the sync
            try {
                setClosureStage('1/3: Compressing Photos...');
                await new Promise(resolve => setTimeout(resolve, 300));
                setPdfPermit(await compressPermitImagesForPdf(permit));
                setClosureStage('2/3: Generating PDF...');
                const pdfNode = await mountPDFLayout();
                if (pdfNode) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                    const pdf = await renderPagesToPdf(pdfNode);
                    const rawNumber = String(updatedPermit.itwocxNumber || updatedPermit.permitNumber || "").replace(/\D/g, "");
                    const pdfBase64 = pdf.output('datauristring').split(',')[1];

                    try {
                        const storage = getStorage();
                        const pdfRef = ref(storage, `pdf_backups/PF${rawNumber}_EMERGENCY_CLOSED_${new Date().getTime()}.pdf`);
                        await uploadString(pdfRef, pdfBase64, 'base64', { contentType: 'application/pdf' });
                        const downloadUrl = await getDownloadURL(pdfRef);
                        updatedPermit = { ...updatedPermit, pdfBackupUrl: downloadUrl } as any;
                    } catch (storageError: any) {
                        console.error("Backup PDF Error:", storageError);
                    }
                }
            } catch (error: any) {
                console.error("Protocol error", error);
            } finally {
                setIsPreparingPDF(false);
                setPdfPermit(null);
            }

            setClosureStage('3/3: Syncing to CX...');
            // 2. Apply Filtering Rule for 'Breaking Ground' family and finalize sync
            const pTypeCheck = String(updatedPermit.permitType || '').toUpperCase();
            const isBreakingGround = ['BG', 'BGP', 'BE', 'EXCAVATION'].includes(pTypeCheck);

            if (isBreakingGround) {
                updatedPermit.syncStatus = 'pending';
                updatedPermit.sync_status = 'pending';
                updatedPermit.cxSyncPending = 'closure';
                updatedPermit.cxSyncError = null;
            }
        }

        await syncToFirebase(updatedPermit as Permit);

        setIsSubmitting(false);
        setClosureStage('');
        if (ceaseAction === 'cancelled') {
            alert("Permit successfully closed.");
        } else {
            alert("Cease Works record updated (Suspended).");
            setCeaseItem(''); setCeaseAction(''); setCeaseIssuerName('');
        }
    };

    return (
        <>
            {/* Loading indicator */}
            {isLoading && (
                <div className="fixed inset-0 z-[9999] bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-white px-4">
                    <Loader2 size={80} className="animate-spin text-blue-500 mb-6" />
                    <h2 className="text-3xl font-black uppercase tracking-widest text-center">Loading Permit...</h2>
                    <p className="text-gray-300 mt-4 text-center text-lg font-bold">Please wait while we fetch your permit details.</p>
                </div>
            )}

            {/* Error state if permit not found */}
            {!isLoading && !permit && (
                <div className="fixed inset-0 z-[9999] bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-white px-4">
                    <AlertTriangle size={80} className="text-red-500 mb-6" />
                    <h2 className="text-3xl font-black uppercase tracking-widest text-center">Permit Not Found</h2>
                    <p className="text-gray-300 mt-4 text-center text-lg font-bold">The requested permit could not be found.</p>
                    <button
                        onClick={onBack}
                        className="mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>
            )}

            {/* Main content - only render if we have a permit and it's not loading */}
            {!isLoading && permit && (
                <>
                    {!isOnline && (
                        <div className="fixed top-0 left-0 right-0 z-[10000] bg-red-600 text-white p-2 text-center text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                            <Wifi size={14} className="animate-pulse" /> No Internet Connection - Photos and PDF generation disabled
                        </div>
                    )}

                    {isSubmitting && (
                        <div role="status" aria-live="polite" className="fixed inset-0 z-[9999] bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-white px-4">
                            <Loader2 size={80} className="animate-spin text-blue-500 mb-6" />
                            <h2 className="text-3xl font-black uppercase tracking-widest text-center">{closureStage ? 'Closing Permit' : 'Processing...'}</h2>
                            <p className="text-gray-300 mt-4 text-center text-lg font-bold">Please do not close the application.</p>
                            {closureStage && (
                                <ol className="mt-6 space-y-3 text-sm sm:text-base font-bold">
                                    {['Generating closure PDF', 'Securing PDF backup', 'Saving closure and finalizing'].map((label, index) => (
                                        <li key={label} aria-current={closureStage === index + 1 ? 'step' : undefined} className={closureStage === index + 1 ? 'text-white' : 'text-gray-400'}>
                                            {index + 1}/3 {label}{closureStage === index + 1 ? '...' : closureStage > index + 1 ? ' ✓' : ''}
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    )}

                    {debugEnabled && (
                        <div className="fixed bottom-0 left-0 right-0 z-[9999] print:hidden bg-gray-900 text-xs font-mono border-t-2 border-red-600">
                            <div className="flex justify-between items-center px-3 py-2">
                                <button type="button" onClick={() => setIsDebugOpen(o => !o)} className="text-white font-bold uppercase">{isDebugOpen ? '▼' : '▲'} Debug Console ({debugLogs.length})</button>
                                <button type="button" onClick={() => setDebugLogs([])} className="text-gray-300 underline">Clear</button>
                            </div>
                            {isDebugOpen && (
                                <div className="max-h-48 overflow-y-auto px-3 pb-3 space-y-1">
                                    {debugLogs.length === 0 ? <p className="text-gray-400">No errors captured.</p> : debugLogs.map((entry, i) => <p key={i} className="text-red-500 break-words whitespace-pre-wrap">{entry}</p>)}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={`w-full max-w-full min-w-0 overflow-x-hidden box-border xl:max-w-6xl mx-auto pb-12 mt-6 print:hidden relative z-10 ${!isOnline ? 'mt-12' : ''}`}>
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={onBack} className="text-gray-500 font-bold flex items-center gap-1"><ArrowLeft size={16} /> Back to Register</button>
                            <PrintPermitButton onBeforePrint={prepareForPrint} className="px-5 rounded-xl" />
                        </div>

                        <div className="bg-white rounded-t-2xl border border-gray-200 p-6 md:p-8 flex justify-between shadow-sm items-center relative">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-black text-gray-900 uppercase mb-2">{permit.itwocxNumber || permit.permitNumber ? `PF# ${permit.itwocxNumber || permit.permitNumber}` : 'NEW PERMIT'}</h1>
                                <div className="flex flex-col md:flex-row md:items-center text-xs text-gray-500 font-bold uppercase tracking-widest gap-2 md:gap-4"><span className="bg-gray-100 px-2 py-1 rounded text-gray-900 w-fit">{permit.location || 'No Location'}</span><span>Active Receiver: <span className="text-blue-700">{currentReceiverName}</span></span></div>
                            </div>
                            <div className={`px-6 py-3 rounded-xl text-sm font-black uppercase text-white h-fit shadow-md ${permit.status === 'closed' ? 'bg-red-600' : (permit.isDraft ? 'bg-orange-500 animate-pulse' : (isExecutionBlocked ? 'bg-amber-500' : 'bg-green-600'))}`}>
                                {permit.status === 'closed' ? 'CLOSED' : (permit.isDraft ? 'DRAFT (Building)' : (isExecutionBlocked ? 'PENDING APPROVAL' : 'ISSUED / ACTIVE'))}
                            </div>
                        </div>

                        {duplicatePermitError && <div className="bg-red-50 border border-red-300 text-red-700 p-3 mt-4 rounded-lg text-sm font-bold">Error: Permit number already exists.</div>}

                        {isMaster && (permit as any).cxSyncPending && ((permit as any).cxSyncError || (permit as any).syncStatus === 'failed' || (permit as any).sync_status === 'failed') && (
                            <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-3 mt-4 text-sm font-bold flex justify-between items-center gap-2 shadow-inner">
                                <div className="flex items-center gap-2">
                                    <CloudOff size={18} className="shrink-0" />
                                    <span><strong>ADMIN ALERT:</strong> CX Sync Failed ({(permit as any).cxSyncPending === 'issue' ? 'Emission' : 'Closure'}). <span className="font-normal">Error: {(permit as any).cxSyncError || 'Unknown'}</span></span>
                                </div>
                            </div>
                        )}

                        {isExecutionBlocked && <div className="bg-amber-100 text-amber-800 p-4 text-center font-black uppercase tracking-widest border-b-4 border-amber-300 mt-4">⚠️ Mechanical Work Pending. Awaiting Permit Approver to sign Part B.</div>}

                        <div className="flex border-b-4 border-gray-100 bg-white sticky top-0 z-40 shadow-sm overflow-x-auto hide-scrollbar mt-4">
                            <button onClick={() => setActiveTab('engineer')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'engineer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Engineer {engineerMissingCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white" aria-label={`${engineerMissingCount} missing items`}>{engineerMissingCount}</span>} {isIssued && <Lock size={12} />}</button>
                            <button onClick={() => setActiveTab('receiver_checklist')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'receiver_checklist' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Receiver Checklist {missingReceiverItems.length > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white" aria-label={`${missingReceiverItems.length} missing items`}>{missingReceiverItems.length}</span>} {isIssued && <Lock size={12} />}</button>
                            <button onClick={() => setActiveTab('issuer')} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'issuer' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>Issuer {isIssued && <CheckCircle size={14} className="text-green-500" />}</button>

                            {!isHydro && (
                                <button onClick={() => setActiveTab('approver')} disabled={permit.isDraft} className={`px-4 py-4 text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${permit.isDraft ? 'opacity-30 cursor-not-allowed' : (activeTab === 'approver' ? 'text-blue-700 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50')}`}>Approver {hasApproverSigned && <Lock size={12} />}</button>
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
                                <div className={isPartAReadOnly ? 'pointer-events-none opacity-95' : 'select-text pointer-events-auto'}>
                                    <fieldset disabled={isPartAReadOnly} className="border-0 p-0 m-0 min-w-0">
                                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                            <h3 className="font-black text-xl text-blue-900 uppercase">Engineer (Part A)</h3>
                                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 4/12</span>
                                        </div>
                                        {isPartAReadOnly && <div className="bg-gray-100 text-gray-600 p-3 rounded-lg mb-6 text-sm font-bold flex items-center gap-2"><Lock size={16} /> This planning section is locked after the Issuer signs or issues the permit.</div>}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">ITWOCX Permit # * {missingField('itwocxNumber') && requiredBadge}</p><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} className={requiredInputClass(missingField('itwocxNumber'))} aria-invalid={missingField('itwocxNumber')} value={itwocxNumber ?? ''} onChange={e => setItwocxNumber(toPermitNumber(e.target.value))} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} placeholder="Enter ITWOCX permit number" /></div>
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Work Location {missingField('location') && requiredBadge}</p><input type="text" className={requiredInputClass(missingField('location'))} aria-invalid={missingField('location')} value={location} onChange={v => setLocation(v.target.value)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} /></div>
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Permit Issued Date {missingField('issuedDate') && requiredBadge}</p><input type="date" className={requiredInputClass(missingField('issuedDate'))} aria-invalid={missingField('issuedDate')} value={issuedDate} onChange={v => setIssuedDate(v.target.value)} disabled={arePermitDatesLocked} readOnly={arePermitDatesLocked} /></div>
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Permit Commencement Date (Start Date) {missingField('commencementDate') && requiredBadge}</p><input type="date" className={requiredInputClass(missingField('commencementDate'))} aria-invalid={missingField('commencementDate')} value={commencementDate} onChange={v => { setCommencementDate(v.target.value); setEndDate(v.target.value ? addDaysISO(v.target.value, 7) : ''); }} disabled={arePermitDatesLocked} readOnly={arePermitDatesLocked} /></div>
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Permit End Date {missingField('endDate') && requiredBadge}</p><input type="date" className={requiredInputClass(missingField('endDate'))} aria-invalid={missingField('endDate')} value={endDate} onChange={v => setEndDate(v.target.value)} disabled={arePermitDatesLocked} readOnly={arePermitDatesLocked} /></div>
                                            <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">Excavation Type {missingField('excavationType') && requiredBadge}</p><select className={requiredInputClass(missingField('excavationType'))} aria-invalid={missingField('excavationType')} value={excavationType} onChange={e => setExcavationType(e.target.value)} disabled={isPartAReadOnly}><option value="">Select excavation type</option><option value="mechanical">Mechanical Excavation</option><option value="hydro">Hydro Excavation</option><option value="hand">Hand Digging</option></select></div>
                                            <div className="md:col-span-2 border-t pt-4 mt-2"><p className="text-xs text-gray-500 font-bold uppercase mb-2">Scope of Works {missingField('scopeOfWorks') && requiredBadge}</p><textarea className={`${requiredInputClass(missingField('scopeOfWorks'))} h-20`} aria-invalid={missingField('scopeOfWorks')} value={scopeOfWorks} onChange={v => setScopeOfWorks(v.target.value)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly}></textarea></div>
                                        </div>

                                        {!isPartAReadOnly && (
                                            <div className="mb-8">
                                                <button type="button" onClick={(e) => { e.preventDefault(); handleSaveDraft(); }} disabled={isSubmitting} className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white py-4 rounded-xl font-black uppercase shadow-lg flex items-center justify-center gap-2">
                                                    {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : 'Save & Sync Permit'}
                                                </button>
                                                {saveSuccess && <div role="status" className="mt-3 bg-green-50 border border-green-300 text-green-800 p-3 rounded-lg text-sm font-bold flex items-center gap-2"><CheckCircle size={16} /> Permit saved and synced successfully.</div>}
                                                {saveError && <div role="alert" className="mt-3 bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg text-sm font-bold">{saveError}</div>}
                                            </div>
                                        )}

                                        <div className="space-y-4 mb-10 border-b border-gray-100 pb-10">
                                            {partAItems.map(item => (
                                                <div key={item.id} className={`flex flex-col md:flex-row gap-4 border rounded-lg p-3 ${isMissing(item.answer) ? 'border-red-500 bg-red-50/60' : 'border-gray-100'}`}>
                                                    <div className="flex-1"><span className="font-black text-blue-600 mr-2">{String(item.id).replace(/[a-z]/g, '')}.</span><span className="text-sm font-bold text-gray-800 leading-relaxed">{item.question}</span>{isMissing(item.answer) && requiredBadge}</div>
                                                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-80 shrink-0">
                                                        <SyncedSelect className={requiredInputClass(isMissing(item.answer)) + " sm:w-24"} aria-label={item.question} aria-invalid={isMissing(item.answer)} value={item.answer || ''} onValueChange={v => updateChecklist('partAChecklist', item.id, 'answer', v)} disabled={isPartAReadOnly}><option value="">- PEND -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></SyncedSelect>
                                                        <DebouncedInput type="text" placeholder="Comment..." className={inputClass + " flex-1"} value={item.comment || ''} onValueChange={v => updateChecklist('partAChecklist', item.id, 'comment', v)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                                            <div className="bg-gray-50 p-6 rounded-2xl border shadow-sm">
                                                <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-gray-500 border-b pb-2">Site Engineer Signature</p>
                                                {permit.siteEngineerSignature && isIssued ? (
                                                    <div className="text-center">{permit.siteEngineerSignature.type === 'draw' && <img src={permit.siteEngineerSignature.data} className="h-16 mx-auto mix-blend-multiply" alt="Signature" />}<p className="font-bold text-sm uppercase">{permit.siteEngineerSignature.name}</p></div>
                                                ) : (
                                                    <AclSignature users={aclUsers} role="Site Engineer" label="Sign here" onSave={(sig) => updateField('siteEngineerSignature', sig)} initialValue={permit.siteEngineerSignature} readOnly={isIssued || isClosed} />
                                                )}
                                            </div>

                                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200 shadow-sm relative">
                                                <p className="text-center font-black uppercase text-xs mb-4 tracking-widest text-blue-800 border-b border-blue-200 pb-2">Receiver Initial Signature (Induction)</p>
                                                {permit.receiverSignature && isIssued ? (
                                                    <div className="text-center">{permit.receiverSignature.type === 'draw' && <img src={permit.receiverSignature.data} className="h-16 mx-auto mix-blend-multiply" alt="Signature" />}<p className="font-bold text-sm uppercase text-blue-900">{permit.receiverSignature.name}</p></div>
                                                ) : (
                                                    <>
                                                        {!canReceiverSign && !permit.receiverSignature && (
                                                            <p className="text-xs text-red-700 font-bold mb-3 bg-red-50 p-3 rounded-lg border-2 border-red-500 text-left">{receiverSignWarning}</p>
                                                        )}
                                                        <div className={!canReceiverSign && !permit.receiverSignature ? 'opacity-40 pointer-events-none' : ''}>
                                                            <AclSignature users={aclUsers} role="Receiver" label="Sign here" onSave={(sig) => updateField('receiverSignature', sig)} initialValue={permit.receiverSignature} excludeEmail={permit.issuerEmail} validateUser={user => {
                                                                if (permit.issuerSignature && normalizeName(`${user.firstName || ''} ${user.lastName || ''}`) === normalizeName(permit.issuerSignature.name)) {
                                                                    alert("An Issuer cannot also be the Receiver on the same permit.");
                                                                    return false;
                                                                }
                                                                return true;
                                                            }} readOnly={isIssued || isClosed || (!canReceiverSign && !permit.receiverSignature)} />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            </div>

                            <div className={activeTab === 'receiver_checklist' ? 'block animate-fade-in' : 'hidden'}>
                                <div className={isPartAReadOnly ? 'pointer-events-none opacity-95' : 'select-text pointer-events-auto'}>
                                    <fieldset disabled={isPartAReadOnly} className="border-0 p-0 m-0 min-w-0">
                                        <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                            <h3 className="font-black text-xl text-blue-900 uppercase">Receiver Checklist</h3>
                                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 6/12</span>
                                        </div>
                                        {isPartAReadOnly && <div className="bg-gray-100 text-gray-600 p-3 rounded-lg mb-6 text-sm font-bold flex items-center gap-2"><Lock size={16} /> This pre-work checklist is locked after the Issuer signs or issues the permit.</div>}

                                        {!receiverChecklistApplies ? (
                                            <div className="bg-blue-50 border-4 border-blue-200 p-10 rounded-[2rem] text-center mb-8 shadow-inner animate-fade-in">
                                                <Info size={48} className="mx-auto mb-4 text-blue-500" />
                                                <h3 className="text-xl font-black text-blue-800 uppercase mb-2">Excavation is Hydro / Hand</h3>
                                                <p className="text-blue-700 font-medium">Mechanical checklist is not applicable. Please review Part A in the Engineer tab, ensuring the induction is signed, then proceed to the execution tabs.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 mb-10">
                                                <p className="text-red-600 font-bold text-xs bg-red-50 p-3 rounded-lg border border-red-100 uppercase mb-6">Checks to be made BEFORE mechanical digging (Editable by Receiver).</p>
                                                {receiverItems.map(item => (
                                                    <div key={item.id} className={`flex flex-col md:flex-row gap-4 border rounded-lg p-3 ${isMissing(item.answer) ? 'border-red-500 bg-red-50/60' : 'border-gray-100'}`}>
                                                        <div className="flex-1"><span className="font-black text-blue-600 mr-2">{item.id}.</span><span className="text-sm font-bold text-gray-800">{item.question}</span>{isMissing(item.answer) && requiredBadge}</div>
                                                        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-80 shrink-0">
                                                            <SyncedSelect className={requiredInputClass(isMissing(item.answer)) + " sm:w-24"} aria-label={item.question} aria-invalid={isMissing(item.answer)} value={item.answer || ''} onValueChange={v => updateChecklist('receiverChecklist', item.id, 'answer', v)} disabled={isPartAReadOnly}><option value="">- PEND -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></SyncedSelect>
                                                            <DebouncedInput type="text" placeholder="Comment..." className={inputClass + " flex-1"} value={item.comment || ''} onValueChange={v => updateChecklist('receiverChecklist', item.id, 'comment', v)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </fieldset>
                                </div>
                            </div>

                            <div className={activeTab === 'issuer' ? 'block animate-fade-in' : 'hidden'}>
                                <div className={(isIssuedPermit || isClosed) ? 'pointer-events-none opacity-95' : 'select-text pointer-events-auto'}>
                                    <fieldset disabled={isIssuedPermit || isClosed} className="border-0 p-0 m-0 min-w-0">
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
                                                <div key={q.key} className="flex flex-col p-4 bg-white gap-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                        <span className="font-bold text-sm text-gray-800 w-full sm:w-2/3">{q.label} *</span>
                                                        <div className="flex space-x-3 w-full sm:w-1/3 sm:justify-end">
                                                            {(['yes', 'no', 'n/a'] as const).map(opt => (
                                                                <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                                                                    <input type="radio" checked={permit[q.key as keyof Permit] === opt} onChange={() => updateField(q.key as keyof Permit, opt)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} className="h-5 w-5 text-blue-600 cursor-pointer" />
                                                                    <span className="uppercase text-xs font-black text-gray-600">{opt}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <DebouncedInput type="text" placeholder="Issuer comment..." aria-label={`Issuer comment for ${q.label}`} className={inputClass} value={permit.issuerComments?.[q.key] || ''} onValueChange={v => updateIssuerComment(q.key, v)} disabled={isPartAReadOnly} readOnly={isPartAReadOnly} />
                                                </div>
                                            ))}
                                        </div>

                                        <div className="max-w-xl mx-auto border-2 border-green-500 p-8 rounded-2xl bg-green-50 shadow-md text-center">
                                            <h4 className="font-black uppercase text-green-900 mb-6 tracking-widest text-lg">Finalize & Issue to Field</h4>
                                            {permit.issuerSignature && isIssuedPermit ? (
                                                <div className="animate-fade-in">
                                                    <div className="text-center bg-white p-4 rounded-xl shadow-inner mb-4"><img src={permit.issuerSignature?.data} className="h-16 mx-auto mix-blend-multiply" /><p className="font-bold text-sm uppercase">{permit.issuerSignature?.name}</p></div>
                                                    <div className="bg-green-600 text-white p-3 rounded-lg font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg"><CheckCircle size={20} /> PERMIT ISSUED TO SITE (LOCKED)</div>
                                                    <p className="text-xs text-gray-500 mt-3 font-bold">Tabs 1, 2, and 3 are now locked.</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <SignaturePad label="Issuer Signature" onSave={(sig) => updateField('issuerSignature', sig)} initialValue={permit.issuerSignature} readOnly={isPartAReadOnly} />
                                                    <button type="button" onClick={handleIssuePermit} disabled={isSubmitting} className={`mt-8 w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-green-600 text-white shadow-xl hover:bg-green-700 hover:scale-[1.02]'}`}>
                                                        {isSubmitting ? <Loader2 size={28} className="animate-spin" /> : <FileSignature size={28} />}
                                                        {isSubmitting ? 'ISSUING...' : 'ISSUE PERMIT (LOCK PLANNING & DRAFT)'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </fieldset>
                                </div>
                            </div>

                            {!isHydro && (
                                <div className={activeTab === 'approver' ? 'block animate-fade-in' : 'hidden'}>
                                    <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                        <h3 className="font-black text-xl text-blue-900 uppercase">Approver (Part B)</h3>
                                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Ref: PDF Pg 5/12</span>
                                    </div>

                                    <div className="animate-fade-in filter">
                                        <p className="text-red-600 font-black text-sm mb-6 bg-red-50 p-3 rounded-lg border border-red-100 uppercase flex items-center gap-2"><ShieldCheck size={18} /> Permit Approver MUST attend site before starting any mechanical excavation.</p>

                                        <div className="space-y-4 mb-8">
                                            {partBItems.map(item => (
                                                <div key={item.id} className="flex flex-col md:flex-row gap-4 border-b border-gray-100 pb-4 last:border-0">
                                                    <div className="flex-1"><span className="font-black text-blue-600 mr-2">{item.id}.</span><span className="text-sm font-bold text-gray-800 leading-relaxed">{item.question}</span></div>
                                                    <div className="w-full md:w-40 shrink-0"><SyncedSelect className={inputClass} value={item.answer || ''} onValueChange={v => updateChecklist('partBChecklist', item.id, 'answer', v)} disabled={hasApproverSigned || isClosed}><option value="">- PENDING -</option><option value="yes">YES</option><option value="no">NO</option><option value="n/a">N/A</option></SyncedSelect></div>
                                                    <DebouncedTextArea className={`${inputClass} w-full md:w-64 min-h-20 resize-y`} value={permit.approverComments?.[item.id] || ''} onValueChange={v => updateApproverComment(item.id, v)} disabled={hasApproverSigned || isClosed} placeholder="Approver comment..." aria-label={`Approver comment for item ${item.id}`} />
                                                </div>
                                            ))}
                                        </div>

                                        <div className="bg-blue-50 p-6 md:p-8 rounded-2xl border-2 border-blue-200 mt-8 max-w-md mx-auto shadow-md">
                                            <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest text-center mb-6 border-b border-blue-200 pb-2">Permit Approver Authorization</h4>

                                            <div className="mb-8 p-5 bg-white rounded-xl border border-blue-100 shadow-sm text-center">
                                                <p className="text-xs font-black text-gray-700 uppercase mb-3 border-b border-gray-100 pb-2"><Camera size={14} className="inline mr-1 text-blue-600" /> Step 1: Mandatory Site Photo</p>

                                                {(permit as any).approverPhoto ? (
                                                    <div className="relative inline-block mt-2">
                                                        <img src={(permit as any).approverPhoto} className="h-32 w-32 object-cover rounded-xl border-4 border-green-500 shadow-md" alt="Inspection" />
                                                        <p className="text-[10px] font-black text-green-600 mt-3 uppercase tracking-widest flex justify-center items-center gap-1"><CheckCircle size={14} /> Photo Attached</p>
                                                    </div>
                                                ) : (
                                                    <div className="mt-2">
                                                        <p className="text-xs text-red-700 font-bold mb-3 bg-red-50 p-3 rounded-lg border-2 border-red-500 text-left">⚠️ LEGAL LIABILITY NOTICE: By submitting this photograph and signing Part B, the Approver legally certifies an on-site visual inspection of the exposed underground services and assumes full personal, disciplinary, and legal liability under the Health and Safety at Work Act; uploading desk, unrelated, or falsified images constitutes falsification of an official safety record and will result in immediate compliance escalation.</p>
                                                        <button onClick={() => approverCameraRef.current?.click()} disabled={isUploadingApproverPhoto || hasApproverSigned || isClosed || !isOnline} className={`bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-black text-sm uppercase shadow-lg flex items-center justify-center gap-3 w-full transition-all ${!isOnline ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}`}>
                                                            {isUploadingApproverPhoto ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                                                            {isUploadingApproverPhoto ? 'Uploading Securely...' : 'Take Photo'}
                                                        </button>
                                                        <input ref={approverCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleApproverPhotoUpload} />
                                                        <p className="text-[10px] text-red-600 font-bold mt-3 uppercase tracking-wide bg-red-50 py-1.5 rounded-md border border-red-100 shadow-inner">⚠️ Required before signing</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={!(permit as any).approverPhoto ? "opacity-30 pointer-events-none filter grayscale transition-all duration-300" : "animate-fade-in transition-all duration-300"}>
                                                <p className="text-xs font-black text-gray-700 uppercase mb-3 border-b border-gray-100 pb-2 text-center"><ShieldCheck size={14} className="inline mr-1 text-blue-600" /> Step 2: Authorize Works</p>
                                                {hasApproverSigned ? (
                                                    <div className="text-center bg-white p-6 rounded-xl border-2 border-green-500 shadow-inner">
                                                        {permit.approverSignature!.type === 'draw' && <img src={permit.approverSignature!.data} className="h-16 mx-auto mix-blend-multiply mb-2" alt="sig" />}
                                                        <p className="font-black uppercase text-gray-900 text-xs">{permit.approverSignature!.name}</p>
                                                        <div className="bg-green-600 text-white px-4 py-3 mt-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"><ShieldCheck size={20} /> Mechanical Approved</div>
                                                    </div>
                                                ) : (
                                                    <AclSignature users={aclUsers} role="Approver" label="Approver Signature" onSave={handleApproverSign} readOnly={isClosed} />
                                                )}
                                            </div>
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
                                        <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Name</label><DebouncedInput type="text" className={inputClass} value={newCrewName} onValueChange={v => setNewCrewName(v)} placeholder="Full Name" /></div>
                                        <div><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Role</label><SyncedSelect className={inputClass} value={newCrewRole} onValueChange={v => setNewCrewRole(v)}><option value="Labour">Labour</option><option value="Operator">Operator</option><option value="Spotter">Spotter</option><option value="Foreman">Foreman</option></SyncedSelect></div>
                                        <div><SignaturePad key={`crew-${(permit.crewMembers || []).length}`} label="Sign & Add to Crew" onSave={handleRegisterCrew} externalName={newCrewName} /></div>
                                    </div>
                                )}
                                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner">
                                    <table className="min-w-full text-sm"><thead className="bg-gray-100 text-gray-700 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200"><tr><th className="p-4 text-left">Date &amp; Time</th><th className="p-4 text-left">Name</th><th className="p-4 text-left">Role</th><th className="p-4 text-center">Signature</th></tr></thead><tbody className="divide-y divide-gray-100">{(permit.crewMembers || []).map(m => (<tr key={m.id} className="hover:bg-gray-50 transition-colors"><td className="p-4 font-mono text-xs text-gray-500">{formatDateTime(m.dateInducted) || 'N/A'}</td><td className="p-4 font-black uppercase text-gray-900">{m.name}</td><td className="p-4 font-bold text-blue-800 text-xs uppercase bg-blue-50 rounded px-2">{m.role}</td><td className="p-4">{m.signature?.data && (m.signature.type === 'type' ? m.signature.name : <img src={m.signature.data} className="h-6 mx-auto mix-blend-multiply" />)}</td></tr>))}</tbody></table>
                                </div>
                            </div>

                            <div className={activeTab === 'daily' ? 'block animate-fade-in' : 'hidden'}>
                                <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                    <h3 className="font-black text-xl text-blue-900 uppercase">Daily Sign On</h3>
                                </div>
                                {!isClosed && (
                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div><AclSignature key={`daily-receiver-${(permit.dailyLogs || []).length}`} users={aclUsers} role="Receiver" label="Receiver Signature" onSave={setDailyRecSig} onClear={() => setDailyRecSig(null)} /></div>
                                        <div><SignaturePad key={`daily-operator-${(permit.dailyLogs || []).length}`} label="Operator Signature" onSave={setDailyOpSig} onClear={() => setDailyOpSig(null)} /></div>
                                        <div><SignaturePad key={`daily-spotter-${(permit.dailyLogs || []).length}`} label="Spotter Signature" onSave={setDailySpotSig} onClear={() => setDailySpotSig(null)} /></div>
                                        <div className="md:col-span-3 border-t pt-4"><button type="button" onClick={handleSaveDailyLog} className="w-full bg-blue-800 hover:bg-blue-900 text-white py-4 rounded-xl font-black uppercase shadow-md flex items-center justify-center gap-2"><CheckCircle size={20} /> + Add Sign-On Entry</button></div>
                                    </div>
                                )}
                                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner">
                                    <table className="min-w-full text-xs text-center"><thead className="bg-gray-100 text-gray-700 uppercase font-black tracking-widest"><tr><th className="p-4 border-r">Date &amp; Time</th><th className="p-4 border-r">Receiver</th><th className="p-4 border-r">Operator</th><th className="p-4">Spotter</th></tr></thead><tbody className="divide-y divide-gray-100">{(permit.dailyLogs || []).map(log => (<tr key={log.id} className="hover:bg-gray-50 transition-colors"><td className="p-4 font-mono text-gray-600 border-r">{formatDateTime(log.date)}</td>{[log.receiverSig, log.excavatorSig, log.spotterSig].map((sig, index) => <td key={index} className="p-4 border-r">{sig ? <><div>{sig.name}</div>{sig.type === 'draw' && sig.data && <img src={sig.data} className="h-8 mx-auto mix-blend-multiply" alt="Signature" />}</> : 'N/A'}</td>)}</tr>))}</tbody></table>
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
                                        <h4 className="text-sm font-black uppercase mb-6 text-blue-900 flex items-center gap-2 border-b border-blue-200 pb-2"><Users size={20} /> New Receiver Acknowledgement</h4>
                                        <AclSignature key={`handover-${currentHandovers.length}`} users={aclUsers} role="Receiver" label="New Receiver Signature" onSave={setHandoverSignature} onClear={() => setHandoverSignature(null)} excludeEmail={permit.issuerEmail} />
                                        {handoverSignature && <button onClick={finalizeHandover} className="mt-8 w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 hover:scale-[1.01]"><ShieldCheck size={20} /> Confirm Handover Registration</button>}
                                    </div>
                                )}

                                <div className="mt-10"><h4 className="font-black text-sm text-gray-700 uppercase tracking-widest mb-4 border-b pb-2">Handover Log</h4><div className="overflow-x-auto border rounded-xl shadow-inner"><table className="min-w-full text-sm text-center"><thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] tracking-widest"><tr><th className="p-3 border-r">#</th><th className="p-3 border-r text-left">Receiver Name</th><th className="p-3 border-r">Signature</th><th className="p-3">Date</th></tr></thead><tbody className="divide-y divide-gray-100">
                                    {currentHandovers.map((h, i) => (<tr key={h.id} className="hover:bg-gray-50 transition-colors"><td className="p-3 border-r font-black text-gray-400">{i + 1}</td><td className="p-3 border-r uppercase font-bold text-gray-900 text-left">{h.receiverName}</td><td className="p-3 border-r">{h.signature?.type === 'type' ? h.signature.name : h.signature?.data && <img src={h.signature.data} className="h-8 mx-auto mix-blend-multiply" alt="Signature" />}</td><td className="p-3 font-mono text-xs text-gray-500">{formatDateTime(h.date) || 'N/A'}</td></tr>))}
                                </tbody></table></div></div>
                            </div>

                            <div className={activeTab === 'photos' ? 'block animate-fade-in' : 'hidden'}>
                                <div className="flex justify-between items-center border-b-2 border-blue-200 pb-2 mb-6">
                                    <h3 className="font-black text-xl text-blue-900 uppercase">Photographic Evidence</h3>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                                    {(permit.photos || []).map(photo => (<div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white relative animate-fade-in"><img src={photo.url} className="aspect-square object-cover w-full" /><div className="p-3 border-t"><p className="text-[10px] font-black uppercase text-gray-700 line-clamp-2" title={photo.caption}>{photo.caption || 'No caption'}</p></div></div>))}
                                </div>
                                {!isClosed && (
                                    <div className="border-4 border-dashed border-gray-300 p-8 rounded-[2rem] text-center bg-gray-50/50 hover:bg-gray-50 transition-colors animate-fade-in relative z-10">
                                        <DebouncedInput type="text" placeholder="Type a descriptive caption for the photo..." className={inputClass + " mb-6 max-w-md mx-auto text-center"} value={photoCaption} onValueChange={v => setPhotoCaption(v)} />
                                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                            <button onClick={() => cameraInputRef.current?.click()} disabled={isUploadingPhoto || !isOnline} className={`text-white px-8 py-4 rounded-xl font-black uppercase shadow-lg flex items-center justify-center gap-2 transition-all ${!isOnline ? 'bg-gray-400 opacity-50 cursor-not-allowed' : 'bg-blue-800 hover:bg-blue-900 hover:scale-[1.02]'}`}>
                                                {isUploadingPhoto ? <Loader2 className="animate-spin" /> : <Camera size={20} />} Take / Upload Photo
                                            </button>
                                            <button onClick={() => galleryInputRef.current?.click()} disabled={isUploadingPhoto || !isOnline} className={`text-blue-900 bg-white border-2 border-blue-200 px-8 py-4 rounded-xl font-black uppercase shadow-sm flex items-center justify-center gap-2 transition-all ${!isOnline ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 hover:scale-[1.02]'}`}>
                                                {isUploadingPhoto ? <Loader2 className="animate-spin" /> : <ImageIcon size={20} />} Upload from Gallery
                                            </button>
                                        </div>
                                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                                        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                    </div>
                                )}
                            </div>

                            <div className={activeTab === 'notes' ? 'block animate-fade-in' : 'hidden'}>
                                <div className="mt-4 bg-red-50 border-4 border-red-600 p-8 rounded-[2rem] shadow-inner mb-10 animate-fade-in relative">
                                    <h3 className="font-black text-2xl mb-6 text-red-700 uppercase flex items-center gap-3 tracking-tighter"><AlertTriangle size={32} className="shrink-0" /> CEASE WORKS PROTOCOL (Pg 7)</h3>
                                    <div className="space-y-4 mb-8">
                                        {[
                                            { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
                                            { id: '2', text: "If the methodology or site conditions change, work must stop..." },
                                            { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
                                            { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
                                        ].map(item => (
                                            <label key={item.id} className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${ceaseItem === item.id || permit.ceaseWorksRecord?.affectedItemNumber === item.id ? 'border-red-600 bg-red-100 shadow-md' : 'border-red-200 bg-white hover:bg-red-50'}`}>
                                                {!permit.ceaseWorksRecord && <input type="radio" name="ceaseCondition" value={item.id} checked={ceaseItem === item.id} onChange={(e) => setCeaseItem(e.target.value as any)} className="w-5 h-5 mt-0.5 text-red-600 focus:ring-red-500 cursor-pointer" />}
                                                <div className="flex gap-3 leading-relaxed"><span className="font-black text-red-700 text-lg">{item.id}.</span><span className="text-sm font-medium text-gray-900 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.text.replace(/must stop/g, '<strong>must stop</strong>') }}></span></div>
                                            </label>
                                        ))}
                                    </div>
                                    {ceaseItem && !permit.ceaseWorksRecord && (
                                        <div className="bg-white p-8 rounded-2xl border-2 border-red-300 shadow-xl animate-fade-in">
                                            <h4 className="text-red-800 font-black uppercase tracking-widest mb-6 border-b border-red-100 pb-2">Execute Cease Works PROTOCOL</h4>

                                            {!isOnline && ceaseAction === 'cancelled' && (
                                                <div className="bg-red-100 text-red-800 p-3 rounded-lg mb-4 text-sm font-bold flex items-center gap-2">
                                                    <Wifi size={20} /> You are offline. Internet connection is required to generate the Emergency Protocol PDF.
                                                </div>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Action Required</label><SyncedSelect className={inputClass} value={ceaseAction} onValueChange={v => setCeaseAction(v as any)}><option value="">- Select Action -</option><option value="cancelled">Cancel / Revoke Permit immediately</option></SyncedSelect></div>
                                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Issuer Name</label><DebouncedInput type="text" className={inputClass} value={ceaseIssuerName} onValueChange={v => setCeaseIssuerName(v)} placeholder="Authorizing Issuer..." /></div>
                                            </div>
                                            {ceaseAction && (
                                                <div className={!isOnline && ceaseAction === 'cancelled' ? 'opacity-50 pointer-events-none' : ''}>
                                                    <SignaturePad label="Issuer Signature to Confirm Protocol" onSave={handleCeaseWorksSave} externalName={ceaseIssuerName} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-black text-xl mb-2 text-blue-900 border-b-2 border-blue-200 pb-2 uppercase mt-10">Job Notes</h3>
                                <div className="space-y-3 mb-4">
                                    {(() => {
                                        const history: PermitNote[] = Array.isArray(permit.notesHistory) ? permit.notesHistory : [];
                                        const legacyText = String(permit.otherNotes || '').trim();
                                        const entries: PermitNote[] = history.length > 0 ? history : (legacyText ? [{ text: legacyText, author: String((permit as any).notesAuthor || ''), timestamp: String((permit as any).notesUpdatedAt || permit.createdAt || '') }] : []);
                                        if (entries.length === 0) return <p className="text-xs font-bold text-gray-400 uppercase">No notes yet.</p>;
                                        return entries.map((n, i) => {
                                            const d = n?.timestamp ? new Date(n.timestamp) : null;
                                            return (
                                                <div key={`${n?.timestamp || 'note'}-${i}`} className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                                                    <div className="text-[11px] text-blue-900 font-black uppercase mb-1">{String(n?.author || 'Unknown user')} · {d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : 'Date unavailable'}</div>
                                                    <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{String(n?.text || '')}</p>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                                {!isClosed && (
                                    <>
                                        <textarea className={`${inputClass} mb-4 h-24 text-sm leading-relaxed`} value={noteDraft} onChange={e => setNoteDraft(e.target.value)} disabled={isSavingNote} placeholder="Add a note (job details, incidents, toolbox meeting notes...). Submitted notes cannot be edited."></textarea>
                                        <button type="button" onClick={handleAddNote} disabled={isSavingNote || !noteDraft.trim()} className={`px-8 py-3 rounded-xl font-black text-xs uppercase shadow-md transition-all ${isSavingNote || !noteDraft.trim() ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-800 hover:bg-blue-900 text-white hover:scale-[1.02]'}`}>{isSavingNote ? 'Saving...' : 'Add Note'}</button>
                                    </>
                                )}
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
                                        <div className="bg-blue-900 p-4 text-white font-black text-lg uppercase tracking-widest flex items-center justify-between"><div className="flex items-center gap-3"><Lock size={20} /> PERMIT CLOSURE</div><span className="text-xs bg-blue-800 px-3 py-1.5 rounded-full font-bold shadow-inner flex items-center gap-1.5"><ImageIcon size={14} /> Will include final PDF</span></div>
                                        <div className="p-8">
                                            <div className="space-y-5 mb-8">
                                                <label className="flex items-start gap-4 cursor-pointer group p-3 border rounded-xl hover:bg-gray-50 transition-colors"><input type="checkbox" checked={preClosureCheck1} onChange={e => { setPreClosureCheck1(e.target.checked); if (e.target.checked) setPreClosureCheck3(false); }} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The authorised excavation has been completed and the work site has been left in a safe condition.</span></label>
                                                <label className="flex items-start gap-4 cursor-pointer group p-3 border rounded-xl hover:bg-gray-50 transition-colors"><input type="checkbox" checked={preClosureCheck2} onChange={e => setPreClosureCheck2(e.target.checked)} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The site services plan has been accurately As Built for all new services and returned to the Site Services Coordinator.</span></label>
                                                <div className="flex flex-col gap-3 p-3 border rounded-xl hover:bg-gray-50 transition-colors relative"><label className="flex items-start gap-4 cursor-pointer group"><input type="checkbox" checked={preClosureCheck3} onChange={e => { setPreClosureCheck3(e.target.checked); if (e.target.checked) setPreClosureCheck1(false); }} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-800 leading-relaxed">The work has not been completed and the following remains outstanding:</span></label>{preClosureCheck3 && (<DebouncedTextArea className="ml-9 text-sm border-2 border-blue-200 rounded-lg p-3 bg-white focus:ring-2 outline-none animate-in fade-in" rows={3} placeholder="Please detail outstanding works..." value={outstandingWorks} onValueChange={v => setOutstandingWorks(v)} />)}</div>
                                            </div>
                                            <div className="border-t-2 border-gray-100 pt-8">
                                                {(!hasDigitalDaily || !hasDigitalCrew) && (
                                                <div className="mb-6">
                                                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-4 bg-gray-50">
                                                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">DAILY SIGN OFF & CREW REGISTRATION EVIDENCE *</p>
                                                        {(permit.dailySignOffUrl || permit.crewRegistrationUrl) ? (
                                                            <div className="space-y-2 relative">
                                                                <img src={permit.dailySignOffUrl || permit.crewRegistrationUrl} alt="Daily sign off and crew registration evidence" className="h-28 w-full object-cover rounded-xl border border-gray-200" />
                                                                <button type="button" onClick={() => handleClosureEvidenceDelete()} disabled={isSubmitting || !isOnline} aria-label="Delete evidence photo" title="Delete photo" className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-md hover:bg-red-700 disabled:bg-gray-400"><Trash2 size={16} /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                <button onClick={() => dailySignOffUploadRef.current?.click()} disabled={!isOnline} className={`w-full ${!isOnline ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'} font-black uppercase text-xs py-3 rounded-xl`}><Camera size={14} className="inline mr-2" />Take Photo</button>
                                                                <button onClick={() => dailySignOffGalleryRef.current?.click()} disabled={!isOnline} className={`w-full ${!isOnline ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'} font-black uppercase text-xs py-3 rounded-xl`}><ImageIcon size={14} className="inline mr-2" />Upload from Gallery</button>
                                                            </div>
                                                        )}
                                                        <input ref={dailySignOffUploadRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleClosureEvidenceUpload} />
                                                        <input ref={dailySignOffGalleryRef} type="file" accept="image/*" className="hidden" onChange={handleClosureEvidenceUpload} />
                                                    </div>
                                                </div>
                                                )}

                                                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Identify to Close (Active Receiver)</label>
                                                <DebouncedInput type="text" className={inputClass + " mb-6 py-3 text-lg text-center uppercase border-gray-400"} placeholder={activeReceiverName.toUpperCase()} value={closureReceiverName} onValueChange={v => setClosureReceiverName(v)} />

                                                {isClosureDeniedByHandover && (
                                                    <div className="bg-red-100 border border-red-300 text-red-800 p-3 rounded-lg mb-4 text-xs font-bold flex items-center justify-center gap-2 text-center shadow-inner">
                                                        <AlertTriangle size={16} className="shrink-0" /> {aclError || HANDOVER_CLOSURE_DENIED_MESSAGE}
                                                    </div>
                                                )}
                                                {!isOnline && (
                                                    <div className="bg-red-100 text-red-800 p-3 rounded-lg mb-4 text-xs font-bold flex items-center justify-center gap-2 text-center shadow-inner">
                                                        <Wifi size={16} className="shrink-0" /> INTERNET REQUIRED: You cannot close the permit offline because the final 12-page PDF must be uploaded directly to the cloud.
                                                    </div>
                                                )}
                                                <button onTouchStart={(e) => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }} onClick={handleAutomatedCloseAndLodge} disabled={isSubmitting || !isOnline || isClosureDeniedByHandover || !isRegistrationEvidenceReady} className={`w-full py-5 rounded-xl font-black text-lg uppercase flex items-center justify-center gap-3 transition-all ${isSubmitting || !isOnline || isClosureDeniedByHandover || !isRegistrationEvidenceReady ? 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed' : 'bg-red-600 text-white shadow-xl hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]'}`}>
                                                    {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <CloudUpload size={28} />}
                                                    {isSubmitting ? 'Processing...' : 'Close Permit & Finalize'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                        <EmergencyProtocolContent isPdf={false} />
                    </div>

                    {isPreparingPDF && <div className="absolute -left-[10000px] top-0 print:static print:left-0 w-[210mm] print:w-[210mm] z-[-50] print:z-auto">
                        <div ref={pdfExportRef} className="bg-white">
                                                    <PermitPDFLayout permit={pdfPermit || permit} pdfRef={pdfExportRef} currentReceiverName={currentReceiverName} currentReceiverSignature={currentReceiverSignature} partAItems={partAItems} partBItems={partBItems} receiverItems={receiverItems} handoverItems={handoverItems} currentHandovers={currentHandovers} CEASE_WORKS_ITEMS={[
                                { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
                                { id: '2', text: "If the methodology or site conditions change, work must stop..." },
                                { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
                                { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
                            ]} />
                        </div>
                    </div>}

                    {/* Local print only: print-only permit in normal document flow; no fixed/absolute/overflow clipping. Separate from the Cx PDF layout above */}
                    {isPrintMounted && <div className="hidden print:block print-area">
                        <PermitPDFLayout permit={permit} pdfRef={printLayoutRef} auditUrl={permit.id ? buildAuditPdfUrl(permit.id) : undefined} currentReceiverName={currentReceiverName} currentReceiverSignature={currentReceiverSignature} partAItems={partAItems} partBItems={partBItems} receiverItems={receiverItems} handoverItems={handoverItems} currentHandovers={currentHandovers} CEASE_WORKS_ITEMS={[
                            { id: '1', text: "If you encounter a previously unidentified service or archaeological items, work must stop..." },
                            { id: '2', text: "If the methodology or site conditions change, work must stop..." },
                            { id: '3', text: "If the foreman, excavator operator or spotter change at any stage, work must stop..." },
                            { id: '4', text: "If you encounter asbestos or other contaminates work must stop..." }
                        ]} />
                    </div>}
                </>
            )}
        </>
    );
};

export default PermitDetail;
