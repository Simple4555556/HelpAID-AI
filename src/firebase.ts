import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User
} from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
let firebaseConfig: any = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || '',
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || '',
  firestoreDatabaseId: (import.meta as any).env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "ai-studio-27ae267d-2d54-4dc2-ac44-d89a20c230cf"
};

import { getStorage } from 'firebase/storage';

if (!firebaseConfig.apiKey) {
  console.warn("Firebase configuration credentials are missing. Please check your environment configurations.");
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => {
  localStorage.removeItem('helpaid_token');
  localStorage.removeItem('helpaid_user');
  return signOut(auth);
};

// Firebase Email/Password Auth helpers
export const registerWithEmail = async (email: string, password: string, displayName: string) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (cred.user) {
    await updateProfile(cred.user, { displayName });
    try { await sendEmailVerification(cred.user); } catch (e) { /* optional */ }
  }
  return cred;
};

export const loginWithEmail = async (email: string, password: string, rememberMe: boolean = true) => {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
};

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

export { collection, doc, setDoc, getDoc, addDoc, onSnapshot, query, where, orderBy, Timestamp };
export type { User };
