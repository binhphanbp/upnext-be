import { initializeApp, getApp, getApps, cert, App } from 'firebase-admin/app';
import { generateKeyPairSync } from 'node:crypto';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider = {
  provide: FIREBASE_ADMIN,
  useFactory: () => {
    const apps = getApps();
    if (apps.length > 0) {
      return getApp();
    }

    let projectId = process.env.FIREBASE_PROJECT_ID;
    let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase env variables not set. Using dummy config for local development.');
      projectId = 'dummy-project';
      clientEmail = 'dummy@dummy.iam.gserviceaccount.com';
      const { privateKey: generatedKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });
      privateKey = generatedKey;
    }

    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '⚠️ Warning: Failed to initialize Firebase Admin with provided credentials. Push notifications will be mocked.',
          err,
        );
        return {
          name: '[DEFAULT]',
          options: {},
        } as unknown as App;
      }
      throw err;
    }
  },
};