import { getApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Isolated data-source config for the notifier. Defaults read the existing LIVE `permits`
 * collection in the default database (read-only: this module only ever calls .get()).
 * To move to a dedicated DB or multi-tenant layout later, change these values only:
 *   NOTIFIER_DATABASE_ID=notifications  NOTIFIER_PERMITS_PATH=tenants/<tenantId>/permits
 */
const DATABASE_ID = process.env.NOTIFIER_DATABASE_ID || '(default)';
export const PERMITS_PATH = process.env.NOTIFIER_PERMITS_PATH || 'permits';

export const getNotifierDb = (): Firestore => getFirestore(getApp(), DATABASE_ID);
