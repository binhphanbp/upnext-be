import { initializeApp, getApp, getApps, cert } from 'firebase-admin/app';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider = {
  provide: FIREBASE_ADMIN,
  useFactory: () => {
    const apps = getApps();
    if (apps.length > 0) {
      return getApp();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '⚠️ Warning: Missing Firebase environment variables. Push notifications will be disabled/mocked in development.',
        );
        return {
          name: '[DEFAULT]',
          options: {},
        } as any;
      }
      throw new Error('Missing Firebase environment variables');
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
        } as any;
      }
      throw err;
    }
  },
};