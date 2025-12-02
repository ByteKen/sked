import { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

// Toast types and their styles
const toastConfig = {
  error: {
    icon: AlertCircle,
    gradient: 'from-red-500 to-rose-600',
    bg: 'bg-red-50 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-500/20',
    iconColor: 'text-red-500',
    textColor: 'text-red-800 dark:text-red-200',
    subtextColor: 'text-red-600 dark:text-red-300',
  },
  success: {
    icon: CheckCircle2,
    gradient: 'from-emerald-500 to-green-600',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    iconColor: 'text-emerald-500',
    textColor: 'text-emerald-800 dark:text-emerald-200',
    subtextColor: 'text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    gradient: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/20',
    iconColor: 'text-amber-500',
    textColor: 'text-amber-800 dark:text-amber-200',
    subtextColor: 'text-amber-600 dark:text-amber-300',
  },
  info: {
    icon: Info,
    gradient: 'from-blue-500 to-cyan-600',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/20',
    iconColor: 'text-blue-500',
    textColor: 'text-blue-800 dark:text-blue-200',
    subtextColor: 'text-blue-600 dark:text-blue-300',
  },
};

export function Toast({ message, description, type = 'error', onClose, duration = 5000 }) {
  const { theme } = usePreferencesStore();
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  
  const config = toastConfig[type] || toastConfig.error;
  const Icon = config.icon;

  const handleClose = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, handleClose]);

  if (!isVisible) return null;

  const isDark = theme === 'dark';

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-[100] max-w-md w-full
        transform transition-all duration-300 ease-out
        ${isLeaving ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div
        className={`
          relative overflow-hidden rounded-xl border shadow-lg
          ${isDark ? config.bg.split(' ')[1] : config.bg.split(' ')[0]}
          ${isDark ? config.border.split(' ')[1] : config.border.split(' ')[0]}
        `}
      >
        {/* Top gradient accent */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradient}`} />
        
        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isDark ? config.textColor.split(' ')[1] : config.textColor.split(' ')[0]}`}>
              {message}
            </p>
            {description && (
              <p className={`mt-1 text-sm ${isDark ? config.subtextColor.split(' ')[1] : config.subtextColor.split(' ')[0]}`}>
                {description}
              </p>
            )}
          </div>
          
          {/* Close button */}
          <button
            onClick={handleClose}
            className={`
              flex-shrink-0 p-1 rounded-lg transition-colors
              ${isDark 
                ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                : 'hover:bg-black/5 text-slate-400 hover:text-slate-600'
              }
            `}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Progress bar for auto-close */}
        {duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10">
            <div
              className={`h-full bg-gradient-to-r ${config.gradient} animate-shrink`}
              style={{ animationDuration: `${duration}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Toast container to manage multiple toasts
export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toastItem, index) => (
        <div
          key={toastItem.id}
          style={{ transform: `translateY(-${index * 8}px)` }}
        >
          <Toast
            {...toastItem}
            onClose={() => removeToast(toastItem.id)}
          />
        </div>
      ))}
    </div>
  );
}
