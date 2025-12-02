import { useState } from 'react';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Edit2, 
  MoreVertical, 
  Calendar,
  LayoutGrid,
  Sparkles,
  AlertCircle,
  Check,
  X,
  ArrowRight,
  LogOut
} from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useAuthStore } from '../store/authStore';
import ConfirmationModal from './ConfirmationModal';

export default function HomePage({ onOpenWorkspace }) {
  const { 
    getWorkspaceList,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    switchWorkspace
  } = useWorkspaceStore();
  
  const { theme } = usePreferencesStore();
  const { user, logout } = useAuthStore();
  
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [inputError, setInputError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const workspaceList = getWorkspaceList();
  const isDark = theme === 'dark';

  const validateWorkspaceName = (name, excludeId = null) => {
    if (!name.trim()) {
      return 'Please enter a workspace name';
    }
    if (name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (name.trim().length > 50) {
      return 'Name must be less than 50 characters';
    }
    const existingNames = workspaceList
      .filter(w => w.id !== excludeId)
      .map(w => w.title.toLowerCase());
    if (existingNames.includes(name.trim().toLowerCase())) {
      return 'A workspace with this name already exists';
    }
    return '';
  };

  const handleCreateWorkspace = async () => {
    const error = validateWorkspaceName(newWorkspaceName);
    if (error) {
      setInputError(error);
      return;
    }
    
    setIsCreating(true);
    try {
      const workspace = await createWorkspace(newWorkspaceName.trim());
      if (workspace) {
        setNewWorkspaceName('');
        setShowNewWorkspaceModal(false);
        setInputError('');
        onOpenWorkspace();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenWorkspace = async (workspaceId) => {
    await switchWorkspace(workspaceId);
    onOpenWorkspace();
  };

  const handleStartEdit = (workspace, e) => {
    e.stopPropagation();
    setEditingWorkspaceId(workspace.id);
    setEditingName(workspace.title);
    setMenuOpenId(null);
    setInputError('');
  };

  const handleSaveEdit = async (e) => {
    e?.stopPropagation();
    const error = validateWorkspaceName(editingName, editingWorkspaceId);
    if (error) {
      setInputError(error);
      return;
    }
    
    await updateWorkspace(editingWorkspaceId, { title: editingName.trim() });
    setEditingWorkspaceId(null);
    setEditingName('');
    setInputError('');
  };

  const handleDeleteWorkspace = async (workspaceId) => {
    await deleteWorkspace(workspaceId);
    setShowDeleteConfirm(null);
    setMenuOpenId(null);
  };

  const suggestions = [
    'Marketing Campaign 2025',
    'Website Redesign',
    'Product Launch',
    'Team Sprint',
  ];

  // Color palette for workspace cards
  const cardColors = [
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-500',
    'from-pink-500 to-rose-600',
    'from-indigo-500 to-blue-600',
  ];

  const getCardColor = (index) => cardColors[index % cardColors.length];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0f1419]' : 'bg-slate-100'}`}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {isDark ? (
          <>
            <div className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-violet-600/8 to-cyan-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute -bottom-1/2 -right-1/4 w-[600px] h-[600px] bg-gradient-to-r from-blue-600/8 to-purple-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
          </>
        ) : (
          <>
            <div className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-violet-200/30 to-cyan-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute -bottom-1/2 -right-1/4 w-[600px] h-[600px] bg-gradient-to-r from-blue-200/30 to-purple-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
          </>
        )}
      </div>

      {/* Header */}
      <header className="relative sticky top-0 z-40">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60" />
        <div className={`backdrop-blur-2xl border-b ${
          isDark 
            ? 'bg-slate-900/70 border-white/5' 
            : 'bg-white/70 border-slate-200'
        }`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl blur-lg opacity-40" />
                  <div className="relative w-10 h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h1 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Gantt Pro</h1>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{user?.name || user?.email}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className={`p-2.5 rounded-xl transition-all ${
                    isDark
                      ? 'text-slate-400 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="relative inline-flex mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-2xl blur-xl opacity-40" />
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg">
              <LayoutGrid className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
          </div>
          <h1 className={`text-2xl sm:text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Your Workspaces
          </h1>
          <p className={`text-sm sm:text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Select a workspace to continue or create a new one
          </p>
        </div>

        {/* Workspaces Grid */}
        {workspaceList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {workspaceList.map((workspace, index) => (
              <div
                key={workspace.id}
                className={`group relative rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer ${
                  isDark 
                    ? 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600' 
                    : 'bg-white border border-slate-200 hover:border-slate-300 shadow-lg'
                }`}
                onClick={() => !editingWorkspaceId && handleOpenWorkspace(workspace.id)}
              >
                {/* Color accent bar */}
                <div className={`h-2 bg-gradient-to-r ${getCardColor(index)}`} />
                
                <div className="p-5">
                  {/* Header with icon and menu */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getCardColor(index)} flex items-center justify-center shadow-lg`}>
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>
                    
                    {/* Menu button */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id);
                        }}
                        className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                          isDark 
                            ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                            : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                        }`}
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {/* Dropdown menu */}
                      {menuOpenId === workspace.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                          <div className={`absolute right-0 top-full mt-1 w-40 rounded-xl shadow-xl border z-50 overflow-hidden ${
                            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                          }`}>
                            <button
                              onClick={(e) => handleStartEdit(workspace, e)}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-sm ${
                                isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Edit2 className="w-4 h-4" />
                              Rename
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(workspace); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Workspace name */}
                  {editingWorkspaceId === workspace.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => { setEditingName(e.target.value); setInputError(''); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(e);
                            if (e.key === 'Escape') { setEditingWorkspaceId(null); setInputError(''); }
                          }}
                          className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                            inputError 
                              ? 'border-red-500 bg-red-500/10' 
                              : isDark 
                                ? 'bg-slate-900 border-slate-600 text-white' 
                                : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                          autoFocus
                        />
                        <button onClick={handleSaveEdit} className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingWorkspaceId(null); setInputError(''); }} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {inputError && (
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {inputError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <h3 className={`text-lg font-semibold mb-2 truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {workspace.title}
                    </h3>
                  )}

                  {/* Meta info */}
                  <div className={`flex items-center gap-4 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(workspace.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Open button - visible on hover */}
                  <div className="mt-4 pt-4 border-t border-transparent group-hover:border-slate-700/50 transition-all">
                    <div className={`flex items-center justify-between text-sm font-medium ${
                      isDark ? 'text-cyan-400' : 'text-cyan-600'
                    } opacity-0 group-hover:opacity-100 transition-opacity`}>
                      <span>Open workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Create New Card */}
            <button
              onClick={() => setShowNewWorkspaceModal(true)}
              className={`group relative rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] border-2 border-dashed min-h-[200px] flex flex-col items-center justify-center gap-3 ${
                isDark 
                  ? 'border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/30' 
                  : 'border-slate-300 hover:border-cyan-500/50 hover:bg-slate-50'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDark 
                  ? 'bg-slate-800 group-hover:bg-cyan-500/20' 
                  : 'bg-slate-100 group-hover:bg-cyan-500/10'
              }`}>
                <Plus className={`w-7 h-7 ${isDark ? 'text-slate-500 group-hover:text-cyan-400' : 'text-slate-400 group-hover:text-cyan-600'}`} />
              </div>
              <span className={`text-sm font-medium ${isDark ? 'text-slate-400 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-900'}`}>
                Create New Workspace
              </span>
            </button>
          </div>
        ) : (
          /* Empty state - show create form directly */
          <div className="max-w-md mx-auto text-center">
            <div className={`rounded-2xl p-6 mb-6 ${
              isDark 
                ? 'bg-slate-800/50 border border-slate-700' 
                : 'bg-white border border-slate-200 shadow-lg'
            }`}>
              <div className="flex items-center justify-center gap-2 mb-4">
                <FolderOpen className="w-5 h-5 text-cyan-500" />
                <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  Create Your First Workspace
                </h3>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => { setNewWorkspaceName(e.target.value); setInputError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorkspace(); }}
                  placeholder="Enter workspace name..."
                  className={`w-full px-4 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    inputError 
                      ? 'border-red-500 bg-red-500/10' 
                      : isDark 
                        ? 'bg-slate-900/50 border border-slate-600 text-white placeholder-slate-500' 
                        : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
                {inputError && (
                  <p className="text-xs text-red-500 flex items-center gap-1 px-1">
                    <AlertCircle className="w-3 h-3" />
                    {inputError}
                  </p>
                )}
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isCreating}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                >
                  {isCreating ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </div>

            {/* Suggestions */}
            <div className="text-left">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  Suggestions
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setNewWorkspaceName(suggestion)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      isDark 
                        ? 'bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 text-slate-400 hover:text-white' 
                        : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {showNewWorkspaceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'
          }`}>
            <div className="h-1 bg-gradient-to-r from-cyan-500 to-violet-500" />
            
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-xl flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    New Workspace
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Create a new project workspace
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => { setNewWorkspaceName(e.target.value); setInputError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorkspace(); }}
                    placeholder="e.g., Marketing Campaign 2025"
                    className={`w-full px-4 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      inputError 
                        ? 'border-red-500 bg-red-500/10' 
                        : isDark 
                          ? 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500' 
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                    autoFocus
                  />
                  {inputError && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {inputError}
                    </p>
                  )}
                </div>

                {/* Quick suggestions */}
                <div>
                  <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Quick suggestions:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setNewWorkspaceName(suggestion)}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          isDark 
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-400' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowNewWorkspaceModal(false); setNewWorkspaceName(''); setInputError(''); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium border rounded-xl transition-all ${
                    isDark 
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50 text-white rounded-xl transition-all"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'
          }`}>
            <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
            
            <div className="p-5">
              <div className="flex justify-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
              </div>
              
              <h3 className={`text-lg font-bold text-center mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Delete Workspace?
              </h3>
              
              <p className={`text-sm text-center mb-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Are you sure you want to delete <strong className={isDark ? 'text-white' : 'text-slate-900'}>"{showDeleteConfirm.title}"</strong>? 
                All tasks will be permanently deleted.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium border rounded-xl transition-all ${
                    isDark ? 'border-white/10 text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteWorkspace(showDeleteConfirm.id)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          logout();
          setShowLogoutConfirm(false);
        }}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        confirmStyle="danger"
      />
    </div>
  );
}
