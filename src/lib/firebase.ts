import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  signInAnonymously,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork,
  setLogLevel,
  Firestore
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Google Workspace Scopes
export const WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly"
];

WORKSPACE_SCOPES.forEach(scope => {
  googleProvider.addScope(scope);
});

// In-memory access token cache for Google APIs (not stored in localStorage for security)
let cachedGoogleAccessToken: string | null = null;

export const setGoogleAccessToken = (token: string | null) => {
  cachedGoogleAccessToken = token;
};

export const getGoogleAccessToken = (): string | null => {
  return cachedGoogleAccessToken;
};

// Silence noisy internal backoff logs and quota warnings from the Firestore client
try {
  setLogLevel("silent");
} catch {
  // Ignore
}

// Initialize Firestore with custom database ID if defined
const customDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db: Firestore = customDbId 
  ? getFirestore(app, customDbId)
  : getFirestore(app);

export {
  GoogleAuthProvider,
  signInWithPopup,
  fbSignOut,
  onAuthStateChanged,
  signInAnonymously,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork
};

export type { User };
