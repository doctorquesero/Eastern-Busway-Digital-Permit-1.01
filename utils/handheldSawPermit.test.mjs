import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import {
    applyHandheldSawPatch,
    applyHandheldSawPermitPatch,
    createInitialHandheldSawDetails,
    HANDHELD_SAW_APPROVAL_LEGAL_WARNING,
    HANDHELD_SAW_FORM_TABS,
    HANDHELD_SAW_SERVICES,
    HANDHELD_SAW_WORK_CONTROLS,
    clearManagerApproval,
    finishDateForHandheldSawStart,
    formatHandheldSawPermitNumber,
    hasHandheldSawPermitValidity,
    hasHandheldSawSchedule,
    hasSatisfiedHandheldSawApproval,
    hasUploadedApprovalPdf,
    stripHandheldSawPermitPrefix,
    tabForHandheldSawValidationErrors,
    timeFrom12Hour,
    timeTo12Hour,
    validateHandheldSawIssuance,
    withClearedSignatureDeletes
} from './handheldSawPermit.ts';

const signature = name => ({ data: 'signed', name, date: '2026-11-20T08:30:00.000Z', type: 'type' });

const validPermit = () => {
    const handheldSaw = createInitialHandheldSawDetails();
    handheldSaw.alternativesReviewed = 'yes';
    handheldSaw.alternativesExplanation = 'Alternatives reviewed and unsuitable.';
    handheldSaw.safetyCase = {
        scope: 'Cut concrete slab.',
        itemBeingCut: 'Concrete, 150 mm, dry surface.',
        supportToPreventJamming: 'Material secured on both sides.',
        directSupervision: 'Supervisor continuously present.',
        duration: 'Two hours.'
    };
    handheldSaw.zoneManagerEndorsement = signature('Zone Manager');
    handheldSaw.projectDirectorDeclaration = true;
    handheldSaw.projectDirectorSignature = signature('Project Director');
    handheldSaw.jseaReference = 'JSEA-2026-0042';
    handheldSaw.startTime = '08:00';
    handheldSaw.finishTime = '10:00';
    handheldSaw.services = Object.fromEntries(HANDHELD_SAW_SERVICES.map(service => [service.key, 'N']));
    handheldSaw.equipmentMake = 'SawCo';
    handheldSaw.equipmentModel = 'HS-7';
    handheldSaw.bladeGuards = 'yes';
    handheldSaw.antiKickbackSystems = 'yes';
    handheldSaw.workControls = HANDHELD_SAW_WORK_CONTROLS.map(() => ({ answer: 'yes', comment: '' }));
    handheldSaw.ppe = {
        doubleEyeProtection: true,
        gloves: true,
        p2DustMask: true,
        hearingProtection: true,
        taskSpecific: 'High visibility clothing.'
    };
    handheldSaw.issuerDeclaration = true;
    handheldSaw.receiverDeclaration = true;
    handheldSaw.acceptors = [{ name: 'Acceptor', signature: signature('Acceptor'), comments: '', declaration: true }];
    handheldSaw.managerApprovalUrl = 'https://storage.example/approval.pdf';
    handheldSaw.managerApprovalContentType = 'application/pdf';
    handheldSaw.managerApprovalVerifiedByIssuer = true;
    handheldSaw.managerApprovalVerifiedBy = 'issuer@example.test';
    handheldSaw.managerApprovalVerifiedAt = '2026-11-20T08:30:00.000Z';
    handheldSaw.onSiteIssue = { latitude: -36.85, longitude: 174.76, capturedAt: '2026-11-20T08:00:00.000Z' };
    return {
        permitType: 'handheld_saw',
        permitNumber: '11630',
        itwocxNumber: '11630',
        location: 'Test site',
        commencementDate: '2026-11-20',
        endDate: '2026-11-26',
        issuerSignature: signature('Issuer'),
        receiverSignature: signature('Receiver'),
        handheldSaw
    };
};

