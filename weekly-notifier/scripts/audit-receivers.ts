/**
 * One-off, READ-ONLY audit: which Receiver values on active permits cannot be mapped to a valid user email.
 * Run from weekly-notifier/ (needs credentials: GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`):
 *   npx tsx scripts/audit-receivers.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'eba-digital-permits' });
const db = getFirestore();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[.,_]+/g, ' ').replace(/\s+/g, ' ').trim();
const sortedKey = (v: unknown): string => norm(v).split(' ').filter(Boolean).sort().join(' ');
const nameFromEmail = (email: string): string =>
  email.split('@')[0].split('.').filter(Boolean).slice(0, 2).join(' ');
const asEmail = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return EMAIL_REGEX.test(s) ? s : null;
};
const permitRef = (d: any, id: string): string => {
  const digits = String(d.itwocxNumber ?? d.permitNumber ?? d.number ?? id).replace(/\D/g, '');
  return digits ? `PF#${digits.padStart(4, '0')}` : `PF#${id}`;
};

interface Profile { source: string; id: string; label: string; email: string | null; }

(async () => {
  // 1. Users: appSettings/global roleAssignments + users collection
  const profiles: Profile[] = [];
  const settings = await db.collection('appSettings').doc('global').get();
  const assignments: any[] = settings.exists && Array.isArray(settings.data()?.roleAssignments) ? settings.data()!.roleAssignments : [];
  assignments.forEach((u, i) => profiles.push({
    source: 'appSettings/global', id: String(u.uid || u.id || i),
    label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.displayName || '(unnamed)',
    email: asEmail(u.email)
  }));
  const usersSnap = await db.collection('users').get();
  usersSnap.forEach(d => {
    const u = d.data();
    profiles.push({
      source: 'users', id: d.id,
      label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.displayName || u.fullName || '(unnamed)',
      email: asEmail(u.email) || asEmail(d.id)
    });
  });

  const missing = profiles.filter(p => !p.email);
  console.log('\n=== 1. USER PROFILES ===');
  console.log(`Total profiles: ${profiles.length} (${assignments.length} in appSettings, ${usersSnap.size} in users)`);
  console.log(`Profiles with NO valid email: ${missing.length}`);
  missing.forEach(p => console.log(`  - [${p.source}] id=${p.id}  name="${p.label}"`));

  // Lookup: name (exact + order-insensitive) and email -> email
  const byName = new Map<string, string>();
  const knownEmails = new Set<string>();
  for (const p of profiles) {
    if (!p.email) continue;
    knownEmails.add(p.email);
    for (const n of [p.label, nameFromEmail(p.email)]) {
      const k = norm(n);
      if (k && !byName.has(k)) byName.set(k, p.email);
      if (k && !byName.has(`~${sortedKey(n)}`)) byName.set(`~${sortedKey(n)}`, p.email);
    }
  }
  const resolve = (raw: string): string | null => {
    const direct = asEmail(raw);
    if (direct) return direct;
    return byName.get(norm(raw)) || byName.get(`~${sortedKey(raw)}`) || null;
  };

  // 2 + 3. Active permits (issued, not closed) and receiver cross-reference
  const permitsSnap = await db.collection('permits').where('isDraft', '==', false).get();
  const unmapped = new Map<string, { raw: Set<string>; refs: string[] }>();
  let active = 0;
  let mapped = 0;

  permitsSnap.forEach(doc => {
    const d = doc.data();
    if (d.status === 'closed' || d.isClosed === true) return;
    active++;

    const logs: any[] = Array.isArray(d.handoverLogs) ? d.handoverLogs : [];
    const last = logs.length ? logs[logs.length - 1] : null;
    const rawReceiver = String(
      last?.receiverEmail || last?.receiverName || last?.receiver ||
      d.receiverEmail || d.receiverSignature?.email || d.receiver || d.receiverName || d.receiverSignature?.name || ''
    );

    if (rawReceiver && resolve(rawReceiver)) { mapped++; return; }

    const key = norm(rawReceiver) || '(empty)';
    const entry = unmapped.get(key) || { raw: new Set<string>(), refs: [] };
    entry.raw.add(JSON.stringify(rawReceiver));
    entry.refs.push(permitRef(d, doc.id));
    unmapped.set(key, entry);
  });

  // 4. Report
  const totalUnmapped = [...unmapped.values()].reduce((n, e) => n + e.refs.length, 0);
  console.log('\n=== 2-4. ACTIVE PERMITS vs USER PROFILES ===');
  console.log(`Active permits: ${active} | mapped to a valid email: ${mapped} | NOT mapped: ${totalUnmapped}`);
  console.log(`Distinct unmappable Receiver values: ${unmapped.size}\n`);

  [...unmapped.entries()]
    .sort((a, b) => b[1].refs.length - a[1].refs.length)
    .forEach(([key, e]) => {
      const note = key === '(empty)' ? 'Receiver field is empty'
        : [...knownEmails].some(em => nameFromEmail(em) === key) ? 'matches a profile name but that profile has no email'
        : 'no user profile with this name/email';
      console.log(`Receiver "${key}"  -> ${e.refs.length} permit(s)  [${note}]`);
      console.log(`   raw variants: ${[...e.raw].join(', ')}`);
      console.log(`   PF#: ${e.refs.sort().join(', ')}\n`);
    });
})().catch(err => { console.error('Audit failed:', err?.message || err); process.exit(1); });
