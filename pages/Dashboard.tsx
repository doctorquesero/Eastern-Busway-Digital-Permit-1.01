import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocsFromServer, onSnapshot, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { RefreshCw, Loader2, Trash2, ShieldAlert, Filter, Columns, CheckSquare, Square, Search, X, CloudOff, Plus, ChevronRight, Download } from 'lucide-react';
import { getCurrentUserEmail, getCircuitBreakerRemainingTime } from '../services/cx';
import { getNamePartsFromEmail } from '../utils/userNames';
import { getAppMode, getTargetCollection } from '../utils/appMode';

// 🚀 DICCIONARIO OFICIAL ALINEADO CON iTwoCX
const permitCategories = [
  { code: 'BG', name: 'Breaking Ground', icon: '🚧', color: 'bg-orange-100 text-orange-800', border: 'border-orange-200' },
  { code: 'BGP', name: 'BG - Part B', icon: '🏗️', color: 'bg-amber-100 text-amber-800', border: 'border-amber-200' },
  { code: 'BE', name: 'Service Disconnect', icon: '🔌', color: 'bg-yellow-100 text-yellow-800', border: 'border-yellow-200' },
  { code: 'PUMP', name: 'Pump Permits', icon: '💧', color: 'bg-blue-100 text-blue-800', border: 'border-blue-200' },
  { code: 'HYDRO', name: 'Hydro Excavation', icon: '💦', color: 'bg-cyan-50 text-cyan-400', border: 'border-cyan-100' },
  { code: 'TES', name: 'Trench Safe Entry', icon: '⛏️', color: 'bg-emerald-50 text-emerald-400', border: 'border-emerald-100' },
  { code: 'HO', name: 'Hot Works', icon: '🔥', color: 'bg-red-50 text-red-400', border: 'border-red-100' },
  { code: 'OOH', name: 'Out of Hours', icon: '🌙', color: 'bg-indigo-50 text-indigo-400', border: 'border-indigo-100' },
  { code: 'PT', name: 'Permit to Test', icon: '🧪', color: 'bg-purple-50 text-purple-400', border: 'border-purple-100' },
  { code: 'CS', name: 'Confined Space', icon: '🕳️', color: 'bg-gray-50 text-gray-400', border: 'border-gray-100' },
  { code: 'ISO', name: 'Isolation Permits', icon: '🛑', color: 'bg-rose-50 text-rose-400', border: 'border-rose-100' },
  { code: 'WB', name: 'Workbox Permits', icon: '🏢', color: 'bg-slate-50 text-slate-400', border: 'border-slate-100' },
  { code: 'WH', name: 'Working at Heights', icon: '🧗', color: 'bg-sky-50 text-sky-400', border: 'border-sky-100' },
  { code: 'HP', name: 'High-Powered Saw', icon: '🪚', color: 'bg-teal-50 text-teal-400', border: 'border-teal-100' },
  { code: 'USW1', name: 'Utility Services L1', icon: '⚡', color: 'bg-fuchsia-50 text-fuchsia-400', border: 'border-fuchsia-100' },
  { code: 'USW2', name: 'Utility Services L2', icon: '⚡', color: 'bg-pink-50 text-pink-400', border: 'border-pink-100' },
];

interface DirectoryUser { email: string; fullName: string; roles: string[] }
const cleanEmail = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
};
const normName = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

const MASTER_SECURITY_PIN = "CX-Master-2026";
const COLUMN_FILTERS_STORAGE_KEY = 'eba_dashboard_column_filters';
const COLUMNS_STORAGE_KEY = 'eba_dashboard_columns';
const SEARCH_STORAGE_KEY = 'eba_dashboard_search';
const DEFAULT_COLUMNS = ['reference', 'type', 'location', 'status', 'action'];