test('handheld saw permit enforces the inclusive seven-calendar-day validity window', () => {
    assert.equal(finishDateForHandheldSawStart('2026-11-20'), '2026-11-26');
    assert.equal(finishDateForHandheldSawStart('2024-02-25'), '2024-03-02');
    assert.equal(finishDateForHandheldSawStart('2026-02-30'), '');
    assert.equal(finishDateForHandheldSawStart(''), '');
    assert.equal(hasHandheldSawPermitValidity('2026-11-20', '2026-11-20'), true);
    assert.equal(hasHandheldSawPermitValidity('2026-11-20', '2026-11-26'), true);
    assert.equal(hasHandheldSawPermitValidity('2026-11-20', '2026-11-27'), false);
    assert.equal(hasHandheldSawPermitValidity('2026-11-20', '2026-11-19'), false);
    assert.equal(hasHandheldSawPermitValidity('', '2026-11-20'), false);
    assert.equal(hasHandheldSawSchedule('2026-11-20', '08:00', '2026-11-20', '10:00'), true);
    assert.equal(hasHandheldSawSchedule('2026-11-20', '10:00', '2026-11-20', '08:00'), false);
    assert.equal(hasHandheldSawSchedule('2026-11-20', '08:00', '2026-11-27', '10:00'), false);
});

test('compliant starting responses are editable defaults and approval removal clears verification metadata', () => {
    const initial = createInitialHandheldSawDetails();
    assert.equal(initial.alternativesReviewed, 'yes');
    assert.ok(Object.values(initial.services).every(status => status === 'N'));
    assert.ok(initial.workControls.every(control => control.answer === 'yes'));
    assert.deepEqual([
        initial.ppe.doubleEyeProtection,
        initial.ppe.gloves,
        initial.ppe.p2DustMask,
        initial.ppe.hearingProtection
    ], [true, true, true, true]);
    assert.equal(initial.bladeGuards, 'yes');
    assert.equal(initial.antiKickbackSystems, 'yes');

    const cleared = clearManagerApproval({
        ...initial,
        managerApprovalUrl: 'https://storage.example/approval.pdf',
        managerApprovalFileName: 'approval.pdf',
        managerApprovalVerifiedByIssuer: true,
        managerApprovalVerifiedBy: 'issuer@example.test',
        managerApprovalVerifiedAt: '2026-11-20T08:30:00.000Z'
    });
    assert.equal(cleared.managerApprovalUrl, '');
    assert.equal(cleared.managerApprovalFileName, '');
    assert.equal(cleared.managerApprovalVerifiedByIssuer, false);
    assert.equal(cleared.managerApprovalVerifiedBy, '');
    assert.equal(cleared.managerApprovalVerifiedAt, '');
});

test('12-hour date/time controls convert to and from stored 24-hour times', () => {
    assert.deepEqual(timeTo12Hour('00:05'), { hour: '12', minute: '05', period: 'AM' });
    assert.deepEqual(timeTo12Hour('12:45'), { hour: '12', minute: '45', period: 'PM' });
    assert.deepEqual(timeTo12Hour('18:30'), { hour: '6', minute: '30', period: 'PM' });
    assert.deepEqual(timeTo12Hour(''), { hour: '', minute: '', period: 'AM' });
    assert.equal(timeFrom12Hour('12', '00', 'AM'), '00:00');
    assert.equal(timeFrom12Hour('12', '30', 'PM'), '12:30');
    assert.equal(timeFrom12Hour('6', '30', 'PM'), '18:30');
});

