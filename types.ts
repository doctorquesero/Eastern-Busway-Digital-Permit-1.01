// ==========================================
// EBA DIGITAL PERMIT SYSTEM - CORE TYPES
// ==========================================

export interface Signature {
    data: string;
    name: string;
    date: string;
    type: 'draw' | 'type';
}

export interface HandoverLog {
    id: string;
    date: string;
    receiverName: string;
    signature: Signature;
    initial: Signature;
}

export interface DailySignOff {
    id: string;
    date: string;
    receiverSig: Signature | null;
    excavatorSig: Signature | null;
    spotterSig: Signature | null;
}

export interface PermitPhoto {
    id: string;
    url: string;
    caption: string;
    uploadedBy: string;
    date: string;
}

export interface CeaseWorksRecord {
    id: string;
    date: string;
    issuerName: string;
    issuerSignature: Signature;
    affectedItemNumber: '1' | '2' | '3' | '4';
    actionTaken: 'resumed' | 'suspended' | 'cancelled';
}

export interface CrewMember {
    id: string;
    name: string;
    role: string;
    signature?: Signature;
    dateInducted: string;
}

export interface ChecklistItem {
    id: string;
    question: string;
    answer: 'yes' | 'no' | 'n/a' | null;
    comment?: string;
}

export interface PartBHighRiskOptions {
    power11kv: boolean;
    gasHighPressure: boolean;
    mainFibre: boolean;
}

export interface CloseApproachDistances {
    overheadElectricityDist: string;
    overheadRailDist: string;
    overheadOtherDist: string;
    undergroundElectricityDist: string;
    undergroundFibreDist: string;
    undergroundGasDist: string;
    undergroundWaterDist: string;
    permitsObtained: 'yes' | 'no' | 'n/a' | null;
}

export interface Permit {
    id: string;
    permitNumber: string;
    itwocxNumber?: string;
    status: 'draft' | 'active' | 'closed';
    createdAt: string;
    
    // Page 1 & 2: Site Plan & Base Details
    location: string;
    revealModelLayer: boolean;
    subLayers: boolean;
    ebaConstructionLayer: boolean;
    asBuiltLayers: boolean;

    // Page 3: Risk Assessment & Scope (Issuer & Site Engineer)
    scopeOfWorks: string;
    excavationType: 'mechanical' | 'hydro' | 'hand';
    
    // --> Issuer Questions (Pg 3)
    knownServicesScanned: 'yes' | 'no' | 'n/a' | null;
    servicesMarked: 'yes' | 'no' | 'n/a' | null;
    potholingMarkers: 'yes' | 'no' | 'n/a' | null;
    // NUEVAS PREGUNTAS REV 14
    transpowerDesignation: 'yes' | 'no' | 'n/a' | null;
    watercareWorksOver: 'yes' | 'no' | 'n/a' | null;

    // Page 4: Part A (Service Identification)
    partAChecklist: ChecklistItem[];
    partAPotholingMethod: string;
    partAFrequency: string;
    partACloseApproach: CloseApproachDistances;
    partAOverheadProtection: string;

    // Page 5: Part B (Mechanical Excavation)
    partBChecklist: ChecklistItem[];
    partBHighRiskOptions: PartBHighRiskOptions;

    // Page 6 & 8-9: Receiver & Handover Checklists
    receiverChecklist: ChecklistItem[];
    handoverChecklist: ChecklistItem[];

    // Signatures Master
    siteEngineerSignature?: Signature;
    issuerSignature?: Signature;
    receiverSignature?: Signature;
    approverSignature?: Signature;
    
    // Logs and attachments (Pg 10 & 12)
    dailyLogs: DailySignOff[];
    handoverLogs: HandoverLog[];
    crewMembers: CrewMember[];
    otherNotes: string;
    photos: PermitPhoto[];
    ceaseWorksRecord?: CeaseWorksRecord;
    
    // Closure (Pg 11)
    closureSignature?: Signature;
    closureReceiverName?: string;
    closureDate?: string;
    closureChecklistExcavationSafe?: boolean;
    closureChecklistAsBuiltReturned?: boolean;
    closureChecklistOutstandingWorks?: boolean;
    closureOutstandingWorksDetails?: string;
}

// ==========================================
// 🚀 TRANCRIPCIÓN EXACTA DEL PDF (REV 14)
// ==========================================

