import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { HandheldSawPermitDetails, Permit, Signature } from '../types';
import { buildAuditPdfUrl } from '../utils/auditUrl';
import { getAppMode } from '../utils/appMode';
import {
    HANDHELD_SAW_APPROVAL_LEGAL_WARNING,
    HANDHELD_SAW_SERVICES,
    HANDHELD_SAW_TITLE,
    HANDHELD_SAW_VALIDITY_DAYS,
    HANDHELD_SAW_WORK_CONTROLS,
    formatHandheldSawPermitNumber,
    hasUploadedApprovalPdf,
    timeTo12Hour
} from '../utils/handheldSawPermit';

interface HandheldSawPermitPDFLayoutProps {
    permit: Permit;
}

const value = (input: unknown) => String(input ?? '').trim() || '—';
const yesNo = (input: unknown) => input === 'yes' ? 'YES' : input === 'no' ? 'NO' : '—';
const dateTime = (input?: string) => input ? new Date(input).toLocaleString() : '—';
const permitDateTime = (date?: string, time?: string) => {
    const parsedTime = timeTo12Hour(time || '');
    return `${value(date)} · ${parsedTime.hour && parsedTime.minute ? `${parsedTime.hour}:${parsedTime.minute} ${parsedTime.period}` : 'Time not set'}`;
};
const signatureDate = (input?: string) => input ? new Date(input).toLocaleDateString() : '—';
const signatureTime = (input?: string) => input ? new Date(input).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—';
const issueDate = (input?: string) => input ? new Date(input).toLocaleString() : 'Not issued';

const SignatureBlock: React.FC<{ title: string; signature?: Signature; name?: string; comments?: string }> = ({ title, signature, name, comments }) => (
    <div className="border border-gray-500 p-3 min-h-24 break-inside-avoid">
        <h3 className="font-bold uppercase text-xs mb-2">{title}</h3>
        {signature?.data ? <img src={signature.data} alt={`${title} signature`} className="h-12 max-w-full object-contain object-left mb-1" /> : <div className="h-12 border-b border-gray-400 mb-1" />}
        <p><b>Name:</b> {value(name || signature?.name)}</p>
        <p><b>Date:</b> {signatureDate(signature?.date)} <b>Time (24 hr):</b> {signatureTime(signature?.date)}</p>
        {comments !== undefined && <p className="mt-1 whitespace-pre-wrap"><b>Further comments:</b> {value(comments)}</p>}
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-5">
        <h2 className="bg-gray-200 border-y-2 border-black px-3 py-2 font-black uppercase tracking-wide">{title}</h2>
        <div className="pt-3">{children}</div>
    </section>
);

const Pair: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value: content }) => (
    <div className="border-b border-gray-300 py-2"><b>{label}:</b> <span className="whitespace-pre-wrap">{content || '—'}</span></div>
);