test('issuance validation accepts a fully complete signed on-site permit and rejects missing safety controls', () => {
    assert.deepEqual(validateHandheldSawIssuance(validPermit()), []);
    const pdfApprovalOnly = validPermit();
    pdfApprovalOnly.handheldSaw.zoneManagerEndorsement = undefined;
    pdfApprovalOnly.handheldSaw.projectDirectorSignature = undefined;
    pdfApprovalOnly.handheldSaw.projectDirectorDeclaration = false;
    assert.deepEqual(validateHandheldSawIssuance(pdfApprovalOnly), []);
    const zoneManagerOnly = validPermit();
    zoneManagerOnly.handheldSaw.managerApprovalUrl = '';
    zoneManagerOnly.handheldSaw.managerApprovalVerifiedByIssuer = false;
    zoneManagerOnly.handheldSaw.projectDirectorSignature = undefined;
    zoneManagerOnly.handheldSaw.projectDirectorDeclaration = false;
    assert.deepEqual(validateHandheldSawIssuance(zoneManagerOnly), []);
    const projectDirectorOnly = validPermit();
    projectDirectorOnly.handheldSaw.managerApprovalUrl = '';
    projectDirectorOnly.handheldSaw.managerApprovalVerifiedByIssuer = false;
    projectDirectorOnly.handheldSaw.zoneManagerEndorsement = undefined;
    assert.deepEqual(validateHandheldSawIssuance(projectDirectorOnly), []);
    const noApprovalPath = validPermit();
    noApprovalPath.handheldSaw.managerApprovalUrl = '';
    noApprovalPath.handheldSaw.managerApprovalVerifiedByIssuer = false;
    noApprovalPath.handheldSaw.zoneManagerEndorsement = undefined;
    noApprovalPath.handheldSaw.projectDirectorSignature = undefined;
    noApprovalPath.handheldSaw.projectDirectorDeclaration = false;
    assert.ok(validateHandheldSawIssuance(noApprovalPath).some(error => error.includes('Complete one approval path')));
    const samePerson = validPermit();
    samePerson.issuerEmail = 'receiver@example.test';
    samePerson.receiverEmail = 'receiver@example.test';
    assert.ok(validateHandheldSawIssuance(samePerson).some(error => error.includes('cannot also be the Permit Receiver')));
    const incomplete = validPermit();
    incomplete.handheldSaw.workControls[0] = { answer: null, comment: '' };
    incomplete.handheldSaw.services.electrical = 'U';
    incomplete.handheldSaw.drawingsReviewed = true;
    assert.ok(validateHandheldSawIssuance(incomplete).some(error => error.includes('All nine work controls need YES, NO or N/A.')));
    const naWithoutComment = validPermit();
    naWithoutComment.handheldSaw.workControls[0] = { answer: 'n/a', comment: '' };
    assert.deepEqual(validateHandheldSawIssuance(naWithoutComment), []);
    const noWithoutComment = validPermit();
    noWithoutComment.handheldSaw.workControls[0] = { answer: 'no', comment: '' };
    assert.deepEqual(validateHandheldSawIssuance(noWithoutComment), []);
    const noWithComment = validPermit();
    noWithComment.handheldSaw.workControls[0] = { answer: 'no', comment: 'Control unavailable; additional supervision arranged.' };
    assert.deepEqual(validateHandheldSawIssuance(noWithComment), []);
    assert.ok(validateHandheldSawIssuance(incomplete).some(error => error.includes('attach or link relevant service drawings')));
});

test('permit numbers format as PF#<number> without duplicating prefixes', () => {
    assert.equal(formatHandheldSawPermitNumber('097'), 'PF#097');
    assert.equal(formatHandheldSawPermitNumber('PF#097'), 'PF#097');
    assert.equal(formatHandheldSawPermitNumber('pf# 097'), 'PF#097');
    assert.equal(formatHandheldSawPermitNumber('PF097'), 'PF#097');
    assert.equal(formatHandheldSawPermitNumber('#097'), 'PF#097');
    assert.equal(formatHandheldSawPermitNumber('PF#'), '');
    assert.equal(formatHandheldSawPermitNumber(''), '');
    assert.equal(stripHandheldSawPermitPrefix('PF#097'), '097');
    assert.equal(stripHandheldSawPermitPrefix('097'), '097');
    assert.equal(stripHandheldSawPermitPrefix('PF#'), '');

    const formattedPermit = validPermit();
    formattedPermit.permitNumber = 'PF#097';
    formattedPermit.itwocxNumber = 'PF#097';
    assert.deepEqual(validateHandheldSawIssuance(formattedPermit), []);

    const prefixOnly = validPermit();
    prefixOnly.permitNumber = 'PF#';
    prefixOnly.itwocxNumber = 'PF#';
    assert.ok(validateHandheldSawIssuance(prefixOnly).some(error => error.includes('Permit number is required.')));
});

