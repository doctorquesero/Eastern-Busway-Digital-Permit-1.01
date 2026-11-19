import { getApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Every tenant-specific value lives here. To port to the multi-tenant SaaS, set e.g.
 *   METRICS_PERMITS_PATH=tenants/<tenantId>/permits
 *   METRICS_SUMMARY_PATH=tenants/<tenantId>/analytics/latest_summary
 *   METRICS_SETTINGS_PATH=tenants/<tenantId>/appSettings/global
 * The permits collection and settings document are only ever READ. The only write in this
 * module is the single summary document.
 */
export const PERMITS_PATH = process.env.METRICS_PERMITS_PATH || 'permits';
export const SUMMARY_PATH = process.env.METRICS_SUMMARY_PATH || 'analytics/latest_summary';
export const shardPath = (index: number): string => `${SUMMARY_PATH}_nodes_${index}`;
export const SETTINGS_PATH = process.env.METRICS_SETTINGS_PATH || 'appSettings/global';
const DATABASE_ID = process.env.METRICS_DATABASE_ID || '(default)';

export const getMetricsDb = (): Firestore => getFirestore(getApp(), DATABASE_ID);
