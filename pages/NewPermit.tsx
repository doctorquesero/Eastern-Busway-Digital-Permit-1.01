import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Save, CheckCircle, AlertOctagon, Info } from 'lucide-react';
import { Permit, INITIAL_PART_A, INITIAL_PART_B, INITIAL_RECEIVER_CHECKLIST, Signature, ChecklistItem } from '../types';
import { generatePermitNumber, savePermit } from '../services/storage';
import SignaturePad from '../components/SignaturePad';

interface NewPermitProps {
  onCancel: () => void;
  onComplete: () => void;
}

const NewPermit: React.FC<NewPermitProps> = ({ onCancel, onComplete }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Permit>({
    id: crypto.randomUUID(),
    permitNumber: generatePermitNumber(),
    itwocxNumber: '',
    status: 'active',
    createdAt: new Date().toISOString(),
    location: '',
    revealModelLayer: false,
    subLayers: false,
    ebaConstructionLayer: false,
    asBuiltLayers: false,
    scopeOfWorks: '',
    excavationType: 'mechanical', // Default
    knownServicesScanned: null,
    knownServicesScannedComment: '',
    servicesMarked: null,
    servicesMarkedComment: '',
    potholingMarkers: null,
    potholingMarkersComment: '',
    transpowerDesignation: null,
    transpowerDesignationComment: '',
    watercareWorksOver: null,
    watercareWorksOverComment: '',
    partAChecklist: [...INITIAL_PART_A],
    partAPotholingMethod: '',
    partAFrequency: '',
    partAOverheadProtection: '',
    partACloseApproach: {
        overheadElectricityDist: '',
        overheadRailDist: '',
        overheadOtherDist: '',
        undergroundElectricityDist: '',
        undergroundFibreDist: '',
        undergroundGasDist: '',
        undergroundWaterDist: '',
        permitsObtained: null
    },
    partBChecklist: [...INITIAL_PART_B],
    partBHighRiskOptions: {
        power11kv: false,
        gasHighPressure: false,
        mainFibre: false
    },
    receiverChecklist: [...INITIAL_RECEIVER_CHECKLIST],
    dailyLogs: [],
    handoverLogs: [],
    crewMembers: [], // Initialized empty
    notes: [],
    photos: []
  });

  const isHydro = formData.excavationType === 'hydro' || formData.excavationType === 'hand';

  const updateField = (field: keyof Permit, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateChecklist = (listName: 'partAChecklist' | 'partBChecklist' | 'receiverChecklist', id: string, answer: 'yes' | 'no' | 'n/a' | null, comment?: string) => {
    setFormData(prev => ({
      ...prev,
      [listName]: prev[listName].map(item => 
        item.id === id ? { ...item, answer: answer as any, comment: comment ?? item.comment } : item
      )
    }));
  };

  const steps = [
    'Location & Plan',
    'Excavation Details',
    'Part A: ID',
    'Part B: Mech',
    'Receiver Checks',
    'Sign Off'
  ];

  const handleSave = () => {
    // Automatically add the receiver to the crew list if signed
    const finalData = { ...formData };
    if (finalData.receiverSignature) {
        finalData.crewMembers.push({
            id: crypto.randomUUID(),
            name: finalData.receiverSignature.name,
            role: 'Permit Receiver',
            signature: finalData.receiverSignature,
            dateInducted: new Date().toISOString()
        });
    }

    savePermit(finalData);
    onComplete();
  };

  // Standard high-contrast input style
  const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow font-medium shadow-sm";

  // Helper to render a specific Part A checklist item by ID
  const renderPartAChecklistItem = (id: string) => {
    const item = formData.partAChecklist.find(i => i.id === id);
    if (!item) return null;
    
    return (
        <div key={item.id} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors mb-4 shadow-sm">
            <p className="font-bold text-gray-800 text-sm mb-3">{item.id.replace('a','').replace('b','')}. {item.question}</p>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex space-x-4 shrink-0">
                    {(['yes', 'no'] as const).map(opt => (
                        <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                            <input 
                                type="radio" 
                                name={`partA-${item.id}`}
                                checked={item.answer === opt}
                                onChange={() => updateChecklist('partAChecklist', item.id, opt)}
                                className="text-brand-600 focus:ring-brand-500 bg-white border border-gray-300 h-4 w-4"
                            />
                            <span className="uppercase text-xs font-black text-gray-700">{opt}</span>
                        </label>
                    ))}
                </div>
                <input 
                    type="text" 
                    placeholder="Comments..."
                    value={item.comment || ''}
                    onChange={(e) => updateChecklist('partAChecklist', item.id, item.answer, e.target.value)}
                    className={inputClass}
                />
            </div>
        </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 flex items-center font-bold">
          <ArrowLeft size={16} className="mr-1" /> Back to Register
        </button>
        <div>
            {formData.itwocxNumber ? (
                <div className="text-right">
                    <h2 className="text-xl font-black text-gray-900">ITWOcx: {formData.itwocxNumber}</h2>
                    <p className="text-xs text-gray-500 font-mono">{formData.permitNumber}</p>
                </div>
            ) : (
                <h2 className="text-xl font-black text-gray-900">{formData.permitNumber}</h2>
            )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((label, idx) => (
            <span key={idx} className={`hidden md:inline-block text-xs font-black uppercase tracking-tighter ${step > idx + 1 ? 'text-brand-600' : step === idx + 1 ? 'text-brand-800' : 'text-gray-400'}`}>
              {label}
            </span>
          ))}
          <span className="md:hidden text-xs font-black text-brand-700 uppercase">Step {step}: {steps[step-1]}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-brand-600 transition-all duration-300"
            style={{ width: `${(step / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
        
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Site Plan & Location</h3>
            
            <div>
              <label className="block text-xs font-black text-gray-700 mb-1 uppercase tracking-tighter">ITWOCX Permit #</label>
              <input 
                type="text" 
                value={formData.itwocxNumber}
                onChange={(e) => updateField('itwocxNumber', e.target.value)}
                className={inputClass}
                placeholder="Enter ITWOCX Number (e.g. CX-12345)"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 mb-1 uppercase tracking-tighter">Work Location / Site Address</label>
              <input 
                type="text" 
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                className={inputClass}
                placeholder="e.g. 123 Construction Rd, Zone B"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200 shadow-sm">
              <h4 className="font-black text-blue-900 mb-2 uppercase text-sm">Service Plan Requirements</h4>
              <p className="text-sm text-blue-800 mb-4 font-medium">Confirm the following layers have been selected on the digital map:</p>
              
              <div className="space-y-3 mb-4">
                {[
                  { key: 'revealModelLayer', label: 'Select the Reveal Model layer' },
                  { key: 'subLayers', label: 'Select all sub layers' },
                  { key: 'ebaConstructionLayer', label: 'Select the EBA construction layer' },
                  { key: 'asBuiltLayers', label: 'Select all As Built layers underneath' }
                ].map((item) => (
                  <label key={item.key} className="flex items-center space-x-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={formData[item.key as keyof Permit] as boolean}
                      onChange={(e) => updateField(item.key as keyof Permit, e.target.checked)}
                      className="h-5 w-5 text-brand-600 rounded focus:ring-brand-500 bg-white border border-gray-300"
                    />
                    <span className="text-gray-700 font-bold group-hover:text-brand-700 transition-colors">{item.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs font-black text-blue-900 uppercase tracking-widest border-t border-blue-200 pt-2 text-center">To be filled in by the permit issuer</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Excavation Scope & Risk</h3>
            
            <div>
              <label className="block text-xs font-black text-gray-700 mb-1 uppercase tracking-tighter">Scope of Works (filled by Engineer)</label>
              <textarea 
                value={formData.scopeOfWorks}
                onChange={(e) => updateField('scopeOfWorks', e.target.value)}
                className={`${inputClass} h-32 resize-none`}
                placeholder="Describe the excavation work in detail..."
              />
            </div>

             <div>
              <label className="block text-xs font-black text-gray-700 mb-1 uppercase tracking-tighter">Excavation Type</label>
              <select 
                value={formData.excavationType}
                onChange={(e) => updateField('excavationType', e.target.value)}
                className={inputClass}
              >
                  <option value="mechanical">Mechanical Excavation (Requires Part B & Approver Sign-off)</option>
                  <option value="hydro">Hydro Excavation (Part B Not Required)</option>
                  <option value="hand">Hand Digging (Part B Not Required)</option>
              </select>
            </div>

            <div className="py-2 text-center border-t border-b border-red-100 my-4 bg-red-50/30">
                <p className="text-red-700 font-black text-xs uppercase tracking-tighter">
                    The remaining questions in Step 2 must be completed by the Permit Issuer.
                </p>
            </div>

            <div className="space-y-4">
                {[
                    { key: 'knownServicesScanned', commentKey: 'knownServicesScannedComment', label: 'Has the area for this permit been scanned?' },
                    { key: 'servicesMarked', commentKey: 'servicesMarkedComment', label: 'Known active services physically marked out on site?' },
                    { key: 'potholingMarkers', commentKey: 'potholingMarkersComment', label: 'If you are potholing have you got depth markers for holes when back filling?' },
                    { key: 'transpowerDesignation', commentKey: 'transpowerDesignationComment', label: 'Is the work within the Transpower Designation Area & a S176 is in place?' },
                    { key: 'watercareWorksOver', commentKey: 'watercareWorksOverComment', label: 'Have the works complied with Watercare "Works Over Approval" form (2m from <375mm, 10m from ≥375mm)?' }
                ].map((q) => (
                    <div key={q.key} className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3">
                            <span className="text-gray-900 text-sm font-bold mb-2 sm:mb-0 pr-4">{q.label}</span>
                            <div className="flex space-x-4 shrink-0">
                                {(['yes', 'no', 'n/a'] as const).map(opt => (
                                    <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name={q.key} 
                                            checked={formData[q.key as keyof Permit] === opt}
                                            onChange={() => updateField(q.key as keyof Permit, opt)}
                                            className="text-brand-600 focus:ring-brand-500 bg-white border border-gray-300"
                                        />
                                        <span className="uppercase text-xs font-black text-gray-700">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Add comments..."
                            value={(formData as any)[q.commentKey] || ''}
                            onChange={(e) => updateField(q.commentKey as keyof Permit, e.target.value)}
                            className={inputClass}
                        />
                    </div>
                ))}
            </div>
          </div>
        )}

        {step === 3 && (
            <div className="space-y-6">
                <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Part A: Service Identification</h3>
                
                {renderPartAChecklistItem('1a')}
                {renderPartAChecklistItem('1b')}
                {renderPartAChecklistItem('2')}
                {renderPartAChecklistItem('3')}

                <div className="mb-4">
                    <label className="block text-xs font-black text-gray-700 mb-1 uppercase">4. Potholing Method & Tools</label>
                    <textarea 
                        value={formData.partAPotholingMethod}
                        onChange={(e) => updateField('partAPotholingMethod', e.target.value)}
                        className={`${inputClass} h-20 resize-none`}
                        placeholder="e.g. hydro, air vac, hand digging..."
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-xs font-black text-gray-700 mb-1 uppercase">5. Frequency of Potholing / Slotting (Meters)</label>
                    <input 
                        type="text"
                        value={formData.partAFrequency}
                        onChange={(e) => updateField('partAFrequency', e.target.value)}
                        className={inputClass}
                        placeholder="Meters between slots or N/A"
                    />
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4 shadow-sm">
                    <label className="block text-xs font-black text-gray-900 mb-2 uppercase tracking-widest">6. Close Approach Requirements</label>
                    
                    <div className="overflow-x-auto rounded border">
                        <table className="min-w-full text-xs text-left">
                            <thead className="bg-gray-100 font-black uppercase text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 border">Overhead</th>
                                    <th className="px-2 py-2 border">Distance</th>
                                    <th className="px-2 py-2 border">Underground</th>
                                    <th className="px-2 py-2 border">Distance</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                <tr>
                                    <td className="px-2 py-1 border font-bold">Electricity</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.overheadElectricityDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.overheadElectricityDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                    <td className="px-2 py-1 border font-bold">Electricity</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.undergroundElectricityDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.undergroundElectricityDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-1 border font-bold">Rail</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.overheadRailDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.overheadRailDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                    <td className="px-2 py-1 border font-bold">Fibre</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.undergroundFibreDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.undergroundFibreDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-1 border font-bold">Other</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.overheadOtherDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.overheadOtherDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                    <td className="px-2 py-1 border font-bold">Gas</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.undergroundGasDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.undergroundGasDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-1 border bg-gray-50"></td>
                                    <td className="px-2 py-1 border bg-gray-50"></td>
                                    <td className="px-2 py-1 border font-bold">Water or other</td>
                                    <td className="px-2 py-1 border">
                                        <input type="text" className="w-full h-full p-1 bg-white focus:outline-none focus:bg-brand-50" 
                                            value={formData.partACloseApproach.undergroundWaterDist}
                                            onChange={e => { const n = {...formData.partACloseApproach}; n.undergroundWaterDist = e.target.value; updateField('partACloseApproach', n)}}
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between bg-gray-50 p-2 rounded border mt-3">
                        <span className="text-xs font-black text-gray-700 uppercase">Required Permits obtained?</span>
                        <div className="flex gap-4">
                            <label className="flex items-center text-xs cursor-pointer"><input type="radio" name="permitsObtained" className="mr-1 bg-white border-gray-300" checked={formData.partACloseApproach.permitsObtained === 'yes'} onChange={() => {const n = {...formData.partACloseApproach}; n.permitsObtained='yes'; updateField('partACloseApproach', n)}} /> <span className="font-bold">YES</span></label>
                            <label className="flex items-center text-xs cursor-pointer"><input type="radio" name="permitsObtained" className="mr-1 bg-white border-gray-300" checked={formData.partACloseApproach.permitsObtained === 'no'} onChange={() => {const n = {...formData.partACloseApproach}; n.permitsObtained='no'; updateField('partACloseApproach', n)}} /> <span className="font-bold">NO</span></label>
                            <label className="flex items-center text-xs cursor-pointer"><input type="radio" name="permitsObtained" className="mr-1 bg-white border-gray-300" checked={formData.partACloseApproach.permitsObtained === 'n/a'} onChange={() => {const n = {...formData.partACloseApproach}; n.permitsObtained='n/a'; updateField('partACloseApproach', n)}} /> <span className="font-bold">N/A</span></label>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-xs font-black text-gray-700 mb-1 uppercase">7. Overhead Service Protection Provided</label>
                    <input 
                        type="text"
                        value={formData.partAOverheadProtection}
                        onChange={(e) => updateField('partAOverheadProtection', e.target.value)}
                        className={inputClass}
                        placeholder="Describe protection measures in detail..."
                    />
                </div>

                {renderPartAChecklistItem('8')}
            </div>
        )}

        {step === 4 && (
             <div className="space-y-6">
             <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Part B: Mechanical Excavation</h3>
             
             {isHydro ? (
                 <div className="bg-blue-50 border-2 border-blue-200 p-8 rounded-xl text-center text-blue-900 shadow-sm">
                     <Info className="mx-auto mb-3" size={32} />
                     <p className="font-black text-xl mb-1">Hydro/Hand Excavation</p>
                     <p className="font-medium">Part B is not required for this excavation type. Please proceed to the next step.</p>
                 </div>
             ) : (
                <>
                 <div className="bg-red-50 text-red-900 p-4 rounded-lg text-sm mb-4 border-l-4 border-red-600 shadow-sm font-bold">
                     <strong>CRITICAL:</strong> Permit Approver MUST attend site before starting any mechanical excavation.
                 </div>
                 
                 <div className="space-y-4">
                     {formData.partBChecklist.map((item) => (
                         <div key={item.id} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors shadow-sm">
                             <div className="flex justify-between items-start mb-2">
                                <p className="font-bold text-gray-800 text-sm flex-1 mr-4">{item.id}. {item.question}</p>
                             </div>

                             {item.id === '5' && (
                                 <div className="mb-3 pl-4 border-l-4 border-brand-200 bg-gray-50 p-2 rounded">
                                     <p className="text-[10px] font-black text-brand-800 mb-2 uppercase tracking-widest">Verify services in scope:</p>
                                     <div className="flex flex-wrap gap-4">
                                         <label className="flex items-center text-xs cursor-pointer group">
                                             <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" 
                                                checked={formData.partBHighRiskOptions.power11kv}
                                                onChange={(e) => {
                                                    const opts = {...formData.partBHighRiskOptions, power11kv: e.target.checked};
                                                    updateField('partBHighRiskOptions', opts);
                                                }}
                                             />
                                             <span className="font-bold group-hover:text-brand-600">{'>'}11kV Mains Power</span>
                                         </label>
                                         <label className="flex items-center text-xs cursor-pointer group">
                                             <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" 
                                                checked={formData.partBHighRiskOptions.gasHighPressure}
                                                onChange={(e) => {
                                                    const opts = {...formData.partBHighRiskOptions, gasHighPressure: e.target.checked};
                                                    updateField('partBHighRiskOptions', opts);
                                                }}
                                             />
                                             <span className="font-bold group-hover:text-brand-600">High Pressure Gas</span>
                                         </label>
                                         <label className="flex items-center text-xs cursor-pointer group">
                                             <input type="checkbox" className="mr-2 h-4 w-4 bg-white border-gray-300" 
                                                checked={formData.partBHighRiskOptions.mainFibre}
                                                onChange={(e) => {
                                                    const opts = {...formData.partBHighRiskOptions, mainFibre: e.target.checked};
                                                    updateField('partBHighRiskOptions', opts);
                                                }}
                                             />
                                             <span className="font-bold group-hover:text-brand-600">Main Fibre</span>
                                         </label>
                                     </div>
                                 </div>
                             )}

                             <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mt-3">
                                 <div className="flex space-x-4 shrink-0">
                                     {(['yes', 'no', 'n/a'] as const).map(opt => (
                                         <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                                             <input 
                                                 type="radio" 
                                                 name={`partB-${item.id}`}
                                                 checked={item.answer === opt}
                                                 onChange={() => updateChecklist('partBChecklist', item.id, opt)}
                                                 className="text-brand-600 focus:ring-brand-500 bg-white border border-gray-300"
                                             />
                                             <span className="uppercase text-xs font-black text-gray-700">{opt}</span>
                                         </label>
                                     ))}
                                 </div>
                                 <input 
                                     type="text" 
                                     placeholder="Comments / Verification details..."
                                     value={item.comment || ''}
                                     onChange={(e) => updateChecklist('partBChecklist', item.id, item.answer, e.target.value)}
                                     className={inputClass}
                                 />
                             </div>
                         </div>
                     ))}
                 </div>
                 </>
             )}
         </div>
        )}

        {step === 5 && (
            <div className="space-y-6">
                <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Receiver Checklist (Page 6)</h3>
                
                {isHydro ? (
                     <div className="bg-blue-50 border-2 border-blue-200 p-8 rounded-xl text-center text-blue-900 shadow-sm font-bold">
                         <Info className="mx-auto mb-3" size={32} />
                         <p>Checklist is not required for Hydro/Hand digging.</p>
                     </div>
                ) : (
                    <>
                    <p className="text-sm text-gray-600 font-bold mb-4">Checks to be made by Receiver BEFORE mechanical digging starts.</p>
                    <div className="space-y-4">
                        {formData.receiverChecklist.map((item) => (
                            <div key={item.id} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors shadow-sm">
                                <p className="font-bold text-gray-800 text-sm mb-3">{item.id}. {item.question}</p>
                                <div className="flex flex-wrap gap-4 items-center mb-3">
                                    <div className="flex space-x-4">
                                        {(['yes', 'no'] as const).map(opt => (
                                            <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name={`receiver-${item.id}`}
                                                    checked={item.answer === opt}
                                                    onChange={() => updateChecklist('receiverChecklist', item.id, opt)}
                                                    className="text-brand-600 focus:ring-brand-500 bg-white border border-gray-300 h-4 w-4"
                                                />
                                                <span className="uppercase text-xs font-black text-gray-700">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <input 
                                        type="text" 
                                        placeholder={item.id === '10' ? "Describe exact system of communication..." : "Add required verification comments..."}
                                        value={item.comment || ''}
                                        onChange={(e) => updateChecklist('receiverChecklist', item.id, item.answer, e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    </>
                )}
            </div>
        )}

        {step === 6 && (
            <div className="space-y-6">
                <h3 className="text-lg font-black border-b pb-2 uppercase tracking-wide text-brand-900">Sign Off & Approval</h3>

                <div className="bg-red-50 border-l-8 border-red-600 p-5 rounded-lg shadow-sm mb-6">
                    <div className="flex items-center mb-3">
                        <AlertOctagon className="text-red-600 mr-3" size={24} />
                        <h4 className="font-black text-red-800 uppercase tracking-widest">CEASE WORKS PROTOCOL</h4>
                    </div>
                    <ul className="list-disc pl-6 text-sm text-red-900 space-y-2 font-bold">
                        <li>If you encounter previously unidentified service or archaeological items.</li>
                        <li>If methodology or site conditions change (Risks must be reassessed).</li>
                        <li>If foreman, operator or spotter changes (Checklist must be re-signed).</li>
                        <li>If you encounter asbestos or contaminates.</li>
                    </ul>
                    <p className="text-xs text-red-700 mt-4 font-black text-center uppercase tracking-widest bg-white/50 py-2 rounded">Work must stop and permit issuer must be contacted immediately.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2">
                        <SignaturePad 
                            label="Site Engineer Signature" 
                            onSave={(sig) => updateField('siteEngineerSignature', sig)}
                            initialValue={formData.siteEngineerSignature}
                        />
                    </div>
                    <SignaturePad 
                        label="Permit Issuer Signature" 
                        onSave={(sig) => updateField('issuerSignature', sig)}
                        initialValue={formData.issuerSignature}
                    />
                     <SignaturePad 
                        label="Permit Receiver Signature (Checklist Pg 6)" 
                        onSave={(sig) => updateField('receiverSignature', sig)}
                        initialValue={formData.receiverSignature}
                    />
                </div>
                
                {!isHydro && (
                    <div className="bg-amber-50 p-4 rounded-lg text-sm text-amber-900 mt-6 border-l-4 border-amber-500 font-bold shadow-sm">
                        <strong>NOTE:</strong> The Permit Approver for Mechanical Excavation will sign off after issuance, directly on the permit details page before works commence.
                    </div>
                )}
            </div>
        )}

      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center no-print">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : onCancel()}
          className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-black uppercase tracking-tighter hover:bg-white hover:border-gray-400 transition-all shadow-sm active:scale-95"
        >
          {step === 1 ? 'Cancel' : 'Previous'}
        </button>

        {step < steps.length ? (
          <button
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-2 px-8 py-3 bg-brand-600 text-white rounded-xl font-black uppercase tracking-tighter hover:bg-brand-700 shadow-lg transition-all active:scale-95"
          >
            Next Step <ArrowRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-10 py-4 bg-green-600 text-white rounded-xl font-black uppercase tracking-tighter hover:bg-green-700 shadow-xl transition-all active:scale-95 text-lg"
          >
            <CheckCircle size={22} />
            Issue Permit
          </button>
        )}
      </div>
    </div>
  );
};

export default NewPermit;