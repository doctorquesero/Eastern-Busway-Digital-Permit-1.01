import React from 'react';
import { Permit, ChecklistItem, Signature, HandoverLog } from '../types';
import { Phone } from 'lucide-react';

export interface PermitPDFLayoutProps {
    permit: Permit;
    pdfRef: React.RefObject<HTMLDivElement>;
    currentReceiverName: string;
    currentReceiverSignature?: Signature | null;
    partAItems: ChecklistItem[];
    partBItems: ChecklistItem[];
    receiverItems: ChecklistItem[];
    handoverItems?: ChecklistItem[];
    currentHandovers: HandoverLog[];
    CEASE_WORKS_ITEMS: { id: string; text: string }[];
}

const Page: React.FC<{ children: React.ReactNode, pageNum: number | string }> = ({ children, pageNum }) => (
    <div className="pdf-page bg-white box-border mx-auto relative flex flex-col"
        style={{ width: '210mm', height: '296mm', padding: '12mm 15mm', pageBreakAfter: 'always', pageBreakInside: 'avoid', overflow: 'hidden' }}>

        {/* HEADER */}
        <div className="flex justify-between items-end mb-4 border-b-2 border-blue-600 pb-2 shrink-0">
            <h2 className="text-2xl font-black text-blue-700 tracking-tighter">AT Eastern Busway</h2>
            <div className="text-right text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                Digital Record
            </div>
        </div>

        {/* CONTENT */}
        <div className="flex-grow">
            {children}
        </div>

        {/* FOOTER */}
        <div className="shrink-0 pt-2 mt-4 border-t border-gray-400 text-[9px] text-gray-600 flex justify-between items-end">
            <div>
                <p>Eastern Busway Alliance | Breaking Ground Permit Template</p>
                <p>Document Number: EB-PT-0-HS-000021 | Rev 14 | Date: 11th March 2025</p>
            </div>
            <div className="font-bold">
                Page {pageNum} {typeof pageNum === 'number' && pageNum <= 12 ? 'of 12' : ''}
            </div>
        </div>
    </div>
);

const EBASignature: React.FC<{ title: string; sig?: Signature | null; date?: string; initialTitle?: string }> = ({ title, sig, date, initialTitle = "Signature" }) => (
    <div className="flex border border-black text-[10px] font-bold w-full mt-2">
        <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/4 text-center uppercase">{title}</div>
        <div className="p-1 w-1/4 flex items-center justify-center border-r border-black bg-gray-50 uppercase text-center leading-tight">{sig?.name || ''}</div>
        <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/6 text-center uppercase">{initialTitle}</div>
        <div className="p-0.5 w-1/4 flex items-center justify-center border-r border-black">
            {sig?.data && <img src={sig.data} className="h-8 object-contain mix-blend-multiply" alt="sig" />}
        </div>
        <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/12 text-center uppercase">Date</div>
        <div className="p-1 w-1/6 flex items-center justify-center font-mono text-[9px] text-center">{date || (sig?.date ? new Date(sig.date).toLocaleDateString() : '')}</div>
    </div>
);

const YNBox: React.FC<{ checked: boolean; label: string }> = ({ checked, label }) => (
    <span className="inline-flex items-center ml-3">
        <span className="mr-1">{label}</span>
        <div className="w-4 h-4 border border-black flex items-center justify-center font-black text-xs leading-none pb-0.5 bg-white shrink-0">
            {checked ? 'X' : ''}
        </div>
    </span>
);

const CheckBox: React.FC<{ checked: boolean }> = ({ checked }) => (
    <div className="w-3 h-3 border border-black mx-auto flex items-center justify-center text-[10px] font-black shrink-0">{checked ? 'X' : ''}</div>
);

