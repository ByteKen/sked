import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AgendaReminderBanner } from '@/components/calendar/AgendaReminderBanner';
import {
  HomePageSkeleton,
  StatusFullPageSkeleton,
  WorkspacePageSkeleton,
} from '@/components/skeletons/PageSkeletons';
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

function ProtectedRoute({
  children,
  loadingFallback,
  waitForWorkspaces = false,
}: {
  children: ReactNode;
  loadingFallback: ReactNode;
  waitForWorkspaces?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authChecked = useAuthStore((s) => s.authChecked);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const workspacesLoadedForUid = useWorkspaceStore((s) => s.loadedForUid);
  const location = useLocation();

  if (!authChecked) {
    return <>{loadingFallback}</>;
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?redirect=${redirect}`} replace />;
  }

  if (waitForWorkspaces && (workspacesLoading || workspacesLoadedForUid !== user?.id)) {
    return <>{loadingFallback}</>;
  }

  return <>{children}</>;
}

function RootRoute() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authChecked = useAuthStore((s) => s.authChecked);
  const hasSessionHint = useAuthStore((s) => s.hasSessionHint);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const workspacesLoadedForUid = useWorkspaceStore((s) => s.loadedForUid);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'calendar' ? 'calendar' : 'workspaces';

  if (!authChecked) {
    return hasSessionHint ? <HomePageSkeleton tab={initialTab} /> : <LandingPage />;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const safeRedirect = sanitizeInternalRedirectPath(searchParams.get('redirect'));
  if (safeRedirect) {
    return <Navigate to={safeRedirect} replace />;
  }

  if (workspacesLoading || workspacesLoadedForUid !== user?.id) {
    return <HomePageSkeleton tab={initialTab} />;
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
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);
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
    <MotionConfig reducedMotion={enableAnimations ? 'user' : 'always'}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<LegacyLoginRedirect />} />
        <Route path="/share/:shareId" element={<SharedChartPage />} />
        <Route path="/terms" element={<LegalPage section="terms" />} />
        <Route path="/privacy" element={<LegalPage section="privacy" />} />
        <Route
          path="/status"
          element={
            <ProtectedRoute loadingFallback={<StatusFullPageSkeleton />}>
              <StatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace/:workspaceId"
          element={
            <ProtectedRoute
              waitForWorkspaces
              loadingFallback={<WorkspacePageSkeleton variant="workspace" />}
            >
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
