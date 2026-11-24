import type { HandheldSawPermitDetails, Permit, SawPermitWorkControl } from '../types';

export const HANDHELD_SAW_TITLE = 'High-Powered Handheld Saw Permit';
export const HANDHELD_SAW_VALIDITY_DAYS = 7;
export const HANDHELD_SAW_APPROVAL_LEGAL_WARNING =
    '⚠️ False or misleading approval records are an offence under NZ law (Health and Safety at Work Act 2015) and carry legal and disciplinary consequences.';

export const hasUploadedApprovalPdf = (details?: Partial<HandheldSawPermitDetails> | null): boolean =>
    Boolean(details?.managerApprovalUrl && details?.managerApprovalContentType === 'application/pdf');

export const hasSatisfiedHandheldSawApproval = (details?: Partial<HandheldSawPermitDetails> | null): boolean => {
    if (!details) return false;
    if (hasUploadedApprovalPdf(details)) return true;
    const zoneManagerApproval = !!details.zoneManagerEndorsement?.data;
    const projectDirectorApproval = !!details.projectDirectorSignature?.data && !!details.projectDirectorDeclaration;
    return zoneManagerApproval || projectDirectorApproval;
};

export type HandheldSawFormTab = 'details' | 'approvals' | 'receiver' | 'issuer' | 'closeout';

export const HANDHELD_SAW_FORM_TABS: ReadonlyArray<{ id: HandheldSawFormTab; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'receiver', label: "Receiver's Checklist" },
    { id: 'issuer', label: 'Permit Issuer' },
    { id: 'closeout', label: 'Closure' }
];

export const tabForHandheldSawValidationErrors = (errors: string[]): HandheldSawFormTab => {
    if (errors.some(error => /Permit number|Work location|JSEA|Start date|Finish date|Start time|Finish time|validity period/i.test(error))) return 'details';
    if (errors.some(error => /approval|Zone Manager|Project Director|Safety case|alternatives/i.test(error))) return 'approvals';
    if (errors.some(error => /Equipment|Blade guard|Anti-kickback|work controls|PPE|Double-eye protection|Permit Receiver declaration|Acceptor/i.test(error))) return 'receiver';
    return 'issuer';
};

