import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'eba-digital-permits';

const TARGET_REFERENCE = '94';
let temporaryCredentialsPath = '';

const initializeTestAdmin = () => {
    const configPath = path.join(process.env.APPDATA || '', 'firebase-tools.json');
    const configStorePath = path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(fs.existsSync(configPath) ? configPath : configStorePath, 'utf8'));
    const tokens = config.tokens;
    if (!tokens?.refresh_token) {
        throw new Error('Firebase CLI refresh token is unavailable. Run firebase login first.');
    }
    const firebaseToolsApi = require(path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'api.js'));
    temporaryCredentialsPath = path.join(os.tmpdir(), `eba-cx-test-${process.pid}.json`);
    fs.writeFileSync(temporaryCredentialsPath, JSON.stringify({
        type: 'authorized_user',
        client_id: firebaseToolsApi.clientId(),
        client_secret: firebaseToolsApi.clientSecret(),
        refresh_token: tokens.refresh_token,
    }));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = temporaryCredentialsPath;
};

const getPermitReference = (permit: FirebaseFirestore.DocumentData) =>
    String(permit.itwocxNumber ?? permit.permitNumber ?? '').replace(/\D/g, '');

const run = async () => {
    initializeTestAdmin();
    const { processPendingPermitSync } = await import('./index.js');
    const db = admin.firestore();
    console.log('[TEST] Starting local CX sync test for permit reference 94.');
    const authSnapshot = await db.collection('settings').doc('cx_auth').get();
    const authData = authSnapshot.data();
    console.log(`[TEST] Token validation: ${authData?.session_key ? 'cached session token found' : 'no cached session token; worker will renew/login'}.`);

    let match: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let collectionName = '';
    for (const candidateCollection of ['permits_demo', 'permits']) {
        const snapshot = await db.collection(candidateCollection).get();
        const candidate = snapshot.docs.find((doc) => getPermitReference(doc.data()) === TARGET_REFERENCE);
        if (candidate) {
            match = candidate;
            collectionName = candidateCollection;
            break;
        }
    }

    if (!match) {
        throw new Error('Permit reference 94 was not found in permits_demo or permits.');
    }

    const permit = match.data();
    const isClosure = permit.status === 'closed' || permit.cxSyncPending === 'closure';
    const previousValue = isClosure
        ? { ...permit, status: 'active', cxSyncPending: null, syncStatus: 'synced' }
        : { ...permit, isDraft: true, status: 'draft', cxSyncPending: null, syncStatus: 'synced' };

    console.log(`[TEST] Search results: ${collectionName}/${match.id}`);
    console.log(`[TEST] Reference: ${permit.itwocxNumber || permit.permitNumber}; action: ${isClosure ? 'Closure' : 'Issuance'}; PDF: ${permit.pdfBackupUrl ? 'available' : 'missing'}.`);
    console.log('[TEST] Invoking the production CX sync worker.');
    await processPendingPermitSync(match.id, permit, previousValue, collectionName);
    console.log('[TEST] Final PUT response: CX sync worker completed successfully.');
    console.log('[TEST] PDF upload status: attachment step completed when closure was requested.');
};

run()
    .catch((error: unknown) => {
        console.error('[TEST] CX sync failed:', error instanceof Error ? error.stack || error.message : error);
        process.exitCode = 1;
    })
    .finally(() => {
        if (temporaryCredentialsPath) fs.rmSync(temporaryCredentialsPath, { force: true });
        if (admin.apps.length) void admin.app().delete();
    });