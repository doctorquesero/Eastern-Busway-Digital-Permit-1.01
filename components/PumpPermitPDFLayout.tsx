import React from 'react';
import { Permit } from '../types';

interface PumpPermitPDFLayoutProps {
    permit: Permit;
}

const PumpPermitPDFLayout: React.FC<PumpPermitPDFLayoutProps> = ({ permit }) => {
    return (
        <div className="bg-white p-8 w-[800px] mx-auto text-black font-sans text-sm pb-16">
            {/* HEADER */}
            <div className="flex justify-between items-start border-b-4 border-blue-900 pb-4 mb-6">
                <div>
                    <h1 className="text-3xl font-black text-blue-900 uppercase">Permit to Pump</h1>
                    <p className="text-lg font-bold text-gray-600">Eastern Busway Alliance</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">ITWOCX Ref</p>
                    <p className="text-2xl font-black text-red-600">PF#{permit.itwocxNumber?.replace(/\D/g, "")}</p>
                    <p className="text-xs font-bold mt-2">Status: <span className="uppercase text-blue-800">{permit.status}</span></p>
                </div>
            </div>

            {/* SECTION 1: Details */}
            <div className="mb-6">
                <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">1. General Details</h2>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Project Name:</span><br/><span className="font-semibold">{permit.projectName}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Requesting Company:</span><br/><span className="font-semibold">{permit.requestingCompany}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Dewatering Location:</span><br/><span className="font-semibold">{permit.dewateringLocation}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Description of Area:</span><br/><span className="font-semibold">{permit.areaDescription}</span></div>
                </div>
            </div>

            {/* SECTION 2: Person in Charge */}
            <div className="mb-6">
                <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">2. Person in Charge</h2>
                <div className="grid grid-cols-3 gap-4">
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Name:</span><br/><span className="font-semibold">{permit.personInChargeName}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Contact:</span><br/><span className="font-semibold">{permit.personInChargeContact}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Position:</span><br/><span className="font-semibold">{permit.personInChargePosition}</span></div>
                </div>
            </div>

            {/* SECTION 3: Pumping Details */}
            <div className="mb-6">
                <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">3. Pumping Details</h2>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Impurities other than sediment:</span><br/><span className="font-semibold">{permit.impurities || 'N/A'}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Final Discharge Point:</span><br/><span className="font-semibold">{permit.dischargePoint}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Pump Size/Rate/Volume:</span><br/><span className="font-semibold">{permit.pumpSizeRateVolume}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Hours of Operation:</span><br/><span className="font-semibold">{permit.pumpingHours}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Start Date:</span><br/><span className="font-semibold">{permit.startDate}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Expiry Date:</span><br/><span className="font-semibold">{permit.expiryDate}</span></div>
                </div>
            </div>

            {/* SECTION 4: Controls & Monitoring */}
            <div className="mb-8">
                <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">4. Controls & Monitoring</h2>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Inlet Controls:</span><br/><span className="font-semibold">{permit.pumpInletControls}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Outlet Controls:</span><br/><span className="font-semibold">{permit.pumpOutletControls}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Sediment Control Point:</span><br/><span className="font-semibold">{permit.sedimentControlPoint}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Discharge Criteria:</span><br/><span className="font-semibold">{permit.dischargeCriteria}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Monitoring Location:</span><br/><span className="font-semibold">{permit.monitoringLocation}</span></div>
                    <div><span className="font-bold text-gray-600 text-xs uppercase">Monitoring Frequency:</span><br/><span className="font-semibold">{permit.monitoringFrequency}</span></div>
                </div>
            </div>

            {/* SIGNATURES: INITIAL ISSUE */}
            <div className="mb-8 grid grid-cols-2 gap-6 border-t-2 border-gray-200 pt-6">
                <div>
                    <h3 className="font-black text-sm uppercase text-gray-700 mb-2">Requester (Site Engineer)</h3>
                    {permit.siteEngineerSignature ? (
                        <>
                            <img src={permit.siteEngineerSignature.dataUrl} className="h-16 mb-1 mix-blend-multiply border-b border-gray-200 pb-1" />
                            <p className="font-bold">{permit.siteEngineerSignature.name}</p>
                            <p className="text-xs text-gray-500">{new Date(permit.siteEngineerSignature.date).toLocaleString()}</p>
                        </>
                    ) : <p className="italic text-gray-400">Not signed</p>}
                </div>
                <div>
                    <h3 className="font-black text-sm uppercase text-gray-700 mb-2">Receiver</h3>
                    {permit.receiverSignature ? (
                        <>
                            <img src={permit.receiverSignature.dataUrl} className="h-16 mb-1 mix-blend-multiply border-b border-gray-200 pb-1" />
                            <p className="font-bold">{permit.receiverSignature.name}</p>
                            <p className="text-xs text-gray-500">{new Date(permit.receiverSignature.date).toLocaleString()}</p>
                        </>
                    ) : <p className="italic text-gray-400">Not signed</p>}
                </div>
                <div>
                    <h3 className="font-black text-sm uppercase text-gray-700 mb-2">Issuer Authorization</h3>
                    {permit.issuerSignature ? (
                        <>
                            <img src={permit.issuerSignature.dataUrl} className="h-16 mb-1 mix-blend-multiply border-b border-gray-200 pb-1" />
                            <p className="font-bold">{permit.issuerSignature.name}</p>
                            <p className="text-xs text-gray-500">{new Date(permit.issuerSignature.date).toLocaleString()}</p>
                        </>
                    ) : <p className="italic text-gray-400">Not signed</p>}
                </div>
            </div>

            {/* PAGE BREAK FOR LOGS */}
            <div style={{ pageBreakBefore: 'always' }}></div>

            <div className="mt-8">
                <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">5. Monitoring Log</h2>
                
                {permit.monitoringLogs && permit.monitoringLogs.length > 0 ? (                <div className="mb-4 text-xs">
                    <div className="grid grid-cols-[150px_1fr] border border-gray-400">
                        <div className="bg-green-100 font-bold p-2 border-r border-gray-400">Monitoring requirements</div>
                        <div className="p-2 flex flex-col gap-1">
                            <div>{permit.reqClarity ? '☒' : '☐'} Clarity {'>'}100mm visibility</div>
                            <div>{permit.reqPh ? '☒' : '☐'} pH is between 5.5 & 8.5</div>
                            <div>{permit.reqSheen ? '☒' : '☐'} No oily sheen, discolouration or odour</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-[150px_1fr] border border-gray-400 border-t-0">
                        <div className="bg-green-100 font-bold p-2 border-r border-gray-400">Monitoring frequency</div>
                        <div className="p-2">{permit.monitoringFrequency || 'N/A'}</div>
                    </div>
                    <div className="border border-gray-400 border-t-0 p-2 bg-green-100">
                        <div className="font-bold">Water quality required</div>
                        <div>If criteria are not met - stop pumping and contact the permit authoriser immediately.</div>
                    </div>
                    <table className="w-full text-left border-collapse text-[10px] border border-gray-400 mt-2">
                        <thead>
                            <tr className="bg-green-100 text-gray-800 font-bold">
                                <th className="p-1 border border-gray-400">Time</th>
                                <th className="p-1 border border-gray-400">Mon Clarity/ pH</th>
                                <th className="p-1 border border-gray-400">Tues Clarity/ pH</th>
                                <th className="p-1 border border-gray-400">Wed Clarity/ pH</th>
                                <th className="p-1 border border-gray-400">Thus Clarity/ pH</th>
                                <th className="p-1 border border-gray-400">Fri Clarity/ pH</th>
                                <th className="p-1 border border-gray-400">Staff member undertaking monitoring</th>
                                <th className="p-1 border border-gray-400">Monitoring location</th>
                                <th className="p-1 border border-gray-400">Comments</th>
                            </tr>
                        </thead>
                        <tbody>
                            {permit.monitoringLogs.map(log => (
                                <tr key={log.id}>
                                    <td className="p-1 border border-gray-400">{log.time}</td>
                                    <td className="p-1 border border-gray-400">{log.mon}</td>
                                    <td className="p-1 border border-gray-400">{log.tue}</td>
                                    <td className="p-1 border border-gray-400">{log.wed}</td>
                                    <td className="p-1 border border-gray-400">{log.thu}</td>
                                    <td className="p-1 border border-gray-400">{log.fri}</td>
                                    <td className="p-1 border border-gray-400">{log.staffMember}</td>
                                    <td className="p-1 border border-gray-400">{log.monitoringLocation || ''}</td>
                                    <td className="p-1 border border-gray-400">{log.comments}</td>
                                </tr>
                            ))}
                            {permit.monitoringLogs.length === 0 && (
                                <tr><td colSpan={9} className="p-4 text-center text-gray-400 font-bold border border-gray-400">No monitoring logs recorded.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>) : (
                    <p className="italic text-gray-500">No monitoring logs recorded.</p>
                )}
            </div>

            {/* CLOSURE SECTION */}
            {permit.status === 'closed' && (
                <div className="mt-8 border border-gray-400">
                    <div className="bg-cyan-300 font-bold p-2 text-sm border-b border-gray-400 leading-tight">
                        <span className="font-black">Permit closeout person</span><br />
                        in Charge of Work to complete and return closed out permits and monitoring records to the Authoriser
                    </div>
                    <div className="bg-cyan-300 font-bold p-2 text-sm border-b border-gray-400">
                        As the Person in Charge of Work I confirm that pumping activities described in this permit have now been completed.
                    </div>
                    <div className="grid grid-cols-3">
                        <div className="p-2 border-r border-gray-400 h-16 flex flex-col justify-end relative">
                            <div className="absolute top-2 left-2 bg-cyan-300 font-bold px-1 text-sm">Name</div>
                            <div className="font-semibold text-center mt-4">{permit.closureReceiverName}</div>
                        </div>
                        <div className="p-2 border-r border-gray-400 h-16 flex flex-col justify-end relative">
                            <div className="absolute top-2 left-2 bg-cyan-300 font-bold px-1 text-sm">Signature</div>
                            {permit.closureSignature && (
                                <img src={permit.closureSignature.dataUrl} className="h-10 mx-auto mix-blend-multiply mb-1" />
                            )}
                        </div>
                        <div className="p-2 h-16 flex flex-col justify-end relative">
                            <div className="absolute top-2 left-2 bg-cyan-300 font-bold px-1 text-sm">Date</div>
                            <div className="font-semibold text-center mb-1">{permit.closureDate ? new Date(permit.closureDate).toLocaleDateString() : ''}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* PHOTOS */}
            {permit.photos && permit.photos.length > 0 && (
                <div className="mt-8" style={{ pageBreakBefore: 'always' }}>
                    <h2 className="text-lg font-black bg-blue-900 text-white px-3 py-1 uppercase tracking-widest mb-4">7. Site Layout Plan</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {permit.photos.map(p => (
                            <div key={p.id} className="border border-gray-300 p-2">
                                <img src={p.url} className="w-full h-auto" />
                                <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold">{p.caption}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PumpPermitPDFLayout;