export const INITIAL_PART_A: ChecklistItem[] = [
    { id: '1a', question: 'Have I obtained all the EBA service plans with applicable REVEAL layer turned on?', answer: null, comment: '' },
    { id: '1b', question: 'Have I physically inspected the site for any above ground indicators of services and other hazards?', answer: null, comment: '' },
    { id: '2', question: 'Have I positively identified all services from all surrounding buildings? It includes to open manholes, check existing boxes for water meters, and verify any inconsistencies in the be4udig and GIS drawings referred to existing services on site.', answer: null, comment: '' },
    { id: '3', question: 'Have I evaluated if it is possible to de-energise services before work commences?', answer: null, comment: '' },
    { id: '4', question: 'Based on the risk of this job/site, what type of potholing is to be completed on this job (e.g. hydro or air excavation, hand digging, etc.) List the tools being used for potholing.', answer: null, comment: '' },
    { id: '5', question: 'If applicable, what is the frequency of the potholing/slotting to be done to identify the applicable services?', answer: null, comment: '' },
    { id: '6', question: 'State the requirements for close approach permits on this job; both underground and overhead.', answer: null, comment: '' },
    { id: '7', question: 'What means of overhead service protection have I provided for this job?', answer: null, comment: '' },
    { id: '8', question: 'Have all the EBA service plans and BeforeUDig drawings for the site been reviewed for inconsistencies?', answer: null, comment: '' }
];

export const INITIAL_PART_B: ChecklistItem[] = [
    { id: '1', question: 'Have all services been exposed and identified by a competent person?', answer: null, comment: '' },
    { id: '2', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null, comment: '' },
    { id: '3', question: 'Has all potholing by the chosen method been completed? (refer to items 4 and 6 on page 4).', answer: null, comment: '' },
    { id: '4', question: 'If there are high risk services* within the excavation is there a clear plan/risk assessment for the team to mitigate the risk? >11kV mains power, high pressure gas, main fibre, watermains >300mm and sewer >300mm', answer: null, comment: '' },
    { id: '5', question: 'If any of the following services are within the scope, has the correct Network Utility provider verified the services identified within the works designation. >11kV mains power, high pressure gas, main fibre.', answer: null, comment: '' },
    // NUEVA PREGUNTA REV 14
    { id: '6', question: 'Has compliance with Watercare\'s "Works Over Approval" form been verified, ensuring that any works within 2 meters of pipelines <375 mm and 10 meters of pipelines ≥375 mm have the necessary approval?', answer: null, comment: '' }
];

// PÁGINA 6: Exactamente 10 preguntas
export const INITIAL_RECEIVER_CHECKLIST: ChecklistItem[] = [
    { id: '1', question: 'Have all services been exposed and identified by a competent person?', answer: null, comment: '' },
    { id: '2', question: 'Do I understand the specific work methodology / site plan / drawings and specifications for this site?', answer: null, comment: '' },
    { id: '3', question: 'Do I have a copy of the Permits required in question 8 on page 3', answer: null, comment: '' },
    { id: '4', question: 'Have I got all of the underground service plans on site, reviewed and understand them?', answer: null, comment: '' },
    { id: '5', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null, comment: '' },
    { id: '6', question: 'Have all underground services been marked on site including location and depth? Also included to identify all services from all surrounding buildings and check any inconsistencies in the be4udig and GIS drawings referred to existing services on site', answer: null, comment: '' },
    { id: '7', question: 'Where marks could be removed, have I made a provision to maintain information of location and depth once work commences?', answer: null, comment: '' },
    { id: '8', question: 'Has all potholing by the chosen method been completed? (refer to items 4 and 6 on page 4).', answer: null, comment: '' },
    { id: '9', question: 'Have the operators, spotters and stand overs been briefed by myself of service location, depths and minimum approach or exclusion distances?', answer: null, comment: '' },
    { id: '10', question: 'What system of communication has been agreed between the operator and stand over/spotter?', answer: null, comment: '' }
];

// PÁGINA 8-9: Exactamente 11 preguntas (Se añade la #6 original del Handover)
export const INITIAL_HANDOVER_CHECKLIST: ChecklistItem[] = [
    { id: '1', question: 'Have all services been exposed and identified by a competent person?', answer: null, comment: '' },
    { id: '2', question: 'Do I understand the specific work methodology / site plan / drawings and specifications for this site?', answer: null, comment: '' },
    { id: '3', question: 'Do I have a copy of the Permits required in question 8 on page 3', answer: null, comment: '' },
    { id: '4', question: 'Have I got all of the underground service plans on site, reviewed and understand them?', answer: null, comment: '' },
    { id: '5', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null, comment: '' },
    { id: '6', question: 'Has the service location provider briefed the engineer and myself of service location and depths? (do not rely on depths indicated on plans)', answer: null, comment: '' },
    { id: '7', question: 'Have all underground services been marked on site including location and depth? Also included to identify all services from all surrounding buildings and check any inconsistencies in the be4udig and GIS drawings referred to existing services on site', answer: null, comment: '' },
    { id: '8', question: 'Where marks could be removed, have I made a provision to maintain information of location and depth once work commences?', answer: null, comment: '' },
    { id: '9', question: 'Has all potholing by the chosen method been completed? (refer to items 4 and 6 on page 4).', answer: null, comment: '' },
    { id: '10', question: 'Have the operators, spotters and stand overs been briefed by myself of service location, depths and minimum approach or exclusion distances?', answer: null, comment: '' },
    { id: '11', question: 'What system of communication has been agreed between the operator and stand over/spotter?', answer: null, comment: '' }
];