import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore'; 
import { db } from '../firebase'; 
import { RefreshCw, Loader2, Trash2, ShieldAlert, Filter, Columns, CheckSquare, Square, Search, X, CloudOff } from 'lucide-react'; 
import { getCurrentUserEmail, getCircuitBreakerRemainingTime } from '../services/cx';

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

const MASTER_SECURITY_PIN = "CX-Master-2026"; 

const ALL_COLUMNS = [
  { id: 'reference', label: 'Reference', alwaysVisible: true },
  { id: 'type', label: 'Permit Type', alwaysVisible: false },
  { id: 'location', label: 'Location', alwaysVisible: false },
  { id: 'status', label: 'Status', alwaysVisible: false },
  { id: 'engineer', label: 'Site Engineer', alwaysVisible: false },
  { id: 'receiver', label: 'Receiver', alwaysVisible: false },
  { id: 'issuer', label: 'Issuer', alwaysVisible: false },
  { id: 'approver', label: 'Approver', alwaysVisible: false },
  { id: 'action', label: 'Action', alwaysVisible: true }
];

export const Dashboard = () => {
  const navigate = useNavigate();
  const [savedPermits, setSavedPermits] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{id: string, num: string} | null>(null);
  const [securityPin, setSecurityPin] = useState('');
  const [pinError, setPinError] = useState('');

  const currentUser = getCurrentUserEmail().toLowerCase();
  const isSuperAdmin = currentUser.includes('dietrich') || currentUser.includes('eba-dt');

  const [selectedColumns, setSelectedColumns] = useState<string[]>(['reference', 'type', 'location', 'status', 'action']);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [cbTimeLeft, setCbTimeLeft] = useState(0);
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
      status: [], engineer: [], receiver: [], issuer: [], approver: []
  });

  const loadPermits = async () => {
    setIsSyncing(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'permits'));
      const permitsFromCloud: any[] = [];
      querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          permitsFromCloud.push({ id: docSnap.id, ...data });
      });

      permitsFromCloud.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSavedPermits(permitsFromCloud);
      localStorage.setItem('eba_permits_db_v3', JSON.stringify(permitsFromCloud));
    } catch (error) {
      const rawData = localStorage.getItem('eba_permits_db_v3');
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData);
          const arr = Array.isArray(parsed) ? parsed : Object.values(parsed);
          arr.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setSavedPermits(arr);
        } catch (parseErr) {}
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => { 
    loadPermits(); 
    const cbInterval = setInterval(() => {
      setCbTimeLeft(getCircuitBreakerRemainingTime());
    }, 1000);
    const interval = setInterval(loadPermits, 15000); 
    return () => {
        clearInterval(cbInterval);
        clearInterval(interval);
    };
  }, []);

  const handleCategoryClick = (code: string) => {
    // 🚀 LÓGICA DE ACCESO RESTRINGIDA SEGÚN PLANTILLAS DISPONIBLES
    if (['BG', 'BGP', 'BE'].includes(code)) {
      // Plantilla de Excavación (Breaking Ground)
      navigate('/new', { state: { permitType: code } });
    } else if (code === 'PUMP') {
      // Plantilla de Bombeo
      navigate('/new-pump', { state: { permitType: code } });
    } else {
      // El resto aún no tiene plantilla diseñada
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
      await deleteDoc(doc(db, 'permits', deleteTarget.id)); 
      setSavedPermits(prev => prev.filter(p => p.id !== deleteTarget.id)); 
      setDeleteTarget(null);
      alert(`✅ Permit PF#${deleteTarget.num} was securely and permanently deleted.`);
    } catch (error: any) {
      alert(`Error deleting permit: ${error.message}`);
    }
  };

  const filterOptions = useMemo(() => {
    return {
      status: ['DRAFT', 'ACTIVE', 'CLOSED'],
      engineer: Array.from(new Set(savedPermits.map(p => p.siteEngineerSignature?.name).filter(Boolean))),
      receiver: Array.from(new Set(savedPermits.map(p => p.receiverSignature?.name).filter(Boolean))),
      issuer: Array.from(new Set(savedPermits.map(p => p.issuerSignature?.name).filter(Boolean))),
      approver: Array.from(new Set(savedPermits.map(p => p.approverSignature?.name).filter(Boolean)))
    };
  }, [savedPermits]);

  const filteredPermits = savedPermits.filter(p => {
    const pStatus = p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT' : 'ACTIVE');
    
    if (columnFilters.status.length > 0 && !columnFilters.status.includes(pStatus)) return false;
    if (columnFilters.engineer.length > 0 && !columnFilters.engineer.includes(p.siteEngineerSignature?.name)) return false;
    if (columnFilters.receiver.length > 0 && !columnFilters.receiver.includes(p.receiverSignature?.name)) return false;
    if (columnFilters.issuer.length > 0 && !columnFilters.issuer.includes(p.issuerSignature?.name)) return false;
    if (columnFilters.approver.length > 0 && !columnFilters.approver.includes(p.approverSignature?.name)) return false;
    
    return true; 
  });

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

  const totalClosed = savedPermits.filter(p => p.status === 'closed').length;
  const totalDrafts = savedPermits.filter(p => p.isDraft).length;
  const totalActive = savedPermits.filter(p => !p.isDraft && p.status !== 'closed').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 relative">
      
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
              <button onClick={executeSecureDeletion} className="flex-1 py-3 bg-red-600 text-white font-black uppercase text-xs rounded-xl hover:bg-red-700 flex items-center justify-center gap-2"><Trash2 size={16}/> Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-8">
        
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
            <button onClick={loadPermits} disabled={isSyncing} className="flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-4 py-2 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
              {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
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
              
              <div className="relative">
                <button 
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm transition-colors"
                >
                    <Columns size={16} /> COLUMNS
                </button>

                {showColumnSelector && (
                  <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="bg-gray-50 p-3 border-b border-gray-200 font-bold text-xs uppercase tracking-wider text-gray-700">Select Columns</div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {ALL_COLUMNS.map(col => (
                        <label key={col.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${col.alwaysVisible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {selectedColumns.includes(col.id) ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-gray-400"/>}
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
                              <button 
                                onClick={() => setActiveFilterMenu(activeFilterMenu === col.id ? null : col.id)}
                                className={`p-1 rounded transition-colors ${isFilterActive ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-800 hover:bg-gray-200'}`}
                              >
                                <Filter size={14} className={isFilterActive ? 'fill-current' : ''} />
                              </button>
                            )}
                          </div>

                          {activeFilterMenu === col.id && (
                             <div className="absolute left-4 top-12 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden font-normal normal-case tracking-normal text-gray-900 animate-in fade-in slide-in-from-top-1">
                                <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                   <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><Search size={14}/> Filter {col.label}</div>
                                   <button onClick={() => setActiveFilterMenu(null)} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto p-1">
                                   {(filterOptions[col.id as keyof typeof filterOptions] as string[]).map((opt, idx) => (
                                      <label key={idx} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-blue-50 text-xs font-semibold">
                                        {columnFilters[col.id].includes(opt) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16} className="text-gray-300"/>}
                                        {opt}
                                        <input type="checkbox" className="hidden" checked={columnFilters[col.id].includes(opt)} onChange={() => toggleFilterOption(col.id, opt)} />
                                      </label>
                                    ))}
                                </div>
                                <div className="p-2 border-t border-gray-100 flex gap-2">
                                    <button onClick={() => clearFilter(col.id)} className="flex-1 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Clear</button>
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
                            <Search size={48} className='mx-auto mb-4 opacity-30 text-gray-300'/>
                            <p className='font-bold uppercase tracking-wider text-gray-500'>No results found</p>
                            <p className='text-xs mt-1'>Check your column filters.</p>
                        </td>
                    </tr>
                  ) : (
                    filteredPermits.map((p) => {
                      const pStatus = p.status === 'closed' ? 'CLOSED' : (p.isDraft ? 'DRAFT' : 'ACTIVE');
                      const permitTypeDisplay = p.permitType ? String(p.permitType).toUpperCase() : (p.excavationType ? String(p.excavationType).toUpperCase() : 'BG');

                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          
                          {selectedColumns.includes('reference') && (
                            <td className="p-4 font-black text-blue-700">{p.itwocxNumber || p.permitNumber || 'DRAFT'}</td>
                          )}
                          
                          {selectedColumns.includes('type') && (
                            <td className="p-4 font-bold text-gray-700">
                                <span className="px-2 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-md text-[10px] font-black uppercase tracking-wider">
                                    {permitTypeDisplay}
                                </span>
                            </td>
                          )}
                          
                          {selectedColumns.includes('location') && (
                            <td className="p-4 text-gray-600 font-medium">{p.location || '-'}</td>
                          )}
                          
                          {selectedColumns.includes('status') && (
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-center ${pStatus === 'CLOSED' ? 'bg-red-100 text-red-800' : (pStatus === 'DRAFT' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800')}`}>
                                  {pStatus}
                                </span>
                                
                                {p.syncStatus === 'pending' && (
                                  <span className="animate-pulse bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center gap-1 uppercase">
                                    <RefreshCw size={8} className="animate-spin" /> Sync Queue
                                  </span>
                                )}

                                {p.cxSyncError && (
                                  <div className="flex items-center gap-1 text-red-600" title={p.cxSyncError}>
                                    <CloudOff size={10} />
                                    <span className="text-[7px] font-bold uppercase truncate max-w-[80px]">Sync Error</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          )}

                          {selectedColumns.includes('engineer') && (
                            <td className="p-4 text-xs font-bold text-gray-600">{p.siteEngineerSignature?.name || '-'}</td>
                          )}

                          {selectedColumns.includes('receiver') && (
                            <td className="p-4 text-xs font-bold text-gray-600">{p.receiverSignature?.name || '-'}</td>
                          )}

                          {selectedColumns.includes('issuer') && (
                            <td className="p-4 text-xs font-bold text-gray-600">{p.issuerSignature?.name || '-'}</td>
                          )}

                          {selectedColumns.includes('approver') && (
                            <td className="p-4 text-xs font-bold text-gray-600">{p.approverSignature?.name || '-'}</td>
                          )}

                          {selectedColumns.includes('action') && (
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => navigate(permitTypeDisplay === 'PUMP' ? `/pump-permit/${p.id}` : `/permit/${p.id}`)} className="bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-black text-xs uppercase transition-colors">
                                  Open
                                </button>
                                {isSuperAdmin && (
                                  <button onClick={() => requestDeletion(p.id, p.itwocxNumber || 'DRAFT')} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-colors" title="Secure Delete">
                                    <Trash2 size={16} />
                                  </button>
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
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-2">Permit Action Center</h2>
          
          {/* 🚀 GRID CON LÓGICA DE BLOQUEO VISUAL PARA NO-DISPONIBLES */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {permitCategories.map((permit) => {
                // Solo BG, BGP, BE y PUMP están activos
                const isTemplateAvailable = ['BG', 'BGP', 'BE', 'PUMP'].includes(permit.code);
                
                return (
                  <div 
                    key={permit.code} 
                    onClick={() => handleCategoryClick(permit.code)}
                    className={`bg-white rounded-xl shadow-sm border ${permit.border} p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 
                      ${isTemplateAvailable 
                        ? 'hover:shadow-md hover:border-blue-500 hover:ring-1 hover:ring-blue-500' 
                        : 'opacity-60 grayscale-[0.5] hover:bg-gray-50'}`}
                  >
                    <span className={`text-2xl p-3 rounded-full mb-3 ${permit.color}`}>{permit.icon}</span>
                    <h3 className="font-bold text-gray-800 text-xs uppercase tracking-tight">{permit.name}</h3>
                    <div className='flex items-center gap-1 mt-1'>
                        <span className="text-[9px] font-black text-gray-400 uppercase">{permit.code}</span>
                        {!isTemplateAvailable && <span className='text-[8px] bg-gray-200 text-gray-500 px-1 rounded font-bold'>WIP</span>}
                    </div>
                  </div>
                );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};