export const stripHandheldSawPermitPrefix = (input: unknown): string => {
    const raw = String(input ?? '').trim();
    if (!raw) return '';
    return raw.replace(/^(?:PF#?|#)\s*/i, '').trim();
};

export const formatHandheldSawPermitNumber = (input: unknown): string => {
    const stripped = stripHandheldSawPermitPrefix(input);
    return stripped ? `PF#${stripped}` : '';
};

export const finishDateForHandheldSawStart = (startDate: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return '';
    const [year, month, day] = startDate.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return '';
    start.setUTCDate(start.getUTCDate() + HANDHELD_SAW_VALIDITY_DAYS - 1);
    return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
};

export const HANDHELD_SAW_SERVICES = [
    { key: 'postTensioningCables', label: 'Post Tensioning Cables' },
    { key: 'preStressedComponents', label: 'Pre-stressed Components' },
    { key: 'electrical', label: 'Electrical' },
    { key: 'gas', label: 'Gas' },
    { key: 'water', label: 'Water' },
    { key: 'drainage', label: 'Drainage' },
    { key: 'fireServices', label: 'Fire Services' },
    { key: 'airConditioning', label: 'Air Conditioning' },
    { key: 'telecommunications', label: 'Telecommunications' },
    { key: 'sewer', label: 'Sewer' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'other', label: 'Other' }
] as const;

export const HANDHELD_SAW_WORK_CONTROLS = [
    'Services drawings (including current as-built drawings) obtained and reviewed.',
    'All services within 2m of the proposed work location clearly marked with indelible markings.',
    'Blades compatible with the saw (type, size, material, fittings and speed rating), selected for the material being cut, and blade integrity verified during prestart inspection.',
    'Inground pipes properly supported during cutting to prevent movement, pinching or jamming, and precast pits or concrete elements cut on the surface wherever possible.',
    'Fire-retardant mats, spark shields or barriers in place for hot works, sparks or fire risk.',
    'Work area properly ventilated (exhaust fans, ducting or other).',
    'Environmental protection measures in place to control, contain and clean up slurry.',
    'Appropriate controls in place to manage crystalline silica.',
    'All nominated operators hold relevant training and experience.'
] as const;

export const createInitialHandheldSawDetails = (): HandheldSawPermitDetails => ({
    alternativesReviewed: 'yes',
    alternativesExplanation: '',
    alternativesComments: '',
    safetyCase: {
        scope: '',
        itemBeingCut: '',
        supportToPreventJamming: '',
        directSupervision: '',
        duration: ''
    },
    projectDirectorDeclaration: false,
    projectDirectorComments: '',
    safetyCaseComments: {},
    issuerComments: '',
    receiverComments: '',
    jseaReference: '',
    permitDetailsComments: '',
    startTime: '',
    finishTime: '',
    services: Object.fromEntries(HANDHELD_SAW_SERVICES.map(service => [service.key, 'N'])),
    serviceComments: {},
    otherServiceDetails: '',
    drawingsReviewed: false,
    drawingsReference: '',
    drawingsUrl: '',
    drawingsFileName: '',
    equipmentMake: '',
    equipmentModel: '',
    equipmentComments: {},
    bladeGuards: 'yes',
    antiKickbackSystems: 'yes',
    workControls: HANDHELD_SAW_WORK_CONTROLS.map(() => ({ answer: 'yes', comment: '' })),
    ppe: {
        doubleEyeProtection: true,
        gloves: true,
        p2DustMask: true,
        hearingProtection: true,
        taskSpecific: '',
        comments: {}
    },
    issuerDeclaration: false,
    receiverDeclaration: false,
    acceptors: [],
    closureType: null,
    closureDeclaration: false,
    closureComments: '',
    managerApprovalUrl: '',
    managerApprovalFileName: '',
    managerApprovalContentType: '',
    managerApprovalUploadedAt: '',
    managerApprovalUploadedBy: '',
    managerApprovalVerifiedByIssuer: false,
    managerApprovalVerifiedBy: '',
    managerApprovalVerifiedAt: '',
    managerApprovalVerificationComments: ''
});

export const clearManagerApproval = (details: HandheldSawPermitDetails): HandheldSawPermitDetails => ({
    ...details,
    managerApprovalUrl: '',
    managerApprovalFileName: '',
    managerApprovalContentType: '',
    managerApprovalUploadedAt: '',
    managerApprovalUploadedBy: '',
    managerApprovalVerifiedByIssuer: false,
    managerApprovalVerifiedBy: '',
    managerApprovalVerifiedAt: '',
    managerApprovalVerificationComments: ''
});

export const mergeHandheldSawDetails = (saved?: Partial<HandheldSawPermitDetails>): HandheldSawPermitDetails => {
    const initial = createInitialHandheldSawDetails();
    if (!saved) return initial;
    return {
        ...initial,
        ...saved,
        safetyCase: { ...initial.safetyCase, ...saved.safetyCase },
        services: { ...initial.services, ...saved.services },
        ppe: { ...initial.ppe, ...saved.ppe },
        workControls: HANDHELD_SAW_WORK_CONTROLS.map((_, index) => ({
            ...initial.workControls[index],
            ...(saved.workControls?.[index] || {})
        })),
        acceptors: Array.isArray(saved.acceptors) ? saved.acceptors : []
    };
};

const ISSUER_ONLY_SAW_FIELDS = new Set<keyof HandheldSawPermitDetails>([
    'issuerDeclaration',
    'issuerComments',
    'closureType',
    'closureComments',
    'closureDeclaration'
]);

const PERMIT_IDENTITY_FIELDS = new Set<keyof Permit>([
    'itwocxNumber',
    'permitNumber',
    'location',
    'commencementDate',
    'endDate'
]);

const valuesEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    return JSON.stringify(a) === JSON.stringify(b);
};

export const applyHandheldSawPermitPatch = (current: Permit, patch: Partial<Permit>): Permit => {
    const changedKeys = (Object.keys(patch) as Array<keyof Permit>).filter(
        key => !valuesEqual(current[key], patch[key])
    );
    const changesIdentity = changedKeys.some(key => PERMIT_IDENTITY_FIELDS.has(key));
    const nextSaw = mergeHandheldSawDetails(current.handheldSaw);
    return {
        ...current,
        ...patch,
        ...(changesIdentity ? {
            issuerSignature: undefined,
            issuerEmail: '',
            handheldSaw: { ...nextSaw, issuerDeclaration: false }
        } : {})
    };
};

export const applyHandheldSawPatch = (current: Permit, patch: Partial<HandheldSawPermitDetails>): Permit => {
    const currentSaw = mergeHandheldSawDetails(current.handheldSaw);
    const changedKeys = (Object.keys(patch) as Array<keyof HandheldSawPermitDetails>).filter(
        key => !valuesEqual(currentSaw[key], patch[key])
    );
    const changesIssuerPrerequisites = changedKeys.some(key => !ISSUER_ONLY_SAW_FIELDS.has(key));
    return {
        ...current,
        ...(changesIssuerPrerequisites ? { issuerSignature: undefined, issuerEmail: '' } : {}),
        handheldSaw: {
            ...currentSaw,
            ...patch,
            ...(changesIssuerPrerequisites ? { issuerDeclaration: false } : {})
        }
    };
};

export const withClearedSignatureDeletes = <T extends Record<string, unknown>>(
    sanitizedPayload: T,
    candidate: Pick<Permit, 'issuerSignature' | 'receiverSignature'>,
    deleteSentinel: unknown,
    options: { deleteIssuer?: boolean; deleteReceiver?: boolean } = {}
): T => {
    const deleteIssuer = options.deleteIssuer ?? !candidate.issuerSignature?.data;
    const deleteReceiver = options.deleteReceiver ?? false;
    return {
        ...sanitizedPayload,
        ...(deleteIssuer && !candidate.issuerSignature?.data ? { issuerSignature: deleteSentinel } : {}),
        ...(deleteReceiver && !candidate.receiverSignature?.data ? { receiverSignature: deleteSentinel } : {})
    };
};

export const timeTo12Hour = (time: string): { hour: string; minute: string; period: 'AM' | 'PM' } => {
    if (!time) return { hour: '', minute: '', period: 'AM' };
    const [hourPart = '0', minute = '00'] = time.split(':');
    const hour24 = Number(hourPart);
    if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return { hour: '', minute: '', period: 'AM' };
    return {
        hour: String(hour24 % 12 || 12),
        minute: minute.padStart(2, '0'),
        period: hour24 >= 12 ? 'PM' : 'AM'
    };
};

export const timeFrom12Hour = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
    if (!hour || !minute) return '';
    const hour12 = Number(hour);
    if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12 || !/^\d{2}$/.test(minute)) return '';
    const hour24 = (hour12 % 12) + (period === 'PM' ? 12 : 0);
    return `${String(hour24).padStart(2, '0')}:${minute}`;
};

