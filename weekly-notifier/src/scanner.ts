import { getNotifierDb } from './config';
import { daysOverdue, getExpiryInstant } from './expiry';
import { ExpiredPermit, ReceiverGroup } from './types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = 'https://eba-digital-permits.web.app';

const asEmail = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return EMAIL_REGEX.test(s) ? s : null;
};

interface UserRecord {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  roles: Set<string>; // lowercase role names from the ACL
}

interface UserDirectory {
  byEmail: Map<string, UserRecord>;
  byId: Map<string, string>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const normName = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
};

// Known site spellings/variations -> canonical ACL full name (must still exist in the ACL with the Receiver role)
const NAME_ALIASES: Record<string, string> = {
  'isaac rivers': 'issac rivers',
  'tama leaf': 'tama leaf',
  'tamahana leaf': 'tama leaf',
  'tama': 'tama leaf',
  'sifa v': 'sifa valentine',
  'sifa': 'sifa valentine',
  'sifa valentine': 'sifa valentine',
  'ryan parsrson': 'ryan parsson',
  'ryan parsons': 'ryan parsson'
};

const rolesOf = (u: any): string[] => {
  const raw = [u?.roles, u?.role].flat().filter(Boolean);
  return raw.flatMap(r => String(r).split(/[,;/]/)).map(r => r.trim().toLowerCase()).filter(Boolean);
};

const isReceiverUser = (r: UserRecord | undefined): r is UserRecord => !!r && r.roles.has('receiver');

const nameOfRecord = (r: UserRecord): string => normName(`${r.firstName} ${r.lastName}`.trim() || r.displayName);

/**
 * Loads the user directory from the same places the web app does:
 *  - appSettings/global.roleAssignments (Settings page; { email, firstName, lastName, roles|role })
 *  - the `users` collection
 * Records are merged by lowercase email.
 */
const loadUserDirectory = async (): Promise<UserDirectory> => {
  const db = getNotifierDb();
  const byEmail = new Map<string, UserRecord>();
  const byId = new Map<string, string>();

  const ingest = (u: any, fallbackId?: string) => {
    const email = asEmail(u?.email) || asEmail(fallbackId);
    if (!email) return;
    const full = [str(u.firstName), str(u.lastName)].filter(Boolean).join(' ');
    const rec: UserRecord = byEmail.get(email) || { email, displayName: '', firstName: '', lastName: '', roles: new Set<string>() };
    rec.displayName = rec.displayName || full || str(u.name) || str(u.displayName) || str(u.fullName);
    rec.firstName = rec.firstName || str(u.firstName);
    rec.lastName = rec.lastName || str(u.lastName);
    rolesOf(u).forEach(r => rec.roles.add(r));
    byEmail.set(email, rec);
    for (const id of [fallbackId, u.uid, u.id]) if (id) byId.set(String(id), email);
  };

  const [usersSnap, settingsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('appSettings').doc('global').get()
  ]);
  usersSnap.docs.forEach(d => ingest(d.data(), d.id));
  const assignments = settingsSnap.exists ? settingsSnap.data()?.roleAssignments : null;
  if (Array.isArray(assignments)) assignments.forEach(a => ingest(a));

  console.log(`[Scan] Directory: ${usersSnap.size} users doc(s), ${Array.isArray(assignments) ? assignments.length : 0} roleAssignments, ${byEmail.size} merged record(s).`);
  return { byEmail, byId };
};

const typedNameOf = (data: any): string => {
  const logs: any[] = Array.isArray(data.handoverLogs) ? data.handoverLogs : [];
  const last = logs.length ? logs[logs.length - 1] : null;
  const candidates = last
    ? [last.receiverName]
    : [data.receiverSignature?.name, data.receiverName, data.receiver];
  return candidates.map(str).find(n => n && !asEmail(n)) || '';
};

const excludedIdentities = (data: any): { emails: Set<string>; names: Set<string> } => {
  const emails = new Set<string>();
  const names = new Set<string>();
  [data.issuerEmail, data.approverEmail,
    data.issuerSignature?.email, data.approverSignature?.email,
    data.issuer, data.approver, data.issuerName, data.approverName,
    data.issuerSignature?.name, data.approverSignature?.name].forEach(v => {
    const e = asEmail(v);
    if (e) emails.add(e);
    else if (normName(v)) names.add(normName(v));
  });
  return { emails, names };
};

const matchByTypedName = (typed: string, receivers: UserRecord[]): { user: UserRecord | null; note: string } => {
  const n = normName(typed);
  if (!n) return { user: null, note: 'no receiver name typed on permit' };

  const exact = receivers.filter(r => nameOfRecord(r) === n);
  if (exact.length === 1) return { user: exact[0], note: 'exact name' };

  const canonical = NAME_ALIASES[n];
  if (canonical) {
    const hit = receivers.filter(r => nameOfRecord(r) === canonical);
    if (hit.length === 1) return { user: hit[0], note: 'alias' };
  }

  const tokens = n.split(' ');
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const fn = (r: UserRecord) => normName(r.firstName || r.displayName.split(' ')[0]);
  const ln = (r: UserRecord) => normName(r.lastName || r.displayName.split(' ').slice(1).join(' '));
  const lastOk = (r: UserRecord, dist: number) =>
    !last || (last.length === 1 ? ln(r).startsWith(last) : levenshtein(ln(r), last) <= dist);

  for (const dist of [0, 1]) {
    const hits = receivers.filter(r => levenshtein(fn(r), first) <= dist && lastOk(r, dist));
    if (hits.length === 1) return { user: hits[0], note: dist === 0 ? 'prefix/initial' : 'typo (distance 1)' };
    if (hits.length > 1) return { user: null, note: `ambiguous name "${typed}" matches ${hits.length} ACL receivers` };
  }
  return { user: null, note: `name "${typed}" does not match any ACL Receiver` };
};

