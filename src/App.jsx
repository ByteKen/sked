import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { usePreferencesStore } from './store/preferencesStore';
import LoginScreen from './components/LoginScreen';
import GanttDashboard from './components/GanttDashboard';
import HomePage from './components/HomePage';

export default function App() {
  const { isAuthenticated, loading, initAuth } = useAuthStore();
  const { loading: workspaceLoading, initWorkspaces, cleanup: cleanupWorkspaces } = useWorkspaceStore();
  const { theme, initPreferences, cleanup: cleanupPreferences } = usePreferencesStore();
  const [showHomePage, setShowHomePage] = useState(true);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Initialize workspaces and preferences when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initWorkspaces();
      initPreferences();
      
      return () => {
        cleanupWorkspaces();
        cleanupPreferences();
      };
    }
  }, [isAuthenticated, initWorkspaces, initPreferences, cleanupWorkspaces, cleanupPreferences]);

  // Always start on homepage when authenticated - user manually selects workspace
  // No auto-navigation to dashboard

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl mb-4">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-white text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Show loading while workspaces are being fetched
  if (workspaceLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        theme === 'dark' ? 'bg-[#0f1419]' : 'bg-slate-100'
      }`}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-xl mb-4">
            <svg className="w-8 h-8 text-white animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className={`text-lg font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show homepage if user wants to see all workspaces or has no workspaces
  if (showHomePage) {
    return (
      <HomePage 
        onOpenWorkspace={() => setShowHomePage(false)} 
      />
    );
  }

  // Show dashboard with current workspace
  return (
    <GanttDashboard 
      onGoHome={() => setShowHomePage(true)} 
    />
  );
}
