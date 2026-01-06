import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Download, Filter } from 'lucide-react';
import { Permit } from '../types';
import { getPermits } from '../services/storage';
import SafetyWidget from '../components/SafetyWidget';

interface DashboardProps {
  onCreateNew: () => void;
  onViewPermit: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onCreateNew, onViewPermit }) => {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');

  useEffect(() => {
    setPermits(getPermits());
  }, []);

  const filteredPermits = permits.filter(p => {
    const matchesSearch = p.permitNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.itwocxNumber && p.itwocxNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getReceiverName = (p: Permit) => {
      if (p.handoverLogs && p.handoverLogs.length > 0) {
          return p.handoverLogs[p.handoverLogs.length - 1].receiverName;
      }
      return p.receiverSignature?.name || '-';
  };

  const handleExport = () => {
    // CSV export matching the new column structure
    const headers = ['ITWOcx #', 'Date Issued', 'Receiver', 'Location', 'Permit Number', 'Status', 'Scope'];
    const rows = filteredPermits.map(p => [
      p.itwocxNumber || '',
      new Date(p.createdAt).toLocaleDateString(),
      getReceiverName(p),
      p.location,
      p.permitNumber,
      p.status,
      `"${p.scopeOfWorks.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `permit_register_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Standard input style for consistency
  const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permit Register</h1>
          <p className="text-gray-500">Manage digital breaking ground permits</p>
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all"
        >
          <Plus size={18} />
          Issue New Permit
        </button>
      </div>

      <SafetyWidget />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search permits..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative">
                <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-gray-500 text-sm h-full"
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <Filter size={14} />
                </div>
            </div>
            
            <button 
                onClick={handleExport}
                className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3 whitespace-nowrap">ITWOcx #</th>
                <th className="px-6 py-3 whitespace-nowrap">Date Issued</th>
                <th className="px-6 py-3">Receiver</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 whitespace-nowrap">Permit #</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPermits.length > 0 ? filteredPermits.map((permit) => (
                <tr key={permit.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-900 font-bold">
                    {permit.itwocxNumber || '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(permit.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    {getReceiverName(permit)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{permit.location}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">
                    {permit.permitNumber}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${permit.status === 'active' ? 'bg-green-100 text-green-800' : 
                        permit.status === 'draft' ? 'bg-gray-100 text-gray-800' : 
                        'bg-blue-100 text-blue-800'}`}>
                      {permit.status.charAt(0).toUpperCase() + permit.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => onViewPermit(permit.id)}
                      className="text-brand-600 hover:text-brand-900 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        No permits found matching your criteria.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;