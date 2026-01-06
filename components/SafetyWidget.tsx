import React, { useEffect, useState } from 'react';
import { getSafetyAlerts, SafetyAlert } from '../services/gemini';
import { AlertTriangle, Loader2, ExternalLink } from 'lucide-react';

const SafetyWidget: React.FC = () => {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await getSafetyAlerts();
        setAlerts(data);
      } catch (err) {
        // Fallback or silent fail
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="bg-safety-orange/10 px-4 py-3 border-b border-safety-orange/20 flex items-center">
        <AlertTriangle className="text-safety-orange mr-2" size={20} />
        <h3 className="font-semibold text-gray-800">Construction Safety Intelligence</h3>
        <span className="ml-auto text-xs bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-500">
          Powered by Google
        </span>
      </div>
      
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.length > 0 ? alerts.map((alert, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="mb-2 sm:mb-0">
                  <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                  <p className="text-xs text-gray-500">Source: {alert.source}</p>
                </div>
                <a 
                  href={alert.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs flex items-center text-brand-600 hover:text-brand-800 font-medium"
                >
                  Read Alert <ExternalLink size={12} className="ml-1" />
                </a>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center">No recent alerts found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SafetyWidget;