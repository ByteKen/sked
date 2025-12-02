import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  doc, 
  setDoc, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export const useGanttStore = create(
  subscribeWithSelector((set, get) => ({
    tasks: [],
    nextId: 1,
    loading: false,
    currentWorkspaceId: null,
    unsubscribe: null,

    // Initialize tasks for a specific workspace
    initTasks: (workspaceId) => {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user logged in, skipping task initialization');
        set({ tasks: [], loading: false, currentWorkspaceId: null });
        return;
      }

      if (!workspaceId) {
        console.log('No workspace selected, skipping task initialization');
        set({ tasks: [], loading: false, currentWorkspaceId: null });
        return;
      }

      // Cleanup previous listener if switching workspaces
      const { unsubscribe: prevUnsubscribe } = get();
      if (prevUnsubscribe) {
        prevUnsubscribe();
      }

      set({ loading: true, currentWorkspaceId: workspaceId });

      const userDocRef = doc(db, 'users', user.uid);
      
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const tasksKey = `tasks_${workspaceId}`;
          const nextIdKey = `nextId_${workspaceId}`;
          
          set({ 
            tasks: data[tasksKey] || [], 
            nextId: data[nextIdKey] || 1,
            loading: false 
          });
        } else {
          set({ tasks: [], nextId: 1, loading: false });
        }
      }, (error) => {
        console.error('Firestore listener error:', error);
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
        set({ unsubscribe: null, tasks: [], currentWorkspaceId: null });
      }
    },

    // Add a new task
    addTask: (task) => {
      const id = get().nextId;
      const newTask = {
        ...task,
        id,
        children: [],
        collapsed: false,
      };

      set((state) => ({
        tasks: [...state.tasks, newTask],
        nextId: state.nextId + 1,
      }));

      get().persistTasks();
      return newTask;
    },

    // Update a task
    updateTask: (taskId, updates) => {
      const updateRecursive = (tasks) => {
        return tasks.map((task) => {
          if (task.id === taskId) {
            return { ...task, ...updates };
          }
          if (task.children && task.children.length > 0) {
            return {
              ...task,
              children: updateRecursive(task.children),
            };
          }
          return task;
        });
      };

      set((state) => ({
        tasks: updateRecursive(state.tasks),
      }));

      // After updating, recalculate parent progress
      get().recalculateAllParentProgress();
      get().persistTasks();
    },

    // Calculate progress for a parent task based on its subtasks
    calculateParentProgress: (task) => {
      if (!task.children || task.children.length === 0) {
        return task.progress || 0;
      }

      const totalSubtasks = task.children.length;
      const completedSubtasks = task.children.filter(
        (child) => child.progress === 100 || child.isDone
      ).length;

      return Math.round((completedSubtasks / totalSubtasks) * 100);
    },

    // Recalculate progress for all parent tasks
    recalculateAllParentProgress: () => {
      const recalculate = (tasks) => {
        return tasks.map((task) => {
          if (task.children && task.children.length > 0) {
            // First recalculate children
            const updatedChildren = recalculate(task.children);
            // Then calculate this task's progress based on children
            const completedSubtasks = updatedChildren.filter(
              (child) => child.progress === 100 || child.isDone
            ).length;
            const progress = Math.round((completedSubtasks / updatedChildren.length) * 100);
            
            return {
              ...task,
              children: updatedChildren,
              progress,
            };
          }
          return task;
        });
      };

      set((state) => ({
        tasks: recalculate(state.tasks),
      }));
    },

    // Toggle subtask done status
    toggleSubtaskDone: (taskId) => {
      const toggleRecursive = (tasks) => {
        return tasks.map((task) => {
          if (task.id === taskId) {
            const isDone = !task.isDone;
            return { 
              ...task, 
              isDone,
              progress: isDone ? 100 : 0 
            };
          }
          if (task.children && task.children.length > 0) {
            return {
              ...task,
              children: toggleRecursive(task.children),
            };
          }
          return task;
        });
      };

      set((state) => ({
        tasks: toggleRecursive(state.tasks),
      }));

      // Recalculate parent progress after toggling
      get().recalculateAllParentProgress();
      get().persistTasks();
    },

    // Delete a task
    deleteTask: (taskId) => {
      const deleteRecursive = (tasks) => {
        return tasks
          .filter((task) => task.id !== taskId)
          .map((task) => {
            if (task.children && task.children.length > 0) {
              return {
                ...task,
                children: deleteRecursive(task.children),
              };
            }
            return task;
          });
      };

      set((state) => ({
        tasks: deleteRecursive(state.tasks),
      }));

      // Recalculate parent progress after deleting task
      get().recalculateAllParentProgress();
      get().persistTasks();
    },

    // Add subtask
    addSubtask: (parentId, subtask) => {
      const id = get().nextId;
      const newSubtask = {
        ...subtask,
        id,
        parentId,
        children: [],
        collapsed: false,
      };

      const updateRecursive = (tasks) => {
        return tasks.map((task) => {
          if (task.id === parentId) {
            return {
              ...task,
              children: [...(task.children || []), newSubtask],
            };
          }
          if (task.children && task.children.length > 0) {
            return {
              ...task,
              children: updateRecursive(task.children),
            };
          }
          return task;
        });
      };

      set((state) => ({
        tasks: updateRecursive(state.tasks),
        nextId: state.nextId + 1,
      }));

      // Recalculate parent progress after adding subtask
      get().recalculateAllParentProgress();
      get().persistTasks();
      return newSubtask;
    },

    // Toggle task collapse
    toggleCollapse: (taskId) => {
      const toggleRecursive = (tasks) => {
        return tasks.map((task) => {
          if (task.id === taskId) {
            return { ...task, collapsed: !task.collapsed };
          }
          if (task.children && task.children.length > 0) {
            return {
              ...task,
              children: toggleRecursive(task.children),
            };
          }
          return task;
        });
      };

      set((state) => ({
        tasks: toggleRecursive(state.tasks),
      }));

      get().persistTasks();
    },

    // Get all tasks (flattened)
    getAllTasks: () => {
      const flatten = (tasks) => {
        return tasks.reduce((acc, task) => {
          acc.push(task);
          if (task.children && task.children.length > 0) {
            acc.push(...flatten(task.children));
          }
          return acc;
        }, []);
      };

      return flatten(get().tasks);
    },

    // Find task by ID
    findTaskById: (id) => {
      const find = (tasks) => {
        for (const task of tasks) {
          if (task.id === id) return task;
          if (task.children && task.children.length > 0) {
            const found = find(task.children);
            if (found) return found;
          }
        }
        return null;
      };

      return find(get().tasks);
    },

    // Persist to Firestore (workspace-specific)
    persistTasks: async () => {
      const user = auth.currentUser;
      const { currentWorkspaceId } = get();
      
      if (!user) {
        console.log('No user logged in, skipping persist');
        return;
      }

      if (!currentWorkspaceId) {
        console.log('No workspace selected, skipping persist');
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const tasksKey = `tasks_${currentWorkspaceId}`;
        const nextIdKey = `nextId_${currentWorkspaceId}`;
        
        await setDoc(userDocRef, {
          [tasksKey]: get().tasks,
          [nextIdKey]: get().nextId,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('Failed to persist tasks to Firestore:', err);
      }
    },

    // Clear all tasks
    clearTasks: async () => {
      set({ tasks: [], nextId: 1 });
      await get().persistTasks();
    },

    // Export data as JSON
    exportAsJSON: () => {
      return JSON.stringify(
        {
          tasks: get().tasks,
          exportDate: new Date().toISOString(),
        },
        null,
        2
      );
    },

    // Import data from JSON
    importFromJSON: (jsonString) => {
      try {
        const data = JSON.parse(jsonString);
        if (data.tasks && Array.isArray(data.tasks)) {
          set({ tasks: data.tasks });
          get().persistTasks();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  }))
);
