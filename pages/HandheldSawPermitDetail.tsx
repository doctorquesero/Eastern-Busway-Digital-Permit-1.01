import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock3, CloudUpload, Loader2, MapPin, Printer, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { collection, deleteField, doc, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { getStorage, getDownloadURL, deleteObject, ref, uploadBytes, uploadString } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db } from '../firebase';
import SignaturePad from '../components/SignaturePad';
import HandheldSawPermitPDFLayout from '../components/HandheldSawPermitPDFLayout';
import { getPermitById, savePermit } from '../services/storage';
import { getUserRole } from '../services/cx';
import { getAppMode, getTargetCollection } from '../utils/appMode';
import { generateId } from '../utils/id';
import { sanitizeForFirestore } from '../utils/firestore';
import { renderPagesToPdf } from '../utils/pdf';
import { buildAuditPdfUrl } from '../utils/auditUrl';
import { AclUser, aclName, aclRoles, validAclPin } from '../utils/acl';
import {
    applyHandheldSawPatch,
    applyHandheldSawPermitPatch,
    createInitialHandheldSawDetails,
    HANDHELD_SAW_APPROVAL_LEGAL_WARNING,
    HANDHELD_SAW_FORM_TABS,
    HANDHELD_SAW_SERVICES,
    HANDHELD_SAW_TITLE,
    HANDHELD_SAW_VALIDITY_DAYS,
    HANDHELD_SAW_WORK_CONTROLS,
    HandheldSawFormTab,
    finishDateForHandheldSawStart,
    formatHandheldSawPermitNumber,
    hasHandheldSawSchedule,
    hasSatisfiedHandheldSawApproval,
    hasUploadedApprovalPdf,
    mergeHandheldSawDetails,
    stripHandheldSawPermitPrefix,
    tabForHandheldSawValidationErrors,
    validateHandheldSawIssuance,
    clearManagerApproval,
    timeFrom12Hour,
    timeTo12Hour,
    withClearedSignatureDeletes
} from '../utils/handheldSawPermit';
import {
    HandheldSawPermitDetails,
    Permit,
    SawPermitServiceStatus,
    SawPermitWorkControlStatus,
    Signature,
    INITIAL_HANDOVER_CHECKLIST,
    INITIAL_PART_A,
    INITIAL_PART_B,
    INITIAL_RECEIVER_CHECKLIST
} from '../types';

type FormTab = HandheldSawFormTab;
type ApprovalRole = 'Zone Manager' | 'Project Director' | 'Receiver';

const textInputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100';
const selectClass = textInputClass;

const SignatureTimestamp: React.FC<{ signature?: Signature }> = ({ signature }) => {
    if (!signature?.date) return <p className="text-xs text-gray-500">Date: — · Time (24 hr): —</p>;
    const date = new Date(signature.date);
    if (Number.isNaN(date.getTime())) return <p className="text-xs text-gray-500">Signature date/time unavailable</p>;
    return <p className="text-xs text-gray-500">Date: {date.toLocaleDateString()} · Time (24 hr): {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</p>;
};

const formatPermitDateTime = (date: string, time: string) => {
    if (!date) return 'Not set';
    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString();
    const parsedTime = timeTo12Hour(time);
    return `${dateLabel} · ${parsedTime.hour && parsedTime.minute ? `${parsedTime.hour}:${parsedTime.minute} ${parsedTime.period}` : 'Time not set'}`;
};

const TextField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    invalid?: boolean;
}> = ({ label, value, onChange, type = 'text', required = false, disabled = false, placeholder, invalid = false }) => (
    <label className="block min-w-0">
        <span className={`mb-1 block text-xs font-black uppercase tracking-wide ${invalid ? 'text-red-700' : 'text-gray-600'}`}>{label}{required ? ' *' : ''}</span>
        <input type={type} value={value || ''} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} placeholder={placeholder} aria-invalid={invalid} className={`${textInputClass} ${invalid ? 'border-red-600 bg-red-50 ring-1 ring-red-300' : ''}`} />
    </label>
);

const TextAreaField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
    rows?: number;
    invalid?: boolean;
}> = ({ label, value, onChange, required = false, disabled = false, rows = 3, invalid = false }) => (
    <label className="block min-w-0">
        <span className={`mb-1 block text-xs font-black uppercase tracking-wide ${invalid ? 'text-red-700' : 'text-gray-600'}`}>{label}{required ? ' *' : ''}</span>
        <textarea value={value || ''} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} rows={rows} aria-invalid={invalid} className={`${textInputClass} ${invalid ? 'border-red-600 bg-red-50 ring-1 ring-red-300' : ''}`} />
    </label>
);

const SelectField: React.FC<{
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
}> = ({ label, value, options, onChange, disabled = false, required = false, invalid = false }) => (
    <label className="block min-w-0">
        <span className={`mb-1 block text-xs font-black uppercase tracking-wide ${invalid ? 'text-red-700' : 'text-gray-600'}`}>{label}{required ? ' *' : ''}</span>
        <select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled} required={required} aria-invalid={invalid} className={`${selectClass} ${invalid ? 'border-red-600 bg-red-50 ring-1 ring-red-300' : ''}`}>
            <option value="">Select…</option>
            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    </label>
);

