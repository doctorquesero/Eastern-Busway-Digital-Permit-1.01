import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HardHat } from 'lucide-react';
import ebLogo from '../assets/eb-logo.png';

export const UnderConstruction = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <img src={ebLogo} alt="Eastern Busway Alliance" className="h-24 object-contain mb-8" />
      
      <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg border-t-4 border-brand-900 w-full">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-yellow-100 rounded-full">
            <HardHat className="h-16 w-16 text-yellow-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-extrabold text-gray-900 mb-4">Under Construction</h1>
        
        <p className="text-gray-500 mb-8 text-lg">
          This permit module is currently being built and will be available soon.
        </p>
        
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};