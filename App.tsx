import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import NewPermitRoute from './pages/NewPermitRoute';
import PermitDetail from './pages/PermitDetail';
import AuditPdfView from './pages/AuditPdfView';
import NewPumpPermit from './pages/NewPumpPermit';
import PumpPermitDetail from './pages/PumpPermitDetail';
import HandheldSawPermitDetail from './pages/HandheldSawPermitDetail';
import { UnderConstruction } from './pages/UnderConstruction';
import { Settings as SettingsPage } from './pages/Settings';
import MetricsDashboard from './metrics-performance/web/MetricsDashboard';
import { logoutCX, getUserRole, getCurrentUserEmail } from './services/cx';
import { LoginModal } from './components/LoginModal';
import { DemoBanner } from './components/DemoBanner';
import { LogOut, Loader2, Settings as SettingsIcon, BarChart3, ArrowLeft, KeyRound } from 'lucide-react';
import ebLogo from './assets/eb-logo.png';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, authPersistence } from './firebase';
import { ChangePinModal } from './components/ChangePinForm';

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Route render crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-black text-red-700 uppercase mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-700 mb-4 break-words">{this.state.error.message}</p>
        <button onClick={() => { window.location.hash = '#/'; window.location.reload(); }} className="bg-blue-700 text-white px-6 py-3 rounded-xl font-black uppercase">Back to Dashboard</button>
      </div>
    );
  }
}

const PermitDetailContainer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/" replace />;
  return <PermitDetail id={id} onBack={() => navigate('/')} />;
};

const PumpPermitDetailContainer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/" replace />;
  return <PumpPermitDetail id={id} onBack={() => navigate('/')} />;
};

const HandheldSawPermitDetailContainer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/" replace />;
  return <HandheldSawPermitDetail id={id} onBack={() => navigate('/')} />;
};

// ðŸš€ NÃšCLEO DE NAVEGACIÃ“N (Para poder usar useLocation)
const MainApp = ({ userRole, userEmail, handleLogout }: { userRole: string, userEmail: string, handleLogout: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const closePinModal = useCallback(() => setIsPinModalOpen(false), []);

  // ðŸ”’ ValidaciÃ³n estricta: Solo los Master ven el botÃ³n Settings
  const isMaster = userRole.toLowerCase().includes('master');
  // ðŸ‘ï¸ VerificaciÃ³n visual: Si ya estamos en la pÃ¡gina de Settings, ocultar el botÃ³n
  const isSettingsPage = location.pathname === '/settings';
  const isMetricsPage = location.pathname === '/metrics';

  return (
    <>
      <DemoBanner />
      <div className="min-h-screen w-full max-w-full overflow-x-hidden print:overflow-visible print:block print:min-h-0 box-border bg-gray-50 flex flex-col">
        <div className="bg-white border-b-4 border-brand-900 p-3 flex justify-between items-center shadow-md shrink-0 print:hidden">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <img src={ebLogo} alt="Eastern Busway Alliance" className="h-8 sm:h-10 object-contain shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight truncate">{userEmail}</span>
              <span className="text-xs font-black text-brand-700 uppercase truncate">{userRole}</span>
            </div>
          </div>

          <div className="flex gap-1.5 sm:gap-2 shrink-0 ml-2">
            <button
              onClick={() => setIsPinModalOpen(true)}
              aria-label="Change PIN"
              className="flex items-center justify-center gap-1 bg-blue-700 px-2 py-2 sm:px-4 rounded-xl text-[10px] sm:text-xs font-black uppercase text-white hover:bg-blue-800 transition-colors shadow-md shrink-0"
            >
              <KeyRound size={16} />
              <span>Change PIN</span>
            </button>
            {isMetricsPage ? (
              <button
                onClick={() => navigate('/')}
                aria-label="Back to Dashboard"
                className="flex items-center justify-center gap-2 bg-gray-800 p-2.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-gray-900 transition-colors shadow-md shrink-0"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/metrics')}
                  aria-label="Metrics and Analytics"
                  className="flex items-center justify-center gap-2 bg-gray-800 p-2.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-gray-900 transition-colors shadow-md shrink-0"
                >
                  <BarChart3 size={16} />
                  <span className="hidden sm:inline">Metrics &amp; Analytics</span>
                </button>
                {!isSettingsPage && (
                  <button
                    onClick={() => navigate('/settings')}
                    aria-label="Settings"
                    className="flex items-center justify-center gap-2 bg-gray-800 p-2.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-gray-900 transition-colors shadow-md shrink-0"
                  >
                    <SettingsIcon size={16} />
                    <span className="hidden sm:inline">Settings</span>
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  aria-label="Log Out"
                  className="flex items-center justify-center gap-2 bg-red-600 p-2.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black uppercase text-white hover:bg-red-700 transition-colors shadow-md shrink-0"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Log Out</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto print:overflow-visible print:block print:static box-border">
          <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewPermitRoute />} />
            <Route path="/permit/:id" element={<PermitDetailContainer />} />
            <Route path="/new-pump" element={<NewPumpPermit onCancel={() => navigate('/')} onComplete={() => navigate('/')} />} />
            <Route path="/pump-permit/:id" element={<PumpPermitDetailContainer />} />
            <Route path="/handheld-saw/:id" element={<HandheldSawPermitDetailContainer />} />
            <Route path="/under-construction" element={<UnderConstruction />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/metrics" element={<MetricsDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RouteErrorBoundary>
        </div>
      </div>
      {isPinModalOpen && <ChangePinModal currentEmail={auth.currentUser?.email || userEmail} onClose={closePinModal} />}
    </>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const initializeAuth = async () => {
      await authPersistence.catch(error => console.error('Unable to establish local auth persistence:', error));
      if (!isMounted) return;

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setIsAuthenticated(true);
          setUserRole(getUserRole());
          setUserEmail(getCurrentUserEmail() || firebaseUser.email || '');
        } else {
          setIsAuthenticated(false);
        }
        setIsCheckingSession(false);
      });
    };

    initializeAuth();
    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);


  const handleLoginSuccess = (email: string) => {
    setIsAuthenticated(true);
    setUserRole(getUserRole());
    setUserEmail(email);
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to securely log out?")) {
      logoutCX();
      console.warn("SIGN OUT EXECUTED BY:", new Error().stack);
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
    console.warn("Gating user to Login. Current Auth State:", auth.currentUser, "Loading:", isCheckingSession);
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
        <LoginModal isOpen={true} onClose={() => { }} onLogin={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <HashRouter>
      <MainApp userRole={userRole} userEmail={userEmail} handleLogout={handleLogout} />
    </HashRouter>
  );
};

// Public allow-list: /audit-pdf/:permitId is served before the login gate (no sign-in required).
const AppRoot: React.FC = () => {
  const [isAudit, setIsAudit] = useState(window.location.hash.startsWith('#/audit-pdf/'));
  useEffect(() => {
    const onHash = () => setIsAudit(window.location.hash.startsWith('#/audit-pdf/'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (!isAudit) return <App />;
  return (
    <HashRouter>
      <Routes>
        <Route path="/audit-pdf/:permitId" element={<AuditPdfView />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRoot;