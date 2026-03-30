import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import NewPermit from './pages/NewPermit';
import PermitDetail from './pages/PermitDetail';
import { UnderConstruction } from './pages/UnderConstruction';
import { Settings as SettingsPage } from './pages/Settings'; // 🚀 IMPORT NUEVO
import { logoutCX, getUserRole, getCurrentUserEmail, getActiveSessionKey } from './services/cx';
import { LoginModal } from './components/LoginModal'; 
import { LogOut, Loader2, Settings as SettingsIcon } from 'lucide-react'; // 🚀 ICONO DE SETTINGS
import ebLogo from './assets/eb-logo.png';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const PermitDetailContainer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/" replace />;
  return <PermitDetail id={id} onBack={() => navigate('/')} />;
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const sessionKey = getActiveSessionKey();
        
        if (!sessionKey) {
          console.warn("⚠️ Usuario recordado en Firebase, pero sin llave de iTwoCX. Forzando Login.");
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
          setUserRole(getUserRole());
          setUserEmail(getCurrentUserEmail());
        }
      } else {
        setIsAuthenticated(false);
      }
      setIsCheckingSession(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (email: string) => {
    setIsAuthenticated(true);
    setUserRole(getUserRole()); 
    setUserEmail(email);
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to securely log out?")) {
      logoutCX(); 
      const auth = getAuth();
      auth.signOut(); 
      
      setIsAuthenticated(false);
      setUserRole('');
      setUserEmail('');
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-white font-bold tracking-widest uppercase text-sm">Verifying Security Clearance...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541888087535-430953288591?q=80&w=2070&auto=format&fit=crop')" }}>
        <div className="absolute inset-0 bg-blue-900/80 backdrop-blur-sm"></div>
        <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <img src={ebLogo} alt="Eastern Busway Alliance" className="h-20 mx-auto object-contain bg-white p-2 rounded-xl shadow-lg" />
          <h2 className="mt-6 text-center text-4xl font-black text-white tracking-tighter uppercase">
            Digital Permits
          </h2>
          <p className="mt-2 text-center text-sm font-bold text-blue-200 uppercase tracking-widest">
            Powered by Can You Dig It
          </p>
        </div>
        <LoginModal isOpen={true} onClose={() => {}} onLogin={handleLoginSuccess} />
      </div>
    );
  }

  // Verificar si el usuario actual es el Master
  const isMaster = userRole.toLowerCase().includes('master');

  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b-4 border-brand-900 p-3 flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-4">
            <img src={ebLogo} alt="Eastern Busway Alliance" className="h-10 object-contain" />
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight">{userEmail}</span>
                <span className="text-xs font-black text-brand-700 uppercase">{userRole}</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {/* 🚀 BOTÓN DE SETTINGS (SOLO PARA MASTER) */}
            {isMaster && (
              <button
                onClick={() => window.location.hash = '#/settings'}
                className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-gray-900 transition-colors shadow-md"
              >
                <SettingsIcon size={16} />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-red-700 transition-colors shadow-md"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewPermit onCancel={() => window.location.hash = '#/'} onComplete={() => window.location.hash = '#/'} />} />
            <Route path="/permit/:id" element={<PermitDetailContainer />} />
            <Route path="/under-construction" element={<UnderConstruction />} />
            <Route path="/settings" element={<SettingsPage />} /> {/* 🚀 NUEVA RUTA */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
};

export default App;