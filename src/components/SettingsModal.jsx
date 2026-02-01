import { X, Settings, Moon, Sun, Diamond, Circle, Printer, Type, GitBranch, Minimize2, Link2, Share2 } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

export default function SettingsModal({ onClose }) {
  const { 
    useRoundedSubtasks, 
    theme, 
    exportTheme,
    taskLabelPosition,
    subtaskLabelPosition,
    showDependencyLinesOnExport,
    barHeight,
    showDependencyLines,
    showSubtaskConnectors,
    toggleSubtaskShape, 
    toggleTheme,
    setExportTheme,
    setTaskLabelPosition,
    setSubtaskLabelPosition,
    toggleShowDependencyLinesOnExport,
    setBarHeight,
    toggleShowDependencyLines,
    toggleShowSubtaskConnectors,
  } = usePreferencesStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-md mx-4 max-h-[90vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col ${
        theme === 'dark' 
          ? 'bg-[#0f1622] border-white/[0.08]' 
          : 'bg-white border-slate-200/60'
      }`}>
        {/* Gradient accent */}
        <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" />
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          theme === 'dark' ? 'border-white/[0.06]' : 'border-slate-200/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              theme === 'dark' 
                ? 'bg-gradient-to-br from-violet-500 to-purple-600' 
                : 'bg-gradient-to-br from-violet-400 to-purple-500'
            }`}>
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}>Settings</h2>
              <p className={`text-xs ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>Customize your experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition ${
              theme === 'dark' 
                ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Theme Toggle */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-violet-400" />
                ) : (
                  <Sun className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                  }`}>App Theme</p>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {theme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  theme === 'dark' 
                    ? 'bg-violet-600' 
                    : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  theme === 'dark' ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Subtask Shape Toggle */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {useRoundedSubtasks ? (
                  <Circle className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Diamond className="w-5 h-5 text-orange-400" />
                )}
                <div>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                  }`}>Subtask Shape</p>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {useRoundedSubtasks 
                      ? 'Rounded bars like parent tasks' 
                      : 'Diamond markers for deadlines'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={toggleSubtaskShape}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  useRoundedSubtasks 
                    ? 'bg-cyan-500' 
                    : 'bg-slate-500'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  useRoundedSubtasks ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
            
            {/* Preview */}
            <div className={`mt-3 p-3 rounded-lg flex items-center gap-4 ${
              theme === 'dark' ? 'bg-slate-900/50' : 'bg-white'
            }`}>
              <span className={`text-xs ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>Preview:</span>
              {useRoundedSubtasks ? (
                <div className="h-4 w-20 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 shadow-sm" />
              ) : (
                <div className="relative w-5 h-5">
                  <div className="w-4 h-4 rotate-45 rounded-sm bg-gradient-to-br from-orange-400 to-orange-500 shadow-sm" />
                </div>
              )}
            </div>
          </div>

          {/* Bar Height / Size */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Minimize2 className={`w-5 h-5 ${
                theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
              }`} />
              <div>
                <p className={`font-medium ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                }`}>Bar Size</p>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>Adjust task bar height</p>
              </div>
            </div>
            <div className="flex gap-2">
              {['compact', 'normal', 'large'].map((size) => (
                <button
                  key={size}
                  onClick={() => setBarHeight(size)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition capitalize ${
                    barHeight === size
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            {/* Size Preview */}
            <div className={`mt-3 p-3 rounded-lg flex flex-col gap-2 ${
              theme === 'dark' ? 'bg-slate-900/50' : 'bg-white'
            }`}>
              <span className={`text-xs ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>Preview:</span>
              <div className={`w-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm ${
                barHeight === 'compact' ? 'h-4' : barHeight === 'normal' ? 'h-6' : 'h-8'
              }`} />
            </div>
          </div>

          {/* Task Label Position */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Type className={`w-5 h-5 ${
                theme === 'dark' ? 'text-purple-400' : 'text-purple-500'
              }`} />
              <div>
                <p className={`font-medium ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                }`}>Task Label Position</p>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>Where to show task names on bars</p>
              </div>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'inside', label: 'Inside' },
                { value: 'outside', label: 'Outside' },
                { value: 'top', label: 'Top' },
                { value: 'hidden', label: 'Hidden' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTaskLabelPosition(option.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    taskLabelPosition === option.value
                      ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subtask Label Position */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Type className={`w-5 h-5 ${
                theme === 'dark' ? 'text-orange-400' : 'text-orange-500'
              }`} />
              <div>
                <p className={`font-medium ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                }`}>Subtask Label Position</p>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>Where to show subtask names</p>
              </div>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'outside', label: 'Outside' },
                { value: 'top', label: 'Top' },
                { value: 'hidden', label: 'Hidden' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSubtaskLabelPosition(option.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    subtaskLabelPosition === option.value
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dependency Lines Toggle */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className={`w-5 h-5 ${
                  showDependencyLines ? 'text-blue-400' : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                }`} />
                <div>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                  }`}>Dependency Lines</p>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {showDependencyLines 
                      ? 'Show arrows between dependent tasks' 
                      : 'Hide dependency arrows'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={toggleShowDependencyLines}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  showDependencyLines 
                    ? 'bg-blue-500' 
                    : 'bg-slate-500'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  showDependencyLines ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Subtask Connectors Toggle */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Share2 className={`w-5 h-5 ${
                  showSubtaskConnectors ? 'text-emerald-400' : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                }`} />
                <div>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                  }`}>Subtask Connectors</p>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {showSubtaskConnectors 
                      ? 'Show lines from parent to subtasks' 
                      : 'Hide parent-subtask connectors'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={toggleShowSubtaskConnectors}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  showSubtaskConnectors 
                    ? 'bg-emerald-500' 
                    : 'bg-slate-500'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  showSubtaskConnectors ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Export Theme */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Printer className={`w-5 h-5 ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-500'
              }`} />
              <div>
                <p className={`font-medium ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                }`}>Export Theme</p>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>Choose theme for PDF/print exports</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setExportTheme('light')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  exportTheme === 'light'
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg'
                    : theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light (Save Ink)
              </button>
              <button
                onClick={() => setExportTheme('dark')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  exportTheme === 'dark'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                    : theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
            </div>
            <p className={`mt-2 text-xs ${
              theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              💡 Light theme recommended for printing to save ink/toner
            </p>
          </div>

          {/* Dependency Lines on Export */}
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' 
              ? 'bg-slate-800/50 border-slate-700/50' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className={`w-5 h-5 ${
                  showDependencyLinesOnExport ? 'text-cyan-400' : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                }`} />
                <div>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
                  }`}>Dependency Lines on Export</p>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {showDependencyLinesOnExport 
                      ? 'Show arrows in exported PDFs' 
                      : 'Hide arrows for cleaner exports'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={toggleShowDependencyLinesOnExport}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  showDependencyLinesOnExport 
                    ? 'bg-cyan-500' 
                    : 'bg-slate-500'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  showDependencyLinesOnExport ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex justify-end ${
          theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200'
        }`}>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white font-semibold rounded-lg transition shadow-lg shadow-violet-500/25"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
