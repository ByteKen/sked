import { useState } from 'react';
import { FolderPlus, Sparkles, LayoutGrid, AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { usePreferencesStore } from '../store/preferencesStore';

export default function EmptyState() {
  const { createWorkspace } = useWorkspaceStore();
  const { theme } = usePreferencesStore();
  const [workspaceName, setWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const validateName = (name) => {
    if (!name.trim()) {
      return 'Please enter a workspace name';
    }
    if (name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (name.trim().length > 50) {
      return 'Name must be less than 50 characters';
    }
    return '';
  };

  const handleInputChange = (value) => {
    setWorkspaceName(value);
    setError(''); // Clear error on change
  };

  const handleCreate = async () => {
    const validationError = validateName(workspaceName);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsCreating(true);
    try {
      await createWorkspace(workspaceName.trim());
    } finally {
      setIsCreating(false);
    }
  };

  const suggestions = [
    'Marketing Campaign 2025',
    'Website Redesign',
    'Product Launch',
    'Team Sprint',
    'Research Project',
  ];

  const isDark = theme === 'dark';

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-3xl blur-xl opacity-30" />
          <div className={`relative w-20 h-20 rounded-3xl flex items-center justify-center ${
            isDark 
              ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700' 
              : 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600'
          }`}>
            <LayoutGrid className="w-10 h-10 text-cyan-400" />
          </div>
        </div>

        {/* Title */}
        <h2 className={`text-2xl font-bold mb-2 ${
          isDark ? 'text-white' : 'text-slate-800'
        }`}>
          Welcome to Gantt Pro!
        </h2>
        <p className={`mb-8 ${
          isDark ? 'text-slate-400' : 'text-slate-600'
        }`}>
          Create your first workspace to start managing your projects with beautiful Gantt charts.
        </p>

        {/* Create Workspace Form */}
        <div className={`rounded-2xl p-6 mb-6 ${
          isDark 
            ? 'bg-slate-800/50 border border-slate-700' 
            : 'bg-white border border-slate-200 shadow-lg'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <FolderPlus className="w-5 h-5 text-cyan-500" />
            <h3 className={`text-sm font-semibold ${
              isDark ? 'text-white' : 'text-slate-800'
            }`}>Create Workspace</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                placeholder="Enter workspace name..."
                className={`w-full px-4 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  error
                    ? 'border-red-500 bg-red-500/10 focus:ring-red-500'
                    : isDark 
                      ? 'bg-slate-900/50 border border-slate-600 text-white placeholder-slate-500' 
                      : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
              {error && (
                <p className="text-xs text-red-500 flex items-center gap-1 px-1">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Workspace'
              )}
            </button>
          </div>
        </div>

        {/* Suggestions */}
        <div className="text-left">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className={`text-xs font-medium uppercase tracking-wide ${
              isDark ? 'text-slate-500' : 'text-slate-500'
            }`}>
              Suggestions
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setWorkspaceName(suggestion)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isDark 
                    ? 'bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white' 
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
