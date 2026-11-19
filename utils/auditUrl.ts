import { getAppMode } from './appMode';

// The ?mode= param (read by appMode.ts) makes a DEMO permit's QR open the permits_demo collection on the scanner's device.
export const buildAuditPdfUrl = (permitId: string): string =>
    `${window.location.origin}/?mode=${getAppMode()}#/audit-pdf/${encodeURIComponent(permitId)}`;
