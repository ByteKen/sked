import { AlertCircle, Loader, Sparkles, BarChart3, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function LoginScreen() {
  const { login, error, cancelled, loading, clearError } = useAuthStore();

  const handleGoogleSignIn = async () => {
    clearError();
    try {
      await login();
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 overflow-hidden">
      {/* Mesh gradient background with floating orbs - matching HomePage */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Base gradient mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/50 via-transparent to-transparent" />
        
        {/* Floating orbs */}
        <div className="absolute top-20 left-[10%] w-72 h-72 rounded-full blur-[100px] animate-float bg-violet-300/30" style={{ animationDelay: '0s', animationDuration: '20s' }} />
        <div className="absolute top-40 right-[15%] w-96 h-96 rounded-full blur-[120px] animate-float bg-cyan-300/25" style={{ animationDelay: '5s', animationDuration: '25s' }} />
        <div className="absolute bottom-20 left-[20%] w-80 h-80 rounded-full blur-[100px] animate-float bg-indigo-300/25" style={{ animationDelay: '10s', animationDuration: '22s' }} />
        
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-[420px] z-10">
        {/* Card glow effect */}
        <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/20 via-indigo-500/20 to-cyan-500/20 rounded-[32px] blur-2xl opacity-50" />
        
        {/* Card */}
        <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl border border-white/80 shadow-2xl shadow-slate-900/5 overflow-hidden">
          {/* Top gradient accent */}
          <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" />
          
          <div className="p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-10">
              {/* Logo */}
              <div className="relative inline-flex mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-2xl blur-xl opacity-40 animate-pulse" style={{ animationDuration: '3s' }} />
                <div className="relative w-20 h-20 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/25 transform hover:scale-105 transition-transform">
                  <BarChart3 className="w-10 h-10 text-white" strokeWidth={2} />
                </div>
              </div>
              
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Gantt Pro
              </h1>
              <p className="text-slate-500 text-sm font-medium flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Modern Project Management
              </p>
            </div>

            {/* Google Sign In Section */}
            <div className="space-y-6">
              {/* Info text */}
              <div className="text-center space-y-1">
                <p className="text-slate-700 text-sm font-medium">
                  Sign in with your PHINMA Education account
                </p>
                <p className="text-slate-400 text-xs">
                  Only @phinmaed.com emails are allowed
                </p>
              </div>

              {/* Cancelled message - friendly, not alarming */}
              {cancelled && !error && (
                <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <Info className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Sign-in cancelled</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click the button below to try again</p>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}

              {/* Google Sign In button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="group relative w-full py-4 px-6 rounded-2xl font-semibold text-slate-700 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-violet-500/10 active:scale-[0.98]"
              >
                <span className="flex items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin text-violet-500" />
                      <span className="text-slate-500">Signing in...</span>
                    </>
                  ) : (
                    <>
                      {/* Google Logo */}
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Footer */}
            <div className="mt-10 pt-6 border-t border-slate-100/80 text-center">
              <p className="text-xs text-slate-400">
                Your data is securely stored in the cloud
              </p>
              <p className="text-xs text-slate-500 font-medium mt-1 flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.89 15.673L6.255.461A.542.542 0 017.27.289l2.543 4.771zm16.794 3.692l-2.25-14a.54.54 0 00-.919-.295L3.316 19.365l7.856 4.427a1.621 1.621 0 001.588 0zM14.3 7.448l-1.86-3.49a.542.542 0 00-.924 0l-8.63 15.667z"/>
                </svg>
                Powered by Firebase
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