test('tab bar places Receiver\'s Checklist before Permit Issuer and labels Closure cleanly', () => {
    assert.deepEqual(HANDHELD_SAW_FORM_TABS, [
        { id: 'details', label: 'Details' },
        { id: 'approvals', label: 'Approvals' },
        { id: 'receiver', label: "Receiver's Checklist" },
        { id: 'issuer', label: 'Permit Issuer' },
        { id: 'closeout', label: 'Closure' }
    ]);

    assert.equal(tabForHandheldSawValidationErrors(['Permit number is required.']), 'details');
    assert.equal(tabForHandheldSawValidationErrors(['Complete one approval path: Permit Issuer-verified approval PDF, Zone Manager endorsement, or Project Director approval.']), 'approvals');
    assert.equal(tabForHandheldSawValidationErrors(['Equipment make is required.']), 'receiver');
    assert.equal(tabForHandheldSawValidationErrors(['Double-eye protection, gloves, P2 dust protection and hearing protection must all be confirmed.']), 'receiver');
    assert.equal(tabForHandheldSawValidationErrors(['Permit Receiver declaration and signature are required.']), 'receiver');
    assert.equal(tabForHandheldSawValidationErrors(['At least one Permit Acceptor must sign the acceptance declaration.']), 'receiver');
    assert.equal(tabForHandheldSawValidationErrors(['Every service identification item must be marked Y, N or U.']), 'issuer');
    assert.equal(tabForHandheldSawValidationErrors(['Permit Issuer declaration and signature are required.']), 'issuer');
    assert.equal(tabForHandheldSawValidationErrors(['The Permit Issuer cannot also be the Permit Receiver on the same permit.']), 'issuer');
});

