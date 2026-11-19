import { daysOverdue, getExpiryInstant } from './expiry';

export const SCHEMA_VERSION = 2;
const TOP_N = 25;
const UNASSIGNED = 'unassigned';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Firestore documents are capped at 1 MiB; warn well before the summary gets there.
const SIZE_WARN_BYTES = 900_000;

export type PermitStatus = 'draft' | 'active' | 'expired' | 'closed';

export interface CountRow { key: string; label: string; count: number }
export interface PersonRow extends CountRow { expired: number }
export type ReceiverRow = PersonRow;
export interface ExpiredRow { id: string; ref: string; location: string; receiver: string; receiverEmail: string; daysOverdue: number }

/** Flattened permit for client-side filtering. Emails are lowercase, '' when unknown. */
export interface PermitNode {
  id: string;
  ref: string;
  status: PermitStatus;
  normalizedZone: string;
  location: string;
  type: string;
  receiverEmail: string;
  issuerEmail: string;
  approverEmail: string;
  siteEngineerEmail: string;
  issueDate: string;
  expiryDate: string;
  hasPartB: boolean;
}

export interface MetricsSummary {
  schemaVersion: number;
  generatedAt: string;
  sourceCollection: string;
  totals: { total: number; draft: number; active: number; closed: number; expired: number; incomplete: number };
  byType: CountRow[];
  byZone: CountRow[];
  byReceiver: PersonRow[];
  byIssuer: PersonRow[];
  byApprover: PersonRow[];
  bySiteEngineer: PersonRow[];
  /** Normalized quadrant -> permit count (full, untruncated). */
  permitsByZone: Record<string, number>;
  oldestExpired: ExpiredRow[];
  /** lowercase email -> official "First Last" from appSettings/global (only emails seen on permits). */
  people: Record<string, string>;
  /** Lowercase emails of every user holding the Receiver role in appSettings/global. */
  registeredReceivers: string[];
  permitNodes: PermitNode[];
}

export const ZONE_DICTIONARY: Record<string, string> = {
  "zone 1": "EB1", "eb1": "EB1",
  "zone 2": "EB2", "eb2": "EB2", "aylesbury": "EB2", "ayr road": "EB2", "anthony": "EB2", "bolina": "EB2", "cortina": "EB2", "dale": "EB2", "dolphin": "EB2", "dowling": "EB2", "kentigern": "EB2", "latham": "EB2", "mattson": "EB2", "millen": "EB2", "osprey": "EB2", "pandora": "EB2", "paul place": "EB2", "pennell": "EB2", "reeves": "EB2", "seven oaks": "EB2", "steeple": "EB2", "tiraumea": "EB2", "undine": "EB2", "william roberts": "EB2",
  "zone 3": "EB3", "eb3": "EB3", "cardiff": "EB3", "marriott": "EB3", "chevis": "EB3", "roseburn": "EB3", "snell": "EB3", "edgewater": "EB3", "wheatley": "EB3", "te anau": "EB3", "ellesmere": "EB3", "gossamer": "EB3", "fremantle": "EB3", "paradise": "EB3", "riverhills": "EB3",
  "zone 4": "EB4", "eb4": "EB4", "trugood": "EB4", "burswood": "EB4", "torrens": "EB4", "greenmount": "EB4", "amera": "EB4", "huntington": "EB4", "heathridge": "EB4", "midvale": "EB4", "davington": "EB4", "harris": "EB4", "dulwich": "EB4", "tullis": "EB4",
  "zone 5": "EB5", "eb5": "EB5", "guys road": "EB5", "cottesmore": "EB5", "lushington": "EB5", "kirikiri": "EB5", "oporoa": "EB5", "waihi": "EB5", "opito": "EB5", "haven": "EB5", "te koha": "EB5", "tiger drive": "EB5", "spalding": "EB5", "bunker rise": "EB5", "nagle": "EB5", "puma": "EB5", "chapel road": "EB5"
};

const NOT_SPECIFIED = 'Not specified';

// Lowercase, strip punctuation and collapse whitespace so "136 - 138 Ti-Rakau Dr." matches reliably.
const cleanLocation = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Matches the street number alone or as part of a range/lot ("136", "134 136", "136 138") directly before "ti rakau".
const mainRoadRegex = (num: string): RegExp => new RegExp(`(^| )${num}( \\d+[a-z]?)? ti rakau`);
const TI_RAKAU_136 = mainRoadRegex('136');
const TI_RAKAU_386 = mainRoadRegex('386');
const ZONE_ENTRIES = Object.entries(ZONE_DICTIONARY);

