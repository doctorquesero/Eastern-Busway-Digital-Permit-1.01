import React, { useEffect, useId, useRef, useState } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db } from '../firebase';
import { AclUser, aclName, validatePinChange } from '../utils/acl';

const normalizedEmail = (email?: string | null) => String(email || '').trim().toLowerCase();

export const ChangePinForm: React.FC<{ currentEmail: string; onSavingChange?: (saving: boolean) => void }> = ({ currentEmail, onSavingChange }) => {
    const id = useId();
    const [users, setUsers] = useState<AclUser[]>([]);
    const [selectedEmail, setSelectedEmail] = useState(() => normalizedEmail(currentEmail));
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => onSnapshot(doc(db, 'appSettings', 'global'), snapshot => {
        const assignments = snapshot.data()?.roleAssignments;
        if (!snapshot.exists() || !Array.isArray(assignments)) {
            setUsers([]);
            setError('ACL directory is unavailable.');
        } else {
            setUsers(assignments);
            setError('');
        }
        setLoading(false);
    }, err => {
        console.error('Unable to load ACL directory:', err);
        setUsers([]);
        setError('Unable to load the stakeholder directory. Please try again.');
        setLoading(false);
    }), []);

    const selected = users.filter(user => normalizedEmail(user.email) === selectedEmail && selectedEmail);
    const options = users.filter(user => normalizedEmail(user.email))
        .sort((a, b) => aclName(a).localeCompare(aclName(b)) || normalizedEmail(a.email).localeCompare(normalizedEmail(b.email)));

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (saving) return;
        setError('');
        setSuccess('');
        if (selected.length !== 1) {
            setError('Select a unique ACL user before changing the PIN.');
            return;
        }
        if (!/^\d{4}$/.test(newPin) || newPin !== confirmPin) {
            setError('Enter and confirm a new 4-digit PIN.');
            return;
        }
        setSaving(true);
        onSavingChange?.(true);
        try {
            const settingsRef = doc(db, 'appSettings', 'global');
            const name = await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(settingsRef);
                const assignments = snapshot.data()?.roleAssignments;
                if (!Array.isArray(assignments)) throw new Error('ACL directory is unavailable.');
                const matches = assignments.filter((user: AclUser) => normalizedEmail(user.email) === selectedEmail);
                if (matches.length !== 1) throw new Error('Selected ACL user is no longer available or is duplicated.');
                const validation = validatePinChange(matches[0], currentPin, newPin, confirmPin);
                if (validation) throw new Error(validation);
                const updated = assignments.map((user: AclUser) =>
                    normalizedEmail(user.email) === selectedEmail ? { ...user, pin: newPin } : user);
                transaction.update(settingsRef, { roleAssignments: updated });
                return aclName(matches[0]) || selectedEmail;
            });
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
            setSuccess(`PIN changed for ${name}.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to update PIN. Please try again.');
        } finally {
            setSaving(false);
            onSavingChange?.(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <h2 className="text-xl font-bold mb-4">Change My PIN</h2>
            <label htmlFor={`${id}-user`} className="block text-sm font-bold mb-4">
                Select User / Stakeholder
                <select id={`${id}-user`} required disabled={loading || saving} className="block w-full border rounded p-2 mt-1 bg-white"
                    value={selected.length === 1 ? selectedEmail : ''}
                    onChange={event => {
                        setSelectedEmail(event.target.value);
                        setCurrentPin(''); setNewPin(''); setConfirmPin('');
                        setError(''); setSuccess('');
                    }}>
                    <option value="">{loading ? 'Loading stakeholders...' : 'Select a stakeholder'}</option>
                    {options.map((user, index) => <option key={`${normalizedEmail(user.email)}-${index}`} value={normalizedEmail(user.email)}>
                        {aclName(user) || 'Name not recorded'} ({user.email?.trim()})
                    </option>)}
                </select>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                    ['Current 4-Digit PIN', currentPin, setCurrentPin],
                    ['New 4-Digit PIN', newPin, setNewPin],
                    ['Confirm New PIN', confirmPin, setConfirmPin]
                ] as const).map(([label, value, setter]) => (
                    <label key={label} className="text-sm font-bold">{label}
                        <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} required disabled={saving}
                            className="block w-full border rounded p-2 mt-1" value={value}
                            onChange={event => setter(event.target.value.replace(/\D/g, '').slice(0, 4))} />
                    </label>
                ))}
            </div>
            <button type="submit" disabled={saving || loading || selected.length !== 1} className="mt-4 bg-blue-600 text-white font-bold rounded px-4 py-2 disabled:opacity-50">
                {saving ? 'Saving...' : 'Change My PIN'}
            </button>
            {error && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p>}
            {success && <p role="status" className="mt-2 text-sm font-bold text-green-700">{success}</p>}
        </form>
    );
};

export const ChangePinModal: React.FC<{ currentEmail: string; onClose: () => void }> = ({ currentEmail, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    useEffect(() => {
        const previousFocus = document.activeElement;
        modalRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); if (!savingRef.current) onClose(); return; }
            if (event.key !== 'Tab' || !modalRef.current) return;
            const focusable = Array.from<HTMLElement>(modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 print:hidden">
            <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 id={titleId} className="font-bold text-lg">Stakeholder PIN</h2>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Close change PIN" className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"><X size={20} /></button>
                </div>
                <ChangePinForm currentEmail={currentEmail} onSavingChange={value => { savingRef.current = value; setSaving(value); }} />
            </div>
        </div>
    );
};
