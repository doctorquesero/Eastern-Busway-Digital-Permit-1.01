import { Permit } from '../types';

const STORAGE_KEY = 'eba_permits_db';

export const getPermits = (): Permit[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const savePermit = (permit: Permit): void => {
  const permits = getPermits();
  const index = permits.findIndex(p => p.id === permit.id);
  if (index >= 0) {
    permits[index] = permit;
  } else {
    permits.push(permit);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(permits));
};

export const getPermitById = (id: string): Permit | undefined => {
  const permits = getPermits();
  return permits.find(p => p.id === id);
};

export const generatePermitNumber = (): string => {
  const count = getPermits().length + 1;
  return `EB-PT-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
};