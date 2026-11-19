export interface AclUser {
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    name?: string;
    role?: string;
    roles?: string | string[];
    phone?: string;
    pin?: string;
}

export const aclRoles = (user: AclUser): string[] =>
    [user.roles, user.role].flat().filter(Boolean)
        .flatMap(role => String(role).split(/[,;/]/))
        .map(role => role.trim().toLowerCase());

export const aclName = (user: AclUser): string =>
    `${user.firstName || ''} ${user.lastName || ''}`.trim().replace(/\s+/g, ' ');

export const aclPin = (user: AclUser): string => {
    if (user.pin !== undefined && user.pin !== null && user.pin !== '') return String(user.pin);
    const digits = String(user.phone || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : '';
};

export const validAclPin = (user: AclUser, pin: string): boolean =>
    /^\d{4}$/.test(pin) && /^\d{4}$/.test(aclPin(user)) && pin === aclPin(user);

export const validatePinChange = (user: AclUser, currentPin: string, newPin: string, confirmPin: string): string => {
    if (!/^\d{4}$/.test(newPin) || newPin !== confirmPin) return 'Enter and confirm a new 4-digit PIN.';
    if (!validAclPin(user, currentPin)) return 'Invalid current 4-digit PIN.';
    return '';
};
