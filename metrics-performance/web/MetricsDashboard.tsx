import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { db } from '../../firebase';

/**
 * Portable analytics module. The ONLY Firestore read here is the single pre-aggregated summary
 * document; the live permits collection is never queried. All filtering below runs client-side
 * over `permitNodes`. For multi-tenant, change SUMMARY_DOC.
 */
const SUMMARY_DOC: [string, string] = ['analytics', 'latest_summary'];
const TOP_N = 25;
const ALL = 'all';

type PermitStatus = 'draft' | 'active' | 'expired' | 'closed';
type Role = 'receiver' | 'issuer' | 'approver';

interface PermitNode {
  id: string;
  ref: string;
  status: PermitStatus;
  normalizedZone: string;
  location?: string;
  type: string;
  receiverEmail: string;
  issuerEmail: string;
  approverEmail: string;
  issueDate: string;
  expiryDate: string;
  hasPartB: boolean;
}
interface MetricsSummary {
  generatedAt: string;
  people?: Record<string, string>;
  registeredReceivers?: string[];
  shardCount?: number;
  permitNodes?: PermitNode[];
}
interface CountRow { key: string; label: string; count: number }
interface PersonRow extends CountRow { expired: number }

const ROLE_LABEL: Record<Role, string> = { receiver: 'Receiver', issuer: 'Issuer', approver: 'Approver' };
const emailOf = (n: PermitNode, role: Role): string =>
  role === 'receiver' ? n.receiverEmail : role === 'issuer' ? n.issuerEmail : n.approverEmail;

const DAY_MS = 86_400_000;

