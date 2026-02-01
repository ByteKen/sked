import { useState } from 'react';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Edit2, 
  MoreVertical, 
  Calendar,
  Sparkles,
  AlertCircle,
  Check,
  X,
  ArrowRight,
  LogOut,
  Clock,
  Layers,
  Zap,
  BarChart3
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
  const [hoveredCard, setHoveredCard] = useState(null);

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
        onOpenWorkspace(workspace.id);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenWorkspace = (workspaceId) => {
    // Just navigate - the route will handle switchWorkspace
    onOpenWorkspace(workspaceId);
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
    'Marketing Campaign 2026',
    'Website Redesign',
    'Product Launch',
    'Team Sprint',
  ];

  // Unique gradient combinations for workspace cards
  const cardThemes = [
    { gradient: 'from-violet-500 via-purple-500 to-fuchsia-500', glow: 'violet' },
    { gradient: 'from-cyan-500 via-blue-500 to-indigo-500', glow: 'cyan' },
    { gradient: 'from-emerald-500 via-teal-500 to-cyan-500', glow: 'emerald' },
    { gradient: 'from-orange-500 via-amber-500 to-yellow-500', glow: 'amber' },
    { gradient: 'from-pink-500 via-rose-500 to-red-500', glow: 'rose' },
    { gradient: 'from-indigo-500 via-blue-500 to-cyan-500', glow: 'indigo' },
  ];

  const getCardTheme = (index) => cardThemes[index % cardThemes.length];

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#08090d]' : 'bg-[#f8fafc]'}`}>
      {/* Unique Background - Mesh gradient with floating orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Base gradient mesh */}
        <div className={`absolute inset-0 ${
          isDark 
            ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent'
            : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/50 via-transparent to-transparent'
        }`} />
        
        {/* Floating orbs */}
        <div className={`absolute top-20 left-[10%] w-72 h-72 rounded-full blur-[100px] animate-float ${
          isDark ? 'bg-violet-600/10' : 'bg-violet-300/30'
        }`} style={{ animationDelay: '0s', animationDuration: '20s' }} />
        <div className={`absolute top-40 right-[15%] w-96 h-96 rounded-full blur-[120px] animate-float ${
          isDark ? 'bg-cyan-600/10' : 'bg-cyan-300/25'
        }`} style={{ animationDelay: '5s', animationDuration: '25s' }} />
        <div className={`absolute bottom-20 left-[20%] w-80 h-80 rounded-full blur-[100px] animate-float ${
          isDark ? 'bg-indigo-600/10' : 'bg-indigo-300/25'
        }`} style={{ animationDelay: '10s', animationDuration: '22s' }} />
        
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />
        
        {/* Grid pattern */}
        <div className={`absolute inset-0 ${
          isDark 
            ? 'bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)]'
            : 'bg-[linear-gradient(rgba(0,0,0,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.03)_1px,transparent_1px)]'
        } bg-[size:64px_64px]`} />
      </div>

      {/* Floating Navigation Pill */}
      <nav className="relative z-50 pt-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className={`inline-flex items-center gap-4 px-4 py-2.5 rounded-2xl backdrop-blur-xl border ${
            isDark 
              ? 'bg-white/[0.03] border-white/[0.08]' 
              : 'bg-white/60 border-white shadow-lg shadow-black/5'
          }`}>
            {/* Logo */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative w-9 h-9 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
              </div>
            </div>
            
            <div className={`h-6 w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
            
            {/* User info */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                isDark 
                  ? 'bg-gradient-to-br from-violet-500/20 to-cyan-500/20 text-violet-300 border border-violet-500/20'
                  : 'bg-gradient-to-br from-violet-100 to-cyan-100 text-violet-700 border border-violet-200'
              }`}>
                {firstName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className={`text-sm font-medium leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {user?.name || firstName}
                </p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {user?.email}
                </p>
              </div>
            </div>

            <div className={`h-6 w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

            {/* Logout */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className={`p-2 rounded-xl transition-all active:scale-95 ${
                isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-20">
        {/* Hero Section */}
        <div className="mb-16">
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              isDark 
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'bg-violet-100 text-violet-700 border border-violet-200'
            }`}>
              <Sparkles className="w-3 h-3" />
              <span>Welcome back</span>
            </div>
          </div>
          
          <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            {getGreeting()}, <br className="sm:hidden" />
            <span className="bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
              {firstName}
            </span>
          </h1>
          
          <p className={`text-lg sm:text-xl max-w-xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Your projects are waiting. Pick up where you left off or start something new.
          </p>
        </div>

        {/* Stats Bar - Only show if there are workspaces */}
        {workspaceList.length > 0 && (
          <div className={`flex flex-wrap items-center gap-6 mb-10 pb-10 border-b ${
            isDark ? 'border-white/[0.06]' : 'border-slate-200/60'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isDark ? 'bg-violet-500/10' : 'bg-violet-100'
              }`}>
                <Layers className={`w-5 h-5 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {workspaceList.length}
                </p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {workspaceList.length === 1 ? 'Workspace' : 'Workspaces'}
                </p>
              </div>
            </div>
            
            <div className={`h-10 w-px ${isDark ? 'bg-white/[0.06]' : 'bg-slate-200'}`} />
            
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isDark ? 'bg-cyan-500/10' : 'bg-cyan-100'
              }`}>
                <Clock className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Last active
                </p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {workspaceList[0] ? new Date(workspaceList[0].updatedAt || workspaceList[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {workspaceList.length > 0 ? 'Your Workspaces' : 'Get Started'}
          </h2>
          
          {workspaceList.length > 0 && (
            <button
              onClick={() => setShowNewWorkspaceModal(true)}
              className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white shadow-lg shadow-violet-500/25"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Workspace</span>
            </button>
          )}
        </div>

        {/* Workspaces Grid - Bento Style */}
        {workspaceList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaceList.map((workspace, index) => {
              const cardTheme = getCardTheme(index);
              const isHovered = hoveredCard === workspace.id;
              
              return (
                <div
                  key={workspace.id}
                  className={`group relative rounded-3xl overflow-hidden transition-all duration-500 cursor-pointer ${
                    isDark 
                      ? 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12]' 
                      : 'bg-white hover:bg-white border border-slate-200/60 hover:border-slate-300 shadow-sm hover:shadow-xl'
                  }`}
                  style={{
                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                  }}
                  onClick={() => !editingWorkspaceId && handleOpenWorkspace(workspace.id)}
                  onMouseEnter={() => setHoveredCard(workspace.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* Gradient glow on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${cardTheme.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`} />
                  
                  {/* Top accent line */}
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${cardTheme.gradient} opacity-80`} />
                  
                  <div className="relative p-5 sm:p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-5">
                      {/* Icon with glow */}
                      <div className="relative">
                        <div className={`absolute inset-0 bg-gradient-to-br ${cardTheme.gradient} rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity`} />
                        <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${cardTheme.gradient} flex items-center justify-center shadow-lg`}>
                          <FolderOpen className="w-7 h-7 text-white" />
                        </div>
                      </div>
                      
                      {/* Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id);
                          }}
                          className={`p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all ${
                            isDark 
                              ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                              : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        
                        {menuOpenId === workspace.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                            <div className={`absolute right-0 top-full mt-2 w-44 rounded-2xl shadow-2xl border z-50 overflow-hidden backdrop-blur-xl ${
                              isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white/90 border-slate-200'
                            }`}>
                              <button
                                onClick={(e) => handleStartEdit(workspace, e)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                                  isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Edit2 className="w-4 h-4" />
                                Rename
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(workspace); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    {editingWorkspaceId === workspace.id ? (
                      <div className="space-y-2 mb-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => { setEditingName(e.target.value); setInputError(''); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(e);
                              if (e.key === 'Escape') { setEditingWorkspaceId(null); setInputError(''); }
                            }}
                            className={`flex-1 px-3 py-2 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                              inputError 
                                ? 'border-red-500 bg-red-500/10' 
                                : isDark 
                                  ? 'bg-white/5 border-white/10 text-white' 
                                  : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                            autoFocus
                          />
                          <button onClick={handleSaveEdit} className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setEditingWorkspaceId(null); setInputError(''); }} className={`p-2 rounded-xl transition-colors ${isDark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}>
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
                      <h3 className={`text-xl font-bold mb-2 truncate transition-colors ${
                        isDark ? 'text-white group-hover:text-white' : 'text-slate-900'
                      }`}>
                        {workspace.title}
                      </h3>
                    )}

                    {/* Meta */}
                    <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Created {new Date(workspace.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Action row */}
                    <div className={`mt-6 pt-4 border-t flex items-center justify-between ${
                      isDark ? 'border-white/[0.06]' : 'border-slate-100'
                    }`}>
                      <div className={`flex items-center gap-2 text-sm font-medium transition-all ${
                        isDark ? 'text-violet-400' : 'text-violet-600'
                      }`}>
                        <Zap className="w-4 h-4" />
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">Open project</span>
                      </div>
                      <ArrowRight className={`w-5 h-5 transform translate-x-0 group-hover:translate-x-1 transition-transform ${
                        isDark ? 'text-slate-500 group-hover:text-white' : 'text-slate-400 group-hover:text-slate-900'
                      }`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State - Beautiful onboarding */
          <div className={`relative rounded-3xl overflow-hidden ${
            isDark 
              ? 'bg-white/[0.02] border border-white/[0.06]' 
              : 'bg-white border border-slate-200/60 shadow-xl'
          }`}>
            {/* Decorative gradient */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-violet-500/10 to-transparent" />
            
            <div className="relative p-8 sm:p-12">
              <div className="max-w-md mx-auto text-center">
                {/* Animated icon */}
                <div className="relative inline-flex mb-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-3xl blur-2xl opacity-30 animate-pulse" />
                  <div className="relative w-24 h-24 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-2xl">
                    <FolderOpen className="w-12 h-12 text-white" />
                  </div>
                </div>
                
                <h2 className={`text-2xl sm:text-3xl font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Create your first workspace
                </h2>
                <p className={`text-base mb-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Organize your projects with beautiful Gantt charts. Get started by creating a workspace.
                </p>

                {/* Input form */}
                <div className="space-y-4 max-w-sm mx-auto">
                  <div className="relative">
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => { setNewWorkspaceName(e.target.value); setInputError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorkspace(); }}
                      placeholder="Enter workspace name..."
                      className={`w-full px-5 py-4 rounded-2xl text-base transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                        inputError 
                          ? 'border-2 border-red-500 bg-red-500/5' 
                          : isDark 
                            ? 'bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:bg-white/10' 
                            : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-violet-300'
                      }`}
                    />
                    {inputError && (
                      <p className="absolute -bottom-6 left-0 text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {inputError}
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={isCreating}
                    className="w-full py-4 px-6 rounded-2xl font-semibold text-white bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 hover:from-violet-400 hover:via-indigo-400 hover:to-cyan-400 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30"
                  >
                    {isCreating ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Plus className="w-5 h-5" />
                        Create Workspace
                      </span>
                    )}
                  </button>
                </div>

                {/* Suggestions */}
                <div className={`mt-10 pt-8 border-t border-dashed text-left ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Need inspiration?
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setNewWorkspaceName(suggestion)}
                        className={`px-4 py-2 text-sm font-medium rounded-xl transition-all active:scale-95 ${
                          isDark 
                            ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white' 
                            : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {showNewWorkspaceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div 
            className={`w-full max-w-md rounded-3xl shadow-2xl border overflow-hidden animate-scale-in ${
              isDark ? 'bg-[#0f1622] border-white/[0.08]' : 'bg-white border-slate-200'
            }`}
          >
            {/* Gradient accent */}
            <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" />
            
            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-2xl blur-lg opacity-40" />
                  <div className="relative w-12 h-12 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <FolderOpen className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    New Workspace
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Start a new project
                  </p>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-5">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => { setNewWorkspaceName(e.target.value); setInputError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorkspace(); }}
                    placeholder="e.g., Marketing Campaign 2026"
                    className={`w-full px-4 py-3.5 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                      inputError 
                        ? 'border-2 border-red-500 bg-red-500/5' 
                        : isDark 
                          ? 'bg-white/5 border border-white/10 text-white placeholder-slate-500' 
                          : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400'
                    }`}
                    autoFocus
                  />
                  {inputError && (
                    <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {inputError}
                    </p>
                  )}
                </div>

                {/* Quick suggestions */}
                <div>
                  <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Quick picks:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setNewWorkspaceName(suggestion)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                          isDark 
                            ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => { setShowNewWorkspaceModal(false); setNewWorkspaceName(''); setInputError(''); }}
                  className={`flex-1 px-4 py-3.5 text-sm font-medium border rounded-xl transition-all active:scale-[0.98] ${
                    isDark 
                      ? 'border-white/10 text-slate-300 hover:bg-white/5' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isCreating}
                  className="flex-1 px-4 py-3.5 text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-violet-500/25"
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
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl border overflow-hidden animate-scale-in ${
            isDark ? 'bg-[#0f1622] border-white/[0.08]' : 'bg-white border-slate-200'
          }`}>
            <div className="h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
            
            <div className="p-6">
              <div className="flex justify-center mb-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                  <Trash2 className="w-7 h-7 text-red-500" />
                </div>
              </div>
              
              <h3 className={`text-xl font-bold text-center mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Delete Workspace?
              </h3>
              
              <p className={`text-sm text-center mb-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                This will permanently delete <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>"{showDeleteConfirm.title}"</span> and all its tasks.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className={`flex-1 px-4 py-3 text-sm font-medium border rounded-xl transition-all active:scale-[0.98] ${
                    isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteWorkspace(showDeleteConfirm.id)}
                  className="flex-1 px-4 py-3 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all active:scale-[0.98]"
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
        type="logout"
      />
    </div>
  );
}
