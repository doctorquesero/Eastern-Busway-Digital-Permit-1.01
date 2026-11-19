import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aclPin, aclRoles, validAclPin, validatePinChange } from './acl.ts';
import { getActiveReceiver, isCurrentUserActiveReceiver } from './receiverOwnership.ts';
import { formatDateTime } from './dateUtils.ts';
import { hasLockedPreworkChanges, isPreworkLocked } from './permitLock.ts';

test('PIN verification uses a valid custom PIN or the last four phone digits', () => {
    const user = { phone: '+64 21 555 1234' };
    assert.equal(aclPin(user), '1234');
    assert.equal(validAclPin(user, '1234'), true);
    assert.equal(validAclPin({ ...user, pin: '0123' }, '0123'), true);
    assert.equal(validAclPin({ ...user, pin: '0123' }, '1234'), false);
    assert.equal(validAclPin({ phone: '12' }, '0012'), false);
    assert.equal(validAclPin({ ...user, pin: '12' }, '1234'), false);
    assert.deepEqual(aclRoles({ roles: ['Receiver', 'Site Engineer'] }), ['receiver', 'site engineer']);
});

test('changing a selected stakeholder PIN requires the current PIN and matching new PINs', () => {
    const user = { phone: '+64 21 555 1234' };
    assert.equal(validatePinChange(user, '1234', '0012', '0012'), '');
    assert.equal(validatePinChange(user, '9999', '0012', '0012'), 'Invalid current 4-digit PIN.');
    assert.equal(validatePinChange(user, '1234', '0012', '0013'), 'Enter and confirm a new 4-digit PIN.');
    assert.equal(validatePinChange({ ...user, pin: '1230' }, '1234', '0012', '0012'), 'Invalid current 4-digit PIN.');
});

test('closure matches the ACL full name or an unambiguous last initial', () => {
    const users = [
        { email: 'alex@example.test', firstName: 'Alex', lastName: 'Jones', roles: ['Receiver'] },
        { email: 'other@example.test', firstName: 'Other', lastName: 'Smith', roles: ['Receiver'] }
    ];
    const account = { email: ' ALEX@example.test ' };
    assert.equal(isCurrentUserActiveReceiver({ receiver: '/Alex Jones' }, account, users), true);
    assert.equal(isCurrentUserActiveReceiver({ receiver: 'Alex J' }, account, users), true);
    assert.equal(isCurrentUserActiveReceiver({ receiver: 'Alex J' }, account, [...users, { email: 'second@example.test', firstName: 'Alex', lastName: 'James', role: 'Receiver' }]), false);
    assert.equal(isCurrentUserActiveReceiver({ receiver: 'Alex Jones' }, account, [{ ...users[0], roles: ['Approver'] }]), false);
});

test('only signed handovers change the active receiver, never daily sign-on', () => {
    const users = [
        { email: 'first@example.test', firstName: 'First', lastName: 'Person', role: 'Receiver' },
        { email: 'second@example.test', firstName: 'Second', lastName: 'Person', role: 'Receiver' }
    ];
    const permit = {
        receiver: 'First Person',
        handoverLogs: [{ receiverName: 'Second Person', receiverEmail: 'second@example.test', signature: { data: '' } }],
        dailyLogs: [{ receiverSig: { name: 'Second Person' } }]
    };
    assert.equal(isCurrentUserActiveReceiver(permit, { email: 'first@example.test' }, users), true);
    permit.handoverLogs[0].signature.data = 'signed';
    assert.equal(getActiveReceiver(permit).email, 'second@example.test');
    assert.equal(isCurrentUserActiveReceiver(permit, { email: 'first@example.test' }, users), false);
    assert.equal(isCurrentUserActiveReceiver(permit, { email: 'second@example.test' }, users), true);
});

test('formats timestamps and does not invent times for legacy date-only entries', () => {
    assert.equal(formatDateTime('2026-03-04'), '04/03/2026 (time not recorded)');
    assert.equal(formatDateTime(new Date(2026, 2, 4, 9, 7).toISOString()), '04/03/2026 09:07');
});

test('prework locks after issuer signature or issuance, including stale writes', () => {
    const draft = { isDraft: true, status: 'active', location: 'A', partAChecklist: [] };
    assert.equal(isPreworkLocked(draft), false);
    const signed = { ...draft, issuerSignature: { data: 'signed' } };
    assert.equal(isPreworkLocked(signed), true);
    assert.equal(hasLockedPreworkChanges(signed, { ...signed, location: 'B' }), true);
    assert.equal(hasLockedPreworkChanges(signed, { ...signed, isDraft: false, status: 'issued' }), false);
    assert.equal(hasLockedPreworkChanges({ ...draft, isDraft: false }, { ...draft, partAChecklist: [{ answer: 'yes' }] }), true);
});
