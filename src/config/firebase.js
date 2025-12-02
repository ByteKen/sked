import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - these values come from your Firebase Console
// Go to: https://console.firebase.google.com → Your Project → Project Settings → General → Your apps → Web app
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
// Force account selection every time (useful for school accounts)
googleProvider.setCustomParameters({
  prompt: 'select_account',
  // Restrict to phinmaed.com domain
  hd: 'phinmaed.com'
});

// Initialize Firestore
export const db = getFirestore(app);

// Allowed email domain
export const ALLOWED_DOMAIN = 'phinmaed.com';

export default app;
