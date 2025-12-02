import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import LoginScreen from './components/LoginScreen';
import GanttDashboard from './components/GanttDashboard';

export default function App() {
  const { isAuthenticated, loading, initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

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

  return isAuthenticated ? <GanttDashboard /> : <LoginScreen />;
}
