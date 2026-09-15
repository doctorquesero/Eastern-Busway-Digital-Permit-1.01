export const getNamePartsFromEmail = (email?: string) => {
    const localPart = String(email || '').split('@')[0];
    const parts = localPart.split('.').filter(Boolean);
    return {
        firstName: parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : '',
        lastName: parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase() : ''
    };
};

export const getDisplayNameFromEmail = (email?: string) => {
    const { firstName, lastName } = getNamePartsFromEmail(email);
    return [firstName, lastName].filter(Boolean).join(' ');
};