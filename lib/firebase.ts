import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore as getFirestoreSdk, Firestore, connectFirestoreEmulator } from "firebase/firestore";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp | undefined {
  if (typeof window === "undefined") return undefined;
  
  if (!app && firebaseConfig.apiKey) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
    } else {
      app = initializeApp(firebaseConfig);
    }
  }
  
  return app;
}

export function getFirebaseAuth(): Auth | undefined {
  if (typeof window === "undefined") return undefined;
  
  if (!auth) {
    const app = getFirebaseApp();
    if (app) {
      auth = getAuth(app);
      
      // Connect to emulator in development if configured
      if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
        connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
      }
    }
  }
  
  return auth;
}

export function getFirestore(): Firestore | undefined {
  if (typeof window === "undefined") return undefined;
  
  if (!db) {
    const app = getFirebaseApp();
    if (app) {
      db = getFirestoreSdk(app);
      
      // Connect to emulator in development if configured
      if (process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST) {
        connectFirestoreEmulator(db, "localhost", Number(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST.split(":")[1] || 8080));
      }
    }
  }
  
  return db;
}
