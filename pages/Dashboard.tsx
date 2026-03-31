import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore'; 
import { db } from '../firebase'; 
import { RefreshCw, Loader2, Trash2, ShieldAlert, Filter, X, ChevronDown } from 'lucide-react'; 
import { getCurrentUserEmail } from '../services/cx';

const permitCategories = [
  { code: 'EX', name: 'Breaking Ground Permits', icon: '🚧', color: 'bg-orange-100 text-orange-800', border: 'border-orange-200' },
  { code: 'HW', name: 'Hot Works Permits', icon: '🔥', color: 'bg-red-100 text-red-800', border: 'border-red-200' },
  { code: 'PU', name: 'Pump Permits', icon: '💧', color: 'bg-blue-100 text-blue-800', border: 'border-blue-200' },
  { code: 'OOH', name: 'Out of Hours Permits', icon: '🌙', color: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-200' },
  { code: 'PT', name: 'Permit to Test', icon: '🧪', color: 'bg-purple-100 text-purple-800', border: 'border-purple-200' },
  { code: 'CS', name: 'Confined Space Permits', icon: '🕳️', color: 'bg-gray-100 text-gray-800', border: 'border-gray-200' },
  { code: 'IS', name: 'Isolation Permits', icon: '🔌', color: 'bg-yellow-100 text-yellow-800', border: 'border-yellow-200' },
  { code: 'WB', name: 'Workbox Permits', icon: '🏗️', color: 'bg-cyan-100 text-cyan-800', border: 'border-cyan-200' },
  { code: 'WH', name: 'Working at Heights Permits', icon: '🧗', color: 'bg-sky-100 text-sky-800', border: 'border-sky-200' },
  { code: 'TE', name: 'Trench Excavation Safe Entry', icon: '⛏️', color: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200' },
];

const MASTER_SECURITY_PIN = "CX-Master-2026"; 

export const Dashboard = () => {
  const navigate = useNavigate();
  const [savedPermits, setSavedPermits] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{id: string, num: string} | null>(null);
  const [securityPin, setSecurityPin] = useState('');
  const [pinError, setPinError] = useState('');

  // 🚀 ESTADOS DEL FILTRO AVANZADO
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    engineer: 'all',
    receiver: 'all',
    issuer: 'all',
    approver: 'all'
  });

  const currentUser = getCurrentUserEmail().toLowerCase();
  const isSuperAdmin = currentUser.includes('dietrich') || currentUser.includes('eba-dt');

  const loadPermits = async () => {
    setIsSyncing(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'permits'));
      const permitsFromCloud: any[] = [];
      
      querySnapshot.forEach((doc) => {
        permitsFromCloud.push(doc.data());
      });

      if (permitsFromCloud.length > 0) {
        localStorage.setItem('eba_permits_db_v3', JSON.stringify(permitsFromCloud));
      }

      permitsFromCloud.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSavedPermits(permitsFromCloud);
    } catch (error) {
      console.error("Error fetching from Firebase:", error);
      const rawData = localStorage.getItem('eba_permits_db_v3');
      if (rawData) {
        const parsed = JSON.parse(rawData);
        const arr = Array.isArray(parsed) ? parsed : Object.values(parsed);
        arr.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setSavedPermits(arr);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadPermits();
  }, []);

  const handleCategoryClick = (code: string) => {
    if (code === 'EX') navigate('/new');
    else navigate('/under-construction');
  };

  const requestDeletion = (id: string, permitNum: string) => {
    setDeleteTarget({ id, num: permitNum });
    setSecurityPin('');
    setPinError('');
  };

  const executeSecureDeletion = async () => {
    if (securityPin !== MASTER_SECURITY_PIN) {
      setPinError('Invalid Security PIN. Access Denied.');
      return;
    }
    if (!deleteTarget) return;

    try {
      await deleteDoc(doc(db, 'permits', deleteTarget.id)); 
      setSavedPermits(prev => prev.filter(p => p.id !== deleteTarget.id)); 
      setDeleteTarget(null);
      alert(`✅ Permit PF#${deleteTarget.num} was securely and permanently deleted.`);
    } catch (error: any) {
      alert(`Error deleting permit: ${error.message}`);
    }
  };

  // 🚀 EXTRACCIÓN DINÁMICA DE NOMBRES PARA LOS FILTROS
  const uniqueEngineers = useMemo(() => Array.from(new Set(savedPermits.map(p => p.siteEngineerSignature?.name).filter(Boolean))), [savedPermits]);
  const uniqueReceivers = useMemo(() => Array.from(new Set(savedPermits.map(p => p.receiverSignature?.name).filter(Boolean))), [savedPermits]);
  const uniqueIssuers = useMemo(() => Array.from(new Set(savedPermits.map(p => p.issuerSignature?.name).filter(Boolean))), [savedPermits]);
  const uniqueApprovers = useMemo(() => Array.from(new Set(savedPermits.map(p => p.approverSignature?.name).filter(Boolean))), [savedPermits]);

  // 🚀 LÓGICA DE FILTRADO MULTICRITERIO
  const filteredPermits = savedPermits.filter(p => {
    // 1. Filtro de Estado
    if (filters.status === 'draft' && !p.isDraft) return false;
    if (filters.status === 'active' && (p.isDraft || p.status === 'closed')) return false;
    if (filters.status === 'closed' && p.status !== 'closed') return false;

    // 2. Filtros de Roles
    if (filters.engineer !== 'all' && p.siteEngineerSignature?.name !== filters.engineer) return false;
    if (filters.receiver !== 'all' && p.receiverSignature?.name !== filters.receiver) return false;
    if (filters.issuer !== 'all' && p.issuerSignature?.name !== filters.issuer) return false;
    if (filters.approver !== 'all' && p.approverSignature?.name !== filters.approver) return false;

    return true; 
  });

  const resetFilters = () => {
    setFilters({ status: 'all', engineer: 'all', receiver: 'all', issuer: 'all', approver: 'all' });
  };

  const totalClosed = savedPermits.filter(p => p.status === 'closed').length;
  const totalDrafts = savedPermits.filter(p => p.isDraft).length;
  const totalActive = savedPermits.filter(p => !p.isDraft && p.status !== 'closed').length;
  
  const activeFilterCount = Object.values(filters).filter(val => val !== 'all').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 relative">
      
      {/* MODAL DE SEGURIDAD (BÓVEDA) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border-t-4 border-red-600 p-6">
            <h3 className="text-xl font-black text-red-700 mb-2 flex items-center gap-2 uppercase tracking-tighter">
              <ShieldAlert size={24} /> Master Override
            </h3>
            <p className="text-sm text-gray-600 mb-6 font-medium">
              You are about to permanently delete <strong>PF#{deleteTarget.num}</strong> from the cloud database. Enter the Master PIN to verify your identity.
            </p>
            
            <input
              type="password"
              value={securityPin}
              onChange={e => { setSecurityPin(e.target.value); setPinError(''); }}
              placeholder="Enter PIN / Password..."
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 mb-2 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all text-center tracking-[0.5em] font-black"
            />
            
            <div className="h-6 mb-4">
              {pinError && <p className="text-red-600 text-xs font-bold text-center">{pinError}</p>}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-black uppercase text-xs rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={executeSecureDeletion} className="flex-1 py-3 bg-red-600 text-white font-black uppercase text-xs rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/30 flex items-center justify-center gap-2">
                <Trash2 size={16}/> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Permits Dashboard</h1>
            <p className="text-gray-500 mt-1">Safety Intelligence & Permit Overview</p>
          </div>
          <button 
            onClick={loadPermits} 
            disabled={isSyncing}
            className="flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-4 py-2 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all"
          >
            {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Refresh Cloud'}</span>
          </button>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b pb-2">
              <h2 className="text-2xl font-bold text-gray-900">Cloud Synced Permits</h2>
              
              {/* BOTÓN TOGGLE FILTROS */}
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${activeFilterCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                  <Filter size={16} />
                  Advanced Filters {activeFilterCount > 0 && <span className="bg-blue-600 text-white rounded-full px-2 py-0.5 text-xs">{activeFilterCount}</span>}
                  <ChevronDown size={16} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>
          </div>

          {/* 🚀 PANEL DE FILTROS AVANZADOS (Desplegable) */}
          {isFilterOpen && (
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 mb-6 animate-in slide-in-from-top-4 fade-in duration-200">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-black text-gray-800 uppercase tracking-wider text-sm flex items-center gap-2"><Filter size={16}/> Filter Criteria</h3>
                      {activeFilterCount > 0 && (
                          <button onClick={resetFilters} className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1">
                              <X size={14}/> Clear All
                          </button>
                      )}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {/* Filter: Status */}
                      <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Project Status</label>
                          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="all">All Statuses</option>
                              <option value="active">Active (Issued)</option>
                              <option value="draft">Drafts</option>
                              <option value="closed">Closed</option>
                          </select>
                      </div>
                      
                      {/* Filter: Engineer */}
                      <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Site Engineer</label>
                          <select value={filters.engineer} onChange={e => setFilters({...filters, engineer: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="all">All Engineers</option>
                              {uniqueEngineers.map((name, i) => <option key={i} value={name as string}>{name as string}</option>)}
                          </select>
                      </div>

                      {/* Filter: Receiver */}
                      <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Permit Receiver</label>
                          <select value={filters.receiver} onChange={e => setFilters({...filters, receiver: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="all">All Receivers</option>
                              {uniqueReceivers.map((name, i) => <option key={i} value={name as string}>{name as string}</option>)}
                          </select>
                      </div>

                      {/* Filter: Issuer */}
                      <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Permit Issuer</label>
                          <select value={filters.issuer} onChange={e => setFilters({...filters, issuer: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="all">All Issuers</option>
                              {uniqueIssuers.map((name, i) => <option key={i} value={name as string}>{name as string}</option>)}
                          </select>
                      </div>

                      {/* Filter: Approver */}
                      <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Permit Approver</label>
                          <select value={filters.approver} onChange={e => setFilters({...filters, approver: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="all">All Approvers</option>
                              {uniqueApprovers.map((name, i) => <option key={i} value={name as string}>{name as string}</option>)}
                          </select>
                      </div>
                  </div>
              </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-700 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200">
                  <tr>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Location</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPermits.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="p-12 text-center text-gray-400">
                            <Filter size={48} className='mx-auto mb-4 opacity-30 text-gray-300'/>
                            <p className='font-bold uppercase tracking-wider text-gray-500'>No permits match your filters</p>
                            <p className='text-xs mt-1'>Try clearing some filters to see more results.</p>
                            {activeFilterCount > 0 && (
                                <button onClick={resetFilters} className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-xs uppercase transition-colors">
                                    Clear Filters
                                </button>
                            )}
                        </td>
                    </tr>
                  ) : (
                    filteredPermits.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-black text-blue-700">{p.itwocxNumber ? `PF#${p.itwocxNumber.replace(/\D/g, "")}` : 'DRAFT'}</td>
                        <td className="p-4 font-bold text-gray-700">{p.excavationType ? String(p.excavationType).toUpperCase() : 'UNKNOWN'}</td>
                        <td className="p-4 text-gray-600 font-medium">{p.location || 'No location'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${p.status === 'closed' ? 'bg-red-100 text-red-800' : (p.isDraft ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800')}`}>
                            {p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT (Building)' : 'ACTIVE')}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => navigate(`/permit/${p.id}`)} className="bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-black text-xs uppercase transition-colors">
                              Open
                            </button>
                            
                            {isSuperAdmin && (
                              <button onClick={() => requestDeletion(p.id, p.itwocxNumber || 'DRAFT')} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-colors" title="Secure Delete">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-2">Permit Action Center</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {permitCategories.map((permit) => {
              const isActive = permit.code === 'EX';
              return (
                <div 
                  key={permit.code} 
                  onClick={() => handleCategoryClick(permit.code)}
                  className={`bg-white rounded-xl shadow-sm border ${permit.border} p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-500 hover:ring-1 hover:ring-blue-500`}
                >
                  <span className={`text-4xl p-4 rounded-full mb-4 ${permit.color}`}>{permit.icon}</span>
                  <h3 className="font-bold text-gray-800 text-lg">{permit.name}</h3>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};