const HandheldSawPermitPDFLayout: React.FC<HandheldSawPermitPDFLayoutProps> = ({ permit }) => {
    const data: HandheldSawPermitDetails = permit.handheldSaw!;
    const formattedPermitNumber = formatHandheldSawPermitNumber(permit.itwocxNumber || permit.permitNumber);
    const hasApprovalPdf = hasUploadedApprovalPdf(data);
    const invalidServiceFlag = Object.values(data.services || {}).some(status => status === 'Y' || status === 'U');
    const managerApprovalUrl = data.managerApprovalUrl;
    const origin = typeof window === 'undefined' ? 'https://eba-digital-permits.web.app' : window.location.origin;
    const mode = typeof window === 'undefined' ? 'LIVE' : getAppMode();
    const permitUrl = `${origin}/?mode=${mode}#/handheld-saw/${encodeURIComponent(permit.id)}`;
    const auditUrl = typeof window === 'undefined'
        ? `${origin}/?mode=${mode}#/audit-pdf/${encodeURIComponent(permit.id)}`
        : buildAuditPdfUrl(permit.id);

    return (
        <div className="handheld-saw-pdf text-black bg-white font-sans text-[11px] leading-snug">
            <style>{`.handheld-saw-pdf .pdf-page { width: 794px; min-height: 1123px; box-sizing: border-box; }`}</style>
            <article className="pdf-page p-10">
                <header className="border-b-4 border-black pb-4 mb-8 flex justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black uppercase">{HANDHELD_SAW_TITLE}</h1>
                        <p className="mt-2 text-lg font-bold">Permit Validity is {HANDHELD_SAW_VALIDITY_DAYS} days</p>
                        <p className="mt-2">Eastern Busway Alliance</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xs font-black uppercase">Permit Reference</p>
                        <p className="text-3xl font-black">{formattedPermitNumber || '—'}</p>
                    </div>
                </header>
                <div className="grid grid-cols-2 gap-10">
                    <div className="flex flex-col items-center text-center">
                        <QRCodeSVG value={permitUrl} size={180} level="M" includeMargin />
                        <p className="mt-3 font-black uppercase">Registered users — open digital permit</p>
                        <p className="mt-1 break-all text-[9px]">{permitUrl}</p>
                    </div>
                    <div className="flex flex-col items-center text-center">
                        <QRCodeSVG value={auditUrl} size={180} level="M" includeMargin />
                        <p className="mt-3 font-black uppercase">Health & Safety — external audit access</p>
                        <p className="mt-1">Read-only audit copy</p>
                        <p className="mt-1 break-all text-[9px]">{auditUrl}</p>
                    </div>
                </div>
                <section className="mt-10 border-2 border-black p-5">
                    <h2 className="mb-3 text-lg font-black uppercase">Permit Details & Time Frame</h2>
                    <div className="grid grid-cols-2 gap-x-6">
                        <Pair label="Permit Reference" value={formattedPermitNumber || '—'} />
                        <Pair label="Status" value={value(permit.status).toUpperCase()} />
                        <Pair label="Work Location" value={permit.location} />
                        <Pair label="JSEA Reference No" value={data.jseaReference} />
                        <Pair label="Issue Date" value={issueDate(permit.issuedDate)} />
                        <Pair label="Start Date / Time" value={permitDateTime(permit.commencementDate, data.startTime)} />
                        <Pair label="Finish / End Date / Time" value={permitDateTime(permit.endDate, data.finishTime)} />
                    </div>
                    {data.permitDetailsComments && <Pair label="Permit and site details comments" value={data.permitDetailsComments} />}
                </section>
                <footer className="mt-10 border-t border-gray-400 pt-3 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 1 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <header className="border-b-4 border-black pb-4 mb-5 flex justify-between gap-6">
                    <div>
                        <h1 className="text-2xl font-black uppercase">{HANDHELD_SAW_TITLE}</h1>
                        <p className="font-bold">Permit Validity is {HANDHELD_SAW_VALIDITY_DAYS} days</p>
                        <p className="mt-2">Eastern Busway Alliance</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xl font-black">{formattedPermitNumber || '—'}</p>
                        <p className="mt-2 font-bold uppercase">Status: {value(permit.status)}</p>
                    </div>
                </header>
                <p className="border border-black p-3 mb-3 font-bold">
                    Complete Part A and use one approval path: upload a Manager Approval PDF, or complete Zone Manager endorsement / Project Director approval (PIN + ACL required).
                </p>
                <p className="border border-red-400 bg-red-50 text-red-700 p-2 mb-4 font-bold">
                    {HANDHELD_SAW_APPROVAL_LEGAL_WARNING}
                </p>
                <Section title="Part A: Permit & Site Details">
                    <div className="grid grid-cols-2 gap-x-6">
                        <Pair label="Permit Reference" value={formattedPermitNumber || '—'} />
                        <Pair label="JSEA Reference No" value={data.jseaReference} />
                        <Pair label="Work Location" value={permit.location} />
                        <Pair label="Start Date & Time" value={permitDateTime(permit.commencementDate, data.startTime)} />
                        <Pair label="Finish / End Date & Time" value={permitDateTime(permit.endDate, data.finishTime)} />
                    </div>
                    <Pair label="Permit and site details comments" value={data.permitDetailsComments} />
                </Section>
                <Section title="Part B: Alternatives Review & Zone Manager Endorsement">
                    <Pair label="Have all practical and reasonable alternatives to using a high-powered handheld saw been identified and explored" value={yesNo(data.alternativesReviewed)} />
                    <Pair label="Alternatives considered and why unsuitable (or attached documentation)" value={data.alternativesExplanation} />
                    <h3 className="font-bold uppercase mt-3">Safety Case</h3>
                    <Pair label="1. What is the scope of work" value={data.safetyCase.scope} />
                    <Pair label="2. What is being cut (materials, size, conditions, etc.)" value={data.safetyCase.itemBeingCut} />
                    <Pair label="3. How is the item being cut supported to prevent blade jamming" value={data.safetyCase.supportToPreventJamming} />
                    <Pair label="4. Is direct supervision oversight planned" value={data.safetyCase.directSupervision} />
                    <Pair label="5. What is the duration of the work" value={data.safetyCase.duration} />
                    {hasApprovalPdf && !data.zoneManagerEndorsement?.data ? (
                        <p className="mt-3 border border-gray-400 p-2 font-bold">Approval provided via uploaded Manager Approval PDF (see Page 9) — manual Zone Manager PIN/ACL sign-off not required.</p>
                    ) : (
                        <div className="mt-3"><SignatureBlock title="Endorsed By — Zone Manager" signature={data.zoneManagerEndorsement} comments={data.zoneManagerComments} /></div>
                    )}
                </Section>
                <Section title="Part C: Project Director Approval — Alternative Approval Path">
                    {hasApprovalPdf && !data.projectDirectorSignature?.data ? (
                        <p className="border border-gray-400 p-2 font-bold">Approval provided via uploaded Manager Approval PDF (see Page 9) — manual Project Director PIN/ACL sign-off not required.</p>
                    ) : (
                        <>
                            <p className="border border-gray-400 p-3 italic mb-3">I hereby approve of this permit, which is to be carried out strictly in accordance with the established safety case.</p>
                            <p><b>Declaration:</b> {data.projectDirectorDeclaration ? 'APPROVED' : 'NOT APPROVED'}</p>
                            <SignatureBlock title="Project Director" signature={data.projectDirectorSignature} comments={data.projectDirectorComments} />
                        </>
                    )}
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 2 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part D: Identification of Services & Structural Elements (Completed by Permit Issuer)">
                    <table className="w-full border-collapse border border-black">
                        <thead><tr className="bg-gray-200"><th className="border border-black text-left p-2">Service / structural element</th><th className="border border-black p-2">Yes (Y)</th><th className="border border-black p-2">No (N)</th><th className="border border-black p-2">Unconfirmed (U)</th><th className="border border-black p-2">Comments</th></tr></thead>
                        <tbody>{HANDHELD_SAW_SERVICES.map(service => {
                            const status = data.services?.[service.key];
                            return <tr key={service.key}><td className="border border-black p-2">{service.label}{service.key === 'other' && data.otherServiceDetails ? `: ${data.otherServiceDetails}` : ''}</td>{(['Y', 'N', 'U'] as const).map(mark => <td key={mark} className="border border-black p-2 text-center">{status === mark ? 'X' : ''}</td>)}<td className="border border-black p-2">{value(data.serviceComments?.[service.key])}</td></tr>;
                        })}</tbody>
                    </table>
                    {invalidServiceFlag && <p className="border border-black mt-3 p-3 font-bold">Mandatory before works commence: Yes (Y), No (N), and Unconfirmed (U). If any item is Yes (Y) or Unconfirmed (U), review, attach or link relevant drawings (DBYD, As-Built Drawings, Engineers Building Plans / Breaking Ground Permit). Issuer confirms reviewed: {data.drawingsReviewed ? 'YES' : 'NO'}.</p>}
                    <Pair label="Service drawings attachment / reference" value={data.drawingsFileName || data.drawingsReference || '—'} />
                    {data.drawingsUrl && <p className="break-all mt-1"><b>Drawing link:</b> {data.drawingsUrl}</p>}
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 3 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part E: Equipment Details (Completed by Permit Issuer)">
                    <div className="grid grid-cols-2 gap-x-6">
                        <Pair label="Equipment Make" value={data.equipmentMake} />
                        <Pair label="Equipment Model" value={data.equipmentModel} />
                        <Pair label="Minimum equipment requirement — Blade guards" value={yesNo(data.bladeGuards)} />
                        <Pair label="Anti-kickback systems / Active blade pressure sensors (minimum requirement effective 15 July 2026)" value={yesNo(data.antiKickbackSystems)} />
                        <Pair label="Equipment Make comments" value={data.equipmentComments?.make} />
                        <Pair label="Equipment Model comments" value={data.equipmentComments?.model} />
                        <Pair label="Blade guard comments" value={data.equipmentComments?.bladeGuards} />
                        <Pair label="Anti-kickback / pressure sensor comments" value={data.equipmentComments?.antiKickbackSystems} />
                    </div>
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 4 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part F: Work Controls (Completed by Permit Receiver)">
                    <table className="w-full border-collapse border border-black">
                        <thead><tr className="bg-gray-200"><th className="border border-black p-2 text-left">Control</th><th className="border border-black p-2">YES</th><th className="border border-black p-2">NO</th><th className="border border-black p-2">N/A</th><th className="border border-black p-2 text-left">Comments (optional)</th></tr></thead>
                        <tbody>{HANDHELD_SAW_WORK_CONTROLS.map((control, index) => {
                            const response = data.workControls?.[index];
                            return <tr key={control}><td className="border border-black p-2">{index + 1}. {control}</td><td className="border border-black p-2 text-center">{response?.answer === 'yes' ? 'X' : ''}</td><td className="border border-black p-2 text-center">{response?.answer === 'no' ? 'X' : ''}</td><td className="border border-black p-2 text-center">{response?.answer === 'n/a' ? 'X' : ''}</td><td className="border border-black p-2">{value(response?.comment)}</td></tr>;
                        })}</tbody>
                    </table>
                    <div className="mt-4">
                        <h3 className="font-bold uppercase mb-2">Mandatory PPE</h3>
                        <p>Double-eye Protection: {data.ppe.doubleEyeProtection === null ? '—' : data.ppe.doubleEyeProtection ? 'YES' : 'NO'} — {value(data.ppe.comments?.doubleEyeProtection)}</p>
                        <p>Gloves: {data.ppe.gloves === null ? '—' : data.ppe.gloves ? 'YES' : 'NO'} — {value(data.ppe.comments?.gloves)}</p>
                        <p>P2 Dust Mask / PARP: {data.ppe.p2DustMask === null ? '—' : data.ppe.p2DustMask ? 'YES' : 'NO'} — {value(data.ppe.comments?.p2DustMask)}</p>
                        <p>Earmuffs / Earplugs: {data.ppe.hearingProtection === null ? '—' : data.ppe.hearingProtection ? 'YES' : 'NO'} — {value(data.ppe.comments?.hearingProtection)}</p>
                        <Pair label="Task-specific PPE" value={data.ppe.taskSpecific} />
                    </div>
                </Section>
                <Section title={`Part F: Permit Receiver — ${data.receiverDeclaration ? 'Acceptance confirmed' : 'Acceptance not confirmed'}`}>
                    <SignatureBlock title="Permit Receiver — confirm work controls" signature={permit.receiverSignature} name={permit.receiverName} comments={data.receiverComments} />
                    <p className="mt-2"><b>Acceptance declaration:</b> {data.receiverDeclaration ? 'CONFIRMED' : 'NOT CONFIRMED'}</p>
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 5 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part F: Permit Acceptors">
                    <div className="grid grid-cols-2 gap-3">{(data.acceptors || []).map((acceptor, index) => <SignatureBlock key={index} title={`Acceptor ${index + 1} — ${acceptor.declaration ? 'acceptance declaration confirmed' : 'declaration not confirmed'}`} signature={acceptor.signature} name={acceptor.name} comments={acceptor.comments} />)}</div>
                    <p className="mt-3 italic">By signing, each person confirms that they understand and will follow the permit safety case and controls.</p>
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 6 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part G: Permit Issuer Authorisation — Issuer Signs Last">
                    <p className="mb-3">Issuer declaration: I have verified the permit details and controls for the approved work.</p>
                    <SignatureBlock title={`Permit Issuer — ${data.issuerDeclaration ? 'Declaration confirmed' : 'Not confirmed'}`} signature={permit.issuerSignature} comments={data.issuerComments} />
                    <p className="mt-3 italic">The Permit Issuer authorizes the work only after the required approval, Receiver controls/signature, and acceptor signatures are complete.</p>
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 7 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Part H: Permit Close Out (Completed by Permit Issuer)">
                    <p><b>Close out selection:</b> {data.closureType === 'works-completed' ? 'Works completed' : data.closureType === 'cancellation' ? 'Cancellation' : '—'}</p>
                    <p className="border border-gray-400 p-3 mt-2">{data.closureType === 'cancellation' ? 'I cancel this permit and confirm work has stopped and the work area is safe.' : 'I confirm the permitted works are completed and the work area has been left safe.'}</p>
                    <p className="mt-2"><b>Declaration:</b> {data.closureDeclaration ? 'CONFIRMED' : 'NOT CONFIRMED'}</p>
                    <SignatureBlock title="Permit Issuer Close Out" signature={permit.closureSignature} name={permit.closureReceiverName} comments={data.closureComments} />
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 8 of 9</span>
                </footer>
            </article>

            <article className="pdf-page p-10">
                <Section title="Manager Approval Documentation">
                    <p className="border border-red-400 bg-red-50 text-red-700 p-2 mb-3 font-bold">
                        {HANDHELD_SAW_APPROVAL_LEGAL_WARNING}
                    </p>
                    <p className="mb-3">Required regional / zone / project manager approval provided by the applicant.</p>
                    <Pair label="Approval file" value={data.managerApprovalFileName} />
                    <Pair label="Uploaded by" value={data.managerApprovalUploadedBy} />
                    <Pair label="Uploaded at" value={dateTime(data.managerApprovalUploadedAt)} />
                    <Pair label="Verified by Permit Issuer" value={data.managerApprovalVerifiedByIssuer ? `${value(data.managerApprovalVerifiedBy)} at ${dateTime(data.managerApprovalVerifiedAt)}` : 'Not verified'} />
                    <Pair label="Verification comments" value={data.managerApprovalVerificationComments} />
                    {managerApprovalUrl && <a className="block my-4 break-all underline" href={managerApprovalUrl}>Open / download the manager approval document: {managerApprovalUrl}</a>}
                    {managerApprovalUrl && data.managerApprovalContentType.startsWith('image/') && (
                        <img src={managerApprovalUrl} crossOrigin="anonymous" alt="Manager approval evidence" className="max-w-full max-h-[780px] object-contain border border-gray-300" />
                    )}
                </Section>
                <footer className="mt-auto pt-3 border-t border-gray-400 text-[9px] flex justify-between">
                    <span>{formattedPermitNumber || '—'}</span><span>Page 9 of 9</span>
                </footer>
            </article>
        </div>
    );
};

export default HandheldSawPermitPDFLayout;
