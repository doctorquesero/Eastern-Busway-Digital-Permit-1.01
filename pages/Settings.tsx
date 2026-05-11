import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Shield, Users, Building, Plus, Trash2, Loader2, Activity } from 'lucide-react';
import { getCurrentUserEmail } from '../services/cx';
import { ModeToggle } from '../components/ModeToggle'; // 🚀 IMPORTACIÓN DEL BOTÓN MAESTRO

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('Receiver');

  // Seguridad: Expulsar si no es Master
  const currentUser = getCurrentUserEmail().toLowerCase();
  const isMaster = currentUser.includes('master') || currentUser.includes('dietrich') || currentUser.includes('eba-dt');

  useEffect(() => {
    if (!isMaster) {
      alert("Access Denied: Master Clearance Required.");
      navigate('/');
      return;
    }
    loadSettings();
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

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-12 h-12" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b-2 border-gray-200 pb-4">
          <div>
            <button onClick={() => navigate('/')} className="text-gray-500 font-bold flex items-center gap-1 mb-2 hover:text-gray-900"><ArrowLeft size={16}/> Back to Dashboard</button>
            <h1 className="text-3xl font-black text-gray-900 uppercase flex items-center gap-3"><Shield className="text-red-600"/> Master Settings</h1>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-black uppercase flex items-center gap-2 shadow-lg transition-all">
            {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Save Changes
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          
          {/* 🚀 MODO DEL SISTEMA (SWITCH LIVE/DEMO) */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2"><Activity className="text-orange-500"/> System Dimension</h2>
              <p className="text-sm text-gray-500 max-w-md">Toggle the entire application between LIVE (Production) and DEMO (Testing) modes. This affects where the permits are sent in iTwoCX.</p>
            </div>
            <ModeToggle />
          </div>

          {/* GENERAL SETTINGS */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2"><Building className="text-blue-600"/> General Platform Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Company / Project Name</label>
                <input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Default iTwoCX Project Code</label>
                <input type="text" value={settings.projectCode} onChange={e => setSettings({...settings, projectCode: e.target.value})} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-[10px] text-gray-400 mt-1 uppercase">Overridden by the System Dimension toggle above.</p>
              </div>
            </div>
          </div>

          {/* ACCESS CONTROL LIST */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2"><Users className="text-blue-600"/> Access Control List (ACL)</h2>
            
            {/* Add User Bar */}
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

            {/* Users Table */}
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
        </div>

      </div>
    </div>
  );
};