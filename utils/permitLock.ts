import type { Permit } from '../types';

const lockedFields: (keyof Permit)[] = [
    'permitNumber', 'itwocxNumber', 'permitType', 'location', 'issuedDate', 'commencementDate', 'endDate',
    'revealModelLayer', 'subLayers', 'ebaConstructionLayer', 'asBuiltLayers', 'scopeOfWorks', 'excavationType',
    'partAChecklist', 'partAPotholingMethod', 'partAFrequency', 'partACloseApproach', 'partAOverheadProtection',
    'receiverChecklist', 'siteEngineerSignature', 'receiverSignature', 'issuerSignature',
    'receiver', 'receiverName', 'receiverEmail', 'receiverId', 'receiverUid', 'issuerEmail',
    'knownServicesScanned', 'servicesMarked', 'potholingMarkers', 'transpowerDesignation', 'watercareWorksOver', 'issuerComments'
];

export const isPreworkLocked = (permit: Permit): boolean => {
    const status = String(permit.status || '').toLowerCase();
    return status === 'closed' || permit.isDraft === false ||
        (permit.isDraft !== true && (status === 'active' || status === 'issued')) ||
        !!permit.issuerSignature?.data;
};

const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    }
    return value;
};

export const hasLockedPreworkChanges = (latest: Permit, candidate: Permit): boolean =>
    isPreworkLocked(latest) && lockedFields.some(field =>
        JSON.stringify(canonical(latest[field])) !== JSON.stringify(canonical(candidate[field]))
    );
