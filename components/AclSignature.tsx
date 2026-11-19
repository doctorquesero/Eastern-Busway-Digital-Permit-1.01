import React, { useState } from 'react';
import SignaturePad from './SignaturePad';
import { Signature } from '../types';
import { AclUser, aclName, aclRoles, validAclPin } from '../utils/acl';

interface AclSignatureProps {
    users: AclUser[];
    role: 'Site Engineer' | 'Receiver' | 'Approver';
    label: string;
    onSave: (signature: Signature, user: AclUser) => void | boolean | Promise<void | boolean>;
    initialValue?: Signature;
    readOnly?: boolean;
    excludeEmail?: string;
    onClear?: () => void;
    validateUser?: (user: AclUser) => boolean;
}

const AclSignature: React.FC<AclSignatureProps> = ({ users, role, label, onSave, initialValue, readOnly, excludeEmail, onClear, validateUser }) => {
    const [search, setSearch] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [replace, setReplace] = useState(false);
    const existing = replace ? undefined : initialValue;
    const eligible = users.filter(user => aclRoles(user).includes(role.toLowerCase()) && user.email && user.firstName && user.lastName && user.email.trim().toLowerCase() !== String(excludeEmail || '').trim().toLowerCase());
    const selected = eligible.find(user => user.email!.trim().toLowerCase() === email);
    const matches = eligible.filter(user => aclName(user).toLowerCase().includes(search.trim().toLowerCase()));
    return (
        <div>
            {!readOnly && initialValue && !replace && <button type="button" className="text-blue-700 font-bold mb-2" onClick={() => setReplace(true)}>Replace signature</button>}
            {!readOnly && !existing && <>
                <label className="block text-xs font-bold mb-1">Search {role}</label>
                <input className="w-full border rounded p-2 mb-2" value={search} onChange={event => setSearch(event.target.value)} />
                <select className="w-full border rounded p-2 mb-2" value={email} onChange={event => { setEmail(event.target.value); setPin(''); onClear?.(); }}>
                    <option value="">Select {role}</option>
                    {eligible.filter(user => matches.includes(user) || user === selected).map(user => <option key={user.email} value={user.email!.trim().toLowerCase()}>{aclName(user)}</option>)}
                </select>
                <label className="block text-xs font-bold mb-1">4-digit PIN</label>
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} className="w-full border rounded p-2 mb-2" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </>}
            <SignaturePad key={email || existing?.name || 'empty'} label={label} initialValue={existing} externalName={selected ? aclName(selected) : undefined}
                fixedName beforeSave={() => {
                    if (!selected) { alert(`Select an ACL ${role} before signing.`); return false; }
                    if (!validAclPin(selected, pin)) { alert(`Invalid 4-digit PIN for ${aclName(selected)}.`); return false; }
                    if (validateUser && !validateUser(selected)) return false;
                    return true;
                }}
                readOnly={readOnly || !!existing}
                onClear={() => { setPin(''); onClear?.(); }}
                onSave={async signature => {
                    if (!selected) return false;
                    const saved = await onSave({ ...signature, name: aclName(selected), email: selected.email!.trim().toLowerCase() }, selected);
                    if (saved === false) return false;
                    setPin('');
                }} />
        </div>
    );
};

export default AclSignature;