const StatCard: React.FC<{ label: string; value: number; tone?: string; active?: boolean; onClick?: () => void }> = ({ label, value, tone = 'text-gray-900', active, onClick }) => {
  const body = (
    <>
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-3xl font-black mt-1 ${tone}`}>{value}</div>
    </>
  );
  if (!onClick) return <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={!!active}
      className={`text-left bg-white rounded-xl border shadow-sm p-4 transition ${active ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-400'}`}>
      {body}
    </button>
  );
};

const BarList: React.FC<{ title: string; rows: CountRow[] }> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h2 className="text-xs font-black uppercase tracking-widest text-gray-600 mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-xs text-gray-400">No data</p> : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.key} className="text-xs">
              <div className="flex justify-between font-semibold text-gray-700"><span className="truncate pr-2">{r.label}</span><span>{r.count}</span></div>
              <div className="h-2 bg-gray-100 rounded"><div className="h-2 bg-blue-600 rounded" style={{ width: `${(r.count / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const Select: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1 min-w-[9rem] flex-1">
    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-xs font-semibold bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

const countBy = (nodes: PermitNode[], pick: (n: PermitNode) => string): CountRow[] => {
  const map = new Map<string, CountRow>();
  for (const n of nodes) {
    const label = pick(n) || 'Not specified';
    const key = label.toLowerCase();
    const row = map.get(key) || { key, label, count: 0 };
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, TOP_N);
};

export const MetricsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [zone, setZone] = useState(ALL);
  const [address, setAddress] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [role, setRole] = useState<Role>('receiver');
  const [person, setPerson] = useState(ALL);

  useEffect(() => {
    let cancelled = false;
    let seq = 0;
    const loadShards = async (header: MetricsSummary, attempt = 0): Promise<PermitNode[] | null> => {
      const count = Number(header.shardCount) || 0;
      const snaps = await Promise.all(
        Array.from({ length: count }, (_, i) => getDoc(doc(db, SUMMARY_DOC[0], `${SUMMARY_DOC[1]}_nodes_${i}`)))
      );
      const shards = snaps.map(s => (s.exists() ? (s.data() as { generatedAt?: string; permitNodes?: PermitNode[] }) : null));
      // A shard from a different generation means the job was mid-write; retry once before giving up.
      const consistent = shards.every(s => s && s.generatedAt === header.generatedAt);
      if (!consistent && attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        return loadShards(header, attempt + 1);
      }
      return shards.flatMap(s => (s && Array.isArray(s.permitNodes) ? s.permitNodes : []));
    };

    const unsub = onSnapshot(
      doc(db, ...SUMMARY_DOC),
      async snap => {
        const mine = ++seq;
        if (!snap.exists()) { setSummary(null); setLoading(false); return; }
        const header = snap.data() as MetricsSummary;
        try {
          // Legacy single-document summaries still carry permitNodes inline.
          const nodes = header.shardCount === undefined ? header.permitNodes || [] : await loadShards(header);
          if (cancelled || mine !== seq) return;
          setSummary({ ...header, permitNodes: nodes || [] });
          setError('');
        } catch (e: any) {
          if (!cancelled && mine === seq) setError(e?.message || 'Failed to load permit shards');
        }
        if (!cancelled && mine === seq) setLoading(false);
      },
      err => { setError(err.message); setLoading(false); }
    );
    return () => { cancelled = true; unsub(); };
  }, []);

  const nodes = useMemo(() => (Array.isArray(summary?.permitNodes) ? summary!.permitNodes! : []), [summary]);
  const people = summary?.people || {};
  const nameOf = (email: string): string => (email ? people[email] || email : 'No email on record');

  const zoneOptions = useMemo(() => Array.from(new Set<string>(nodes.map(n => n.normalizedZone))).sort((a, b) => a.localeCompare(b)), [nodes]);
  const typeOptions = useMemo(() => Array.from(new Set<string>(nodes.map(n => n.type))).sort(), [nodes]);
  const addressOptions = useMemo(
    () => Array.from(new Set<string>(nodes.map(n => (n.location || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [nodes]
  );
  const personOptions = useMemo(() => {
    const emails = Array.from(new Set<string>(nodes.map(n => emailOf(n, role)).filter(Boolean)));
    return emails.map(e => ({ value: e, label: nameOf(e) })).sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, role, summary]);

  // The person filter belongs to the chosen role, so reset it when the role changes.
  useEffect(() => { setPerson(ALL); }, [role]);

  // Every filter except Status: the summary cards count from this set, so they work like tabs.
  const baseFiltered = useMemo(() => nodes.filter(n =>
    (zone === ALL || n.normalizedZone === zone) &&
    (address === ALL || (n.location || '').trim() === address) &&
    (type === ALL || n.type === type) &&
    (person === ALL || emailOf(n, role) === person)
  ), [nodes, zone, address, type, role, person]);

  const filtered = useMemo(() => baseFiltered.filter(n =>
    status === ALL || (status === 'open' ? n.status === 'active' || n.status === 'expired' : n.status === status)
  ), [baseFiltered, status]);

  const totals = useMemo(() => {
    const t = { total: baseFiltered.length, open: 0, closed: 0, expired: 0, draft: 0, partB: 0 };
    for (const n of baseFiltered) {
      if (n.status === 'closed') t.closed++;
      else if (n.status === 'draft') t.draft++;
      else { t.open++; if (n.status === 'expired') t.expired++; }
      if (n.hasPartB) t.partB++;
    }
    return t;
  }, [baseFiltered]);

  const byType = useMemo(() => countBy(filtered, n => n.type), [filtered]);
  const byZone = useMemo(() => countBy(filtered, n => n.normalizedZone), [filtered]);

  const byPerson = useMemo<PersonRow[]>(() => {
    const map = new Map<string, PersonRow>();
    // Receiver view lists every registered Receiver from Settings, including those with no permits.
    if (role === 'receiver' && person === ALL) {
      for (const email of summary?.registeredReceivers || []) map.set(email, { key: email, label: nameOf(email), count: 0, expired: 0 });
    }
    for (const n of filtered) {
      const email = emailOf(n, role);
      const key = email || 'unassigned';
      const row = map.get(key) || { key, label: nameOf(email), count: 0, expired: 0 };
      row.count++;
      if (n.status === 'expired') row.expired++;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, role, person, summary]);

  const overdue = useMemo(() => {
    const generated = summary ? new Date(summary.generatedAt).getTime() : Date.now();
    return filtered
      .filter(n => n.status === 'expired' && n.expiryDate)
      .map(n => ({ n, days: Math.max(0, Math.floor((generated - new Date(n.expiryDate).getTime()) / DAY_MS)) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, TOP_N);
  }, [filtered, summary]);

  const isFiltered = zone !== ALL || address !== ALL || type !== ALL || status !== ALL || person !== ALL;
  const resetFilters = () => { setZone(ALL); setAddress(ALL); setType(ALL); setStatus(ALL); setPerson(ALL); };
  // Clicking the active card again clears the status filter.
  const pickStatus = (s: string) => setStatus(prev => (prev === s ? ALL : s));

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> Dashboard</button>
        <h1 className="text-lg font-black uppercase tracking-wide">Metrics &amp; Performance</h1>
        <span className="text-[11px] text-gray-500">{summary ? `Updated ${new Date(summary.generatedAt).toLocaleString('en-NZ')}` : ''}</span>
      </div>

      {error && <p className="text-sm text-red-600">Could not load metrics: {error}</p>}
      {!error && !summary && <p className="text-sm text-gray-500">No summary has been generated yet. The first hourly run will create it.</p>}
      {summary && nodes.length === 0 && (
        <p className="text-sm text-amber-700">This summary predates interactive filtering. The next scheduled run will add the permit data.</p>
      )}

      {summary && nodes.length > 0 && (
        <>
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <Select label="Zone / Quadrant" value={zone} onChange={setZone} options={[{ value: ALL, label: 'All zones' }, ...zoneOptions.map(z => ({ value: z, label: z }))]} />
              <Select label="Address" value={address} onChange={setAddress} options={[{ value: ALL, label: 'All addresses' }, ...addressOptions.map(a => ({ value: a, label: a }))]} />
              <Select label="Permit Type" value={type} onChange={setType} options={[{ value: ALL, label: 'All types' }, ...typeOptions.map(t => ({ value: t, label: t }))]} />
              <Select label="Status" value={status} onChange={setStatus} options={[
                { value: ALL, label: 'All statuses' }, { value: 'open', label: 'Active (incl. expired)' }, { value: 'active', label: 'Active, in date' }, { value: 'expired', label: 'Expired / Unclosed' },
                { value: 'closed', label: 'Closed' }, { value: 'draft', label: 'Draft / Incomplete' }
              ]} />
              <Select label="Role" value={role} onChange={v => setRole(v as Role)} options={(Object.keys(ROLE_LABEL) as Role[]).map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
              <Select label={ROLE_LABEL[role]} value={person} onChange={setPerson} options={[{ value: ALL, label: `All ${ROLE_LABEL[role].toLowerCase()}s` }, ...personOptions]} />
              <button onClick={resetFilters} disabled={!isFiltered} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black uppercase bg-gray-800 text-white disabled:opacity-30"><RotateCcw size={14} /> Clear</button>
            </div>
            <p className="text-[11px] text-gray-500 mt-3">Showing {filtered.length} of {nodes.length} permits</p>
          </section>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Total Permits" value={totals.total} active={status === ALL} onClick={() => setStatus(ALL)} />
            <StatCard label="Active" value={totals.open} tone="text-green-700" active={status === 'open'} onClick={() => pickStatus('open')} />
            <StatCard label="Closed" value={totals.closed} active={status === 'closed'} onClick={() => pickStatus('closed')} />
            <StatCard label="Expired / Unclosed" value={totals.expired} tone="text-red-600" active={status === 'expired'} onClick={() => pickStatus('expired')} />
            <StatCard label="Draft" value={totals.draft} tone="text-amber-600" active={status === 'draft'} onClick={() => pickStatus('draft')} />
            <StatCard label="Incomplete" value={totals.draft} tone="text-amber-600" active={status === 'draft'} onClick={() => pickStatus('draft')} />
            <StatCard label="With Part B" value={totals.partB} tone="text-blue-700" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <BarList title="Permits by Type" rows={byType} />
            <BarList title="Permits by Zone / Quadrant" rows={byZone} />
          </div>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-600 p-4 pb-2">Permits by {ROLE_LABEL[role]}</h2>
            <table className="min-w-full text-xs text-left">
              <thead className="bg-gray-100 text-[10px] uppercase tracking-widest text-gray-600"><tr><th className="p-3">{ROLE_LABEL[role]}</th><th className="p-3">Permits</th><th className="p-3">Expired</th></tr></thead>
              <tbody>
                {byPerson.length === 0 && <tr><td colSpan={3} className="p-3 text-gray-400">No data</td></tr>}
                {byPerson.map(r => (
                  <tr key={r.key} className="border-t border-gray-100"><td className="p-3 font-semibold">{r.label}</td><td className="p-3">{r.count}</td><td className={`p-3 font-bold ${r.expired ? 'text-red-600' : ''}`}>{r.expired}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-600 p-4 pb-2">Longest Overdue Permits</h2>
            <table className="min-w-full text-xs text-left">
              <thead className="bg-gray-100 text-[10px] uppercase tracking-widest text-gray-600"><tr><th className="p-3">Ref</th><th className="p-3">Zone</th><th className="p-3">Receiver</th><th className="p-3">Receiver Email</th><th className="p-3">Days Overdue</th></tr></thead>
              <tbody>
                {overdue.length === 0 && <tr><td colSpan={5} className="p-3 text-gray-400">No expired permits</td></tr>}
                {overdue.map(({ n, days }) => (
                  <tr key={n.id} className="border-t border-gray-100 cursor-pointer hover:bg-blue-50" onClick={() => navigate(`/permit/${n.id}`)}>
                    <td className="p-3 font-bold">{n.ref}</td><td className="p-3">{n.normalizedZone}</td><td className="p-3">{nameOf(n.receiverEmail)}</td>
                    <td className="p-3 break-all">{n.receiverEmail ? <a href={`mailto:${n.receiverEmail}`} onClick={e => e.stopPropagation()} className="text-blue-700 underline">{n.receiverEmail}</a> : <span className="text-gray-400">No email on record</span>}</td>
                    <td className="p-3 font-bold text-red-600">{days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
};

export default MetricsDashboard;