test('editing Receiver checklist, PPE, comments, Part E, Part D, or Details never wipes an existing Receiver signature', () => {
    const base = {
        ...validPermit(),
        issuerEmail: 'issuer@example.test',
        receiverName: 'Receiver',
        receiverEmail: 'receiver@example.test'
    };

    // Part D Services edits in Permit Issuer tab must NOT wipe Receiver signature/declaration,
    // while still invalidating Issuer signature/declaration since Issuer signs last.
    const afterServices = applyHandheldSawPatch(base, {
        services: { ...base.handheldSaw.services, electrical: 'Y' },
        serviceComments: { electrical: 'Marked on slab' },
        otherServiceDetails: 'Conduit',
        drawingsReviewed: true,
        drawingsReference: 'DBYD-99',
        drawingsUrl: 'https://storage.example/dbyd.pdf'
    });
    assert.deepEqual(afterServices.receiverSignature, base.receiverSignature);
    assert.equal(afterServices.receiverName, 'Receiver');
    assert.equal(afterServices.receiverEmail, 'receiver@example.test');
    assert.equal(afterServices.handheldSaw.receiverDeclaration, true);
    assert.equal(afterServices.issuerSignature, undefined);
    assert.equal(afterServices.issuerEmail, '');
    assert.equal(afterServices.handheldSaw.issuerDeclaration, false);

    // Changing work control dropdowns (Yes/No/N/A) and item comments must NOT wipe Receiver signature.
    const afterControlChange = applyHandheldSawPatch(base, {
        workControls: base.handheldSaw.workControls.map((c, i) => i === 0 ? { answer: 'n/a', comment: 'Optional note' } : c)
    });
    assert.deepEqual(afterControlChange.receiverSignature, base.receiverSignature);
    assert.equal(afterControlChange.receiverName, 'Receiver');
    assert.equal(afterControlChange.receiverEmail, 'receiver@example.test');
    assert.equal(afterControlChange.handheldSaw.receiverDeclaration, true);
    assert.equal(afterControlChange.issuerSignature, undefined);

    // Changing PPE selections/comments and Receiver comments must NOT wipe Receiver signature.
    const afterPpeAndComments = applyHandheldSawPatch(base, {
        ppe: {
            ...base.handheldSaw.ppe,
            gloves: false,
            comments: { gloves: 'Cut-resistant gloves pending' },
            taskSpecific: 'Visor + high vis'
        },
        receiverComments: 'Confirmed dust extraction on site.'
    });
    assert.deepEqual(afterPpeAndComments.receiverSignature, base.receiverSignature);
    assert.equal(afterPpeAndComments.receiverName, 'Receiver');
    assert.equal(afterPpeAndComments.receiverEmail, 'receiver@example.test');
    assert.equal(afterPpeAndComments.handheldSaw.receiverDeclaration, true);

    // Changing Part E equipment details must NOT wipe Receiver signature.
    const afterEquipmentChange = applyHandheldSawPatch(base, {
        equipmentMake: 'Husqvarna',
        equipmentModel: 'K770'
    });
    assert.deepEqual(afterEquipmentChange.receiverSignature, base.receiverSignature);
    assert.equal(afterEquipmentChange.receiverName, 'Receiver');
    assert.equal(afterEquipmentChange.receiverEmail, 'receiver@example.test');
    assert.equal(afterEquipmentChange.handheldSaw.receiverDeclaration, true);
    assert.equal(afterEquipmentChange.issuerSignature, undefined);

    // Permit Details edits invalidate Issuer signature (signs last) without wiping Receiver signature.
    const afterIdentityChange = applyHandheldSawPermitPatch(base, { location: 'New zone' });
    assert.deepEqual(afterIdentityChange.receiverSignature, base.receiverSignature);
    assert.equal(afterIdentityChange.receiverName, 'Receiver');
    assert.equal(afterIdentityChange.receiverEmail, 'receiver@example.test');
    assert.equal(afterIdentityChange.handheldSaw.receiverDeclaration, true);
    assert.equal(afterIdentityChange.issuerSignature, undefined);
    assert.equal(afterIdentityChange.handheldSaw.issuerDeclaration, false);
});

test('withClearedSignatureDeletes only deletes receiverSignature when explicitly cleared', () => {
    const DELETE = Symbol('deleteField');
    const signed = validPermit();

    const bothSigned = withClearedSignatureDeletes({ id: 'p1', issuerSignature: signed.issuerSignature, receiverSignature: signed.receiverSignature }, signed, DELETE);
    assert.equal(bothSigned.issuerSignature, signed.issuerSignature);
    assert.equal(bothSigned.receiverSignature, signed.receiverSignature);

    const issuerCleared = withClearedSignatureDeletes({ id: 'p1', receiverSignature: signed.receiverSignature }, { ...signed, issuerSignature: undefined }, DELETE);
    assert.equal(issuerCleared.issuerSignature, DELETE);
    assert.equal(issuerCleared.receiverSignature, signed.receiverSignature);

    // Without deleteReceiver: true, receiverSignature is never deleted by default.
    const defaultNoReceiverDelete = withClearedSignatureDeletes({ id: 'p1' }, { issuerSignature: undefined, receiverSignature: undefined }, DELETE);
    assert.equal(defaultNoReceiverDelete.issuerSignature, DELETE);
    assert.equal('receiverSignature' in defaultNoReceiverDelete, false);

    // When explicitly cleared via Edit / Re-sign (deleteReceiver: true), deleteField sentinel is emitted.
    const explicitlyClearedReceiver = withClearedSignatureDeletes({ id: 'p1' }, { issuerSignature: undefined, receiverSignature: undefined }, DELETE, { deleteReceiver: true });
    assert.equal(explicitlyClearedReceiver.issuerSignature, DELETE);
    assert.equal(explicitlyClearedReceiver.receiverSignature, DELETE);
});