const ALL_COLUMNS = [
  { id: 'reference', label: 'Reference', alwaysVisible: true },
  { id: 'type', label: 'Permit Type', alwaysVisible: false },
  { id: 'location', label: 'Location', alwaysVisible: false },
  { id: 'status', label: 'Status', alwaysVisible: false },
  { id: 'engineer', label: 'Site Engineer', alwaysVisible: false },
  { id: 'receiver', label: 'Receiver', alwaysVisible: false },
  { id: 'issuer', label: 'Issuer', alwaysVisible: false },
  { id: 'approver', label: 'Approver', alwaysVisible: false },
  { id: 'issuedDate', label: 'Permit Issued Date', alwaysVisible: false },
  { id: 'commencementDate', label: 'Commencement Date', alwaysVisible: false },
  { id: 'endDate', label: 'Expiry Date', alwaysVisible: false },
  { id: 'action', label: 'Action', alwaysVisible: true }
];

const formatDateCell = (value: unknown): string => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const [savedPermits, setSavedPermits] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // 🚀 NUEVO: Estado Reactivo para el Modo de la App
  const [appMode, setAppMode] = useState(getAppMode());

  const [deleteTarget, setDeleteTarget] = useState<{ id: string, num: string } | null>(null);
  const [securityPin, setSecurityPin] = useState('');
  const [pinError, setPinError] = useState('');

  const currentUser = getCurrentUserEmail().toLowerCase();
  const isSuperAdmin = currentUser.includes('dietrich') || currentUser.includes('eba-dt');

  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) || 'null');
      const valid = Array.isArray(cached) ? cached.filter((id: unknown) => ALL_COLUMNS.some(c => c.id === id)) : [];
      return valid.length > 0 ? valid : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem(SEARCH_STORAGE_KEY) || '');
  const [searchInput, setSearchInput] = useState(() => localStorage.getItem(SEARCH_STORAGE_KEY) || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [cbTimeLeft, setCbTimeLeft] = useState(0);
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const [showCreatePermit, setShowCreatePermit] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(() => {
    const defaults = { type: [], status: [], engineer: [], receiver: [], issuer: [], approver: [] };
    try {
      const cached = JSON.parse(localStorage.getItem(COLUMN_FILTERS_STORAGE_KEY) || '{}');
      return Object.keys(defaults).reduce((filters, key) => ({
        ...filters,
        [key]: Array.isArray(cached[key]) ? cached[key] : []
      }), defaults);
    } catch {
      return defaults;
    }
  });

  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);

  // Registered users managed in Settings (appSettings/global.roleAssignments).
  useEffect(() => {
    return onSnapshot(doc(db, 'appSettings', 'global'), snap => {
      const list: any[] = snap.exists() && Array.isArray(snap.data()?.roleAssignments) ? snap.data()!.roleAssignments : [];
      const byEmail = new Map<string, DirectoryUser>();
      list.forEach(u => {
        const email = cleanEmail(u?.email);
        if (!email) return;
        const fallback = getNamePartsFromEmail(email);
        const fullName = `${u.firstName || fallback.firstName || ''} ${u.lastName || fallback.lastName || ''}`.trim() || email;
        const raw = Array.isArray(u.roles) ? u.roles : String(u.roles || u.role || '').split(',');
        const roles = raw.map((r: unknown) => String(r).toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
        const prev = byEmail.get(email);
        byEmail.set(email, { email, fullName: prev?.fullName || fullName, roles: [...new Set([...(prev?.roles || []), ...roles])] });
      });
      setDirectoryUsers([...byEmail.values()]);
      setDirectoryLoaded(true);
    }, err => console.error('Failed to load user directory', err));
  }, []);

  useEffect(() => {
    const hasActiveFilters =  Object.values(columnFilters).some((values: string[]) => values.length > 0);
    if (hasActiveFilters) {
      localStorage.setItem(COLUMN_FILTERS_STORAGE_KEY, JSON.stringify(columnFilters));
    } else {
      localStorage.removeItem(COLUMN_FILTERS_STORAGE_KEY);
    }
  }, [columnFilters]);

  useEffect(() => {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(selectedColumns));
  }, [selectedColumns]);

  useEffect(() => {
    if (searchQuery) localStorage.setItem(SEARCH_STORAGE_KEY, searchQuery);
    else localStorage.removeItem(SEARCH_STORAGE_KEY);
  }, [searchQuery]);

  const sortByCreatedDesc = (arr: any[]) =>
    arr.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const applySnapshot = (querySnapshot: any) => {
    const permitsFromCloud: any[] = [];
    querySnapshot.forEach((docSnap: any) => {
      permitsFromCloud.push({ id: docSnap.id, ...docSnap.data() });
    });
    setSavedPermits(sortByCreatedDesc(permitsFromCloud));
  };

  // Manual refresh: always hits the server, never a local cache or a stale localStorage copy.
  const loadPermits = async () => {
    setIsSyncing(true);
    try {
      const q = query(collection(db, getTargetCollection()), where('env', '==', getAppMode()));
      applySnapshot(await getDocsFromServer(q));
    } catch (error) {
      console.error("Failed to fetch permits from server:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Drop the legacy cached permit list so it can never resurface as stale data.
    localStorage.removeItem('eba_permits_db_v3');

    setIsSyncing(true);
    const q = query(collection(db, getTargetCollection()), where('env', '==', appMode));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        applySnapshot(snapshot);
        setIsSyncing(false);
      },
      (error) => {
        console.error("Permit listener error:", error);
        setIsSyncing(false);
      }
    );
    return () => unsubscribe();
  }, [appMode]);

  useEffect(() => {
    const cbInterval = setInterval(() => {
      setCbTimeLeft(getCircuitBreakerRemainingTime());
    }, 1000);

    // 🚀 RADAR: Revisa el modo de la app cada medio segundo
    const modeRadar = setInterval(() => {
      setAppMode(getAppMode());
    }, 500);

    return () => {
      clearInterval(cbInterval);
      clearInterval(modeRadar);
    };
  }, []);

  const handleCategoryClick = (code: string) => {
    if (['BG', 'BGP', 'BE'].includes(code)) {
      navigate('/new', { state: { permitType: code } });
    } else if (code === 'PUMP') {
      navigate('/new-pump', { state: { permitType: code } });
    } else {
      navigate('/under-construction');
    }
  };

  const requestDeletion = (id: string, permitNum: string) => {
    setDeleteTarget({ id, num: permitNum });
    setSecurityPin('');
    setPinError('');
  };

  const executeSecureDeletion = async () => {
    if (securityPin !== MASTER_SECURITY_PIN) return setPinError('Invalid Security PIN. Access Denied.');
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, getTargetCollection(), deleteTarget.id));
      setSavedPermits(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      alert(`✅ Permit PF#${deleteTarget.num} was securely and permanently deleted.`);
    } catch (error: any) {
      alert(`Error deleting permit: ${error.message}`);
    }
  };

  const directoryByRole = useMemo(() => {
    const result: Record<'receiver' | 'issuer' | 'approver' | 'engineer', DirectoryUser[]> = { receiver: [], issuer: [], approver: [], engineer: [] };
    directoryUsers.forEach(u => {
      if (u.roles.includes('receiver')) result.receiver.push(u);
      if (u.roles.includes('issuer')) result.issuer.push(u);
      if (u.roles.includes('approver')) result.approver.push(u);
      if (u.roles.includes('siteengineer')) result.engineer.push(u);
    });
    return result;
  }, [directoryUsers]);

  const directoryEmails = useMemo(() => new Set(directoryUsers.map(u => u.email)), [directoryUsers]);

  // Email is the key. A typed name is only a fallback (issuer/approver signatures store no email) and must match exactly one registered user.
  const resolveDirectoryEmail = (email: unknown, typedName: unknown, candidates: DirectoryUser[] = directoryUsers): string => {
    const e = cleanEmail(email);
    if (e) return directoryEmails.has(e) ? e : '';
    const want = normName(typedName).split(' ').filter(Boolean);
    if (want.length === 0) return '';
    const matches = candidates.filter(u => {
      const tokens = normName(u.fullName).split(' ').filter(Boolean);
      return want.every(w => tokens.some(t => t.startsWith(w)));
    });
    return matches.length === 1 ? matches[0].email : '';
  };

  const permitPersonEmail = (p: any, role: 'receiver' | 'issuer' | 'approver' | 'engineer'): string => {
    const candidates = directoryByRole[role];
    if (role === 'engineer') return resolveDirectoryEmail(p.siteEngineerEmail || p.engineerEmail, p.siteEngineerSignature?.name, candidates);
    if (role === 'receiver') {
      const logs: any[] = Array.isArray(p.handoverLogs) ? p.handoverLogs : [];
      const last = logs.length ? logs[logs.length - 1] : null;
      return last
        ? resolveDirectoryEmail(last.receiverEmail, last.receiverName, candidates)
        : resolveDirectoryEmail(p.receiverEmail || (cleanEmail(p.receiver) ? p.receiver : ''), p.receiverSignature?.name || p.receiverName, candidates);
    }
    if (role === 'issuer') return resolveDirectoryEmail(p.issuerEmail, p.issuerSignature?.name, candidates);
    return resolveDirectoryEmail(p.approverEmail, p.approverSignature?.name, candidates);
  };

  const personLabel = (email: string) => directoryUsers.find(u => u.email === email)?.fullName || email;
  const filterLabel = (colId: string, value: string) => (colId === 'receiver' || colId === 'issuer' || colId === 'approver' || colId === 'engineer') ? personLabel(value) : value;

  const filterOptions = useMemo(() => {
    const byName = (users: DirectoryUser[]) => [...users].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => u.email);
    return {
      type: Array.from(new Set([...permitCategories.map(category => category.code), ...savedPermits.flatMap(p => [p.permitType, p.type, p.excavationType]).filter(Boolean).map(String).map(value => value.toUpperCase())])).sort(),
      status: ['DRAFT', 'ACTIVE', 'CLOSED'],
      engineer: byName(directoryByRole.engineer),
      receiver: byName(directoryByRole.receiver),
      issuer: byName(directoryByRole.issuer),
      approver: byName(directoryByRole.approver)
    };
  }, [savedPermits, directoryByRole]);

  // Drop persisted selections that are no longer registered users (e.g. legacy name strings).
  useEffect(() => {
    if (!directoryLoaded) return;
    setColumnFilters(prev => {
      let changed = false;
      const next = { ...prev };
      (['receiver', 'issuer', 'approver', 'engineer'] as const).forEach(key => {
        const valid = new Set(filterOptions[key]);
        const kept = (prev[key] || []).filter(v => valid.has(v));
        if (kept.length !== (prev[key] || []).length) { next[key] = kept; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [directoryLoaded, filterOptions]);

  const filteredPermits = savedPermits.filter(p => !!p).filter(p => {
    const sanitize = (value: any) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const safeSearch = sanitize(searchQuery);
    const matchesSearch = !safeSearch || [
      p.permitNumber,
      p.itwocxNumber,
      p.id,
      p.docCode,
      p.location,
      p.description,
      p.contractor
    ].some(value => sanitize(value).includes(safeSearch));

    if (!matchesSearch) return false;

    const permitType = String(p.permitType || p.type || p.excavationType || 'BG').toUpperCase();
    const pStatus = p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT' : 'ACTIVE');

    if ((columnFilters.type || []).length > 0 && !columnFilters.type.includes(permitType)) return false;
    if ((columnFilters.status || []).length > 0 && !columnFilters.status.includes(pStatus)) return false;
    if ((columnFilters.engineer || []).length > 0 && !columnFilters.engineer.includes(permitPersonEmail(p, 'engineer'))) return false;
    if ((columnFilters.receiver || []).length > 0 && !columnFilters.receiver.includes(permitPersonEmail(p, 'receiver'))) return false;
    if ((columnFilters.issuer || []).length > 0 && !columnFilters.issuer.includes(permitPersonEmail(p, 'issuer'))) return false;
    if ((columnFilters.approver || []).length > 0 && !columnFilters.approver.includes(permitPersonEmail(p, 'approver'))) return false;

    return true;
  }).sort((a, b) => {
    const getPermitNumber = (permit: any) => Number.parseInt(String(permit.itwocxNumber || permit.permitNumber || '').replace(/\D/g, ''), 10) || 0;
    return getPermitNumber(b) - getPermitNumber(a);
  });

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredPermits.length / pageSize));
  const visiblePermits = filteredPermits.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, columnFilters]);

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const toggleColumn = (colId: string) => {
    if (ALL_COLUMNS.find(c => c.id === colId)?.alwaysVisible) return;
    setSelectedColumns(prev => prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]);
  };

  const toggleFilterOption = (colId: string, value: string) => {
    setColumnFilters(prev => {
      const current = prev[colId] || [];
      return {
        ...prev,
        [colId]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      };
    });
  };

  const clearFilter = (colId: string) => {
    setColumnFilters(prev => ({ ...prev, [colId]: [] }));
    setActiveFilterMenu(null);
  };

  const clearAllFilters = () => {
    const emptyFilters = Object.keys(columnFilters).reduce((filters, key) => ({ ...filters, [key]: [] }), {} as Record<string, string[]>);
    setSearchQuery('');
    setSearchInput('');
    setColumnFilters(emptyFilters);
    localStorage.removeItem(COLUMN_FILTERS_STORAGE_KEY);
    localStorage.removeItem(SEARCH_STORAGE_KEY);
    localStorage.removeItem(COLUMNS_STORAGE_KEY);
    setSelectedColumns(DEFAULT_COLUMNS);
    setCurrentPage(1);
    setActiveFilterMenu(null);
  };

  const submitSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const exportToExcel = async () => {
    if (filteredPermits.length === 0) return alert('No permits to export.');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Permits');
      sheet.columns = [
        { header: 'Reference', key: 'reference', width: 16 },
        { header: 'Permit Type', key: 'type', width: 14 },
        { header: 'Location', key: 'location', width: 36 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Site Engineer', key: 'engineer', width: 24 },
        { header: 'Receiver', key: 'receiver', width: 24 },
        { header: 'Issuer', key: 'issuer', width: 24 },
        { header: 'Approver', key: 'approver', width: 24 }
      ];
      sheet.getRow(1).font = { bold: true };
      filteredPermits.forEach(p => {
        sheet.addRow({
          reference: p.itwocxNumber || p.permitNumber || 'DRAFT',
          type: String(p.permitType || p.excavationType || 'BG').toUpperCase(),
          location: p.location || '',
          status: p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT' : 'ACTIVE'),
          engineer: p.siteEngineerSignature?.name || '',
          receiver: p.receiverSignature?.name || '',
          issuer: p.issuerSignature?.name || '',
          approver: p.approverSignature?.name || ''
        });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `permits-.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Excel export failed: `);
    }
  };

  const totalClosed = filteredPermits.filter(p => String(p.status ?? '') === 'closed').length;
  const totalDrafts = filteredPermits.filter(p => p.isDraft).length;
  const totalActive = filteredPermits.filter(p => !p.isDraft && String(p.status ?? '') !== 'closed').length;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden box-border bg-gray-50 p-4 sm:p-6 relative">

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border-t-4 border-red-600 p-6">
            <h3 className="text-xl font-black text-red-700 mb-2 flex items-center gap-2 uppercase tracking-tighter">
              <ShieldAlert size={24} /> Master Override
            </h3>
            <p className="text-sm text-gray-600 mb-6 font-medium">You are about to permanently delete <strong>PF#{deleteTarget.num}</strong>. Enter PIN to verify.</p>
            <input type="password" value={securityPin} onChange={e => { setSecurityPin(e.target.value); setPinError(''); }} placeholder="Enter PIN..." className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 mb-2 focus:border-red-500 text-center tracking-[0.5em] font-black outline-none" />
            <div className="h-6 mb-4">{pinError && <p className="text-red-600 text-xs font-bold text-center">{pinError}</p>}</div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-black uppercase text-xs rounded-xl hover:bg-gray-200">Cancel</button>
              <button onClick={executeSecureDeletion} className="flex-1 py-3 bg-red-600 text-white font-black uppercase text-xs rounded-xl hover:bg-red-700 flex items-center justify-center gap-2"><Trash2 size={16} /> Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-full min-w-0 xl:max-w-[1400px] mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Permits Dashboard</h1>
            <p className="text-gray-500 mt-1">Safety Intelligence & Permit Overview</p>
          </div>
          <div className="flex items-center gap-4">
            {cbTimeLeft > 0 && (
              <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm border border-red-300 animate-pulse">
                <ShieldAlert size={16} />
                <span>Sync Paused: Rate Limit Protection ({cbTimeLeft}s)</span>
              </div>
            )}
            <button onClick={() => setShowCreatePermit(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200">
              <Plus size={16} /> Add Permit
            </button>
            <button onClick={exportToExcel} className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 shadow-sm transition-colors hover:bg-green-100">
              <Download size={16} /> <span className="hidden sm:inline">Export Excel</span>
            </button>
            <button onClick={loadPermits} disabled={isSyncing} className="flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-4 py-2 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
              {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Refresh Cloud'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Drafts (Pending)</span>
            <span className="text-4xl font-extrabold text-orange-500 mt-2">{totalDrafts}</span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active in Field</span>
            <span className="text-4xl font-extrabold text-brand-600 mt-2">{totalActive}</span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Closed / Finalized</span>
            <span className="text-4xl font-extrabold text-green-600 mt-2">{totalClosed}</span>
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b pb-2 relative">
            <h2 className="text-2xl font-bold text-gray-900">Cloud Synced Permits</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <form onSubmit={submitSearch} className="flex items-center gap-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search permit #..."
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    className="w-full sm:w-48 focus:sm:w-64 pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:border-blue-500 shadow-sm transition-all"
                  />
                  {(searchInput || searchQuery) && (
                    <button type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors">
                  <Search size={16} /> Search
                </button>
              </form>
              <button onClick={clearAllFilters} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 shadow-sm transition-colors">
                <X size={16} /> Clear All Filters
              </button>
              <div className="relative">
                <button onClick={() => setShowColumnSelector(!showColumnSelector)} className="flex items-center gap-2 px-4 py-2 min-w-[130px] shrink-0 whitespace-nowrap justify-center rounded-lg text-sm font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm transition-colors">
                  <Columns size={16} className="shrink-0" /> COLUMNS
                </button>
                {showColumnSelector && (
                  <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="bg-gray-50 p-3 border-b border-gray-200 font-bold text-xs uppercase tracking-wider text-gray-700">Select Columns</div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {ALL_COLUMNS.map(col => (
                        <label key={col.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${col.alwaysVisible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {selectedColumns.includes(col.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-gray-400" />}
                          <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                          <input type="checkbox" className="hidden" disabled={col.alwaysVisible} checked={selectedColumns.includes(col.id)} onChange={() => toggleColumn(col.id)} />
                        </label>
                      ))}
                    </div>
                    <div className="p-2 border-t border-gray-200"><button onClick={() => setShowColumnSelector(false)} className="w-full py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700">Done</button></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[400px]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-700 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200">
                  <tr>
                    {ALL_COLUMNS.filter(c => selectedColumns.includes(c.id)).map(col => {
                      const hasFilter = filterOptions[col.id as keyof typeof filterOptions] !== undefined;
                      const isFilterActive = hasFilter && columnFilters[col.id].length > 0;
                      return (
                        <th key={col.id} className="p-4 relative group">
                          <div className="flex items-center gap-2">
                            {col.label}
                            {hasFilter && (
                              <button onClick={() => setActiveFilterMenu(activeFilterMenu === col.id ? null : col.id)} className={`p-1 rounded transition-colors ${isFilterActive ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-800 hover:bg-gray-200'}`}>
                                <Filter size={14} className={isFilterActive ? 'fill-current' : ''} />
                              </button>
                            )}
                          </div>
                          {activeFilterMenu === col.id && (
                            <div className="absolute left-4 top-12 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden font-normal normal-case tracking-normal text-gray-900 animate-in fade-in slide-in-from-top-1">
                              <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><Search size={14} /> Filter {col.label}</div>
                                <button onClick={() => setActiveFilterMenu(null)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                              </div>
                              <div className="max-h-48 overflow-y-auto p-1">
                                {(filterOptions[col.id as keyof typeof filterOptions] as string[]).map((opt, idx) => (
                                  <label key={idx} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-blue-50 text-xs font-semibold">
                                    {columnFilters[col.id].includes(opt) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-gray-300" />}
                                    {filterLabel(col.id, opt)}
                                    <input type="checkbox" className="hidden" checked={columnFilters[col.id].includes(opt)} onChange={() => toggleFilterOption(col.id, opt)} />
                                  </label>
                                ))}
                              </div>
                              <div className="p-2 border-t border-gray-100 flex gap-2">
                                <button onClick={() => clearFilter(col.id)} className="flex-1 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Clear Filter</button>
                                <button onClick={() => setActiveFilterMenu(null)} className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700">Apply</button>
                              </div>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPermits.length === 0 ? (
                    <tr>
                      <td colSpan={selectedColumns.length} className="p-12 text-center text-gray-400">
                        <Search size={48} className='mx-auto mb-4 opacity-30 text-gray-300' />
                        <p className='font-bold uppercase tracking-wider text-gray-500'>No results found</p>
                        <p className='text-xs mt-1'>Switch mode or check filters.</p>
                      </td>
                    </tr>
                  ) : (
                    visiblePermits.map((p) => {
                      const pStatus = p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT' : 'ACTIVE');
                      const permitTypeDisplay = p.permitType ? String(p.permitType).toUpperCase() : (p.excavationType ? String(p.excavationType).toUpperCase() : 'BG');
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          {selectedColumns.includes('reference') && (
                            <td className="p-4">
                              <button
                                onClick={() => navigate(permitTypeDisplay === 'PUMP' ? `/pump-permit/${p.id}` : `/permit/${p.id}`)}
                                className="font-black text-blue-700 hover:text-blue-900 hover:underline cursor-pointer transition-colors text-left"
                              >
                                {p.itwocxNumber || p.permitNumber || 'DRAFT'}
                              </button>
                            </td>
                          )}
                          {selectedColumns.includes('type') && <td className="p-4 font-bold text-gray-700"><span className="px-2 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-md text-[10px] font-black uppercase tracking-wider">{permitTypeDisplay}</span></td>}
                          {selectedColumns.includes('location') && <td className="p-4 text-gray-600 font-medium">{p.location || '-'}</td>}
                          {selectedColumns.includes('status') && (
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-center ${pStatus === 'CLOSED' ? 'bg-red-100 text-red-800' : (pStatus === 'DRAFT' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800')}`}>{pStatus}</span>
                                {p.syncStatus === 'pending' && <span className="animate-pulse bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center gap-1 uppercase"><RefreshCw size={8} className="animate-spin" /> Sync Queue</span>}
                                {p.cxSyncError && p.syncStatus !== 'pending' && <div className="flex items-center gap-1 text-red-600" title={p.cxSyncError}><CloudOff size={10} /><span className="text-[7px] font-bold uppercase truncate max-w-[80px]">Sync Error</span></div>}
                              </div>
                            </td>
                          )}
                          {selectedColumns.includes('engineer') && <td className="p-4 text-xs font-bold text-gray-600">{p.siteEngineerSignature?.name || '-'}</td>}
                          {selectedColumns.includes('receiver') && <td className="p-4 text-xs font-bold text-gray-600">{p.receiverSignature?.name || '-'}</td>}
                          {selectedColumns.includes('issuer') && <td className="p-4 text-xs font-bold text-gray-600">{p.issuerSignature?.name || '-'}</td>}
                          {selectedColumns.includes('approver') && <td className="p-4 text-xs font-bold text-gray-600">{p.approverSignature?.name || '-'}</td>}
                          {selectedColumns.includes('issuedDate') && <td className="p-4 text-xs font-bold text-gray-600 whitespace-nowrap">{formatDateCell(p.issuedDate)}</td>}
                          {selectedColumns.includes('commencementDate') && <td className="p-4 text-xs font-bold text-gray-600 whitespace-nowrap">{formatDateCell(p.commencementDate)}</td>}
                          {selectedColumns.includes('endDate') && <td className="p-4 text-xs font-bold text-gray-600 whitespace-nowrap">{formatDateCell(p.endDate)}</td>}
                          {selectedColumns.includes('action') && (
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => navigate(permitTypeDisplay === 'PUMP' ? `/pump-permit/${p.id}` : `/permit/${p.id}`)} className="bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-black text-xs uppercase transition-colors">Open</button>
                                {isSuperAdmin && (
                                  <button onClick={() => requestDeletion(p.id, p.itwocxNumber || 'DRAFT')} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-colors" title="Secure Delete"><Trash2 size={16} /></button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredPermits.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
                <span className="text-xs font-bold text-gray-500">
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredPermits.length)} of {filteredPermits.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Previous</button>
                  <span className="text-xs font-black text-gray-700">Page {currentPage} of {totalPages}</span>
                  <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showCreatePermit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-permit-title">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-5">
                <div>
                  <h2 id="create-permit-title" className="text-xl font-black uppercase tracking-tight text-gray-900">Add Permit</h2>
                  <p className="mt-1 text-sm text-gray-500">Choose a permit type to begin.</p>
                </div>
                <button onClick={() => setShowCreatePermit(false)} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900" aria-label="Close create permit menu">
                  <X size={20} />
                </button>
              </div>
              <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
                {permitCategories.map((permit) => {
                  const isActive = permit.code === 'BG' || permit.code === 'PUMP';
                  return (
                    <button
                      key={permit.code}
                      type="button"
                      onClick={() => isActive && handleCategoryClick(permit.code)}
                      aria-disabled={!isActive}
                      title={isActive ? permit.name : 'In Construction'}
                      className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${isActive ? 'border-blue-200 bg-white text-gray-900 shadow-sm hover:border-blue-500 hover:bg-blue-50 hover:shadow-md' : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-70 hover:border-amber-300'}`}
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${isActive ? permit.color : 'bg-gray-200 text-gray-400 grayscale'}`}>{permit.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black uppercase tracking-tight">{permit.name}</span>
                        <span className="mt-1 flex items-center gap-2 text-[9px] font-black uppercase text-gray-400">
                          {permit.code}
                          {!isActive && <span className="rounded bg-gray-300 px-1.5 py-0.5 text-[8px] text-gray-600">In Construction</span>}
                          {isActive && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[8px] text-green-700">Available</span>}
                        </span>
                      </span>
                      {isActive && <ChevronRight size={18} className="shrink-0 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