export const EmergencyProtocolContent: React.FC<{ isPdf?: boolean }> = ({ isPdf }) => (
    <div className={isPdf ? "mb-6" : "mt-8 bg-gray-900 text-white p-8 rounded-[2rem] no-print"}>
        <h3 className={`font-bold ${isPdf ? 'text-lg mb-2' : 'text-xl mb-4 text-red-400 flex items-center gap-2'}`}>
            {!isPdf && <Phone size={24} />} Incident procedure
        </h3>
        <p className={`font-bold ${isPdf ? 'text-[10px] mb-2' : 'text-sm mb-4'}`}>In the event of a service strike</p>
        <ul className={`list-disc pl-6 ${isPdf ? 'text-[10px] mb-4 space-y-1' : 'text-xs mb-6 space-y-2 text-gray-300'}`}>
            <li>Immediately cease works</li>
            <li>Assist any injured person and begin first aid once safe to do so</li>
            <li>Make the area safe if possible</li>
            <li>Call the Supervisor as soon as possible (Use contacts below)</li>
        </ul>
        <p className={`font-bold ${isPdf ? 'text-[10px] mb-2' : 'text-sm mb-4'}`}>Site emergency Contacts</p>
        <table className={`w-full ${isPdf ? 'text-[9px] border-collapse border border-black' : 'text-xs text-gray-400 border-collapse border border-gray-700'}`}>
            <thead>
                <tr className={isPdf ? "bg-gray-100" : "bg-gray-800 text-gray-300"}>
                    <th className={`p-2 text-left w-1/4 ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Stakeholder</th>
                    <th className={`p-2 text-left ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Details-emergency Contact Number</th>
                </tr>
            </thead>
            <tbody>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>EBA</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you damage any pipeline call Tommy Temple (027 223 1798), Dietrich Truchsess (027 337 6314), David Madigan (027 290 6761) Krishna Nand (027 405 0632) Will Ariki (027 203 0925), Michael Cassidy (027 733 2367), Matt Grohn (0272228754), Mick Nicol (0272765418)</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Vector Gas</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit a gas distribution pipe in the Auckland area call on 0800 764 764</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Vector Power</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit an electricity cable or overhead line, please call immediately on 0508 832 867</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Vector Comms</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit an electricity cable or overhead line, please call immediately on 0800 826 436</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Transpower</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit a Transpower line, evacuate the area immediately, except if you are in a machine in which case, stay there. Emergency contact 0800 843 474 or call 111</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Chorus</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit a Chorus line, please call immediately on 0800 463 896 option 2</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>One NZ</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Call 0508 651 050 Option 3</td></tr>
                <tr><td className={`p-2 font-bold ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>Watercare</td><td className={`p-2 font-medium ${isPdf ? 'border border-black' : 'border border-gray-700'}`}>If you hit any asset, please call immediately to water care's emergency response 09 442 2222</td></tr>
            </tbody>
        </table>
    </div>
);

const PermitPDFLayout: React.FC<PermitPDFLayoutProps> = ({ permit, pdfRef, currentReceiverSignature, partAItems, partBItems, receiverItems, handoverItems, currentHandovers, CEASE_WORKS_ITEMS }) => {

    const pNum = String(permit.itwocxNumber || permit.permitNumber || "").replace(/\D/g, "");

    const photos = permit.photos || [];
    const photoPages = [];
    for (let i = 0; i < photos.length; i += 2) {
        photoPages.push(photos.slice(i, i + 2));
    }

    return (
        <div ref={pdfRef} className="bg-white text-black" style={{ width: '210mm' }}>

            <style>
                {`
                @media print {
                    @page { size: A4; margin: 0 !important; }
                    body { margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                `}
            </style>

            {/* === PAGE 1 === */}
            <Page pageNum={1}>
                <div className="flex flex-col items-center justify-center h-full text-center pb-32">
                    <h1 className="text-4xl font-black text-blue-800 mb-6 uppercase">Breaking Ground Permit</h1>
                    <p className="text-xl font-bold mb-2">Permit Reference: PF#{pNum}</p>
                    <p className="text-lg text-gray-700 mb-12">Location: {permit.location}</p>

                    <div className="border-4 border-blue-100 p-8 rounded-xl max-w-lg mx-auto bg-blue-50/50 text-left">
                        <p className="font-bold text-sm mb-2 text-blue-900 uppercase">System Generated Record</p>
                        <p className="text-xs mb-1">Generated on: {new Date().toLocaleString()}</p>
                        <p className="text-xs mb-1">Status: <span className="font-black uppercase">{permit.status}</span></p>
                        <p className="text-xs mt-4 italic text-gray-600">This digital record replaces the printed CX Form. The form must be printed using a scale of 70% if hardcopy is required. No resolution is lost.</p>
                    </div>
                </div>
            </Page>

            {/* === PAGE 2 === */}
            <Page pageNum={2}>
                <h2 className="text-2xl font-bold text-blue-600 mb-4">Site Plan</h2>
                <p className="text-xs mb-4">This permit includes a mandatory map outlining the work zone and marked service locations, based on existing plans.<br />EBA and NUO service plans are also attached for required sites:</p>
                <p className="text-xs font-bold mb-2">Note:</p>
                <p className="text-xs mb-2">The EBA service plans need the following:</p>
                <ul className="list-disc pl-8 text-xs mb-8 space-y-1">
                    <li>select the Reveal Model layer {permit.revealModelLayer ? <span className="font-black ml-2">✓</span> : ''}</li>
                    <li>select all sub layers {permit.subLayers ? <span className="font-black ml-2">✓</span> : ''}</li>
                    <li>select the EBA construction layer {permit.ebaConstructionLayer ? <span className="font-black ml-2">✓</span> : ''}</li>
                    <li>all as built layers underneath {permit.asBuiltLayers ? <span className="font-black ml-2">✓</span> : ''}</li>
                </ul>

                <table className="w-full text-xs border-collapse border border-black mb-6">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-black p-2 text-left w-1/3">Service</th>
                            <th className="border border-black p-2 text-left w-1/3">Network Utility Operator</th>
                            <th className="border border-black p-2 text-left w-1/3">GIS Colour</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td className="border border-black p-2 font-bold text-orange-500">Electricity</td><td className="border border-black p-2">Vector/ Transpower</td><td className="border border-black p-2 font-bold text-orange-500">Orange</td></tr>
                        <tr><td className="border border-black p-2 font-bold text-yellow-500">Gas</td><td className="border border-black p-2">Vector</td><td className="border border-black p-2 font-bold text-yellow-500">Yellow</td></tr>
                        <tr><td className="border border-black p-2 font-bold text-purple-600">Telecommunication</td><td className="border border-black p-2">Chorus/ One NZ/ Vector Comms</td><td className="border border-black p-2 font-bold text-purple-600">Purple</td></tr>
                        <tr><td className="border border-black p-2 font-bold text-blue-500">Water</td><td className="border border-black p-2">Watercare</td><td className="border border-black p-2 font-bold text-blue-500">Blue</td></tr>
                        <tr><td className="border border-black p-2 font-bold text-red-600">Wastewater (Sewer)</td><td className="border border-black p-2">Watercare</td><td className="border border-black p-2 font-bold text-red-600">Red</td></tr>
                        <tr><td className="border border-black p-2 font-bold text-green-600">Stormwater/ Drainage</td><td className="border border-black p-2">Auckland Council</td><td className="border border-black p-2 font-bold text-green-600">Green</td></tr>
                    </tbody>
                </table>
            </Page>

            {/* === PAGE 3 === */}
            <Page pageNum={3}>
                <table className="w-full text-[10px] border-collapse border border-black mb-4">
                    <thead><tr><th className="border border-black p-1 text-left bg-gray-100" colSpan={2}>Details of any known underground services at or near the area of excavation</th></tr></thead>
                    <tbody>
                        <tr><td className="border border-black p-1" colSpan={2}>Details of underground services are appended to this Permit to dig. A before-u-dig request has been submitted to ascertain the assets owned by the utility companies. The Eastern Busway Alliance Utility Engineers have contacted the utility companies and have uploaded all details onto the project GIS software. Utility companies contacted are</td></tr>
                        <tr>
                            <td className="border border-black p-1 w-1/2 align-top">Vector (electric and gas)<br />Chorus (fibre optic and internet)<br />One NZ (telecommunications)</td>
                            <td className="border border-black p-1 w-1/2 align-top">Watercare (water distribution and wastewater sewer)<br />Auckland Council (Stormwater)<br />Transpower (high voltage electric) the Transpower designation is shown on GIS</td>
                        </tr>
                    </tbody>
                </table>

                <div className="bg-blue-600 text-white font-bold text-xs p-1 border border-black border-b-0">To be filled in by the permit issuer</div>
                <div className="bg-blue-500 text-white font-bold text-[10px] p-1 border border-black border-b-0">Approval is subject to the following conditions/procedures/precautions (Isolation of known underground services etc)</div>
                <table className="w-full text-[10px] border-collapse border border-black mb-4">
                    <thead>
                        <tr className="bg-blue-500 text-white">
                            <th className="border border-black p-1 text-left">Check</th>
                            <th className="border border-black p-1 w-28">Response</th>
                            <th className="border border-black p-1 w-40 text-left">Issuer Comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border border-black p-1 font-medium">Has the area for this permit been scanned</td>
                            <td className="border border-black p-1 font-bold text-right"><YNBox checked={permit.knownServicesScanned === 'yes'} label="Y" /><YNBox checked={permit.knownServicesScanned === 'no'} label="N" /><YNBox checked={permit.knownServicesScanned === 'n/a'} label="N/A" /></td>
                            <td className="border border-black p-1 text-[8px]">{permit.issuerComments?.knownServicesScanned || ''}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 font-medium">Known active services physically marked out on site.</td>
                            <td className="border border-black p-1 text-right font-bold"><YNBox checked={permit.servicesMarked === 'yes'} label="Y" /><YNBox checked={permit.servicesMarked === 'no'} label="N" /><YNBox checked={permit.servicesMarked === 'n/a'} label="N/A" /></td>
                            <td className="border border-black p-1 text-[8px]">{permit.issuerComments?.servicesMarked || ''}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 font-medium">If you are potholing have you got depth markers for holes when back filling?</td>
                            <td className="border border-black p-1 text-right font-bold"><YNBox checked={permit.potholingMarkers === 'yes'} label="Y" /><YNBox checked={permit.potholingMarkers === 'no'} label="N" /><YNBox checked={permit.potholingMarkers === 'n/a'} label="N/A" /></td>
                            <td className="border border-black p-1 text-[8px]">{permit.issuerComments?.potholingMarkers || ''}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 font-medium">Is the work within the Transpower Designation Area &amp; a S176 is in place?</td>
                            <td className="border border-black p-1 text-right font-bold"><YNBox checked={permit.transpowerDesignation === 'yes'} label="Y" /><YNBox checked={permit.transpowerDesignation === 'no'} label="N" /><YNBox checked={permit.transpowerDesignation === 'n/a'} label="N/A" /></td>
                            <td className="border border-black p-1 text-[8px]">{permit.issuerComments?.transpowerDesignation || ''}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 font-medium">Have the works complied with Watercare's "Works Over Approval" form, for distances of 2 meters or less from pipelines &lt;375 mm and 10 meters or less from pipelines ≥375 mm according to the COP?</td>
                            <td className="border border-black p-1 text-right font-bold"><YNBox checked={permit.watercareWorksOver === 'yes'} label="Y" /><YNBox checked={permit.watercareWorksOver === 'no'} label="N" /><YNBox checked={permit.watercareWorksOver === 'n/a'} label="N/A" /></td>
                            <td className="border border-black p-1 text-[8px]">{permit.issuerComments?.watercareWorksOver || ''}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="border border-black flex-grow flex flex-col mb-4">
                    <div className="bg-gray-100 font-bold text-[10px] p-1 border-b border-black shrink-0">Scope of works for excavation (To be filled out by the Engineer):</div>
                    <div className="p-2 text-[10px] font-medium whitespace-pre-wrap flex-grow">{permit.scopeOfWorks}</div>
                </div>

                <EBASignature title="Permit Issuer" sig={permit.issuerSignature} />
            </Page>

            {/* === PAGE 4 === */}
            <Page pageNum={4}>
                <h2 className="text-xl font-bold text-blue-600 mb-2">Part A Service identification</h2>
                <p className="text-red-600 text-[10px] font-bold mb-2">Completion and approval of the checklist below will enable hydro excavation works <span className="underline">Only</span>. Part B will require further authorisation (refer to page 6).</p>
                <p className="text-[10px] mb-2">If the answer to any item is no, then work cannot proceed until the relevant item has been completed or risk assessed, and the hazard has been controlled.</p>

                <table className="w-full text-[9px] border-collapse border border-black mb-4">
                    <thead className="bg-blue-600 text-white">
                        <tr><th className="border border-black p-1 w-8">Item</th><th className="border border-black p-1 text-left">Check</th><th className="border border-black p-1 w-8">Yes</th><th className="border border-black p-1 w-8">No</th><th className="border border-black p-1 w-40">Comment</th></tr>
                    </thead>
                    <tbody>
                        {partAItems.slice(0, 4).map(item => (
                            <tr key={item.id}>
                                <td className="border border-black p-1 text-center font-bold">{item.id.replace(/[a-z]/g, '')}.</td>
                                <td className="border border-black p-1">{item.question}</td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'yes'} /></div></td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'no'} /></div></td>
                                <td className="border border-black p-1 text-[8px]">{item.comment}</td>
                            </tr>
                        ))}
                        <tr>
                            <td className="border border-black p-1 text-center font-bold align-top">4.</td>
                            <td className="border border-black p-1 align-top" colSpan={4}>Based on the risk of this job/site, what type of potholing is to be completed on this job (e.g. hydro or air excavation, hand digging, etc.) List the tools being used for potholing.<br /><div className="mt-2 text-blue-800 font-bold">{permit.partAPotholingMethod}</div></td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 text-center font-bold align-top">5.</td>
                            <td className="border border-black p-1 p-0 align-top" colSpan={4}>
                                <div className="p-1">If applicable, what is the frequency of the potholing/slotting to be done to identify the applicable services?</div>
                                <div className="border-t border-black grid grid-cols-2 text-center divide-x divide-black bg-gray-50"><div className="p-1">{permit.partAFrequency} Meters between slots</div><div className="p-1">{!permit.partAFrequency ? 'Not applicable' : ''}</div></div>
                            </td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 text-center font-bold align-top">6.</td>
                            <td className="border border-black p-0 align-top" colSpan={4}>
                                <div className="p-1 flex justify-between items-start">
                                    <div className="w-1/2 pr-2">State the requirements for close approach permits on this job; <strong>both</strong> underground and overhead.</div>
                                    <div className="w-1/2 font-bold text-right pt-1">Required Permits obtained: <YNBox checked={permit.partACloseApproach?.permitsObtained === 'yes'} label="Yes" /><YNBox checked={permit.partACloseApproach?.permitsObtained === 'no'} label="No" /></div>
                                </div>
                                <table className="w-full text-[9px] border-t border-black text-left">
                                    <thead className="bg-gray-100"><tr><th className="border-r border-black p-1 w-1/4">Overhead</th><th className="border-r border-black p-1 w-1/4">Distance</th><th className="border-r border-black p-1 w-1/4">Underground</th><th className="p-1 w-1/4">Distance</th></tr></thead>
                                    <tbody>
                                        <tr className="border-t border-black"><td className="border-r border-black p-1">Electricity:</td><td className="border-r border-black p-1 font-bold">{permit.partACloseApproach?.overheadElectricityDist}</td><td className="border-r border-black p-1">Electricity:</td><td className="p-1 font-bold">{permit.partACloseApproach?.undergroundElectricityDist}</td></tr>
                                        <tr className="border-t border-black"><td className="border-r border-black p-1">Rail:</td><td className="border-r border-black p-1 font-bold">{permit.partACloseApproach?.overheadRailDist}</td><td className="border-r border-black p-1">Fibre:</td><td className="p-1 font-bold">{permit.partACloseApproach?.undergroundFibreDist}</td></tr>
                                        <tr className="border-t border-black"><td className="border-r border-black p-1">Other:</td><td className="border-r border-black p-1 font-bold">{permit.partACloseApproach?.overheadOtherDist}</td><td className="border-r border-black p-1">Gas:</td><td className="p-1 font-bold">{permit.partACloseApproach?.undergroundGasDist}</td></tr>
                                        <tr className="border-t border-black"><td className="border-r border-black p-1 bg-gray-50"></td><td className="border-r border-black p-1 bg-gray-50"></td><td className="border-r border-black p-1">Water or other:</td><td className="p-1 font-bold">{permit.partACloseApproach?.undergroundWaterDist}</td></tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 text-center font-bold">7.</td>
                            <td className="border border-black p-1" colSpan={4}>What means of overhead service protection have I provided for this job?<br /><div className="mt-1 text-blue-800 font-bold">{permit.partAOverheadProtection}</div></td>
                        </tr>
                        <tr>
                            <td className="border border-black p-1 text-center font-bold">8.</td>
                            <td className="border border-black p-1">{partAItems.find(i => i.id === '8')?.question}</td>
                            <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={partAItems.find(i => i.id === '8')?.answer === 'yes'} /></div></td>
                            <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={partAItems.find(i => i.id === '8')?.answer === 'no'} /></div></td>
                            <td className="border border-black p-1 text-[8px]">{partAItems.find(i => i.id === '8')?.comment}</td>
                        </tr>
                    </tbody>
                </table>
                <div className="mt-auto space-y-2">
                    <EBASignature title="Permit Requester" sig={permit.siteEngineerSignature} />
                    {/* 🚀 FIX: Usamos permit.receiverSignature (el receptor inicial/inducción) para congelar la Parte A */}
                    <EBASignature title="Permit Receiver" sig={permit.receiverSignature} />
                </div>
            </Page>

            {/* === PAGE 5 === */}
            <Page pageNum={5}>
                <h2 className="text-xl font-bold text-blue-600 mb-2">Part B Mechanical Excavation</h2>
                <p className="text-red-600 text-[10px] mb-2 font-bold uppercase">Permit Approver MUST attend site before starting any mechanical excavation.</p>
                <p className="text-red-600 text-[10px] mb-2">Checks to be made BEFORE mechanical digging.</p>
                <p className="text-[10px] mb-4">If the answer to any item is no, then work cannot proceed until the relevant item has been completed or risk assessed, and the hazard has been controlled. Note details of this in the relevant Comment section below.</p>
                <p className="font-bold text-[11px] mb-1">Approver checklist</p>

                <table className="w-full text-[9px] border-collapse border border-black mb-8">
                    <thead className="bg-blue-600 text-white">
                        <tr><th className="border border-black p-1 w-8">Item</th><th className="border border-black p-1 text-left">Check</th><th className="border border-black p-1 w-8">Yes</th><th className="border border-black p-1 w-8">No</th><th className="border border-black p-1 w-8">N/A</th><th className="border border-black p-1 w-32">Supplier of info/comment</th></tr>
                    </thead>
                    <tbody>
                        {partBItems.map(item => (
                            <tr key={item.id}>
                                <td className="border border-black p-1 text-center font-bold">{item.id}.</td>
                                <td className="border border-black p-1">
                                    {item.question}
                                    {item.id === '4' && <div className="text-red-600 mt-1 font-bold">{'>'}11kV mains power, high pressure gas, main fibre, watermains {'>'}300mm and sewer {'>'}300mm</div>}
                                    {item.id === '5' && <div className="text-red-600 mt-1 font-bold">{'>'}11kV mains power, high pressure gas, main fibre.</div>}
                                </td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'yes'} /></div></td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'no'} /></div></td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'n/a'} /></div></td>
                                <td className="border border-black p-1 text-[8px] text-center">{item.comment}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="text-[9px] font-bold text-center border p-2 mb-2 bg-gray-50">NOTE: Any unidentified service found, must be treated as live until confirmed otherwise.</p>

                {/* Approver Comments Block */}
                {permit.approverComments && Object.values(permit.approverComments).some(v => v && v.trim()) && (
                    <div className="border border-black mb-2">
                        <div className="bg-blue-600 text-white font-bold text-[9px] p-1">Approver Comments</div>
                        <table className="w-full text-[9px] border-collapse">
                            <tbody>
                                {partBItems.map(item => {
                                    const comment = permit.approverComments?.[item.id];
                                    if (!comment || !comment.trim()) return null;
                                    return (
                                        <tr key={item.id}>
                                            <td className="border-b border-black p-1 font-bold w-8 text-center align-top">{item.id}.</td>
                                            <td className="border-b border-black p-1 whitespace-pre-wrap">{comment}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <EBASignature title="Permit Approver" sig={permit.approverSignature} />
            </Page>

            {/* === PAGE 6 === */}
            <Page pageNum={6}>
                <h2 className="text-xl font-bold text-black mb-2">Receiver checklist</h2>
                <p className="text-red-600 text-[10px] mb-2">Checks to be made BEFORE mechanical digging.</p>
                <p className="text-[10px] mb-4">If the answer to any item is no, then work cannot proceed until the relevant item has been completed or risk assessed, and the hazard has been controlled. Note details of this in the relevant Comment section below.</p>

                <table className="w-full text-[9px] border-collapse border border-black mb-4">
                    <thead className="bg-blue-600 text-white">
                        <tr><th className="border border-black p-1 w-8">Item</th><th className="border border-black p-1 text-left">Check</th><th className="border border-black p-1 w-8">Yes</th><th className="border border-black p-1 w-8">No</th><th className="border border-black p-1 w-32">Supplier of info/comment</th></tr>
                    </thead>
                    <tbody>
                        {receiverItems.map(item => (
                            <tr key={item.id}>
                                <td className="border border-black p-1 text-center font-bold">{item.id}.</td>
                                <td className="border border-black p-1">{item.question}</td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'yes'} /></div></td>
                                <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={item.answer === 'no'} /></div></td>
                                <td className="border border-black p-1 text-[8px] text-center">{item.comment}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <p className="text-red-600 text-[10px] font-bold mb-4">The original copy of this Permit must be retained at the work location while work is occurring.</p>
                <p className="text-[10px] mb-4">I confirm that all the requirements of these checklists have been met and work may now proceed in accordance with the WMS, JSEA and SP27 Safe Work around Overhead and Underground Services.</p>
                {/* 🚀 FIX: Usamos permit.receiverSignature (el receptor inicial/inducción) para congelar la página 6 */}
                <EBASignature title="Permit Receiver" sig={permit.receiverSignature} />
            </Page>

            {/* === PAGE 7 === */}
            <Page pageNum={7}>
                <p className="text-red-600 text-sm mb-4">Cease works if you encounter any of the below section and call the permit issuer:</p>
                <table className="w-full text-[10px] border-collapse border border-black mb-8">
                    <tbody>
                        {CEASE_WORKS_ITEMS.map(item => (
                            <tr key={item.id}>
                                <td className="border border-black p-2 text-center w-8 font-bold">{item.id}.</td>
                                <td className="border border-black p-2 leading-relaxed text-[11px]"><span dangerouslySetInnerHTML={{ __html: item.text.replace(/must stop/g, '<strong>must stop</strong>').replace(/before/g, '<strong>before</strong>').replace(/reviewed/g, '<strong>reviewed</strong>').replace(/signed/g, '<strong>signed</strong>') }} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="flex border border-black text-[10px] font-bold w-full h-12">
                    <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/4 text-center">Permit Issuer</div>
                    <div className="p-2 w-1/4 border-r border-black flex items-center justify-center bg-gray-50 uppercase text-[9px] text-center">{permit.ceaseWorksRecord?.issuerName || ''}</div>
                    <div className="p-1 w-1/6 border-r border-black text-center text-[9px] flex flex-col justify-center">Item No#:<br /><span className="text-red-600 text-sm font-black">{permit.ceaseWorksRecord?.affectedItemNumber || ''}</span></div>
                    <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/6 text-center">Signature</div>
                    <div className="p-1 w-1/4 border-r border-black flex items-center justify-center">
                        {permit.ceaseWorksRecord?.issuerSignature?.data && <img src={permit.ceaseWorksRecord.issuerSignature.data} className="h-8 mix-blend-multiply" alt="sig" />}
                    </div>
                    <div className="bg-blue-700 text-white p-2 flex items-center justify-center w-1/12 text-center">Date</div>
                    <div className="p-2 w-1/6 text-[9px] text-center font-mono flex items-center justify-center">
                        {permit.ceaseWorksRecord?.date ? new Date(permit.ceaseWorksRecord.date).toLocaleDateString() : ''}
                    </div>
                </div>
            </Page>

            {/* === PAGE 8 === */}
            <Page pageNum={8}>
                <h2 className="text-lg font-bold text-black mb-2">Receiver hand over checklist</h2>
                <p className="text-[10px] mb-2">When the permit to break ground is required to be handed over to a new work group, please ensure a qualified permit receiver is available to receive the permit.</p>
                <p className="text-[10px] mb-4">New permit receiver is to complete the below table and initial beside the check box to confirm they have been briefed on the permit information by the previous permit receiver.<br /><span className="text-red-600">The Yes/No answers in the below table are to be an exact reflection of the checklist on page 6.</span></p>

                <table className="w-full text-[9px] border-collapse border border-black">
                    <thead className="bg-blue-600 text-white text-center">
                        <tr><th className="border border-black p-1 w-6">Item</th><th className="border border-black p-1 text-left w-64">Check</th><th className="border border-black p-1 w-6">Yes</th><th className="border border-black p-1 w-6">No</th>
                            {[1, 2, 3, 4, 5, 6, 7].map(n => <th key={n} className="border border-black p-1 w-10">Initial<br />{n}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(handoverItems || []).slice(0, 7).map(item => {
                            const origAns = receiverItems.find(r => r.id === item.id)?.answer;
                            return (
                                <tr key={item.id}>
                                    <td className="border border-black p-1 text-center font-bold">{item.id}.</td>
                                    <td className="border border-black p-1 leading-tight">{item.question}</td>
                                    <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={origAns === 'yes'} /></div></td>
                                    <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={origAns === 'no'} /></div></td>
                                    {[0, 1, 2, 3, 4, 5, 6].map(i => (
                                        <td key={i} className="border border-black p-0 text-center align-middle">
                                            {currentHandovers[i]?.signature?.data && <img src={currentHandovers[i].signature.data} className="h-6 w-8 mx-auto object-contain mix-blend-multiply" alt="sig" />}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </Page>

            {/* === PAGE 9 === */}
            <Page pageNum={9}>
                <table className="w-full text-[9px] border-collapse border border-black mb-8">
                    <thead className="bg-blue-600 text-white text-center">
                        <tr><th className="border border-black p-1 w-6">Item</th><th className="border border-black p-1 text-left w-64">Check</th><th className="border border-black p-1 w-6">Yes</th><th className="border border-black p-1 w-6">No</th>
                            {[1, 2, 3, 4, 5, 6, 7].map(n => <th key={n} className="border border-black p-1 w-10">Initial<br />{n}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(handoverItems || []).slice(7, 11).map(item => {
                            const origAns = receiverItems.find(r => r.id === item.id)?.answer;
                            return (
                                <tr key={item.id}>
                                    <td className="border border-black p-1 text-center font-bold">{item.id}.</td>
                                    <td className="border border-black p-1 leading-tight">{item.question}</td>
                                    <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={origAns === 'yes'} /></div></td>
                                    <td className="border border-black p-0"><div className="flex justify-center"><CheckBox checked={origAns === 'no'} /></div></td>
                                    {[0, 1, 2, 3, 4, 5, 6].map(i => (
                                        <td key={i} className="border border-black p-0 text-center align-middle">
                                            {currentHandovers[i]?.signature?.data && <img src={currentHandovers[i].signature.data} className="h-6 w-8 mx-auto object-contain mix-blend-multiply" alt="sig" />}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                <p className="text-[10px] font-bold mb-2">Signature required below to acknowledge the above table has been reviewed and understood.</p>
                <table className="w-full text-[10px] border-collapse border border-black">
                    <thead className="bg-blue-600 text-white">
                        <tr><th className="border border-black p-2 w-16 text-center">Handover number</th><th className="border border-black p-2 text-left">Permit Receiver name</th><th className="border border-black p-2 text-left">Signature</th><th className="border border-black p-2 w-16 text-center">Initial</th><th className="border border-black p-2 w-20 text-left">Date</th></tr>
                    </thead>
                    <tbody>
                        {[0, 1, 2, 3, 4, 5, 6].map(i => {
                            const h = currentHandovers[i];
                            return (
                                <tr key={i} className="h-8">
                                    <td className="border border-black p-1 text-center">{i + 1}.</td>
                                    <td className="border border-black p-1 font-bold uppercase">{h?.receiverName || ''}</td>
                                    <td className="border border-black p-0"><div className="flex justify-start pl-2">{h?.signature?.data && <img src={h.signature.data} className="h-6 object-contain mix-blend-multiply" alt="sig" />}</div></td>
                                    <td className="border border-black p-0"><div className="flex justify-center">{h?.signature?.data && <img src={h.signature.data} className="h-4 object-contain mix-blend-multiply" alt="sig" />}</div></td>
                                    <td className="border border-black p-1 font-mono text-[9px]">{h?.date ? new Date(h.date).toLocaleDateString() : ''}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </Page>

            {/* === PAGE 10 === */}
            <Page pageNum={10}>
                <p className="text-[10px] font-bold mb-2">Daily sign off of this Permit is required by the foreman, excavator operator and spotter.</p>
                <table className="w-full text-[10px] border-collapse border border-black mb-8">
                    <tbody>
                        <tr className="bg-blue-600 text-white font-bold"><td colSpan={6} className="p-1 border border-black">Daily sign off: confirmation all the above requirements have been completed and understood</td></tr>
                        <tr><td className="bg-blue-600 text-white font-bold p-1 border border-black w-40">Date</td>
                            {[0, 1, 2, 3, 4].map(i => <td key={i} className="border border-black p-1 text-center font-mono">{permit.dailyLogs?.[i]?.date || ''}</td>)}
                        </tr>
                        <tr><td className="bg-blue-600 text-white font-bold p-1 border border-black">Reviewed by Permit Receiver</td>
                            {[0, 1, 2, 3, 4].map(i => <td key={i} className="border border-black p-0 text-center h-8">{permit.dailyLogs?.[i]?.receiverSig?.data && <img src={permit.dailyLogs[i].receiverSig.data} className="h-6 mx-auto mix-blend-multiply" alt="sig" />}</td>)}
                        </tr>
                        <tr><td className="bg-blue-600 text-white font-bold p-1 border border-black">Signed by excavator operator</td>
                            {[0, 1, 2, 3, 4].map(i => <td key={i} className="border border-black p-0 text-center h-8">{permit.dailyLogs?.[i]?.excavatorSig?.data && <img src={permit.dailyLogs[i].excavatorSig.data} className="h-6 mx-auto mix-blend-multiply" alt="sig" />}</td>)}
                        </tr>
                        <tr><td className="bg-blue-600 text-white font-bold p-1 border border-black">Signed by spotter</td>
                            {[0, 1, 2, 3, 4].map(i => <td key={i} className="border border-black p-0 text-center h-8">{permit.dailyLogs?.[i]?.spotterSig?.data && <img src={permit.dailyLogs[i].spotterSig.data} className="h-6 mx-auto mix-blend-multiply" alt="sig" />}</td>)}
                        </tr>
                    </tbody>
                </table>

                <p className="text-[10px] mb-4">Once work is complete, and the Permit is closed, it must be uploaded to CX and the hard copy returned to the permit issuer.</p>
                <div className="bg-blue-200 font-bold p-1 border border-black text-[10px] uppercase pl-2">PART I: WORK CREW SIGN-ON</div>
                <p className="text-[10px] my-2 font-bold">This Section is to be completed by all personnel who will be part of the excavation crew</p>
                <p className="text-[10px] mb-1 font-bold">By signing below, I agree that:</p>
                <ul className="list-disc pl-6 text-[9px] mb-4 space-y-1">
                    <li>I understand the work methods and controls required, my role / tasks, and have read and understand this Permit and related JSEA</li>
                    <li>I am competent to operate identified equipment / perform an identified rescue role as relevant to my role</li>
                    <li>I do not suffer from any medical or other condition that may impede my ability to perform this work</li>
                    <li>I will notify my supervisor immediately if I become aware of a new hazard or change in conditions while performing the works.</li>
                </ul>

                <table className="w-full text-[10px] border-collapse border border-black">
                    <thead className="bg-gray-100 text-left">
                        <tr><th className="border border-black p-1 w-1/4">Name</th><th className="border border-black p-1 w-1/6">Date</th><th className="border border-black p-1 w-1/4">Signature</th>
                            <th className="border border-black p-1 w-1/4">Name</th><th className="border border-black p-1 w-1/6">Date</th><th className="border border-black p-1 w-1/4">Signature</th></tr>
                    </thead>
                    <tbody>
                        {[0, 2, 4, 6, 8, 10, 12, 14].map(idx => {
                            const m1 = permit.crewMembers?.[idx];
                            const m2 = permit.crewMembers?.[idx + 1];
                            return (
                                <tr key={idx} className="h-8">
                                    <td className="border border-black p-1 uppercase font-bold text-[9px]">{m1?.name || ''}</td><td className="border border-black p-1 font-mono text-[8px]">{m1?.dateInducted ? new Date(m1.dateInducted).toLocaleDateString() : ''}</td><td className="border border-black p-0 text-center">{m1?.signature?.data && <img src={m1.signature.data} className="h-6 mx-auto mix-blend-multiply" alt="sig" />}</td>
                                    <td className="border border-black p-1 uppercase font-bold text-[9px]">{m2?.name || ''}</td><td className="border border-black p-1 font-mono text-[8px]">{m2?.dateInducted ? new Date(m2.dateInducted).toLocaleDateString() : ''}</td><td className="border border-black p-0 text-center">{m2?.signature?.data && <img src={m2.signature.data} className="h-6 mx-auto mix-blend-multiply" alt="sig" />}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </Page>

            {/* === PAGE 11 === */}
            <Page pageNum={11}>
                <div className="bg-gray-100 font-bold text-[10px] p-1 border border-black mb-2 uppercase pl-2">
                    PERMIT CLOSURE (To be completed by Supervisor of Works Crew once work is complete)<br /><span className="font-normal capitalize text-[9px]">Check as Appropriate</span>
                </div>
                <div className="border border-black p-4 text-[10px] space-y-4 mb-8">
                    <div className="flex items-start gap-2"><div className="mt-0.5"><CheckBox checked={permit.closureChecklistExcavationSafe || false} /></div><span className="font-bold">The authorised excavation has been completed and the work site has been left in a safe condition.</span></div>
                    <div className="flex items-start gap-2"><div className="mt-0.5"><CheckBox checked={permit.closureChecklistAsBuiltReturned || false} /></div><span className="font-bold">The site services plan has been accurately As Built for all new services and returned to the Site Services Coordinator.</span></div>
                    <div className="flex items-start gap-2"><div className="mt-0.5"><CheckBox checked={permit.closureChecklistOutstandingWorks || false} /></div><span className="font-bold">• The work has not been completed and the following remains outstanding:</span></div>
                    {permit.closureChecklistOutstandingWorks && <div className="ml-6 p-2 border border-gray-400 min-h-[40px] italic font-medium">{permit.closureOutstandingWorksDetails}</div>}
                </div>

                <EBASignature title="Permit Receiver" sig={permit.closureSignature} date={permit.closureDate ? new Date(permit.closureDate).toLocaleDateString() : ''} initialTitle="Time" />

                <div className="mt-8 text-[9px] leading-relaxed font-medium">
                    <p className="font-black text-xs mb-2 uppercase">NOTES: Special requirements in relation to unique services:</p>
                    <p className="mb-4 italic">e.g. utility representative stand over, designated trained spotter, residents notified, client representative, plan for continuous service</p>

                    <p className="font-black mt-2">Transpower: <span className="font-medium">A close approach consent is required for:</span></p>
                    <ul className="list-disc pl-6 mb-2 space-y-1"><li>6.4 meters from Power poles/pylons horizontally</li><li>6.4 meters from Overhead lines vertically and horizontally</li></ul>
                    <p className="mb-4">Direct contact for Transpower is Mike Booth 027 2221 087.<br />Agreement for stand over and permits to be organised though Mark McLaughlin 027 202 8948 (EBA)<br />Five working days' notice is required for permit to work.</p>

                    <p className="font-black mt-2">Vector: <span className="font-medium">Close Approach Consents are required for:</span></p>
                    <ul className="list-disc pl-6 mb-2 space-y-1"><li>All works within 2 metres of strategic cables or pipes.</li><li>Excavating within 6.4 metres of a power pole.</li><li>Excavating within 5 metres of a Distribution Sub Station and 10 metres within a Zone Substation</li><li>Working within 4 metres of overhead lines</li></ul>
                    <p className="mb-4">Contact 0508 832 867 to request a consent at least 2 full days before you need close approach consent.</p>

                    <p className="mb-2"><span className="font-black">Watercare:</span> Contact Asset Protection Technician Charles Gurr 021 86 9367. And 72 hours' notice is required to arrange inspection.</p>
                    <p className="mb-2"><span className="font-black">Chorus:</span> Chorus have listed the locations where they require a stand-over. There is a two-week lead time to organise this.<br />Contact Edward Blackwell 027 839 9817 for the investigation works nearby Chorus assets.</p>
                    <p className="mb-4"><span className="font-black">One NZ:</span> Stand over not required for site investigations, refer to UELP for more details.</p>
                    <p className="mb-4 font-bold">Refer to "Site Investigations Utilities Location Execution plan" for close approach requirements for all utilities."</p>
                    <div className="font-black text-xs text-center border p-2 mt-4">All archaeological items and unknown underground services uncovered during excavation shall be immediately reported to the Supervisor and all work shall cease until further notice is given</div>
                </div>
            </Page>

            {/* === PAGE 12 === */}
            <Page pageNum={12}>
                <EmergencyProtocolContent isPdf={true} />

                <div className="border border-black min-h-[300px] flex flex-col mt-4">
                    <div className="bg-gray-100 font-bold text-[10px] p-1 border-b border-black shrink-0">Other Notes (these notes are not to be conditional comments)</div>
                    <div className="p-2 text-[10px] whitespace-pre-wrap flex-grow">{permit.otherNotes}</div>
                </div>
            </Page>

            {/* === PÁGINAS ADICIONALES: FOTOS (2 por página) === */}
            {photoPages.map((photoPair, index) => (
                <Page key={`photo-page-${index}`} pageNum={`13.${index + 1}`}>
                    <h2 className="text-xl font-bold text-blue-800 mb-6 uppercase border-b-2 border-gray-300 pb-2">Photographic Evidence - Part {index + 1}</h2>
                    <div className="flex flex-col gap-8 h-full">
                        {photoPair.map(p => (
                            <div key={p.id} className="border-2 border-black p-2 text-center rounded bg-gray-50 flex-1 flex flex-col">
                                <img src={p.url} className="w-full object-contain mb-2 flex-grow" style={{ maxHeight: '400px' }} alt="evidence" />
                                <p className="font-black text-[12px] uppercase bg-white p-2 border border-black shrink-0">{p.caption}</p>
                            </div>
                        ))}
                    </div>
                </Page>
            ))}

        </div>
    );
};

export default PermitPDFLayout;