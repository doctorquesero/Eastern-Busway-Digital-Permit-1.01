import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import NewPermit from './pages/NewPermit';
import PermitDetail from './pages/PermitDetail';
import { logoutCX, hasActiveSession, getUserRole, getCurrentUserEmail, getActiveSessionKey } from './services/cx';
import { LoginModal } from './components/LoginModal'; 
import { LogOut, Loader2 } from 'lucide-react';
import ebLogo from './assets/eb-logo.png';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // 🚀 Import corregido

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

  // 🛡️ EL ESCUDO: Se ejecuta al abrir la app en cualquier dispositivo
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // El usuario está recordado por Firebase. ¿Pero tiene la llave de CX en ESTE dispositivo?
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
      logoutCX(); // Limpia LocalStorage (incluyendo la llave de CX)
      const auth = getAuth();
      auth.signOut(); // Desconecta de Firebase
      
      setIsAuthenticated(false);
      setUserRole('');
      setUserEmail('');
    }
  };

  // Pantalla de carga mientras el escudo revisa la seguridad
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-white font-bold tracking-widest uppercase text-sm">Verifying Security Clearance...</p>
      </div>
    );
  }

  // Pantalla de Login (Si falla el escudo o no hay sesión)
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

  // Aplicación Principal
  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* BARRA SUPERIOR (NAVBAR) */}
        <div className="bg-white border-b-4 border-brand-900 p-3 flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-4">
            <img src={ebLogo} alt="Eastern Busway Alliance" className="h-10 object-contain" />
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight">{userEmail}</span>
                <span className="text-xs font-black text-brand-700 uppercase">{userRole}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-red-700 transition-colors shadow-md"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>

        {/* ZONA DE RUTAS */}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewPermit onCancel={() => window.location.hash = '#/'} onComplete={() => window.location.hash = '#/'} />} />
            <Route path="/permit/:id" element={<PermitDetailContainer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
};

export default App;