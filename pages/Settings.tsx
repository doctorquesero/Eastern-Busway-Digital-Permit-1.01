// ARCHIVO: src/pages/Settings.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Shield, Users, Building, Plus, Trash2, Loader2, Activity, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { getCurrentUserEmail } from '../services/cx';
import { ModeToggle } from '../components/ModeToggle'; 
import { AutoSyncToggle } from '../components/AutoSyncToggle';
import { getTargetCollection } from '../utils/appMode';

interface AppSettings {
  companyName: string;
  projectCode: string;
  roleAssignments: { email: string; role: string }[];
}

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Eastern Busway Alliance',
  projectCode: 'EB-DEMO',
  roleAssignments: [
    { email: 'dietrich.truchsess@easternbusway.nz', role: 'Master' }
  ]
};

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [failedPermits, setFailedPermits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('Receiver');
  
  // 🛡️ ESTADO ANTI-SPAM PARA iTwoCX
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // Seguridad: Expulsar si no es Master
  const currentUser = getCurrentUserEmail().toLowerCase();
  const isMaster = currentUser.includes('master') || currentUser.includes('dietrich') || currentUser.includes('eba-dt');

  useEffect(() => {
    loadSettings();

    // 🚀 RADAR RED BARREDERA: Atrapa CUALQUIER tipo de error de CX
    const unsubscribe = onSnapshot(collection(db, getTargetCollection()), (snapshot) => {
      const failedList: any[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        const hasFailedStatus = data.sync_status === 'failed' || data.syncStatus === 'failed';
        const hasErrorMsg = !!data.cxSyncError || !!data.sync_error;
        
        if (hasFailedStatus || hasErrorMsg) {
          failedList.push({ id: d.id, ...data });
        }
      });
      // Ordenamos para que los más nuevos (los números más altos) salgan arriba
      failedList.sort((a, b) => {
        const numA = parseInt(String(a.itwocxNumber || '0').replace(/\D/g, ''));
        const numB = parseInt(String(b.itwocxNumber || '0').replace(/\D/g, ''));
        return numB - numA;
      });
      setFailedPermits(failedList);
    });

    return () => unsubscribe();
  }, [isMaster, navigate]);

  const loadSettings = async () => {
    try {
      const docRef = doc(db, 'appSettings', 'global');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      } else {
        await setDoc(docRef, DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'appSettings', 'global'), settings);
      alert("✅ Global settings saved successfully!");
    } catch (error: any) {
      alert(`Error saving settings: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 🚀 FUNCIÓN DE REINTENTO BLINDADA (ANTI-BANEOS DE iTwoCX)
  const handleRetrySync = async (permitId: string) => {
    if (retryingIds.has(permitId)) return; // Previene doble clic

    // Bloqueamos el botón
    setRetryingIds(prev => new Set(prev).add(permitId));

    try {
      await updateDoc(doc(db, getTargetCollection(), permitId), {
        sync_status: 'pending',
        syncStatus: 'pending',
        updatedAt: serverTimestamp()
      });
      // Mensaje silencioso en consola para no molestar tanto en pantalla
      console.log(`[Re-Sync] Triggered for ${permitId}. Background worker starting...`);
    } catch (error: any) {
      alert("Error forzando el reintento: " + error.message);
    } finally {
      // Mantenemos el botón bloqueado por 15 segundos exactos para evitar Rate-Limiting
      setTimeout(() => {
        setRetryingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(permitId);
          return newSet;
        });
      }, 15000);
    }
  };

  const handleAddUser = () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      alert("Please enter a valid email address.");
      return;
    }
    if (settings.roleAssignments.some(u => u.email.toLowerCase() === newEmail.toLowerCase())) {
      alert("This user already has an assigned role.");
      return;
    }
    setSettings({
      ...settings,
      roleAssignments: [...settings.roleAssignments, { email: newEmail.toLowerCase(), role: newRole }]
    });
    setNewEmail('');
  };

  const handleRemoveUser = (emailToRemove: string) => {
    if (emailToRemove.includes('dietrich')) {
      alert("Safety Lock: You cannot remove the primary Master account.");
      return;
    }
    setSettings({
      ...settings,
      roleAssignments: settings.roleAssignments.filter(u => u.email !== emailToRemove)
    });
  };

  const handleGarbageCleanup = async () => {
    if (!window.confirm("WARNING: This will permanently delete all malformed and unsupported permits from the database. Proceed?")) return;
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, getTargetCollection()));
      let deletedCount = 0;
      for (const d of snapshot.docs) {
        const data = d.data();
        const pType = (data.permitType || "").toUpperCase();
        if (pType !== "BG" && pType !== "PUMP" && pType !== "EXCAVATION") {
          await deleteDoc(d.ref);
          deletedCount++;
        } else if (data.status === "draft" && !data.partAChecklist) {
          await deleteDoc(d.ref);
          deletedCount++;
        }
      }
      alert(`✅ Database cleanup complete. Deleted ${deletedCount} garbage documents.`);
    } catch (e: any) {
      alert(`Error cleaning up: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-12 h-12" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b-2 border-gray-200 pb-4">
          <div>
            <button onClick={() => navigate('/')} className="text-gray-500 font-bold flex items-center gap-1 mb-2 hover:text-gray-900"><ArrowLeft size={16}/> Back to Dashboard</button>
            <h1 className="text-3xl font-black text-gray-900 uppercase flex items-center gap-3"><Shield className="text-red-600"/> {isMaster ? 'Master Settings' : 'Settings'}</h1>
          </div>
          {isMaster && (
            <div className="flex gap-4">
              <button onClick={handleGarbageCleanup} className="bg-red-100 hover:bg-red-200 text-red-700 px-6 py-3 rounded-xl font-black uppercase flex items-center gap-2 shadow-sm transition-all border border-red-200">
                <Trash2 size={18}/> Clean Database
              </button>
              <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-black uppercase flex items-center gap-2 shadow-lg transition-all">
                {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Save Changes
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8">
          
          {/* MODO DEL SISTEMA (SWITCH LIVE/DEMO) */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2"><Activity className="text-orange-500"/> System Dimension</h2>
              <p className="text-sm text-gray-500 max-w-md">Toggle the entire application between LIVE (Production) and DEMO (Testing) modes. This affects where the permits are sent in iTwoCX.</p>
            </div>
            <div className="flex gap-4 flex-col sm:flex-row">
              <ModeToggle />
              {isMaster && <AutoSyncToggle />}
            </div>
          </div>

          {/* SYNC FAILURES (DLQ MANUAL FAILSAFE DASHBOARD) */}
          {isMaster && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="text-red-600"/> Sync Failures (Dead Letter Queue)
              </h2>
              <span className="bg-red-100 text-red-800 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                {failedPermits.length} Failed Permits
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Permits listed here were successfully saved and secured in Firebase but encountered errors during the asynchronous iTwoCX lodge process. Use the override buttons to try again or download the finalized signed PDF for manual submission.
            </p>

            {failedPermits.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-700 font-bold">
                🎉 All permits are currently synced successfully. No failures detected in the Dead Letter Queue.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100 text-gray-600 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200">
                    <tr>
                      <th className="p-4">Permit Reference</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Sync Error Details</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {failedPermits.map((p, idx) => {
                      const isRetrying = retryingIds.has(p.id);
                      return (
                        <tr key={idx} className="hover:bg-red-50/50 transition-colors">
                          <td className="p-4 font-black text-gray-900">
                            {p.itwocxNumber ? `PF${String(p.itwocxNumber).replace(/\D/g, "")}` : p.permitNumber || "N/A"}
                          </td>
                          <td className="p-4 font-bold text-gray-700 uppercase">{p.permitType || "Permit"}</td>
                          <td className="p-4">
                            <span className="px-2 py-1 rounded text-xs font-black uppercase bg-red-100 text-red-800">
                              {p.sync_status || p.syncStatus || "ERROR"}
                            </span>
                          </td>
                          <td className="p-4 text-xs font-mono text-red-600 max-w-xs overflow-hidden text-ellipsis">
                            {p.cxSyncError || p.sync_error || "Unknown iTwoCX API rejection"}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex flex-col gap-2 items-center justify-center">
                              {/* BOTÓN ANTI-SPAM */}
                              <button 
                                onClick={() => handleRetrySync(p.id)}
                                disabled={isRetrying}
                                className={`${isRetrying ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'} text-white px-4 py-2 rounded-lg font-black text-xs uppercase flex items-center justify-center gap-1 shadow transition-all w-full max-w-[200px]`}
                              >
                                {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14}/>} 
                                {isRetrying ? "Retrying..." : "Retry Sync"}
                              </button>
                              
                              <button 
                                onClick={() => {
                                  if (p.pdfBackupUrl) {
                                    window.open(p.pdfBackupUrl, '_blank');
                                  } else {
                                    alert("PDF backup URL not found in storage for this permit. The PDF may still be generating or was not secured.");
                                  }
                                }} 
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-black text-xs uppercase flex items-center justify-center gap-1 shadow transition-all w-full max-w-[200px]"
                              >
                                <Download size={14}/> Download PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {/* GENERAL SETTINGS */}
          {isMaster && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2"><Building className="text-blue-600"/> General Platform Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Company / Project Name</label>
                <input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              
              {/* MENÚ DESPLEGABLE BLINDADO PARA PROYECTO */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Default iTwoCX Project Code</label>
                <select 
                  value={settings.projectCode} 
                  onChange={e => setSettings({...settings, projectCode: e.target.value})} 
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  <option value="EB-DEMO">EB-DEMO (Testing / Training Environment)</option>
                  <option value="EB">EB (LIVE / Production Environment)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1 uppercase">Overridden by the System Dimension toggle above.</p>
              </div>
            </div>
            </div>
          )}

          {/* ACCESS CONTROL LIST */}
          {isMaster && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2"><Users className="text-blue-600"/> Access Control List (ACL)</h2>
            
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-blue-50 p-4 rounded-xl border border-blue-100">
              <input type="email" placeholder="user@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
              <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full md:w-48 border border-gray-300 rounded-lg px-4 py-2 font-bold text-gray-700 outline-none">
                <option value="Receiver">Receiver</option>
                <option value="Issuer">Issuer</option>
                <option value="Approver">Approver</option>
                <option value="Master">Master Admin</option>
              </select>
              <button onClick={handleAddUser} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
                <Plus size={18}/> Add
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 uppercase font-black text-[10px] tracking-widest border-b-2 border-gray-200">
                  <tr>
                    <th className="p-4">Email Address</th>
                    <th className="p-4">Assigned Role</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settings.roleAssignments.map((user, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-bold text-gray-800">{user.email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-black uppercase ${
                          user.role === 'Master' ? 'bg-red-100 text-red-800' :
                          user.role === 'Approver' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'Issuer' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button onClick={() => handleRemoveUser(user.email)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors">
                          <Trash2 size={16}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
          </div>
          )}
        </div>

      </div>
    </div>
  );
};