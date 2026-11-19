import { initializeApp, getApps } from 'firebase-admin/app';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { aggregatePermits, shardSummary } from './aggregate';
import { getMetricsDb, PERMITS_PATH, SETTINGS_PATH, SUMMARY_PATH, shardPath } from './config';

if (!getApps().length) initializeApp();

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Registered users from Settings (read-only): email -> formal full name, plus every email holding the Receiver role. */
const loadDirectory = async (): Promise<{ names: Map<string, string>; receivers: string[] }> => {
  const snap = await getMetricsDb().doc(SETTINGS_PATH).get();
  const list: any[] = snap.exists && Array.isArray(snap.data()?.roleAssignments) ? snap.data()!.roleAssignments : [];
  const names = new Map<string, string>();
  const receivers = new Set<string>();
  for (const u of list) {
    const email = str(u?.email).toLowerCase();
    if (!email) continue;
    const name = [str(u.firstName), str(u.lastName)].filter(Boolean).join(' ');
    if (name && !names.has(email)) names.set(email, name);
    // `roles` may be an array or a comma-separated string; legacy entries use `role`.
    const roles = (Array.isArray(u.roles) ? u.roles : String(u.roles || u.role || '').split(',')).map((r: unknown) => String(r).trim().toLowerCase());
    // The app forbids an Issuer from also being a Receiver, so an Issuer is never listed as one.
    if (roles.includes('receiver') && !roles.includes('issuer')) receivers.add(email);
  }
  return { names, receivers: [...receivers] };
};

/**
 * Hourly, read-only scan of the LIVE permits collection. Writes analytics/latest_summary plus
 * analytics/latest_summary_nodes_N shards; nothing under `permits` is ever modified, so the iTwoCX sync
 * pipeline is unaffected.
 */
export const metricsPerformanceAggregation = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Pacific/Auckland',
    memory: '512MiB',
    timeoutSeconds: 300,
    retryCount: 0
  },
  async () => {
    const db = getMetricsDb();
    const [permitsSnap, directory] = await Promise.all([db.collection(PERMITS_PATH).get(), loadDirectory()]);
    const docs = permitsSnap.docs.map(d => ({ id: d.id, data: d.data() }));
    const summary = aggregatePermits(docs, directory.names, new Date(), PERMITS_PATH, directory.receivers);
    const { header, shards } = shardSummary(summary);

    // Shards first, header last: the header's shardCount only becomes visible once its shards exist.
    await Promise.all(shards.map(s => db.doc(shardPath(s.index)).set(s)));
    await db.doc(SUMMARY_PATH).set(header);

    // Remove leftover shards from an earlier, larger run.
    const stale: Promise<unknown>[] = [];
    for (let i = shards.length; i < shards.length + 50; i++) {
      stale.push(db.doc(shardPath(i)).delete());
    }
    await Promise.all(stale);
    console.log(`[Metrics] ${summary.totals.total} permits aggregated -> ${SUMMARY_PATH} (+${shards.length} node shards)`);
  }
);
