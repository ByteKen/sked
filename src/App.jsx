import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { usePreferencesStore } from './store/preferencesStore';
import LoginScreen from './components/LoginScreen';
import GanttDashboard from './components/GanttDashboard';
import HomePage from './components/HomePage';

// Loading Screen component
function LoadingScreen({ theme = 'dark' }) {
  const isDark = theme === 'dark';
  return (
    <div className={`min-h-screen flex items-center justify-center ${
      isDark ? 'bg-[#0f1419]' : 'bg-slate-100'
    }`}>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 rounded-xl mb-4">
          <svg className="w-8 h-8 text-white animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <p className={`text-lg font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Loading...</p>
      </div>
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuthStore();
  const { theme } = usePreferencesStore();
  
  if (loading) {
    return <LoadingScreen theme={theme} />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Workspace Dashboard with URL param
function WorkspaceDashboardRoute() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { switchWorkspace, workspaces, loading, currentWorkspaceId } = useWorkspaceStore();
  const { theme } = usePreferencesStore();
  const switchingRef = useRef(false);
  
  useEffect(() => {
    // Wait for workspaces to load first
    if (loading) {
      return;
    }
    
    // Check if workspace exists
    if (!workspaces[workspaceId]) {
      // Workspace doesn't exist, redirect to home
      navigate('/', { replace: true });
      return;
    }
    
    // Switch to the workspace if not already current
    if (currentWorkspaceId !== workspaceId && !switchingRef.current) {
      switchingRef.current = true;
      switchWorkspace(workspaceId).finally(() => {
        switchingRef.current = false;
      });
    }
  }, [workspaceId, workspaces, loading, currentWorkspaceId, switchWorkspace, navigate]);
  
  // Show loading while workspaces load or workspace not ready
  if (loading || currentWorkspaceId !== workspaceId) {
    return <LoadingScreen theme={theme} />;
  }
  
  return <GanttDashboard onGoHome={() => navigate('/')} />;
}

// Home Page Route
function HomePageRoute() {
  const navigate = useNavigate();
  const { loading: workspaceLoading } = useWorkspaceStore();
  const { theme } = usePreferencesStore();
  
  const handleOpenWorkspace = (workspaceId) => {
    navigate(`/workspace/${workspaceId}`);
  };
  
  if (workspaceLoading) {
    return <LoadingScreen theme={theme} />;
  }
  
  return (
    <HomePage 
      onOpenWorkspace={handleOpenWorkspace}
    />
  );
}

export default function App() {
  const { isAuthenticated, loading, initAuth } = useAuthStore();
  const { initWorkspaces, cleanup: cleanupWorkspaces } = useWorkspaceStore();
  const { initPreferences, cleanup: cleanupPreferences } = usePreferencesStore();

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

  return (
    <Routes>
      {/* Login Route */}
      <Route 
        path="/login" 
        element={
          isAuthenticated && !loading ? <Navigate to="/" replace /> : <LoginScreen />
        } 
      />
      
      {/* Home Route - Workspace Selector */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <HomePageRoute />
          </ProtectedRoute>
        } 
      />
      
      {/* Workspace Dashboard Route */}
      <Route 
        path="/workspace/:workspaceId" 
        element={
          <ProtectedRoute>
            <WorkspaceDashboardRoute />
          </ProtectedRoute>
        } 
      />
      
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
