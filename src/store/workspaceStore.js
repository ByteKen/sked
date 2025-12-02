import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  doc, 
  setDoc, 
  onSnapshot,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export const useWorkspaceStore = create(
  subscribeWithSelector((set, get) => ({
    workspaces: {},  // { workspaceId: { id, title, createdAt, updatedAt } }
    currentWorkspaceId: null,
    loading: true,
    unsubscribe: null,

    // Get current workspace
    getCurrentWorkspace: () => {
      const { workspaces, currentWorkspaceId } = get();
      return currentWorkspaceId ? workspaces[currentWorkspaceId] : null;
    },

    // Get workspaces as array
    getWorkspaceList: () => {
      const { workspaces } = get();
      return Object.values(workspaces).sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
    },

    // Initialize workspaces from Firestore
    initWorkspaces: () => {
      const user = auth.currentUser;
      if (!user) {
        set({ workspaces: {}, currentWorkspaceId: null, loading: false });
        return;
      }

      set({ loading: true });

      const userDocRef = doc(db, 'users', user.uid);
      
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const workspaces = data.workspaces || {};
          const lastWorkspaceId = data.lastWorkspaceId;
          
          // Set current workspace to last used, or first available
          let currentWorkspaceId = null;
          if (lastWorkspaceId && workspaces[lastWorkspaceId]) {
            currentWorkspaceId = lastWorkspaceId;
          } else {
            const workspaceIds = Object.keys(workspaces);
            if (workspaceIds.length > 0) {
              currentWorkspaceId = workspaceIds[0];
            }
          }

          set({ 
            workspaces, 
            currentWorkspaceId,
            loading: false 
          });
        } else {
          // New user - no workspaces yet
          set({ workspaces: {}, currentWorkspaceId: null, loading: false });
        }
      }, (error) => {
        console.error('Workspace listener error:', error);
        set({ loading: false });
      });

      set({ unsubscribe });
      return unsubscribe;
    },

    // Cleanup listener
    cleanup: () => {
      const { unsubscribe } = get();
      if (unsubscribe) {
        unsubscribe();
        set({ unsubscribe: null });
      }
    },

    // Create a new workspace
    createWorkspace: async (title) => {
      const user = auth.currentUser;
      if (!user) return null;

      const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const workspace = {
        id: workspaceId,
        title: title.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          workspaces: {
            [workspaceId]: workspace
          },
          lastWorkspaceId: workspaceId,
          // Initialize empty tasks for this workspace
          [`tasks_${workspaceId}`]: [],
          [`nextId_${workspaceId}`]: 1,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        set({ currentWorkspaceId: workspaceId });
        return workspace;
      } catch (err) {
        console.error('Failed to create workspace:', err);
        return null;
      }
    },

    // Switch to a different workspace
    switchWorkspace: async (workspaceId) => {
      const user = auth.currentUser;
      if (!user) return;

      const { workspaces } = get();
      if (!workspaces[workspaceId]) return;

      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          lastWorkspaceId: workspaceId,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        set({ currentWorkspaceId: workspaceId });
      } catch (err) {
        console.error('Failed to switch workspace:', err);
      }
    },

    // Update workspace title
    updateWorkspace: async (workspaceId, updates) => {
      const user = auth.currentUser;
      if (!user) return;

      const { workspaces } = get();
      if (!workspaces[workspaceId]) return;

      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          workspaces: {
            [workspaceId]: {
              ...workspaces[workspaceId],
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          },
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('Failed to update workspace:', err);
      }
    },

    // Delete a workspace
    deleteWorkspace: async (workspaceId) => {
      const user = auth.currentUser;
      if (!user) return;

      const { workspaces, currentWorkspaceId } = get();
      if (!workspaces[workspaceId]) return;

      try {
        const userDocRef = doc(db, 'users', user.uid);
        
        // Remove workspace and its tasks
        await setDoc(userDocRef, {
          workspaces: {
            [workspaceId]: deleteField()
          },
          [`tasks_${workspaceId}`]: deleteField(),
          [`nextId_${workspaceId}`]: deleteField(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // If deleting current workspace, switch to another
        if (currentWorkspaceId === workspaceId) {
          const remainingWorkspaces = Object.keys(workspaces).filter(id => id !== workspaceId);
          const newCurrentId = remainingWorkspaces.length > 0 ? remainingWorkspaces[0] : null;
          
          if (newCurrentId) {
            await setDoc(userDocRef, {
              lastWorkspaceId: newCurrentId,
            }, { merge: true });
          }
          
          set({ currentWorkspaceId: newCurrentId });
        }
      } catch (err) {
        console.error('Failed to delete workspace:', err);
      }
    },
  }))
);
