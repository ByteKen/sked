import { AlertCircle, AlertTriangle, HelpCircle, Trash2, LogOut } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

const iconMap = {
  danger: { icon: AlertCircle, color: 'red' },
  warning: { icon: AlertTriangle, color: 'amber' },
  info: { icon: HelpCircle, color: 'blue' },
  delete: { icon: Trash2, color: 'red' },
  logout: { icon: LogOut, color: 'amber' },
};

const colorMap = {
  red: {
    bg: 'bg-red-500/10',
    bgLight: 'bg-red-50',
    icon: 'text-red-500',
    button: 'bg-red-500 hover:bg-red-600',
    gradient: 'from-red-500 via-orange-500 to-red-500',
  },
  amber: {
    bg: 'bg-amber-500/10',
    bgLight: 'bg-amber-50',
    icon: 'text-amber-500',
    button: 'bg-amber-500 hover:bg-amber-600',
    gradient: 'from-amber-500 via-orange-500 to-amber-500',
  },
  blue: {
    bg: 'bg-blue-500/10',
    bgLight: 'bg-blue-50',
    icon: 'text-blue-500',
    button: 'bg-blue-500 hover:bg-blue-600',
    gradient: 'from-blue-500 via-cyan-500 to-blue-500',
  },
};

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger', // 'danger' | 'warning' | 'info' | 'delete'
}) {
  const { theme } = usePreferencesStore();

  if (!isOpen) return null;

  const { icon: Icon, color } = iconMap[type] || iconMap.danger;
  const colors = colorMap[color] || colorMap.red;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div 
        className={`w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-scale-in ${
          theme === 'dark'
            ? 'bg-slate-900 border-white/10'
            : 'bg-white border-slate-200'
        }`}
      >
        {/* Accent gradient */}
        <div className={`h-1 bg-gradient-to-r ${colors.gradient}`} />

        <div className="p-5">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              theme === 'dark' ? colors.bg : colors.bgLight
            }`}>
              <Icon className={`w-6 h-6 ${colors.icon}`} />
            </div>
          </div>

          {/* Title */}
          <h3 className={`text-lg font-bold text-center mb-2 ${
            theme === 'dark' ? 'text-white' : 'text-slate-900'
          }`}>
            {title}
          </h3>

          {/* Message */}
          <p className={`text-sm text-center mb-6 ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            {message}
          </p>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 px-4 py-2.5 text-sm font-medium border rounded-xl transition-all ${
                theme === 'dark'
                  ? 'border-white/10 text-slate-300 hover:bg-white/10'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all ${colors.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