test('uploaded approval PDF satisfies approval without manual Zone Manager or Project Director sign-off', () => {
    const uploadedPdfOnly = validPermit();
    uploadedPdfOnly.handheldSaw.alternativesReviewed = null;
    uploadedPdfOnly.handheldSaw.alternativesExplanation = '';
    uploadedPdfOnly.handheldSaw.safetyCase = {
        scope: '',
        itemBeingCut: '',
        supportToPreventJamming: '',
        directSupervision: '',
        duration: ''
    };
    uploadedPdfOnly.handheldSaw.zoneManagerEndorsement = undefined;
    uploadedPdfOnly.handheldSaw.projectDirectorSignature = undefined;
    uploadedPdfOnly.handheldSaw.projectDirectorDeclaration = false;
    uploadedPdfOnly.handheldSaw.managerApprovalVerifiedByIssuer = false;
    assert.equal(hasUploadedApprovalPdf(uploadedPdfOnly.handheldSaw), true);
    assert.equal(hasSatisfiedHandheldSawApproval(uploadedPdfOnly.handheldSaw), true);
    assert.deepEqual(validateHandheldSawIssuance(uploadedPdfOnly), []);

    // When NO approval PDF is uploaded, Zone Manager Endorsement & Safety Case fields remain required.
    const noPdfBlankPartB = validPermit();
    noPdfBlankPartB.handheldSaw.managerApprovalUrl = '';
    noPdfBlankPartB.handheldSaw.managerApprovalContentType = '';
    noPdfBlankPartB.handheldSaw.managerApprovalVerifiedByIssuer = false;
    noPdfBlankPartB.handheldSaw.alternativesReviewed = null;
    noPdfBlankPartB.handheldSaw.alternativesExplanation = '';
    noPdfBlankPartB.handheldSaw.safetyCase = {
        scope: '',
        itemBeingCut: '',
        supportToPreventJamming: '',
        directSupervision: '',
        duration: ''
    };
    const noPdfErrors = validateHandheldSawIssuance(noPdfBlankPartB);
    assert.ok(noPdfErrors.some(error => error.includes('Zone Manager explanation of alternatives is required.')));
    assert.ok(noPdfErrors.some(error => error.includes('Safety case: scope of work is required.')));
    assert.ok(noPdfErrors.some(error => error.includes('Zone Manager must record whether alternatives were reviewed.')));

    const nonPdfUpload = validPermit();
    nonPdfUpload.handheldSaw.zoneManagerEndorsement = undefined;
    nonPdfUpload.handheldSaw.projectDirectorSignature = undefined;
    nonPdfUpload.handheldSaw.projectDirectorDeclaration = false;
    nonPdfUpload.handheldSaw.managerApprovalContentType = 'image/png';
    nonPdfUpload.handheldSaw.managerApprovalVerifiedByIssuer = false;
    assert.equal(hasUploadedApprovalPdf(nonPdfUpload.handheldSaw), false);
    assert.equal(hasSatisfiedHandheldSawApproval(nonPdfUpload.handheldSaw), false);
    assert.ok(validateHandheldSawIssuance(nonPdfUpload).some(error => error.includes('Complete one approval path')));

    assert.equal(
        HANDHELD_SAW_APPROVAL_LEGAL_WARNING,
        '⚠️ False or misleading approval records are an offence under NZ law (Health and Safety at Work Act 2015) and carry legal and disciplinary consequences.'
    );
});

