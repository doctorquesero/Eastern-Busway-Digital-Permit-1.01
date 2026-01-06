import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, LogOut } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import NewPermit from './pages/NewPermit';
import PermitDetail from './pages/PermitDetail';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      <nav className="bg-brand-800 text-white shadow-lg print:hidden sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <ShieldCheck className="h-8 w-8 text-brand-200 mr-3" />
              <div>
                <span className="font-bold text-xl tracking-tight">EBA Can you Dig it - Digital Permits</span>
                <span className="block text-xs text-brand-200 font-light opacity-80">Safe Work Systems</span>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="flex items-baseline space-x-4">
                <button className="text-brand-100 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Help</button>
                <div className="flex items-center space-x-2 text-sm bg-brand-900 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

const AppContent: React.FC = () => {
    const navigate = useNavigate();

    return (
        <Layout>
            <Routes>
                <Route path="/" element={
                    <Dashboard 
                        onCreateNew={() => navigate('/new')} 
                        onViewPermit={(id) => navigate(`/permit/${id}`)}
                    />
                } />
                <Route path="/new" element={
                    <NewPermit 
                        onCancel={() => navigate('/')}
                        onComplete={() => navigate('/')}
                    />
                } />
                <Route path="/permit/:id" element={
                    <PermitDetailContainer />
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    );
};

// Wrapper to handle params
const PermitDetailContainer = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const id = location.pathname.split('/').pop() || '';
    
    return <PermitDetail id={id} onBack={() => navigate('/')} />;
}

const App: React.FC = () => {
  return (
    <HashRouter>
        <AppContent />
    </HashRouter>
  );
};

export default App;