/** Maps a free-text location to EB1-EB5. Anything unmatched is forced into 'Not specified', never a raw address. */
export const normalizeZone = (rawLocation: unknown): string => {
  const cleaned = typeof rawLocation === 'string' ? cleanLocation(rawLocation) : '';
  if (!cleaned) return NOT_SPECIFIED;
  // Main roads are split by street number before the general dictionary applies.
  if (TI_RAKAU_136.test(cleaned)) return 'EB2';
  if (TI_RAKAU_386.test(cleaned)) return 'EB5';
  for (const [key, zone] of ZONE_ENTRIES) {
    if (cleaned.includes(key)) return zone;
  }
  return NOT_SPECIFIED;
};

const asEmail = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return EMAIL_REGEX.test(s) ? s : '';
};

/** Email-first active receiver: newest handover, otherwise the permit's own receiver email. */
export const receiverEmailOf = (data: any): string => {
  const logs: any[] = Array.isArray(data.handoverLogs) ? data.handoverLogs : [];
  const last = logs.length ? logs[logs.length - 1] : null;
  return last
    ? asEmail(last.receiverEmail) || asEmail(last.receiverSignature?.email)
    : asEmail(data.receiverEmail) || asEmail(data.receiverSignature?.email) || asEmail(data.receiver);
};

const issuerEmailOf = (data: any): string => asEmail(data.issuerEmail) || asEmail(data.issuerSignature?.email);
const approverEmailOf = (data: any): string => asEmail(data.approverEmail) || asEmail(data.approverSignature?.email);
const siteEngineerEmailOf = (data: any): string =>
  asEmail(data.siteEngineerEmail) || asEmail(data.siteEngineerSignature?.email) || asEmail(data.engineerEmail);

const hasPartBOf = (data: any): boolean => {
  const answered = Array.isArray(data.partBChecklist) && data.partBChecklist.some((i: any) => i && i.answer);
  const hr = data.partBHighRiskOptions;
  return answered || !!(hr && (hr.power11kv || hr.gasHighPressure || hr.mainFibre));
};

const permitRef = (data: any, id: string): string => {
  const digits = String(data.itwocxNumber ?? data.permitNumber ?? data.number ?? id).replace(/\D/g, '');
  return digits ? `PF#${digits.padStart(4, '0')}` : `PF#${id}`;
};

const toIso = (v: any): string => {
  if (!v) return '';
  const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
};

const bump = (map: Map<string, CountRow>, key: string, label: string) => {
  const row = map.get(key) || { key, label, count: 0 };
  row.count++;
  map.set(key, row);
};

const top = <T extends CountRow>(rows: T[]): T[] =>
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, TOP_N);

/**
 * Pure aggregation over raw permit documents (no I/O), so it is trivially unit-testable.
 * `directory` maps lowercase email -> formal display name (from Settings). People are grouped
 * strictly by email; names are only ever looked up, never used as a grouping key.
 */
