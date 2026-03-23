import React from 'react';
import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react';

const SafetyWidget: React.FC = () => {
  const safetyLinks = [
    {
      id: 1,
      title: "WorkSafe NZ: Recent Safety Alerts and Incidents",
      source: "worksafe.govt.nz",
      url: "https://www.worksafe.govt.nz/about-us/news-and-media/safety-alerts/",
      type: "critical"
    },
    {
      id: 2,
      title: "BeforeUDig: Safe Excavation Practices and Case Studies",
      source: "beforeudig.co.nz",
      url: "https://www.beforeudig.co.nz/",
      type: "warning"
    },
    {
      id: 3,
      title: "Vector: Safety Guide and Risks Near Electrical Networks",
      source: "vector.co.nz",
      url: "https://www.vector.co.nz/safety/safety-around-our-network",
      type: "info"
    }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-orange-100 overflow-hidden mb-6">
      <div className="bg-orange-50 px-5 py-3 flex items-center justify-between border-b border-orange-100">
        <div className="flex items-center gap-3 text-orange-900 font-black uppercase tracking-tighter text-sm">
          <AlertTriangle size={20} className="text-orange-500" />
          Construction Safety Intelligence
        </div>
        <div className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-orange-400 bg-white px-2 py-1 rounded shadow-sm border border-orange-100">
          <ShieldAlert size={12} />
          NZ Protocols
        </div>
      </div>
      
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-orange-50/30">
        {safetyLinks.map((link) => (
          <a 
            key={link.id} 
            href={link.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex flex-col justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-300 hover:bg-orange-50 transition-all group"
          >
            <div>
              <h4 className="text-xs font-bold text-gray-900 leading-snug group-hover:text-orange-700 transition-colors">
                {link.title}
              </h4>
            </div>
            <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-50">
              <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                {link.source}
              </span>
              <ExternalLink size={14} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default SafetyWidget;