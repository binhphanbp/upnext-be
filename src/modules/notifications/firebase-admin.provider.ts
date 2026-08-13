import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApp, getApps, cert, App } from 'firebase-admin/app';
import { generateKeyPairSync } from 'node:crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

// Force load .env immediately before NestJS module resolution
dotenv.config({ path: resolve(process.cwd(), '.env') });

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider = {
  provide: FIREBASE_ADMIN,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('FirebaseAdminProvider');

    const apps = getApps();
    if (apps.length > 0) {
      return getApp();
    }

    let projectId =
      configService.get<string>('firebaseProjectId') ||
      configService.get<string>('FIREBASE_PROJECT_ID') ||
      process.env.FIREBASE_PROJECT_ID;

    let clientEmail =
      configService.get<string>('firebaseClientEmail') ||
      configService.get<string>('FIREBASE_CLIENT_EMAIL') ||
      process.env.FIREBASE_CLIENT_EMAIL;

    let privateKey =
      configService.get<string>('firebasePrivateKey') ||
      configService.get<string>('FIREBASE_PRIVATE_KEY') ||
      process.env.FIREBASE_PRIVATE_KEY;

    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!projectId || !clientEmail || !privateKey) {
      logger.warn('⚠️ Firebase env variables not set. Using dummy config for local development.');
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
    } else {
      logger.log(`🔥 Initializing Firebase Admin SDK for project: ${projectId} (${clientEmail})`);
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
        logger.warn(
          '⚠️ Failed to initialize Firebase Admin with provided credentials. Push notifications will be mocked.',
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