/**
 * Receiver resolution:
 *  1. Stored email (newest handover entry first, else permit root). Accepted only if the ACL user holds the
 *     Receiver role and is not the permit's issuer/approver/site engineer (by email or name).
 *  2. Otherwise the typed receiver name is matched against ACL users holding the Receiver role.
 */
export const resolveReceiver = (data: any, dir: UserDirectory): { email: string | null; typedName: string; reason?: string; method?: string } => {
  const logs: any[] = Array.isArray(data.handoverLogs) ? data.handoverLogs : [];
  const ex = excludedIdentities(data);
  const typedName = typedNameOf(data);
  const allowed = (r: UserRecord | undefined): r is UserRecord =>
    isReceiverUser(r) && !ex.emails.has(r.email) && !ex.names.has(nameOfRecord(r));
  const fromId = (id: unknown) => (id ? dir.byId.get(String(id)) || null : null);

  const candidates: Array<string | null> = [];
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    candidates.push(asEmail(last?.receiverEmail), asEmail(last?.receiverSignature?.email), asEmail(last?.signature?.email), fromId(last?.receiverId));
  } else {
    candidates.push(asEmail(data.receiverEmail), asEmail(data.receiverSignature?.email), asEmail(data.receiver), fromId(data.receiverId || data.receiverUid));
  }

  const present = candidates.filter((e): e is string => !!e);
  for (const e of present) {
    const rec = dir.byEmail.get(e);
    if (allowed(rec)) return { email: rec.email, typedName, method: 'stored email' };
  }

  const receivers = [...dir.byEmail.values()].filter(allowed);
  const { user, note } = matchByTypedName(typedName, receivers);
  if (user) return { email: user.email, typedName, method: `name lookup (${note})` };

  const nonReceiver = [...dir.byEmail.values()].find(r => !isReceiverUser(r) && matchByTypedName(typedName, [r]).user);
  const blocked = matchByTypedName(typedName, [...dir.byEmail.values()].filter(isReceiverUser)).user;
  const roleNote = nonReceiver ? 'User in ACL does not hold Receiver role'
    : blocked ? `"${typedName}" is the permit's issuer/approver and cannot be its Receiver`
    : note;
  const why = present.length ? `Stored email "${present[0]}" rejected (not an ACL Receiver or is issuer/approver); ` : 'No receiver email on permit; ';
  return { email: null, typedName, reason: why + roleNote };
};
const permitRef = (data: any, id: string): string => {
  const digits = String(data.itwocxNumber ?? data.permitNumber ?? data.number ?? id).replace(/\D/g, '');
  return digits ? `PF#${digits.padStart(4, '0')}` : `PF#${id}`;
};

export interface ScanResult {
  receivers: ReceiverGroup[];
  unassigned: ExpiredPermit[];
  total: number;
}

/**
 * Scans a permits collection for issued (isDraft === false), unclosed permits past expiry,
 * grouped by the active Receiver's lowercase email. Only permits with no resolvable receiver are `unassigned`.
 */
export const scanExpiredPermits = async (collectionName: string, now: Date): Promise<ScanResult> => {
  const [snap, dir] = await Promise.all([
    getNotifierDb().collection(collectionName).where('isDraft', '==', false).get(),
    loadUserDirectory()
  ]);
  const groups = new Map<string, ReceiverGroup>();
  const unassigned: ExpiredPermit[] = [];
  let total = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === 'closed' || data.isClosed === true) continue;
    const expiry = getExpiryInstant(data);
    if (!expiry || expiry.getTime() > now.getTime()) continue;

    const { email, typedName, reason } = resolveReceiver(data, dir);
    const permit: ExpiredPermit = {
      id: doc.id,
      permitRef: permitRef(data, doc.id),
      permitType: String(data.permitType || data.type || 'BG'),
      location: String(data.location || data.areaDescription || 'Location not specified'),
      expiredAt: expiry.toISOString(),
      daysOverdue: daysOverdue(expiry, now),
      url: `${APP_URL}/?mode=live#/permit/${doc.id}`,
      receiverName: typedName,
      unassignedReason: email ? undefined :       reason
    };
    total++;

    if (!email) { unassigned.push(permit); continue; }

    const group = groups.get(email) || {
      receiverEmail: email,
      displayName: dir.byEmail.get(email)?.displayName || typedName,
      permits: []
    };
    if (!group.displayName && typedName) group.displayName = typedName;
    group.permits.push(permit);
    groups.set(email, group);
  }

  const receivers = [...groups.values()]
    .map(g => ({ ...g, permits: g.permits.sort((a, b) => b.daysOverdue - a.daysOverdue) }))
    .sort((a, b) => b.permits.length - a.permits.length || a.receiverEmail.localeCompare(b.receiverEmail));
  return { receivers, unassigned, total };
};