const DateTimeField: React.FC<{
    label: string;
    date: string;
    time: string;
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
}> = ({ label, date, time, onDateChange, onTimeChange, disabled = false, required = false, invalid = false }) => {
    const [clockOpen, setClockOpen] = useState(false);
    const parsed = timeTo12Hour(time);
    const timeInvalid = !!date && !time;
    const updateTime = (hour: string, minute: string, period: 'AM' | 'PM') => onTimeChange(timeFrom12Hour(hour, minute, period));
    return (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <TextField label={label} type="date" value={date} onChange={value => { onDateChange(value); setClockOpen(!!value); }} required={required} disabled={disabled} invalid={invalid} />
            <p className={`text-sm font-bold ${invalid ? 'text-red-700' : 'text-gray-700'}`} aria-live="polite">
                {date ? formatPermitDateTime(date, time) : 'Choose a date to set the time.'}
            </p>
            {date && <div>
                <button type="button" aria-expanded={clockOpen} aria-invalid={timeInvalid} onClick={() => setClockOpen(open => !open)} disabled={disabled} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50 ${timeInvalid ? 'border-red-600 bg-red-50 text-red-800 ring-1 ring-red-300' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                    <Clock3 size={16} /> {clockOpen ? 'Close time picker' : time ? 'Change time' : 'Choose time (AM / PM)'}
                </button>
                {clockOpen && <div className={`mt-3 rounded-lg border p-3 ${timeInvalid ? 'border-red-400 bg-red-50/50' : 'border-blue-200 bg-blue-50/50'}`}>
                    <p className={`mb-2 text-xs font-black uppercase tracking-wide ${timeInvalid ? 'text-red-700' : 'text-gray-700'}`}>Set clock time</p>
                    <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs font-bold">Hour
                            <select aria-label={`${label} hour`} className={`${selectClass} ${timeInvalid && !parsed.hour ? 'border-red-600 bg-red-50' : ''}`} value={parsed.hour} disabled={disabled} onChange={event => updateTime(event.target.value, parsed.minute || '00', parsed.period)}>
                                <option value="">Hour</option>{Array.from({ length: 12 }, (_, index) => String(index + 1)).map(hour => <option key={hour} value={hour}>{hour}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-bold">Minute
                            <select aria-label={`${label} minute`} className={`${selectClass} ${timeInvalid && !parsed.minute ? 'border-red-600 bg-red-50' : ''}`} value={parsed.minute} disabled={disabled} onChange={event => updateTime(parsed.hour, event.target.value, parsed.period)}>
                                <option value="">Minute</option>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(minute => <option key={minute} value={minute}>{minute}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-bold">AM / PM
                            <select aria-label={`${label} AM or PM`} className={selectClass} value={parsed.period} disabled={disabled} onChange={event => updateTime(parsed.hour, parsed.minute, event.target.value as 'AM' | 'PM')}>
                                <option value="AM">AM</option><option value="PM">PM</option>
                            </select>
                        </label>
                    </div>
                </div>}
            </div>}
        </div>
    );
};

const AclRoleSignature: React.FC<{
    users: AclUser[];
    role: ApprovalRole;
    label: string;
    initialValue?: Signature;
    readOnly?: boolean;
    invalid?: boolean;
    onStartReplace?: () => void;
    onSave: (signature: Signature, user: AclUser, pin: string) => Promise<boolean>;
}> = ({ users, role, label, initialValue, readOnly = false, invalid = false, onStartReplace, onSave }) => {
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [replacing, setReplacing] = useState(false);
    const activeSignature = replacing ? undefined : initialValue;
    const eligible = users.filter(user => aclRoles(user).includes(role.toLowerCase()) && !!user.email && !!aclName(user));
    const selected = eligible.find(user => user.email!.trim().toLowerCase() === email);
    return (
        <div className={`space-y-2 rounded-lg ${invalid ? 'border border-red-500 bg-red-50 p-2' : ''}`}>
            {initialValue && !replacing && !readOnly && <button type="button" className="text-sm font-bold text-blue-700 underline" onClick={() => { setReplacing(true); setEmail(''); setPin(''); onStartReplace?.(); }}>Edit / Re-sign</button>}
            {!activeSignature && !readOnly && <>
                <SelectField label={`${role} — ACL registered name`} value={email} onChange={value => { setEmail(value); setPin(''); }} options={eligible.map(user => ({ value: user.email!.trim().toLowerCase(), label: aclName(user) }))} required />
                <label className="block text-xs font-bold">{role} 4-digit PIN
                    <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`${textInputClass} mt-1`} />
                </label>
                {eligible.length === 0 && <p className="text-sm font-bold text-red-700">No ACL users are registered with the {role} role.</p>}
            </>}
            <SignaturePad
                key={`${role}-${replacing ? 'replace' : activeSignature?.date || email || 'empty'}`}
                label={label}
                initialValue={activeSignature}
                externalName={selected ? aclName(selected) : undefined}
                fixedName
                readOnly={readOnly || !!activeSignature || !selected}
                beforeSave={() => {
                    if (!selected) { alert(`Select an ACL-registered ${role} before signing.`); return false; }
                    if (!validAclPin(selected, pin)) { alert(`Invalid 4-digit PIN for ${aclName(selected)}.`); return false; }
                    return true;
                }}
                onSave={async signature => {
                    if (!selected) return false;
                    const saved = await onSave({
                        ...signature,
                        name: aclName(selected),
                        email: selected.email!.trim().toLowerCase()
                    }, selected, pin);
                    if (saved) setReplacing(false);
                    return saved;
                }}
                onClear={() => setPin('')}
            />
        </div>
    );
};

const FormSection: React.FC<{ title: string; children: React.ReactNode; id?: string }> = ({ title, children, id }) => (
    <section id={id} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="border-b-2 border-blue-100 pb-3 text-lg font-black uppercase tracking-wide text-blue-900">{title}</h2>
        {children}
    </section>
);

const createBlankPermit = (id: string, env: string): Permit => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return {
        id,
        permitNumber: '',
        itwocxNumber: '',
        permitType: 'handheld_saw',
        status: 'draft',
        isDraft: true,
        env,
        createdAt: now.toISOString(),
        issuedDate: '',
        commencementDate: today,
        endDate: finishDateForHandheldSawStart(today),
        location: '',
        revealModelLayer: false,
        subLayers: false,
        ebaConstructionLayer: false,
        asBuiltLayers: false,
        scopeOfWorks: '',
        excavationType: 'hand',
        knownServicesScanned: null,
        servicesMarked: null,
        potholingMarkers: null,
        transpowerDesignation: null,
        watercareWorksOver: null,
        partAChecklist: [...INITIAL_PART_A],
        partAPotholingMethod: '',
        partAFrequency: '',
        partAOverheadProtection: '',
        partACloseApproach: {
            overheadElectricityDist: '',
            overheadRailDist: '',
            overheadOtherDist: '',
            undergroundElectricityDist: '',
            undergroundFibreDist: '',
            undergroundGasDist: '',
            undergroundWaterDist: '',
            permitsObtained: null
        },
        partBChecklist: [...INITIAL_PART_B],
        partBHighRiskOptions: { power11kv: false, gasHighPressure: false, mainFibre: false },
        receiverChecklist: [...INITIAL_RECEIVER_CHECKLIST],
        handoverChecklist: [...INITIAL_HANDOVER_CHECKLIST],
        dailyLogs: [],
        handoverLogs: [],
        crewMembers: [],
        otherNotes: '',
        photos: [],
        handheldSaw: createInitialHandheldSawDetails()
    };
};

const HandheldSawPermitDetail: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
    const location = useLocation();
    const [permit, setPermit] = useState<Permit | null>(null);
    const [loading, setLoading] = useState(true);
    const [aclUsers, setAclUsers] = useState<AclUser[]>([]);
    const [aclLoadError, setAclLoadError] = useState('');
    const [environment] = useState(() => ({ mode: getAppMode(), collection: getTargetCollection() }));
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [activeTab, setActiveTab] = useState<FormTab>('details');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [pdfPermit, setPdfPermit] = useState<Permit | null>(null);
    const pdfRef = useRef<HTMLDivElement>(null);
    const receiverSignatureClearedRef = useRef(false);
    const sessionRole = getUserRole().toLowerCase();
    const currentEmail = String(auth.currentUser?.email || '').trim().toLowerCase();
    const isMaster = currentEmail === 'dietrich.truchsess@easternbusway.nz' || sessionRole.includes('master');
    const isIssuer = isMaster || sessionRole.includes('issuer');
    const isReceiver = isMaster || sessionRole.includes('receiver');
    const isZoneManager = isMaster || sessionRole.includes('zone manager') || sessionRole.includes('regional manager');
    const isProjectDirector = isMaster || sessionRole.includes('project director');
    const isSiteEngineer = sessionRole.includes('site engineer');
    const data = useMemo(() => mergeHandheldSawDetails(permit?.handheldSaw), [permit?.handheldSaw]);
    const hasZoneManagerEndorsement = !!data.zoneManagerEndorsement?.data;
    const hasProjectDirectorSignature = !!data.projectDirectorSignature?.data;
    const hasApprovalPdf = hasUploadedApprovalPdf(data);
    const approvalsComplete = hasSatisfiedHandheldSawApproval(data);
    const isClosed = permit?.status === 'closed';
    const isIssued = permit?.isDraft === false && !isClosed;
    const hasUnconfirmedServices = Object.values(data.services).some(value => value === 'Y' || value === 'U');

    useEffect(() => {
        let cancelled = false;
        const loadPermit = async () => {
            setLoading(true);
            setAclLoadError('');
            receiverSignatureClearedRef.current = false;
            try {
                const cached = getPermitById(id);
                if (!cancelled && cached?.permitType === 'handheld_saw' && cached.env === environment.mode) setPermit(cached);
                const snapshot = await getDoc(doc(db, environment.collection, id));
                if (cancelled) return;
                if (snapshot.exists()) {
                    const loaded = snapshot.data() as Permit;
                    if (loaded.permitType !== 'handheld_saw') {
                        setErrorMessage('This record is not a High-Powered Handheld Saw Permit.');
                        return;
                    }
                    const normalized = { ...loaded, handheldSaw: mergeHandheldSawDetails(loaded.handheldSaw) };
                    setPermit(normalized);
                    savePermit(normalized);
                } else if (location.state?.createHandheldSaw === true) {
                    const created = createBlankPermit(id, environment.mode);
                    await setDoc(doc(db, environment.collection, id), sanitizeForFirestore(created));
                    if (!cancelled) {
                        setPermit(created);
                        savePermit(created);
                    }
                } else {
                    setErrorMessage('Permit not found in the selected environment.');
                }
                const aclSnapshot = await getDoc(doc(db, 'appSettings', 'global'));
                const assignments = aclSnapshot.data()?.roleAssignments;
                if (!Array.isArray(assignments)) throw new Error('ACL directory is unavailable.');
                if (!cancelled) setAclUsers(assignments as AclUser[]);
            } catch (error) {
                if (error instanceof Error && error.message === 'ACL directory is unavailable.') {
                    if (!cancelled) setAclLoadError(error.message);
                } else {
                    console.error('Unable to load handheld saw permit or ACL:', error);
                    if (!cancelled) setErrorMessage('Unable to load the permit or Access Control List. Check your connection and try again.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadPermit();
        return () => { cancelled = true; };
    }, [environment, id, location.state]);

    const buildCloudPayload = (candidate: Permit) => withClearedSignatureDeletes(
        sanitizeForFirestore({
            ...candidate,
            env: environment.mode,
            lastUpdated: new Date().toISOString()
        }),
        candidate,
        deleteField(),
        { deleteReceiver: receiverSignatureClearedRef.current }
    );

    const clearReceiverSignature = () => {
        receiverSignatureClearedRef.current = true;
        setPermit(current => current ? {
            ...current,
            receiverSignature: undefined,
            receiverName: '',
            receiverEmail: '',
            issuerSignature: undefined,
            issuerEmail: '',
            handheldSaw: { ...mergeHandheldSawDetails(current.handheldSaw), issuerDeclaration: false }
        } : current);
        setSuccessMessage('');
        setErrorMessage('');
    };

    const updatePermit = (patch: Partial<Permit>) => {
        setPermit(current => current ? applyHandheldSawPermitPatch(current, patch) : current);
        setSuccessMessage('');
        setErrorMessage('');
    };

    const updateSaw = (patch: Partial<HandheldSawPermitDetails>) => {
        setPermit(current => current ? applyHandheldSawPatch(current, patch) : current);
        setSuccessMessage('');
        setErrorMessage('');
    };

    const saveToCloud = async (candidate: Permit, message = 'Draft saved securely.') => {
        setIsSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const updated = { ...candidate, env: environment.mode };
            await setDoc(doc(db, environment.collection, updated.id), buildCloudPayload(updated), { merge: true });
            receiverSignatureClearedRef.current = false;
            setPermit(updated);
            savePermit(updated);
            setSuccessMessage(message);
            return true;
        } catch (error) {
            console.error('Unable to save handheld saw permit:', error);
            setErrorMessage('Unable to save permit changes. Check your connection and try again.');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const saveAclSignature = async (field: 'zoneManagerEndorsement' | 'projectDirectorSignature' | 'receiverSignature', signature: Signature, user: AclUser, pin: string): Promise<boolean> => {
        try {
            const aclSnapshot = await getDoc(doc(db, 'appSettings', 'global'));
            const assignments = aclSnapshot.data()?.roleAssignments;
            if (!Array.isArray(assignments)) throw new Error('ACL directory is unavailable.');
            const email = String(user.email || '').trim().toLowerCase();
            const matchingUsers = (assignments as AclUser[]).filter(item => String(item.email || '').trim().toLowerCase() === email);
            const role = field === 'zoneManagerEndorsement' ? 'zone manager' : field === 'projectDirectorSignature' ? 'project director' : 'receiver';
            const roleLabel = field === 'zoneManagerEndorsement' ? 'Zone Manager' : field === 'projectDirectorSignature' ? 'Project Director' : 'Receiver';
            const currentUser = matchingUsers[0];
            if (matchingUsers.length !== 1 || !currentUser || !aclRoles(currentUser).includes(role) || !validAclPin(currentUser, pin)) {
                setErrorMessage(`${roleLabel} ACL role or PIN verification failed. Signature was not accepted.`);
                return false;
            }
            const signed = { ...signature, name: aclName(currentUser), email };
            if (field === 'receiverSignature') receiverSignatureClearedRef.current = false;
            const candidate: Permit = field === 'receiverSignature'
                ? {
                    ...permit!,
                    issuerSignature: undefined,
                    issuerEmail: '',
                    receiverSignature: signed,
                    receiverName: signed.name,
                    receiverEmail: email,
                    handheldSaw: { ...data, issuerDeclaration: false }
                }
                : {
                    ...permit!,
                    issuerSignature: undefined,
                    issuerEmail: '',
                    handheldSaw: { ...data, issuerDeclaration: false, [field]: signed } as HandheldSawPermitDetails
                };
            return await saveToCloud(candidate, `${roleLabel} signature verified and saved.`);
        } catch (error) {
            console.error('Unable to verify approval signature against ACL:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Unable to verify approval signature.');
            return false;
        }
    };

    const captureOnSiteLocation = async (): Promise<NonNullable<HandheldSawPermitDetails['onSiteIssue']>> => new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('This device does not support GPS location capture.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                capturedAt: new Date().toISOString()
            }),
            error => reject(new Error(error.code === error.PERMISSION_DENIED
                ? 'Allow location access to record on-site issuance.'
                : 'Unable to capture the on-site location. Move outdoors and retry.')),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });

    const uploadDocument = async (event: React.ChangeEvent<HTMLInputElement>, kind: 'manager' | 'drawings') => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !permit) return;
        if (kind === 'manager' && (file.type && file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf'))) {
            setErrorMessage('Manager approval must be uploaded as a PDF document.');
            return;
        }
        const canUpload = isMaster || isIssuer || (kind === 'manager' && (isSiteEngineer || isZoneManager));
        if (!canUpload) {
            setErrorMessage(kind === 'manager'
                ? 'Only an authorized submitter, Permit Issuer, Zone Manager or Master can upload manager approval.'
                : 'Only an authorized Permit Issuer or Master can upload service drawings.');
            return;
        }
        setIsUploading(true);
        setErrorMessage('');
        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `handheld_saw/${permit.id}/${kind}/${Date.now()}_${safeName}`;
            const result = await uploadBytes(ref(getStorage(), path), file, { contentType: file.type || 'application/octet-stream' });
            const url = await getDownloadURL(result.ref);
            const currentData = mergeHandheldSawDetails(permit.handheldSaw);
            const patch: Partial<HandheldSawPermitDetails> = kind === 'manager'
                ? {
                    managerApprovalUrl: url,
                    managerApprovalFileName: file.name,
                    managerApprovalContentType: file.type || 'application/pdf',
                    managerApprovalUploadedAt: new Date().toISOString(),
                    managerApprovalUploadedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Permit Issuer',
                    managerApprovalVerifiedByIssuer: false,
                    managerApprovalVerifiedBy: '',
                    managerApprovalVerifiedAt: '',
                    managerApprovalVerificationComments: ''
                }
                : { drawingsUrl: url, drawingsFileName: file.name };
            const next: Permit = {
                ...permit,
                issuerSignature: undefined,
                issuerEmail: '',
                handheldSaw: { ...currentData, ...patch, issuerDeclaration: false }
            };
            await setDoc(doc(db, environment.collection, permit.id), buildCloudPayload(next), { merge: true });
            setPermit(next);
            savePermit(next);
            setSuccessMessage(kind === 'manager' ? 'Manager approval PDF uploaded and saved. Manual Zone Manager / Project Director PIN sign-off is not required.' : 'Service drawings uploaded and saved.');
        } catch (error) {
            console.error(`Unable to upload ${kind} documentation:`, error);
            setErrorMessage('Upload failed. The approval or drawings were not saved; check the connection and retry.');
        } finally {
            setIsUploading(false);
        }
    };

    const removeManagerApproval = async () => {
        if (!permit || !data.managerApprovalUrl || isClosed || !(isMaster || isIssuer || isSiteEngineer || isZoneManager)) return;
        if (!confirm('Remove the uploaded manager approval PDF and clear its verification?')) return;
        const approvalUrl = data.managerApprovalUrl;
        setIsUploading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const candidate: Permit = {
                ...permit,
                issuerSignature: undefined,
                issuerEmail: '',
                handheldSaw: { ...clearManagerApproval(data), issuerDeclaration: false }
            };
            await setDoc(doc(db, environment.collection, permit.id), buildCloudPayload(candidate), { merge: true });
            setPermit(candidate);
            savePermit(candidate);
            try {
                await deleteObject(ref(getStorage(), approvalUrl));
                setSuccessMessage('Manager approval PDF removed and its verification cleared.');
            } catch (error) {
                console.error('Approval PDF was unlinked but Storage cleanup failed:', error);
                setErrorMessage('The approval PDF was removed from the permit and its verification cleared, but the stored file could not be deleted. Contact an administrator to remove the orphaned file.');
            }
        } catch (error) {
            console.error('Unable to remove manager approval PDF:', error);
            setErrorMessage('Unable to remove the manager approval PDF. The permit and verification remain unchanged; check the connection and retry.');
        } finally {
            setIsUploading(false);
        }
    };

    const verifyManagerApproval = async (verified: boolean) => {
        if (!permit || !isIssuer || !data.managerApprovalUrl || data.managerApprovalContentType !== 'application/pdf') {
            setErrorMessage('Only the Permit Issuer can verify an uploaded approval PDF.');
            return;
        }
        const candidateData = {
            ...data,
            issuerDeclaration: false,
            managerApprovalVerifiedByIssuer: verified,
            managerApprovalVerifiedBy: verified ? currentEmail : '',
            managerApprovalVerifiedAt: verified ? new Date().toISOString() : ''
        };
        await saveToCloud({ ...permit, issuerSignature: undefined, issuerEmail: '', handheldSaw: candidateData }, verified ? 'Approval PDF verified by the Permit Issuer.' : 'Approval PDF verification cleared.');
    };

    const createPdf = async (candidate: Permit) => {
        setPdfPermit(candidate);
        setIsGeneratingPdf(true);
        try {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (!pdfRef.current) throw new Error('Official permit PDF layout could not be prepared.');
            return await renderPagesToPdf(pdfRef.current);
        } finally {
            setPdfPermit(null);
            setIsGeneratingPdf(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!permit) return;
        setErrorMessage('');
        try {
            const pdf = await createPdf({ ...permit, handheldSaw: data });
            const pdfNumber = stripHandheldSawPermitPrefix(permit.itwocxNumber || permit.permitNumber) || 'DRAFT';
            pdf.save(`HP-${pdfNumber.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`);
        } catch (error) {
            console.error('Unable to generate official handheld saw permit PDF:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Unable to generate the official permit PDF.');
        }
    };

    const handleIssuePermit = async () => {
        if (!permit || isSaving || isUploading || isIssued || isClosed) return;
        if (!isIssuer) {
            setErrorMessage('Only an authorized Permit Issuer or Master can issue this permit.');
            return;
        }
        setIsSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const preflightPermit = { ...permit, handheldSaw: data };
            const preflightErrors = validateHandheldSawIssuance(preflightPermit).filter(error => !error.startsWith('Capture the on-site location'));
            if (preflightErrors.length) {
                setErrorMessage(`Cannot issue this permit:\n${preflightErrors.join('\n')}`);
                setActiveTab(tabForHandheldSawValidationErrors(preflightErrors));
                return;
            }
            const onSiteIssue = await captureOnSiteLocation();
            const candidate: Permit = { ...permit, handheldSaw: { ...data, onSiteIssue } };
            const errors = validateHandheldSawIssuance(candidate);
            if (errors.length) {
                setErrorMessage(`Cannot issue this permit:\n${errors.join('\n')}`);
                setActiveTab(tabForHandheldSawValidationErrors(errors));
                return;
            }
            const permitsQuery = query(collection(db, environment.collection), where('env', '==', environment.mode));
            const existingPermits = await getDocs(permitsQuery);
            const permitDoc = doc(db, environment.collection, candidate.id);
            const numberDigits = String(candidate.itwocxNumber || '').replace(/\D/g, '');
            const issued = {
                ...candidate,
                status: 'active' as const,
                isDraft: false,
                issuedDate: new Date().toISOString(),
                syncStatus: 'pending',
                sync_status: 'pending',
                cxSyncPending: 'issue',
                cxSyncError: null,
                env: environment.mode
            };
            await runTransaction(db, async transaction => {
                const latestSnapshot = await transaction.get(permitDoc);
                if (!latestSnapshot.exists()) throw new Error('Permit record no longer exists.');
                if (latestSnapshot.data().status === 'closed' || latestSnapshot.data().isDraft === false) {
                    throw new Error('Permit has already been issued or closed. Reload before retrying.');
                }
                const duplicate = existingPermits.docs.some(item => item.id !== candidate.id &&
                    String(item.data().itwocxNumber || item.data().permitNumber || '').replace(/\D/g, '') === numberDigits);
                if (duplicate) throw new Error('This permit number is already in use in the current environment.');
                transaction.set(permitDoc, sanitizeForFirestore({
                    ...issued,
                    lastUpdated: new Date().toISOString()
                }), { merge: true });
            });
            setPermit(issued);
            savePermit(issued);
            setSuccessMessage('Permit issued on site. iTwoCX synchronization has been queued.');
        } catch (error) {
            console.error('Unable to issue handheld saw permit:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Unable to issue permit.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClosePermit = async () => {
        if (!permit || !isIssued || isClosed || isSaving || isUploading) return;
        if (!isIssuer) {
            setErrorMessage('Only the authorized Permit Issuer or Master may close this permit.');
            return;
        }
        if (!data.closureType || !data.closureDeclaration || !permit.closureSignature?.data) {
            setErrorMessage('Select Cancellation or Works completed, confirm the close-out declaration, and add the Issuer name and signature.');
            setActiveTab('closeout');
            return;
        }
        if (!confirm('Generate and save the complete official PDF before closing this permit and queuing iTwoCX synchronization?')) return;

        setIsSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const closedAt = new Date().toISOString();
            const candidate: Permit = {
                ...permit,
                status: 'closed',
                closureDate: closedAt,
                closureReceiverName: permit.closureSignature.name,
                handheldSaw: data
            };
            const pdf = await createPdf(candidate);
            const rawNumber = String(candidate.itwocxNumber || candidate.permitNumber || '').replace(/\D/g, '');
            if (!rawNumber) throw new Error('Permit number is missing; the closure PDF cannot be filed.');
            const pdfRef = ref(getStorage(), `pdf_backups/HP${rawNumber}_${Date.now()}.pdf`);
            const base64 = pdf.output('datauristring').split(',')[1];
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    uploadString(pdfRef, base64, 'base64', { contentType: 'application/pdf' }),
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(() => reject(new Error('Closure PDF backup upload timed out. Permit remains open.')), 15000);
                    })
                ]);
            } finally {
                if (timeout) clearTimeout(timeout);
            }
            const pdfBackupUrl = await getDownloadURL(pdfRef);
            const closureDoc = doc(db, environment.collection, candidate.id);
            const closureFields = {
                status: 'closed' as const,
                closureSignature: candidate.closureSignature,
                closureReceiverName: candidate.closureReceiverName,
                closureDate: closedAt,
                closedBy: auth.currentUser?.email || candidate.closureSignature?.name || 'Unknown issuer',
                pdfBackupUrl,
                syncStatus: 'pending',
                sync_status: 'pending',
                cxSyncPending: 'closure',
                cxSyncError: null,
                lastUpdated: new Date().toISOString()
            };
            const closedPermit = await runTransaction(db, async transaction => {
                const latest = await transaction.get(closureDoc);
                if (!latest.exists() || latest.data().status === 'closed' || latest.data().isDraft !== false) {
                    throw new Error('Permit state changed before close-out. The saved PDF is retained; reload before retrying.');
                }
                transaction.set(closureDoc, sanitizeForFirestore(closureFields), { merge: true });
                return { ...candidate, ...closureFields } as Permit;
            });
            setPermit(closedPermit);
            savePermit(closedPermit);
            setSuccessMessage('Permit closed successfully. iTwoCX synchronization has been queued.');
        } catch (error) {
            console.error('Unable to close handheld saw permit:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Unable to close permit. The permit remains open unless the Firestore closure write succeeded.');
        } finally {
            setIsSaving(false);
        }
    };

    const tabs = HANDHELD_SAW_FORM_TABS;

    if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-700" size={40} /></div>;
    if (errorMessage && !permit) return <div className="mx-auto max-w-3xl p-8 text-center"><p className="mb-5 whitespace-pre-wrap font-bold text-red-700">{errorMessage}</p><button onClick={onBack} className="rounded-lg bg-blue-700 px-5 py-3 font-black text-white">Back</button></div>;
    if (!permit) return null;

    const statusLabel = isClosed ? 'CLOSED' : isIssued ? 'ACTIVE — ISSUED ON SITE' : 'DRAFT';
    const saveButtonDisabled = isSaving || isUploading || isClosed;
    const allIssuanceErrors = validateHandheldSawIssuance({ ...permit, handheldSaw: data });
    const issuerPrerequisiteErrors = allIssuanceErrors.filter(error =>
        !error.startsWith('Permit Issuer declaration and signature are required.') &&
        !error.startsWith('Capture the on-site location')
    );
    const issuanceErrors = allIssuanceErrors.filter(error => !error.startsWith('Capture the on-site location'));
    const formattedPermitNumber = formatHandheldSawPermitNumber(permit.itwocxNumber || permit.permitNumber);
    const rawPermitNumber = stripHandheldSawPermitPrefix(permit.itwocxNumber || permit.permitNumber);
    const updateNumber = (value: string) => {
        const formatted = formatHandheldSawPermitNumber(value);
        updatePermit({ itwocxNumber: formatted, permitNumber: formatted });
    };
    const isMissing = (value: unknown) => !String(value ?? '').trim();

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-3 pb-12 pt-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"><ArrowLeft size={16} /> Dashboard</button>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleDownloadPdf} disabled={isGeneratingPdf || isSaving} className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Printer size={16} /> Print Permit</button>
                    <button onClick={() => saveToCloud({ ...permit, handheldSaw: data })} disabled={saveButtonDisabled} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Save size={16} /> {isSaving ? 'Saving…' : 'Save Draft'}</button>
                </div>
            </div>

            <header className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-3xl font-black text-teal-900 sm:text-4xl">{formattedPermitNumber || 'NOT ASSIGNED'}</p>
                        <h1 className="mt-1 text-2xl font-black uppercase text-gray-900 sm:text-3xl">{HANDHELD_SAW_TITLE}</h1>
                        <p className="mt-2 font-bold text-gray-600">Permit Validity is {HANDHELD_SAW_VALIDITY_DAYS} days · On-site issue required</p>
                    </div>
                    <span className={`rounded-full px-4 py-2 text-xs font-black ${isClosed ? 'bg-gray-900 text-white' : isIssued ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>{statusLabel}</span>
                </div>
                <p className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                    Complete Details and choose one approval path: upload a Manager Approval PDF, or complete Zone Manager endorsement / Project Director approval (PIN + ACL required).
                </p>
                <p className="mt-2 text-xs font-semibold text-gray-600">Preselected service, equipment, control and PPE responses are editable starting values. Confirm every response against actual site conditions before signing.</p>
                {(errorMessage || successMessage) && <div role={errorMessage ? 'alert' : 'status'} className={`mt-4 whitespace-pre-wrap rounded-lg p-3 text-sm font-bold ${errorMessage ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{errorMessage || successMessage}</div>}
            </header>

            <nav aria-label="Handheld saw permit sections" className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto rounded-lg border bg-white p-1 shadow-sm">
                {tabs.map(tab => {
                    const locked = tab.id !== 'details' && tab.id !== 'approvals' && !approvalsComplete;
                    return <button key={tab.id} type="button" disabled={locked} onClick={() => setActiveTab(tab.id)} aria-disabled={locked} title={locked ? 'Complete one approval path: upload an approval PDF, or complete Zone Manager / Project Director PIN + ACL sign-off.' : undefined} className={`shrink-0 rounded-md px-3 py-3 text-[10px] font-black uppercase sm:px-4 sm:text-xs ${activeTab === tab.id ? 'bg-teal-800 text-white' : locked ? 'cursor-not-allowed text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}>{tab.label}{locked ? ' 🔒' : ''}</button>;
                })}
            </nav>

            {activeTab === 'details' && (
                <FormSection id="permit-part-a" title="Part A: Permit & Site Details">
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block min-w-0">
                            <span className={`mb-1 block text-xs font-black uppercase tracking-wide ${isMissing(rawPermitNumber) ? 'text-red-700' : 'text-gray-600'}`}>PF# *</span>
                            <div className={`flex overflow-hidden rounded-lg border shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 ${isMissing(rawPermitNumber) ? 'border-red-600 bg-red-50 ring-1 ring-red-300' : 'border-gray-300 bg-white'}`}>
                                <span className="inline-flex select-none items-center border-r border-gray-300 bg-gray-100 px-3 text-sm font-black text-gray-700">PF#</span>
                                <input
                                    type="text"
                                    value={rawPermitNumber}
                                    onChange={event => updateNumber(event.target.value)}
                                    required
                                    disabled={isIssued || isClosed || !isIssuer}
                                    placeholder="097"
                                    aria-label="PF# permit number"
                                    aria-invalid={isMissing(rawPermitNumber)}
                                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none disabled:bg-gray-100"
                                />
                            </div>
                        </label>
                        <TextField label="JSEA Reference No" value={data.jseaReference} onChange={jseaReference => updateSaw({ jseaReference })} required invalid={isMissing(data.jseaReference)} disabled={isIssued || isClosed || !isIssuer} />
                        <TextField label="Work Location" value={permit.location || ''} onChange={location => updatePermit({ location })} required invalid={isMissing(permit.location)} disabled={isIssued || isClosed || !isIssuer} />
                        <DateTimeField label="Start Date & Time" date={permit.commencementDate || ''} time={data.startTime} onDateChange={value => {
                            updatePermit({ commencementDate: value, endDate: finishDateForHandheldSawStart(value) });
                            updateSaw({ finishTime: data.startTime });
                        }} onTimeChange={startTime => {
                            updateSaw({ startTime, finishTime: startTime });
                            updatePermit({ endDate: finishDateForHandheldSawStart(permit.commencementDate || '') });
                        }} required disabled={isIssued || isClosed || !isIssuer} invalid={isMissing(permit.commencementDate) || isMissing(data.startTime)} />
                        <DateTimeField label="Finish / End Date & Time" date={permit.endDate || ''} time={data.finishTime} onDateChange={value => updatePermit({ endDate: value })} onTimeChange={finishTime => updateSaw({ finishTime })} required disabled={isIssued || isClosed || !isIssuer} invalid={isMissing(permit.endDate) || isMissing(data.finishTime)} />
                    </div>
                    <TextAreaField label="Permit and site details comments" value={data.permitDetailsComments || ''} onChange={permitDetailsComments => updateSaw({ permitDetailsComments })} disabled={isClosed || !isIssuer} />
                    <p className={`text-xs font-bold ${hasHandheldSawSchedule(permit.commencementDate || '', data.startTime, permit.endDate || '', data.finishTime) ? 'text-green-700' : 'text-red-700'}`}>{hasHandheldSawSchedule(permit.commencementDate || '', data.startTime, permit.endDate || '', data.finishTime) ? 'Start and finish date/time are within the 7-day validity period.' : 'Finish defaults to the last day of the 7-calendar-day window and must remain after the start time.'}</p>
                </FormSection>
            )}

            {activeTab === 'approvals' && (
                <div className="space-y-5">
                    <FormSection title="Manager Approval PDF">
                        <p role="note" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
                            {HANDHELD_SAW_APPROVAL_LEGAL_WARNING}
                        </p>
                        <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-950">
                            Upload a signed regional / zone / project manager approval PDF. When a valid approval PDF is uploaded, manual Zone Manager and Project Director approval fields and PIN/ACL sign-off are not required.
                        </p>
                        {hasApprovalPdf ? (
                            <div className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-4">
                                <p className="font-black text-green-900">Approval PDF attached: {data.managerApprovalFileName}</p>
                                <p className="text-xs font-bold text-green-800">Approval path satisfied — manual Zone Manager endorsement, safety case, and Project Director PIN/ACL sign-off are not required.</p>
                                <a href={data.managerApprovalUrl} target="_blank" rel="noreferrer" className="inline-block break-all text-sm font-bold text-blue-700 underline">Open approval PDF</a>
                                {!isClosed && (isIssuer || isSiteEngineer || isZoneManager) && <div>
                                    <button type="button" onClick={() => void removeManagerApproval()} disabled={isUploading} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-black text-red-700 disabled:opacity-50">
                                        {isUploading ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} Remove approval PDF
                                    </button>
                                </div>}
                            </div>
                        ) : <p className={`text-sm font-bold ${approvalsComplete ? 'text-gray-600' : 'text-red-700'}`}>No Manager Approval PDF uploaded{approvalsComplete ? ' (optional because manual Zone Manager or Project Director sign-off is complete).' : ' — upload an approval PDF above, or complete manual Zone Manager / Project Director approval below.'}</p>}
                        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-sm font-black text-white ${isUploading || isClosed || !(isIssuer || isSiteEngineer || isZoneManager) ? 'bg-gray-400' : 'bg-teal-700 hover:bg-teal-800'}`}>
                            {isUploading ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />}
                            {hasApprovalPdf ? 'Replace Manager Approval PDF' : 'Upload Manager Approval PDF'}
                            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={isUploading || isClosed || !(isIssuer || isSiteEngineer || isZoneManager)} onChange={event => uploadDocument(event, 'manager')} />
                        </label>
                        {hasApprovalPdf && <>
                            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 font-bold">
                                <input type="checkbox" className="mt-1 h-5 w-5" checked={!!data.managerApprovalVerifiedByIssuer} disabled={isClosed || !isIssuer} onChange={event => void verifyManagerApproval(event.target.checked)} />
                                Permit Issuer verified the uploaded approval PDF (optional record)
                            </label>
                            {data.managerApprovalVerifiedByIssuer && <p className="text-xs font-bold text-green-800">Verified by {data.managerApprovalVerifiedBy || 'Permit Issuer'} at {data.managerApprovalVerifiedAt ? new Date(data.managerApprovalVerifiedAt).toLocaleString() : '—'}.</p>}
                            <TextAreaField label="Approval PDF verification comments (optional)" value={data.managerApprovalVerificationComments || ''} onChange={managerApprovalVerificationComments => updateSaw({ managerApprovalVerificationComments })} disabled={isClosed || !isIssuer} />
                        </>}
                    </FormSection>

                    {!hasApprovalPdf && <>
                        <FormSection title="Part B: Zone Manager Endorsement & Safety Case">
                            <SelectField label="Have all practical and reasonable alternatives to using a high-powered handheld saw been identified and explored?" value={data.alternativesReviewed || ''} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} disabled={isClosed || (!isIssuer && !isZoneManager)} required invalid={!data.alternativesReviewed} onChange={value => updateSaw({ alternativesReviewed: (value || null) as 'yes' | 'no' | null })} />
                            <TextAreaField label="Alternatives considered and why unsuitable (or identify attached documentation)" value={data.alternativesExplanation} onChange={alternativesExplanation => updateSaw({ alternativesExplanation })} required invalid={isMissing(data.alternativesExplanation)} disabled={isClosed || (!isIssuer && !isZoneManager)} />
                            <div className="grid gap-4 md:grid-cols-2">
                                {([
                                    ['scope', '1. What is the scope of work?'],
                                    ['itemBeingCut', '2. What is being cut? Materials, size and conditions'],
                                    ['supportToPreventJamming', '3. How is the item supported to prevent blade jamming?'],
                                    ['directSupervision', '4. Is direct supervision oversight planned?'],
                                    ['duration', '5. What is the duration of the work?']
                                ] as const).map(([field, label]) => (
                                    <TextAreaField key={field} label={label} value={data.safetyCase[field]} onChange={value => updateSaw({ safetyCase: { ...data.safetyCase, [field]: value } })} required invalid={isMissing(data.safetyCase[field])} disabled={isClosed || (!isIssuer && !isZoneManager)} />
                                ))}
                            </div>
                        </FormSection>

                        <FormSection title="Part B — Zone Manager Sign-off (PIN + ACL Required)">
                            {aclLoadError && <p className="rounded bg-red-50 p-3 text-sm font-bold text-red-800">{aclLoadError}; Zone Manager signatures are unavailable until the ACL can be verified.</p>}
                            <AclRoleSignature users={aclUsers} role="Zone Manager" label="Endorsed By — Zone Manager signature" initialValue={data.zoneManagerEndorsement} invalid={!approvalsComplete} readOnly={isClosed || !!aclLoadError} onSave={(signature, user, pin) => saveAclSignature('zoneManagerEndorsement', signature, user, pin)} />
                            <SignatureTimestamp signature={data.zoneManagerEndorsement} />
                            <TextAreaField label="Zone Manager endorsement comments (optional)" value={data.zoneManagerComments || ''} onChange={zoneManagerComments => updateSaw({ zoneManagerComments })} disabled={isClosed || !isZoneManager} />
                            <p className="text-sm font-bold text-amber-900">This endorsement is one available approval path; an uploaded approval PDF or Project Director approval can be used instead.</p>
                        </FormSection>

                        <FormSection title="Part C: Project Director Approval — Alternative Approval Path">
                            <label className={`flex items-start gap-3 rounded-lg border p-3 font-bold ${hasProjectDirectorSignature && !data.projectDirectorDeclaration && !hasZoneManagerEndorsement ? 'border-red-500 bg-red-50 text-red-800' : ''}`}>
                                <input type="checkbox" className="mt-1 h-5 w-5" checked={data.projectDirectorDeclaration} aria-invalid={hasProjectDirectorSignature && !data.projectDirectorDeclaration && !hasZoneManagerEndorsement} disabled={isClosed || !hasProjectDirectorSignature} onChange={event => updateSaw({ projectDirectorDeclaration: event.target.checked })} />
                                I hereby approve of this permit, which is to be carried out strictly in accordance with the established safety case.
                            </label>
                            <AclRoleSignature users={aclUsers} role="Project Director" label="Project Director name and signature (PIN + ACL required)" initialValue={data.projectDirectorSignature} invalid={!approvalsComplete} readOnly={isClosed || !!aclLoadError} onSave={(signature, user, pin) => saveAclSignature('projectDirectorSignature', signature, user, pin)} />
                            <SignatureTimestamp signature={data.projectDirectorSignature} />
                            <TextAreaField label="Project Director — Further comments (optional)" value={data.projectDirectorComments} onChange={projectDirectorComments => updateSaw({ projectDirectorComments })} disabled={isClosed || !isProjectDirector} />
                            <p className="text-xs font-bold text-amber-800">A Zone Manager signature is not required when the Project Director completes this approval path.</p>
                        </FormSection>
                    </>}
                </div>
            )}

            {activeTab === 'receiver' && approvalsComplete && (
                <div className="space-y-5">
                    <FormSection title="Part E: Equipment Details">
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextField label="Equipment Make" value={data.equipmentMake} onChange={equipmentMake => updateSaw({ equipmentMake })} required invalid={isMissing(data.equipmentMake)} disabled={isIssued || isClosed || (!isIssuer && !isReceiver)} />
                            <TextField label="Equipment Model" value={data.equipmentModel} onChange={equipmentModel => updateSaw({ equipmentModel })} required invalid={isMissing(data.equipmentModel)} disabled={isIssued || isClosed || (!isIssuer && !isReceiver)} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextAreaField label="Equipment Make comments" value={data.equipmentComments?.make || ''} onChange={value => updateSaw({ equipmentComments: { ...data.equipmentComments, make: value } })} disabled={isIssued || isClosed || (!isIssuer && !isReceiver)} />
                            <TextAreaField label="Equipment Model comments" value={data.equipmentComments?.model || ''} onChange={value => updateSaw({ equipmentComments: { ...data.equipmentComments, model: value } })} disabled={isIssued || isClosed || (!isIssuer && !isReceiver)} />
                        </div>
                        <fieldset disabled={isIssued || isClosed || (!isIssuer && !isReceiver)} className="space-y-3">
                            <legend className="text-sm font-black uppercase text-gray-700">Minimum equipment requirements</legend>
                            <SelectField label="Blade guards — minimum requirement" value={data.bladeGuards || ''} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={value => updateSaw({ bladeGuards: (value || null) as 'yes' | 'no' | null })} required invalid={!data.bladeGuards} />
                            <TextAreaField label="Blade guards comments" value={data.equipmentComments?.bladeGuards || ''} onChange={value => updateSaw({ equipmentComments: { ...data.equipmentComments, bladeGuards: value } })} />
                            <SelectField label="Anti-kickback systems / Active blade pressure sensors — effective 15 July 2026" value={data.antiKickbackSystems || ''} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={value => updateSaw({ antiKickbackSystems: (value || null) as 'yes' | 'no' | null })} required invalid={!data.antiKickbackSystems} />
                            <TextAreaField label="Anti-kickback / pressure sensor comments" value={data.equipmentComments?.antiKickbackSystems || ''} onChange={value => updateSaw({ equipmentComments: { ...data.equipmentComments, antiKickbackSystems: value } })} />
                        </fieldset>
                    </FormSection>
                    <FormSection title="Part F: Work Controls (Completed by Permit Receiver)">
                        <p className="text-sm font-bold">Select YES, NO or N/A for each control. Comments are optional and at your discretion.</p>
                        <div className="space-y-4">
                            {HANDHELD_SAW_WORK_CONTROLS.map((question, index) => {
                                const control = data.workControls[index];
                                const controlInvalid = !control.answer;
                                return <div key={question} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto] ${controlInvalid ? 'border-red-400 bg-red-50/50' : 'border-gray-200'}`}>
                                    <p className="text-sm font-semibold"><b>{index + 1}.</b> {question}</p>
                                    <div><SelectField label="Response" value={control.answer || ''} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'n/a', label: 'N/A' }]} onChange={value => updateSaw({ workControls: data.workControls.map((item, i) => i === index ? { ...item, answer: (value || null) as SawPermitWorkControlStatus | null } : item) })} disabled={isClosed || !isReceiver} required invalid={!control.answer} /></div>
                                    <div className="md:col-span-2"><TextAreaField label="Comment (optional)" value={control.comment} onChange={comment => updateSaw({ workControls: data.workControls.map((item, i) => i === index ? { ...item, comment } : item) })} disabled={isClosed || !isReceiver} rows={2} /></div>
                                </div>;
                            })}
                        </div>
                        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                            <h3 className="font-black uppercase text-gray-800">Mandatory PPE</h3>
                            {([
                                ['doubleEyeProtection', 'Double-eye Protection'],
                                ['gloves', 'Gloves'],
                                ['p2DustMask', 'P2 Dust Mask / PARP'],
                                ['hearingProtection', 'Earmuffs / Earplugs']
                            ] as const).map(([field, label]) => <div key={field} className="space-y-2">
                                <SelectField label={label} value={data.ppe[field] === null ? '' : data.ppe[field] ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} disabled={isClosed || !isReceiver} required invalid={!data.ppe[field]} onChange={value => updateSaw({ ppe: { ...data.ppe, [field]: value === '' ? null : value === 'yes' } })} />
                                <TextField label={`${label} comments (optional)`} value={data.ppe.comments?.[field] || ''} onChange={value => updateSaw({ ppe: { ...data.ppe, comments: { ...data.ppe.comments, [field]: value } } })} disabled={isClosed || !isReceiver} />
                            </div>)}
                            <TextAreaField label="Task-specific PPE" value={data.ppe.taskSpecific} onChange={taskSpecific => updateSaw({ ppe: { ...data.ppe, taskSpecific } })} required invalid={isMissing(data.ppe.taskSpecific)} disabled={isClosed || !isReceiver} />
                        </div>
                        {aclLoadError && <p className="rounded bg-red-50 p-3 text-sm font-bold text-red-800">{aclLoadError}; Receiver signatures are unavailable until the ACL can be verified.</p>}
                        <label className={`flex items-start gap-3 rounded-lg border p-3 font-bold ${!data.receiverDeclaration ? 'border-red-500 bg-red-50 text-red-800' : ''}`}>
                            <input type="checkbox" className="mt-1 h-5 w-5" checked={data.receiverDeclaration} aria-invalid={!data.receiverDeclaration} disabled={isClosed || !isReceiver} onChange={event => updateSaw({ receiverDeclaration: event.target.checked })} />
                            I accept this permit and will ensure the work is carried out in accordance with the safety case and controls. Accept these terms before signing.
                        </label>
                        <AclRoleSignature users={aclUsers} role="Receiver" label="Permit Receiver — confirm work controls (4-digit PIN + ACL required)" initialValue={permit.receiverSignature} invalid={!permit.receiverSignature?.data} readOnly={isClosed || !isReceiver || !!aclLoadError || !data.receiverDeclaration} onStartReplace={clearReceiverSignature} onSave={(signature, user, pin) => saveAclSignature('receiverSignature', signature, user, pin)} />
                        <SignatureTimestamp signature={permit.receiverSignature} />
                        <TextAreaField label="Permit Receiver — Further comments" value={data.receiverComments} onChange={receiverComments => updateSaw({ receiverComments })} disabled={isClosed || !isReceiver} />
                    </FormSection>
                    <FormSection title="Part F: Permit Acceptors">
                        <p className="text-sm font-semibold">Permit acceptors sign before the Permit Issuer authorizes and issues the permit.</p>
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="font-black uppercase">Permit Acceptors</h3>
                            {!isIssued && !isClosed && <button type="button" onClick={() => updateSaw({ acceptors: [...data.acceptors, { name: '', comments: '', declaration: false }] })} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white">Add Acceptor</button>}
                        </div>
                        {data.acceptors.length === 0 && <p className="rounded border border-red-500 bg-red-50 p-3 text-sm font-bold text-red-800">At least one acceptor with a completed signature and declaration is required.</p>}
                        {data.acceptors.map((acceptor, index) => <div key={index} className="space-y-3 rounded-lg border p-4">
                            <div className="flex items-center justify-between"><h4 className="font-black">Acceptor {index + 1}</h4>{!isIssued && !isClosed && <button type="button" onClick={() => updateSaw({ acceptors: data.acceptors.filter((_, i) => i !== index) })} className="text-xs font-bold text-red-700">Remove</button>}</div>
                            <TextField label="Name" value={acceptor.name} onChange={name => updateSaw({ acceptors: data.acceptors.map((item, i) => i === index ? { ...item, name } : item) })} required invalid={isMissing(acceptor.name)} disabled={isIssued || isClosed} />
                            <div className={!acceptor.signature?.data ? 'rounded-lg border border-red-500 bg-red-50 p-2' : ''}>
                                <SignaturePad label={`Acceptor ${index + 1} — signature and date/time`} initialValue={acceptor.signature} readOnly={isClosed || isIssued} onSave={signature => updateSaw({ acceptors: data.acceptors.map((item, i) => i === index ? { ...item, name: item.name || signature.name, signature } : item) })} />
                            </div>
                            <SignatureTimestamp signature={acceptor.signature} />
                            <label className={`flex items-start gap-3 rounded-lg border p-3 font-semibold ${!acceptor.declaration ? 'border-red-500 bg-red-50 text-red-800' : ''}`}><input type="checkbox" className="mt-1" checked={acceptor.declaration} aria-invalid={!acceptor.declaration} disabled={isClosed || isIssued || !acceptor.signature?.data} onChange={event => updateSaw({ acceptors: data.acceptors.map((item, i) => i === index ? { ...item, declaration: event.target.checked } : item) })} />I accept this permit and will follow the approved safety case and controls.</label>
                            <TextAreaField label="Further comments / acceptance declaration" value={acceptor.comments} onChange={comments => updateSaw({ acceptors: data.acceptors.map((item, i) => i === index ? { ...item, comments } : item) })} disabled={isClosed || isIssued} />
                        </div>)}
                    </FormSection>
                </div>
            )}

            {activeTab === 'issuer' && approvalsComplete && (
                <div className="space-y-5">
                    <FormSection title="Part D: Identification of Services & Structural Elements (Completed by Permit Issuer)">
                        <p className="text-sm font-semibold">Choose Yes (Y), No (N) or Unconfirmed (U) for every service.</p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] border-collapse text-sm">
                                <thead><tr className="bg-gray-100 text-left"><th className="border p-3">Service / structural element</th><th className="border p-3">Response</th><th className="border p-3">Comments</th></tr></thead>
                                <tbody>{HANDHELD_SAW_SERVICES.map(service => <tr key={service.key}>
                                    <td className="border p-3 font-bold">{service.label}</td>
                                    <td className="border p-2"><select aria-label={`${service.label} response`} aria-invalid={!data.services[service.key]} className={`${selectClass} ${!data.services[service.key] ? 'border-red-600 bg-red-50 ring-1 ring-red-300' : ''}`} value={data.services[service.key] || ''} disabled={isIssued || isClosed || !isIssuer} onChange={event => updateSaw({ services: { ...data.services, [service.key]: (event.target.value || null) as SawPermitServiceStatus | null } })}>
                                        <option value="">Select…</option><option value="Y">Yes (Y)</option><option value="N">No (N)</option><option value="U">Unconfirmed (U)</option>
                                    </select></td>
                                    <td className="border p-2"><input aria-label={`${service.label} comments`} className={textInputClass} value={data.serviceComments?.[service.key] || ''} disabled={isIssued || isClosed || !isIssuer} onChange={event => updateSaw({ serviceComments: { ...data.serviceComments, [service.key]: event.target.value } })} /></td>
                                </tr>)}</tbody>
                            </table>
                        </div>
                        {data.services.other && data.services.other !== 'N' && <TextField label="Other service details" value={data.otherServiceDetails} onChange={otherServiceDetails => updateSaw({ otherServiceDetails })} required invalid={isMissing(data.otherServiceDetails)} disabled={isIssued || isClosed || !isIssuer} />}
                        {hasUnconfirmedServices && (
                            <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
                                <p className="font-black text-amber-950">Mandatory before works commence: if any item is Yes (Y) or Unconfirmed (U), review and attach or link relevant drawings (DBYD, As-Built Drawings, Engineers Building Plans / Breaking Ground Permit). No (N) means the service was identified as not present.</p>
                                <label className={`flex items-center gap-2 rounded p-2 font-bold ${!data.drawingsReviewed ? 'border border-red-500 bg-red-50 text-red-800' : ''}`}><input type="checkbox" checked={data.drawingsReviewed} aria-invalid={!data.drawingsReviewed} disabled={isIssued || isClosed || !isIssuer} onChange={event => updateSaw({ drawingsReviewed: event.target.checked })} /> Relevant drawings reviewed</label>
                                <TextField label="Drawing link / reference" value={data.drawingsReference} onChange={drawingsReference => updateSaw({ drawingsReference })} placeholder="Document reference or URL" invalid={!(data.drawingsUrl || data.drawingsReference.trim())} disabled={isIssued || isClosed || !isIssuer} />
                                {data.drawingsUrl && <a href={data.drawingsUrl} target="_blank" rel="noreferrer" className="block break-all font-bold text-blue-700 underline">{data.drawingsFileName || 'Open service drawings'}</a>}
                                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-800 px-4 py-3 text-sm font-black text-white ${isIssued || isClosed || !isIssuer ? 'opacity-50' : ''}`}>
                                    <CloudUpload size={16} /> Attach service drawings
                                    <input type="file" accept="image/*,.heic,.heif,application/pdf" className="sr-only" disabled={isIssued || isClosed || !isIssuer || isUploading} onChange={event => uploadDocument(event, 'drawings')} />
                                </label>
                            </div>
                        )}
                    </FormSection>

                    <FormSection title="Part G: Permit Issuer Authorisation — Issuer Signs Last">
                        <div className="space-y-3 rounded-lg border p-4">
                            <h3 className="font-black uppercase">Permit Issuer</h3>
                            <p className="text-sm font-semibold">The Permit Issuer signs only after the approvals, service review, equipment details, Receiver controls/signature and all acceptor signatures are complete.</p>
                            {data.onSiteIssue && <p className="inline-flex items-center gap-1 rounded bg-green-50 px-3 py-2 text-xs font-bold text-green-800"><MapPin size={14} /> GPS captured {new Date(data.onSiteIssue.capturedAt).toLocaleString()}</p>}
                            {issuerPrerequisiteErrors.length > 0 && <ul className="list-disc space-y-1 rounded-lg border border-red-500 bg-red-50 p-3 pl-8 text-xs font-semibold text-red-800">{issuerPrerequisiteErrors.map(error => <li key={error}>{error}</li>)}</ul>}
                            <label className={`flex items-start gap-3 rounded-lg p-2 font-semibold ${!data.issuerDeclaration ? 'border border-red-500 bg-red-50 text-red-800' : ''}`}><input type="checkbox" className="mt-1" checked={data.issuerDeclaration} disabled={isClosed || isIssued || !isIssuer || issuerPrerequisiteErrors.length > 0 || !!permit.issuerSignature?.data} onChange={event => updateSaw({ issuerDeclaration: event.target.checked })} />I have checked the permit details, endorsements and work controls and authorize the work. Complete this declaration before signing.</label>
                            <TextAreaField label="Permit Issuer — Further comments" value={data.issuerComments} onChange={issuerComments => updateSaw({ issuerComments })} disabled={isClosed || !isIssuer || !!permit.issuerSignature?.data} />
                            <div className={!permit.issuerSignature?.data ? 'rounded-lg border border-red-500 bg-red-50 p-2' : ''}>
                                <SignaturePad label="Name and signature — Permit Issuer (sign last)" initialValue={permit.issuerSignature} readOnly={isClosed || isIssued || !isIssuer || issuerPrerequisiteErrors.length > 0 || !data.issuerDeclaration} onSave={signature => updatePermit({ issuerSignature: signature, issuerEmail: signature.email || auth.currentUser?.email || '' })} />
                            </div>
                            <SignatureTimestamp signature={permit.issuerSignature} />
                            {!isClosed && !isIssued && <div className="space-y-3 border-t pt-4">
                                <div className="flex items-start gap-3"><MapPin className="mt-1 shrink-0 text-teal-800" /><div><h3 className="font-black uppercase text-teal-950">On-site issue required</h3><p className="text-sm text-teal-900">Issuance captures the device GPS coordinates and timestamp.</p></div></div>
                                {issuanceErrors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs font-semibold text-red-700">{issuanceErrors.map(error => <li key={error}>{error}</li>)}</ul>}
                                {issuanceErrors.length === 0 && <p className="text-xs font-bold text-green-700">All required fields are complete. GPS will be captured when the permit is issued.</p>}
                                <button type="button" onClick={handleIssuePermit} disabled={isSaving || isUploading || !isIssuer || !approvalsComplete} className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-teal-800 px-5 py-4 text-base font-black uppercase text-white shadow-lg disabled:bg-gray-400">
                                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                                    {isSaving ? 'Validating & issuing…' : 'Permit Issued'}
                                </button>
                                {!isIssuer && <p className="text-xs font-bold text-amber-900">Only an authorized Permit Issuer or Master can issue.</p>}
                            </div>}
                        </div>
                    </FormSection>
                </div>
            )}

            {activeTab === 'closeout' && approvalsComplete && (
                <FormSection title="Part H: Permit Close Out (Completed by Permit Issuer)">
                    <p className="text-sm font-semibold">Complete Part H only when the work is cancelled or completed. The official PDF backup is uploaded before Firestore closure triggers iTwoCX synchronization.</p>
                    <fieldset disabled={!isIssued || isClosed || !isIssuer} className="space-y-3">
                        <legend className="text-xs font-black uppercase text-gray-600">Close-out selection *</legend>
                        <SelectField label="Close-out selection" value={data.closureType || ''} options={[
                            { value: 'cancellation', label: 'Cancellation — work stopped and the work area left safe.' },
                            { value: 'works-completed', label: 'Works completed — permitted work is complete and the area has been left safe.' }
                        ]} onChange={value => updateSaw({ closureType: (value || null) as 'cancellation' | 'works-completed' | null })} disabled={!isIssued || isClosed || !isIssuer} required invalid={!data.closureType} />
                        <TextAreaField label="Close-out selection comments" value={data.closureComments} onChange={closureComments => updateSaw({ closureComments })} disabled={!isIssued || isClosed || !isIssuer} />
                        <label className={`flex items-start gap-3 rounded-lg border p-3 font-bold ${!data.closureDeclaration ? 'border-red-500 bg-red-50 text-red-800' : ''}`}><input type="checkbox" className="mt-1 h-5 w-5" checked={data.closureDeclaration} aria-invalid={!data.closureDeclaration} onChange={event => updateSaw({ closureDeclaration: event.target.checked })} />I confirm the selected close-out declaration and that work has stopped or is complete as selected.</label>
                    </fieldset>
                    <div className={!permit.closureSignature?.data ? 'rounded-lg border border-red-500 bg-red-50 p-2' : ''}>
                        <SignaturePad label="Permit Issuer — close-out name and signature" initialValue={permit.closureSignature} readOnly={!isIssued || isClosed || !isIssuer} onSave={signature => updatePermit({ closureSignature: signature, closureReceiverName: signature.name, closureDate: signature.date })} />
                    </div>
                    <SignatureTimestamp signature={permit.closureSignature} />
                    {isIssued && !isClosed && <button onClick={handleClosePermit} disabled={isSaving || isUploading || !isIssuer} className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-red-700 px-5 py-4 text-base font-black uppercase text-white shadow-lg disabled:bg-gray-400">
                        {isSaving ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                        {isSaving ? 'Generating PDF & securing closure…' : 'Close Permit & Finalize'}
                    </button>}
                    {isClosed && <p className="rounded-lg bg-gray-100 p-4 font-black text-gray-800">Permit closed at {permit.closureDate ? new Date(permit.closureDate).toLocaleString() : '—'}. iTwoCX sync status: {String((permit as any).syncStatus || (permit as any).sync_status || 'queued')}.</p>}
                </FormSection>
            )}

            {pdfPermit && <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0 z-[-1]">
                <div ref={pdfRef}><HandheldSawPermitPDFLayout permit={pdfPermit} /></div>
            </div>}
        </div>
    );
};

export default HandheldSawPermitDetail;