export const hasHandheldSawPermitValidity = (startDate: string, finishDate: string): boolean => {
    if (!startDate || !finishDate) return false;
    const start = new Date(`${startDate}T00:00:00`);
    const finish = new Date(`${finishDate}T00:00:00`);
    const days = (finish.getTime() - start.getTime()) / 86400000;
    return Number.isFinite(days) && days >= 0 && days < HANDHELD_SAW_VALIDITY_DAYS;
};

export const hasHandheldSawSchedule = (startDate: string, startTime: string, finishDate: string, finishTime: string): boolean => {
    if (!hasHandheldSawPermitValidity(startDate, finishDate) || !startTime || !finishTime) return false;
    const start = new Date(`${startDate}T${startTime}`);
    const finish = new Date(`${finishDate}T${finishTime}`);
    return Number.isFinite(start.getTime()) && Number.isFinite(finish.getTime()) && finish.getTime() > start.getTime();
};

export const validateHandheldSawIssuance = (permit: Permit): string[] => {
    const details = permit.handheldSaw;
    const errors: string[] = [];
    if (!details) return ['Handheld saw permit data is missing.'];
    const uploadedApprovalPdf = hasUploadedApprovalPdf(details);
    const requiredText: Array<[string, unknown]> = [
        ['Permit number', formatHandheldSawPermitNumber(permit.itwocxNumber || permit.permitNumber)],
        ['Work location', permit.location],
        ['JSEA reference number', details.jseaReference],
        ['Start date', permit.commencementDate],
        ['Finish date', permit.endDate],
        ['Start time', details.startTime],
        ['Finish time', details.finishTime],
        ...(!uploadedApprovalPdf ? [
            ['Zone Manager explanation of alternatives', details.alternativesExplanation],
            ['Safety case: scope of work', details.safetyCase.scope],
            ['Safety case: item being cut', details.safetyCase.itemBeingCut],
            ['Safety case: support to prevent blade jamming', details.safetyCase.supportToPreventJamming],
            ['Safety case: direct supervision', details.safetyCase.directSupervision],
            ['Safety case: duration of work', details.safetyCase.duration]
        ] as Array<[string, unknown]> : []),
        ['Equipment make', details.equipmentMake],
        ['Equipment model', details.equipmentModel],
        ['Task-specific PPE', details.ppe.taskSpecific]
    ];
    requiredText.forEach(([label, value]) => {
        if (!String(value ?? '').trim()) errors.push(`${label} is required.`);
    });

    if (!hasHandheldSawSchedule(permit.commencementDate || '', details.startTime, permit.endDate || '', details.finishTime)) {
        errors.push('Finish date and time must be after the start and within the 7-day permit validity period.');
    }
    if (!uploadedApprovalPdf && !details.alternativesReviewed) {
        errors.push('Zone Manager must record whether alternatives were reviewed.');
    }
    if (!hasSatisfiedHandheldSawApproval(details)) {
        errors.push('Complete one approval path: upload a Manager Approval PDF, or complete Zone Manager endorsement / Project Director approval (PIN + ACL required).');
    }
    if (details.managerApprovalVerifiedByIssuer && !uploadedApprovalPdf) {
        errors.push('Only an uploaded PDF document can satisfy Permit Issuer approval verification.');
    }
    if (!details.bladeGuards) errors.push('Blade guard requirement must be answered.');
    if (!details.antiKickbackSystems) errors.push('Anti-kickback system requirement must be answered.');
    if (!details.services || HANDHELD_SAW_SERVICES.some(service => !details.services[service.key])) {
        errors.push('Every service identification item must be marked Y, N or U.');
    }
    if (['Y', 'U'].includes(details.services?.other || '') && !details.otherServiceDetails.trim()) {
        errors.push('Details are required when Other services are marked Y or U.');
    }
    const unresolvedServices = Object.values(details.services || {}).some(value => value === 'Y' || value === 'U');
    if (unresolvedServices && (!details.drawingsReviewed || !(details.drawingsUrl || details.drawingsReference.trim()))) {
        errors.push('Review and attach or link relevant service drawings before works commence.');
    }
    if ((details.workControls || []).length !== HANDHELD_SAW_WORK_CONTROLS.length ||
        details.workControls.some((control: SawPermitWorkControl) => !control.answer)) {
        errors.push('All nine work controls need YES, NO or N/A.');
    }
    if (!details.ppe.doubleEyeProtection || !details.ppe.gloves || !details.ppe.p2DustMask || !details.ppe.hearingProtection) {
        errors.push('Double-eye protection, gloves, P2 dust protection and hearing protection must all be confirmed.');
    }
    if (!details.issuerDeclaration || !permit.issuerSignature?.data) errors.push('Permit Issuer declaration and signature are required.');
    if (!details.receiverDeclaration || !permit.receiverSignature?.data) errors.push('Permit Receiver declaration and signature are required.');
    const issuerIdentity = String(permit.issuerEmail || permit.issuerSignature?.email || permit.issuerSignature?.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const receiverIdentity = String(permit.receiverEmail || permit.receiverSignature?.email || permit.receiverSignature?.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (issuerIdentity && receiverIdentity && issuerIdentity === receiverIdentity) {
        errors.push('The Permit Issuer cannot also be the Permit Receiver on the same permit.');
    }
    if (!details.acceptors.some(acceptor => acceptor.name.trim() && acceptor.signature?.data && acceptor.declaration)) {
        errors.push('At least one Permit Acceptor must sign the acceptance declaration.');
    }
    if (!details.onSiteIssue) errors.push('Capture the on-site location before issuing this permit.');
    return errors;
};
