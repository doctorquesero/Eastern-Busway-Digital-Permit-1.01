
export type SignatureType = 'draw' | 'type';

export interface Signature {
  type: SignatureType;
  data: string; // Base64 image or text string
  name: string; // The printed name of the signer
  date: string;
}

export interface ChecklistItem {
  id: string;
  question: string;
  answer: 'yes' | 'no' | 'n/a' | null;
  comment?: string;
}

export interface PermitNote {
    id: string;
    text: string;
    author: string;
    role: string;
    date: string;
}

export interface PermitPhoto {
    id: string;
    url: string; // Base64
    caption: string;
    uploadedBy: string;
    date: string;
}

// Updated to match the specific table layout in Part A Q6
export interface CloseApproachConfig {
    overheadElectricityDist: string;
    overheadRailDist: string;
    overheadOtherDist: string;
    
    undergroundElectricityDist: string;
    undergroundFibreDist: string;
    undergroundGasDist: string;
    undergroundWaterDist: string;
    
    permitsObtained: 'yes' | 'no' | 'n/a' | null; // Added n/a
}

export interface HandoverLog {
    id: string;
    date: string;
    receiverName: string;
    signature: Signature;
}

// New Interface for Permanent Crew Registry
export interface CrewMember {
    id: string;
    name: string;
    role: string; // Added role field for permanent designation
    signature: Signature;
    dateInducted: string;
}

export interface DailyLog {
    id: string;
    date: string;
    name: string;
    role: 'receiver' | 'foreman' | 'operator' | 'spotter' | 'crew'; // Added receiver
    signature: Signature;
}

export interface Permit {
  id: string;
  permitNumber: string;
  itwocxNumber?: string; // New field - Primary ID if present
  status: 'draft' | 'active' | 'closed';
  createdAt: string;
  location: string;
  
  // Section: Site Plan
  revealModelLayer: boolean;
  subLayers: boolean;
  ebaConstructionLayer: boolean;
  asBuiltLayers: boolean;
  
  // Section: Excavation Details
  scopeOfWorks: string;
  excavationType: 'mechanical' | 'hydro' | 'hand'; // New field for rule logic
  
  knownServicesScanned: 'yes' | 'no' | 'n/a' | null;
  knownServicesScannedComment?: string;
  
  servicesMarked: 'yes' | 'no' | 'n/a' | null;
  servicesMarkedComment?: string;
  
  potholingMarkers: 'yes' | 'no' | 'n/a' | null; 
  potholingMarkersComment?: string;
  
  transpowerDesignation: 'yes' | 'no' | 'n/a' | null; 
  transpowerDesignationComment?: string;
  
  watercareWorksOver: 'yes' | 'no' | 'n/a' | null; 
  watercareWorksOverComment?: string;
  
  // Section: Part A Service ID
  partAChecklist: ChecklistItem[]; 
  partAPotholingMethod: string; // Q4
  partAFrequency: string; // Q5
  partACloseApproach: CloseApproachConfig; // Q6
  partAOverheadProtection: string; // Q7
  
  // Section: Part B Mechanical (Only if Mechanical)
  partBChecklist: ChecklistItem[];
  partBHighRiskOptions: { // New for Q5
    power11kv: boolean;
    gasHighPressure: boolean;
    mainFibre: boolean;
  };

  // Section: Receiver Checklist (Page 6) (Only if Mechanical)
  receiverChecklist: ChecklistItem[];

  // Signatures (Issuance)
  siteEngineerSignature?: Signature; // New field
  issuerSignature?: Signature;
  receiverSignature?: Signature;
  approverSignature?: Signature; // For Part B (Not required for Hydro)
  
  // Lifecycle (Pages 8-11)
  crewMembers: CrewMember[]; // New: Registry of all crew
  handoverLogs: HandoverLog[];
  dailyLogs: DailyLog[];
  
  // Addendums & Photos
  notes: PermitNote[];
  photos: PermitPhoto[];
  
  // Closure
  closureDate?: string;
  closureTime?: string;
  closureReceiverName?: string; // New
  closureSignature?: Signature;
  
  // Pre-Closure Checklist
  closureChecklistExcavationSafe?: boolean;
  closureChecklistAsBuiltReturned?: boolean;
  closureChecklistOutstandingWorks?: boolean;
  closureOutstandingWorksDetails?: string;
}

export const INITIAL_PART_A: ChecklistItem[] = [
  { id: '1a', question: 'Have I obtained all the EBA service plans with applicable REVEAL layer turned on?', answer: null },
  { id: '1b', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null },
  { id: '2', question: 'Have I positively identified all services from all surrounding buildings? It includes open manholes, check existing boxes for water meters, and verify inconsistencies.', answer: null },
  { id: '3', question: 'Have I evaluated if it is possible to de-energise services before work commences?', answer: null },
  { id: '8', question: 'Have all the EBA service plans and BeforeUDig drawings for the site been reviewed for inconsistencies?', answer: null },
];

export const INITIAL_PART_B: ChecklistItem[] = [
  { id: '1', question: 'Have all services been exposed and identified by a competent person?', answer: null },
  { id: '2', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null },
  { id: '3', question: 'Has all potholing by the chosen method been completed?', answer: null },
  { id: '4', question: 'If high risk services (>11kV, Gas, Main Fibre, Water >300mm) are present, is there a clear plan/risk assessment?', answer: null },
  { id: '5', question: 'If any of the following services are within the scope, has the correct Network Utility provider verified the services identified within the works designation?', answer: null },
  { id: '6', question: 'Has compliance with Watercare "Works Over Approval" form been verified?', answer: null },
];

// Updated to 10 items matching new requirement
export const INITIAL_RECEIVER_CHECKLIST: ChecklistItem[] = [
    { id: '1', question: 'Have all services been exposed and identified by a competent person?', answer: null },
    { id: '2', question: 'Do I understand the specific work methodology / site plan / drawings and specifications?', answer: null },
    { id: '3', question: 'Do I have a copy of the Permits required in question 8 on page 3?', answer: null },
    { id: '4', question: 'Have I got all of the underground service plans on site, reviewed and understand them?', answer: null },
    { id: '5', question: 'Have I physically inspected the site for any above ground indicators of services?', answer: null },
    { id: '6', question: 'Have all underground services been marked on site including location and depth? Also included to identify all services from all surrounding buildings and check any inconsistencies in the be4udig and GIS drawings referred to existing services on site', answer: null },
    { id: '7', question: 'Where marks could be removed, have I made a provision to maintain information of location and depth once work commences?', answer: null },
    { id: '8', question: 'Has all potholing by the chosen method been completed? (refer to items 4 and 6 on page 4).', answer: null },
    { id: '9', question: 'Have the operators, spotters and stand overs been briefed by myself of service location, depths and minimum approach or exclusion distances?', answer: null },
    { id: '10', question: 'What system of communication has been agreed between the operator and stand over/spotter?', answer: null, comment: 'Describe system...' },
];