test('official PDF layout includes the cover page and chronologically numbered Parts A-H', () => {
    const require = createRequire(import.meta.url);
    const result = buildSync({
        stdin: {
            contents: `
                import React from 'react';
                import { renderToStaticMarkup } from 'react-dom/server';
                import HandheldSawPermitPDFLayout from './components/HandheldSawPermitPDFLayout';
                module.exports = permit => renderToStaticMarkup(React.createElement(HandheldSawPermitPDFLayout, { permit }));
            `,
            resolveDir: process.cwd(),
            loader: 'js'
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        external: ['react', 'react-dom/server']
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
    const permit = validPermit();
    permit.handheldSaw.managerApprovalFileName = 'regional-approval.pdf';
    permit.handheldSaw.services.electrical = 'Y';
    permit.handheldSaw.drawingsReviewed = true;
    permit.handheldSaw.drawingsReference = 'DBYD-REF-2026';
    const html = module.exports(permit);
    for (const text of [
        'High-Powered Handheld Saw Permit',
        'Permit Validity is 7 days',
        'PF#11630',
        'Permit Details &amp; Time Frame',
        'JSEA-2026-0042',
        'Part A: Permit &amp; Site Details',
        'Part B: Alternatives Review &amp; Zone Manager Endorsement',
        'Part C: Project Director Approval',
        'Part D: Identification of Services',
        'Part E: Equipment Details',
        'Part F: Work Controls',
        'Part G: Permit Issuer Authorisation',
        'Part H: Permit Close Out',
        'Registered users — open digital permit',
        'Health &amp; Safety — external audit access',
        'Page 1 of 9',
        'Post Tensioning Cables',
        'crystalline silica',
        'regional-approval.pdf',
        'Project Director',
        'Permit Issuer'
    ]) assert.ok(html.includes(text), `PDF contains "${text}"`);
    assert.ok(html.includes('Page 9 of 9'));
    assert.ok(html.includes('NO</th>'));
    assert.ok(html.includes('Comments (optional)'));
    assert.ok(html.includes(HANDHELD_SAW_APPROVAL_LEGAL_WARNING));
    assert.ok(html.includes('text-red-700'));
    assert.ok(!html.includes('mandatory for NO or N/A'));
    assert.ok(!html.includes('ITWOCX#'));

    const pdfOnlyPermit = validPermit();
    pdfOnlyPermit.handheldSaw.zoneManagerEndorsement = undefined;
    pdfOnlyPermit.handheldSaw.projectDirectorSignature = undefined;
    pdfOnlyPermit.handheldSaw.projectDirectorDeclaration = false;
    pdfOnlyPermit.handheldSaw.managerApprovalVerifiedByIssuer = false;
    const pdfOnlyHtml = module.exports(pdfOnlyPermit);
    assert.ok(pdfOnlyHtml.includes('manual Zone Manager PIN/ACL sign-off not required'));
    assert.ok(pdfOnlyHtml.includes('manual Project Director PIN/ACL sign-off not required'));
    assert.ok(pdfOnlyHtml.includes(HANDHELD_SAW_APPROVAL_LEGAL_WARNING));
    assert.ok(!html.includes('1. Scope comments'));
    assert.ok(!html.includes('2. Item being cut comments'));
    const coverPage = html.slice(0, html.indexOf('Page 1 of 9'));
    assert.ok(coverPage.includes('PF#11630'));
    assert.ok(coverPage.includes('Test site'));
    assert.ok(coverPage.includes('JSEA-2026-0042'));
    assert.ok(!html.includes('EB-TM-0-HS-000070'));
    assert.ok(!html.includes('Contractor acquisition'));
    assert.ok(html.indexOf('Part F: Permit Receiver') < html.indexOf('Part G: Permit Issuer Authorisation'));
    assert.ok(!html.slice(html.indexOf('Part G: Permit Issuer Authorisation')).includes('Permit Receiver — confirm work controls'));
    assert.ok(!html.includes('Alternatives review comments'));
    assert.ok(!html.includes('Part C: Permit Details'));
});
