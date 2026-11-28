import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AgendaReminderBanner } from '@/components/calendar/AgendaReminderBanner';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { HomePage } from '@/pages/HomePage';
import { LandingPage } from '@/pages/LandingPage';
import { LegalPage } from '@/pages/LegalPage';
import { SharedChartPage } from '@/pages/SharedChartPage';
import { StatusPage } from '@/pages/StatusPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { sanitizeInternalRedirectPath } from '@/domain/navigation';
import { userDocumentSync } from '@/services/userDocumentSync';
import { useAgendaStore } from '@/store/agendaStore';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center studio-atmosphere">
      <div className="text-center">
        <div className="inline-flex justify-center mb-4 animate-pulse">
          <BrandLogo size="lg" glow />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Loading workspace...
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}

function RootRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.loading);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const [searchParams] = useSearchParams();

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const safeRedirect = sanitizeInternalRedirectPath(searchParams.get('redirect'));
  if (safeRedirect) {
    return <Navigate to={safeRedirect} replace />;
  }

  if (workspaceLoading) {
    return <LoadingScreen />;
  }

  return <HomePage />;
}

function LegacyLoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/${location.search}`} replace />;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initAuth = useAuthStore((s) => s.initAuth);
  const initWorkspaces = useWorkspaceStore((s) => s.initWorkspaces);
  const cleanupWorkspaces = useWorkspaceStore((s) => s.cleanup);
  const initPreferences = usePreferencesStore((s) => s.initPreferences);
  const cleanupPreferences = usePreferencesStore((s) => s.cleanup);
  const initAgenda = useAgendaStore((s) => s.initAgenda);
  const cleanupAgenda = useAgendaStore((s) => s.cleanup);

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, [initAuth]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      userDocumentSync.stop();
      return;
    }

    userDocumentSync.start(user.id);
    const unsubWorkspaces = initWorkspaces();
    const unsubPrefs = initPreferences();
    const unsubAgenda = initAgenda();

    return () => {
      unsubWorkspaces();
      unsubPrefs();
      unsubAgenda();
      cleanupWorkspaces();
      cleanupPreferences();
      cleanupAgenda();
      userDocumentSync.stop();
    };
  }, [
    isAuthenticated,
    user?.id,
    initWorkspaces,
    initPreferences,
    initAgenda,
    cleanupWorkspaces,
    cleanupPreferences,
    cleanupAgenda,
  ]);

  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<LegacyLoginRedirect />} />
        <Route path="/share/:shareId" element={<SharedChartPage />} />
        <Route path="/terms" element={<LegalPage section="terms" />} />
        <Route path="/privacy" element={<LegalPage section="privacy" />} />
        <Route
          path="/status"
          element={
            <ProtectedRoute>
              <StatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace/:workspaceId"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <AgendaReminderBanner />
      <ToastContainer />
    </MotionConfig>
  );
}
