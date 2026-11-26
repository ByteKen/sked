import { doc, onSnapshot, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type UserDocumentSnapshot = {
  exists: boolean;
  data: DocumentData | null;
};

type UserDocListener = (snapshot: UserDocumentSnapshot) => void;
type UserDocErrorListener = (error: Error) => void;

class UserDocumentSyncService {
  private activeUid: string | null = null;
  private unsubscribeFirestore: Unsubscribe | null = null;
  private listeners = new Set<UserDocListener>();
  private errorListeners = new Set<UserDocErrorListener>();
  private hasInitialSnapshot = false;
  private latestSnapshot: UserDocumentSnapshot = { exists: false, data: null };

  start(uid: string): void {
    if (this.activeUid === uid && this.unsubscribeFirestore) {
      return;
    }

    this.stop();
    this.activeUid = uid;
    this.hasInitialSnapshot = false;

    const userDocRef = doc(db, 'users', uid);
    this.unsubscribeFirestore = onSnapshot(
      userDocRef,
      (docSnap) => {
        const snapshot: UserDocumentSnapshot = {
          exists: docSnap.exists(),
          data: docSnap.exists() ? docSnap.data() : null,
        };
        this.hasInitialSnapshot = true;
        this.latestSnapshot = snapshot;
        this.listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        console.error('Firestore user document sync error:', error);
        this.errorListeners.forEach((listener) => listener(error));
      },
    );
  }

  stop(): void {
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
    }
    this.activeUid = null;
    this.hasInitialSnapshot = false;
    this.latestSnapshot = { exists: false, data: null };
  }

  subscribe(listener: UserDocListener, onError?: UserDocErrorListener): () => void {
    this.listeners.add(listener);
    if (onError) {
      this.errorListeners.add(onError);
    }

    if (this.hasInitialSnapshot) {
      listener(this.latestSnapshot);
    }

    return () => {
      this.listeners.delete(listener);
      if (onError) {
        this.errorListeners.delete(onError);
      }
    };
  }

  getLatestSnapshot(): UserDocumentSnapshot | null {
    return this.hasInitialSnapshot ? this.latestSnapshot : null;
  }
}

export const userDocumentSync = new UserDocumentSyncService();