export const aggregatePermits = (
  docs: Array<{ id: string; data: any }>,
  directory: Map<string, string>,
  now: Date,
  sourceCollection: string,
  registeredReceivers: string[] = []
): MetricsSummary => {
  const totals = { total: 0, draft: 0, active: 0, closed: 0, expired: 0, incomplete: 0 };
  const types = new Map<string, CountRow>();
  const zones = new Map<string, CountRow>();
  const roleMaps = {
    receiver: new Map<string, PersonRow>(),
    issuer: new Map<string, PersonRow>(),
    approver: new Map<string, PersonRow>(),
    siteEngineer: new Map<string, PersonRow>()
  };
  const expiredRows: ExpiredRow[] = [];
  const nodes: PermitNode[] = [];
  const people: Record<string, string> = {};

  const nameOf = (email: string): string => directory.get(email) || email;
  const officialReceivers = new Set(registeredReceivers);

  // Every registered Receiver gets a row (even with 0 permits), so the list always reflects Settings.
  for (const email of officialReceivers) {
    roleMaps.receiver.set(email, { key: email, label: nameOf(email), count: 0, expired: 0 });
    people[email] = nameOf(email);
  }

  const track = (map: Map<string, PersonRow>, email: string, status: PermitStatus) => {
    const key = email || UNASSIGNED;
    const row = map.get(key) || { key, label: email ? nameOf(email) : 'No email on record', count: 0, expired: 0 };
    row.count++;
    if (status === 'expired') row.expired++;
    map.set(key, row);
    if (email) people[email] = nameOf(email);
  };

  for (const { id, data } of docs) {
    totals.total++;
    const isClosed = data.status === 'closed' || data.isClosed === true;
    const isDraft = data.isDraft !== false;

    const type = String(data.permitType || data.type || 'BG').toUpperCase();
    bump(types, type, type);

    const rawLocation = String(data.location || data.areaDescription || '').trim();
    const zone = normalizeZone(rawLocation);
    bump(zones, zone.toLowerCase(), zone);

    const issuerEmail = issuerEmailOf(data);
    const approverEmail = approverEmailOf(data);
    const siteEngineerEmail = siteEngineerEmailOf(data);

    // A Receiver is never the Issuer, Approver or Site Engineer of the same permit, and never falls back to them.
    let receiverEmail = receiverEmailOf(data);
    const otherRoles = new Set([issuerEmail, approverEmail, siteEngineerEmail].filter(Boolean));
    if (otherRoles.has(receiverEmail)) receiverEmail = '';
    // When the official Receiver list is known, only those registered users can own a permit as Receiver.
    if (receiverEmail && officialReceivers.size > 0 && !officialReceivers.has(receiverEmail)) receiverEmail = '';

    let status: PermitStatus;
    const expiry = getExpiryInstant(data);
    if (isClosed) { status = 'closed'; totals.closed++; }
    else if (isDraft) { status = 'draft'; totals.draft++; totals.incomplete++; }
    else if (expiry && expiry.getTime() <= now.getTime()) { status = 'expired'; totals.active++; totals.expired++; }
    else { status = 'active'; totals.active++; }

    track(roleMaps.receiver, receiverEmail, status);
    track(roleMaps.issuer, issuerEmail, status);
    track(roleMaps.approver, approverEmail, status);
    track(roleMaps.siteEngineer, siteEngineerEmail, status);

    const ref = permitRef(data, id);
    if (status === 'expired' && expiry) {
      expiredRows.push({
        id, ref, location: zone,
        receiver: receiverEmail ? nameOf(receiverEmail) : 'No email on record',
        receiverEmail,
        daysOverdue: daysOverdue(expiry, now)
      });
    }

    nodes.push({
      id, ref, status, normalizedZone: zone, location: rawLocation, type,
      receiverEmail, issuerEmail, approverEmail, siteEngineerEmail,
      issueDate: toIso(data.issuedDate || data.createdAt),
      expiryDate: expiry ? expiry.toISOString() : '',
      hasPartB: hasPartBOf(data)
    });
  }

  const byCount = <T extends CountRow>(rows: T[]): T[] =>
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const summary: MetricsSummary = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    sourceCollection,
    totals,
    byType: top([...types.values()]),
    byZone: byCount([...zones.values()]),
    byReceiver: byCount([...roleMaps.receiver.values()]),
    byIssuer: top([...roleMaps.issuer.values()]),
    byApprover: top([...roleMaps.approver.values()]),
    bySiteEngineer: top([...roleMaps.siteEngineer.values()]),
    permitsByZone: Object.fromEntries([...zones.values()].map(z => [z.label, z.count])),
    oldestExpired: expiredRows.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, TOP_N),
    people,
    registeredReceivers: [...officialReceivers],
    permitNodes: nodes
  };

  return summary;
};

export const SHARD_SIZE = 2000;

export type SummaryHeader = Omit<MetricsSummary, 'permitNodes'> & { shardCount: number };
export interface NodeShard { generatedAt: string; index: number; permitNodes: PermitNode[] }

/**
 * Splits permitNodes out of the summary so no document nears the 1 MiB limit. The header keeps every
 * aggregate plus `shardCount`; each shard carries `generatedAt` so readers can detect a mixed generation.
 */
export const shardSummary = (summary: MetricsSummary, shardSize = SHARD_SIZE): { header: SummaryHeader; shards: NodeShard[] } => {
  const { permitNodes, ...rest } = summary;
  const shards: NodeShard[] = [];
  for (let i = 0; i < permitNodes.length; i += shardSize) {
    shards.push({ generatedAt: summary.generatedAt, index: shards.length, permitNodes: permitNodes.slice(i, i + shardSize) });
  }
  const header: SummaryHeader = { ...rest, shardCount: shards.length };
  for (const doc of [header, ...shards]) {
    const bytes = JSON.stringify(doc).length;
    if (bytes > SIZE_WARN_BYTES) console.warn(`[Metrics] document is ~${bytes} bytes, nearing the 1 MiB Firestore limit.`);
  }
  return { header, shards };
};
