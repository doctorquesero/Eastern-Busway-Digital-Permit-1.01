import type { Permit } from '../types';
import { aclRoles } from './acl.ts';
import type { AclUser } from './acl';

const normalizeName = (value: unknown) =>
    String(value ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const receiverAliases: Record<string, string> = {
    'tama': 'tamahana.leaf@easternbusway.nz',
    'tama leaf': 'tamahana.leaf@easternbusway.nz',
    'tamahana': 'tamahana.leaf@easternbusway.nz',
    'tamahana leaf': 'tamahana.leaf@easternbusway.nz',
    'sifa': 'sifa.valentine@easternbusway.nz',
    'sifa v': 'sifa.valentine@easternbusway.nz',
    'sifa valentine': 'sifa.valentine@easternbusway.nz',
    'isaac rivers': 'issac.rivers@easternbusway.nz',
    'issac rivers': 'issac.rivers@easternbusway.nz',
    'ryan parsrson': 'ryan@collelectrical.co.nz',
    'ryan parsons': 'ryan@collelectrical.co.nz',
    'ryan parsson': 'ryan@collelectrical.co.nz'
};

export const getActiveReceiver = (permit?: Permit) => {
    const logs = Array.isArray(permit?.handoverLogs) ? permit.handoverLogs : [];
    const handover = [...logs].reverse().find(log =>
        log && String(log.signature?.data || '').trim() &&
        (String(log.receiverName || '').trim() || String(log.receiverEmail || '').trim())
    );
    const rootReceiver = String(permit?.receiver || '').trim();
    const rootEmail = String(permit?.receiverEmail || (rootReceiver.includes('@') ? rootReceiver : '')).trim();
    return {
        handover,
        email: String(handover ? handover.receiverEmail || '' : rootEmail).trim().toLowerCase(),
        id: String(handover ? handover.receiverId || '' : permit?.receiverId || permit?.receiverUid || '').trim(),
        names: handover
            ? [handover.receiverName]
            : [permit?.receiverName, permit?.receiverSignature?.name, rootReceiver.includes('@') ? '' : rootReceiver]
    };
};

export const activeReceiverKey = (permit: Permit) => {
    const active = getActiveReceiver(permit);
    return JSON.stringify([active.handover?.id || '', active.email, active.id, active.names, active.handover?.signature?.data || permit.receiverSignature?.data || '']);
};

export const isCurrentUserActiveReceiver = (
    permit: Permit,
    currentUser: { email?: string | null; uid?: string } | null,
    aclUsers: AclUser[]
): boolean => {
    const email = String(currentUser?.email || '').trim().toLowerCase();
    if (!email || String(permit.issuerEmail || '').trim().toLowerCase() === email) return false;
    const receiver = getActiveReceiver(permit);
    const current = aclUsers.find(user => String(user.email || '').trim().toLowerCase() === email);
    if (!current || !aclRoles(current).includes('receiver')) return false;
    if (receiver.email) return receiver.email === email;
    if (receiver.id) return receiver.id === currentUser?.uid;

    const candidates = aclUsers.filter(user => !!user.email && aclRoles(user).includes('receiver'));
    const nameParts = (user: AclUser) => {
        const full = normalizeName(`${user.firstName || ''} ${user.lastName || ''}`) ||
            normalizeName(user.displayName || user.name) ||
            normalizeName(String(user.email || '').split('@')[0]);
        const parts = full.split(' ');
        return { full, first: parts[0], last: parts.slice(1).join(' '), emailName: normalizeName(String(user.email || '').split('@')[0]) };
    };
    for (const rawName of receiver.names) {
        const name = normalizeName(rawName);
        if (!name) continue;
        const exact = candidates.filter(user => {
            const parts = nameParts(user);
            return parts.full === name || parts.emailName === name;
        });
        if (exact.length) return exact.length === 1 && String(exact[0].email).trim().toLowerCase() === email;
        const aliasEmail = receiverAliases[name];
        if (aliasEmail) return aliasEmail === email;
        const tokens = name.split(' ');
        const first = tokens[0];
        const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
        if (last.length !== 1) continue;
        const hits = candidates.filter(user => {
            const parts = nameParts(user);
            return parts.first === first && parts.last.startsWith(last);
        });
        if (hits.length) return hits.length === 1 && String(hits[0].email).trim().toLowerCase() === email;
    }
    return false;
};
