import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus,
  LogOut,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  MoreVertical,
  Settings,
  Menu,
  X,
  LayoutList,
  GanttChartSquare,
  FolderOpen,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useGanttStore } from '../store/ganttStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { exportToPDF, exportToCSV, exportToJSON } from '../utils/exportUtils';
import TaskModal from './TaskModal';
import TaskList from './TaskList';
import GanttChart from './GanttChart';
import ExportMenu from './ExportMenu';
import SettingsModal from './SettingsModal';
import WorkspaceSelector from './WorkspaceSelector';
import ConfirmationModal from './ConfirmationModal';

export default function GanttDashboard({ onGoHome }) {
  const { user, logout } = useAuthStore();
  const { tasks, initTasks, cleanup, addTask, updateTask, deleteTask, addSubtask, findTaskById } = useGanttStore();
  const { 
    currentWorkspaceId, 
    getCurrentWorkspace,
  } = useWorkspaceStore();
  const { theme, exportTheme, useRoundedSubtasks, showDependencyLinesOnExport, barHeight, taskLabelPosition } = usePreferencesStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [mobileView, setMobileView] = useState('chart'); // 'chart' | 'list'
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const ganttChartRef = useRef(null);

  const currentWorkspace = getCurrentWorkspace();

  // Initialize tasks when workspace changes
  useEffect(() => {
    if (currentWorkspaceId) {
      initTasks(currentWorkspaceId);
    }
    
    return () => {
      cleanup();
    };
  }, [currentWorkspaceId, initTasks, cleanup]);

  const handleAddTask = () => {
    setEditingTask(null);
    setShowTaskModal(true);
  };

  const handleEditTask = useCallback((task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  }, []);

  const handleAddSubtask = (parentTaskId) => {
    setEditingTask(null);
    setShowTaskModal(true);
    // Store parent ID in a temporary state to handle in save
    setParentTaskId(parentTaskId);
  };

  const [parentTaskId, setParentTaskId] = useState(null);

  const handleSaveTask = (taskData) => {
    if (editingTask) {
      updateTask(editingTask.id, taskData);
    } else if (parentTaskId) {
      addSubtask(parentTaskId, taskData);
      setParentTaskId(null);
    } else {
      addTask(taskData);
    }
    setShowTaskModal(false);
    setEditingTask(null);
  };

  const handleDeleteTask = (taskId) => {
    const taskToDelete = findTaskById(taskId);
    if (taskToDelete) {
      setDeleteConfirmTask(taskToDelete);
    }
  };

  const confirmDeleteTask = () => {
    if (deleteConfirmTask) {
      deleteTask(deleteConfirmTask.id);
      setDeleteConfirmTask(null);
    }
  };

  const handleExport = async (format) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const workspaceTitle = currentWorkspace?.title || 'gantt-chart';
    const safeTitle = workspaceTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `${safeTitle}-${timestamp}`;

    switch (format) {
      case 'pdf':
        await exportToPDF(ganttChartRef.current, tasks, `${filename}.pdf`, { 
          theme: exportTheme,
          useRoundedSubtasks,
          showDependencyLinesOnExport,
          barHeight,
          taskLabelPosition,
          workspaceTitle: currentWorkspace?.title,
          timeframe: ganttChartRef.current?.getGranularity?.()
        });
        break;
      case 'csv':
        exportToCSV(tasks, `${filename}.csv`, { workspaceTitle: currentWorkspace?.title });
        break;
      case 'json':
        exportToJSON(tasks, `${filename}.json`, { workspaceTitle: currentWorkspace?.title });
        break;
      default:
        break;
    }
    setShowExportMenu(false);
  };

  const visibleTasks = useMemo(() => 
    searchTerm ? filterTasks(tasks, searchTerm) : tasks,
    [tasks, searchTerm]
  );

  return (
    <div className={`min-h-screen ${
      isChartExpanded ? 'overflow-y-auto overflow-x-hidden' : ''
    } ${
      theme === 'dark' ? 'bg-[#0f1419]' : 'bg-slate-100'
    }`}>
      {/* Subtle animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {theme === 'dark' ? (
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

      {/* Header - hidden when chart is expanded */}
      {!isChartExpanded && (
      <header className="relative sticky top-0 z-40">
        {/* Gradient line accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60" />
        
        <div className={`backdrop-blur-2xl border-b ${
          theme === 'dark' 
            ? 'bg-slate-900/70 border-white/5' 
            : 'bg-white/70 border-slate-200'
        }`}>
          <div className="px-3 sm:px-6 py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setShowMobileSidebar(true)}
                className={`p-2 rounded-xl transition-all md:hidden ${
                  theme === 'dark'
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Logo & Title - Logo is clickable to go home */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-none">
                <button
                  onClick={onGoHome}
                  className="relative group cursor-pointer"
                  title="All Workspaces"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity" />
                  <div className="relative w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </button>
                <div className="min-w-0 hidden sm:block">
                  <h1 className={`text-lg font-bold bg-clip-text text-transparent ${
                    theme === 'dark'
                      ? 'bg-gradient-to-r from-white to-slate-300'
                      : 'bg-gradient-to-r from-slate-900 to-slate-600'
                  }`}>Gantt Pro</h1>
                  <p className={`text-[11px] font-medium truncate ${
                    theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                  }`}>{user?.name || user?.email}</p>
                </div>
                
                {/* Workspace Selector - Desktop */}
                <div className="ml-2 hidden md:block">
                  <WorkspaceSelector />
                </div>
              </div>

              {/* Center Search - Desktop */}
              <div className="flex-1 max-w-md mx-4 hidden lg:block">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <div className="relative">
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                      theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-all ${
                        theme === 'dark'
                          ? 'bg-white/5 border-white/10 text-slate-200 placeholder-slate-500 focus:bg-white/10 focus:border-cyan-500/50'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Mobile Search Toggle */}
                <button
                  onClick={() => setShowMobileSearch(!showMobileSearch)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all lg:hidden ${
                    theme === 'dark'
                      ? 'text-slate-400 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Settings Button - Desktop only (mobile has it in bottom nav) */}
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all hidden md:flex ${
                    theme === 'dark'
                      ? 'text-slate-400 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {/* Export - Desktop only */}
                <div className="relative z-[200] hidden sm:block">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium rounded-xl border transition-all ${
                      theme === 'dark'
                        ? 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10 hover:border-white/20'
                        : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden md:inline">Export</span>
                    <ChevronDown className="w-3 h-3 opacity-50 hidden sm:block" />
                  </button>
                  {showExportMenu && <ExportMenu onSelect={handleExport} />}
                </div>

                {/* Add Task Button */}
                <button
                  onClick={handleAddTask}
                  className="group relative inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-sm font-semibold rounded-xl transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Plus className="relative w-4 h-4 text-white" />
                  <span className="relative text-white hidden sm:inline">Add Task</span>
                </button>

                {/* Logout - Desktop only */}
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all hidden sm:flex ${
                    theme === 'dark'
                      ? 'text-slate-500 hover:text-white hover:bg-white/10'
                      : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile Search Bar - Expandable */}
            {showMobileSearch && (
              <div className="mt-3 lg:hidden">
                <div className="relative">
                  <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                    theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                  }`} />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                    className={`w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-all ${
                      theme === 'dark'
                        ? 'bg-white/5 border-white/10 text-slate-200 placeholder-slate-500 focus:bg-white/10 focus:border-cyan-500/50'
                        : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileSidebar(false)}
          />
          
          {/* Sidebar */}
          <div className={`absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] shadow-2xl animate-slide-in-left ${
            theme === 'dark' ? 'bg-slate-900' : 'bg-white'
          }`}>
            {/* Sidebar Header */}
            <div className={`flex items-center justify-between p-4 border-b safe-area-inset-top ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Gantt Pro
                </span>
              </div>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className={`p-2 rounded-lg ${
                  theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                }`}
              >
                <X className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`} />
              </button>
            </div>

            {/* User Info */}
            <div className={`px-4 py-3 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {user?.name || 'User'}
              </p>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {user?.email}
              </p>
            </div>

            {/* Workspace Selector */}
            <div className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Workspace
              </p>
              <WorkspaceSelector />
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className={`text-xs font-medium uppercase tracking-wide mb-3 ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Tasks ({visibleTasks.length})
              </p>
              <TaskList
                tasks={visibleTasks}
                onEdit={(task) => {
                  handleEditTask(task);
                  setShowMobileSidebar(false);
                }}
                onDelete={handleDeleteTask}
                onAddSubtask={(id) => {
                  handleAddSubtask(id);
                  setShowMobileSidebar(false);
                }}
                selectedTaskId={selectedTaskId}
                onSelectTask={(id) => {
                  setSelectedTaskId(id);
                  setShowMobileSidebar(false);
                }}
              />
            </div>

            {/* Sidebar Footer Actions */}
            <div className={`p-4 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => {
                  setShowMobileSidebar(false);
                  setShowLogoutConfirm(true);
                }}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium ${
                  theme === 'dark'
                    ? 'bg-white/5 text-slate-300 hover:bg-white/10'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={isChartExpanded ? "overflow-auto h-screen" : "h-[calc(100dvh-65px-72px)] md:h-[calc(100vh-65px)] flex flex-col overflow-hidden"}>
        {visibleTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <svg className={`mx-auto h-12 w-12 sm:h-16 sm:w-16 mb-4 ${
                theme === 'dark' ? 'text-slate-700' : 'text-slate-300'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className={`mt-4 text-base sm:text-lg font-semibold ${
                theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
              }`}>No tasks yet</h3>
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Create your first task to get started
              </p>
              <button
                onClick={handleAddTask}
                className="mt-6 inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition shadow-lg text-sm sm:text-base"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                Create Task
              </button>
            </div>
          </div>
        ) : (
          <div className={`flex gap-0 ${isChartExpanded ? '' : 'h-full overflow-hidden'}`}>
            {/* Task list sidebar - Desktop only, hidden when chart is expanded */}
            {!isChartExpanded && (
              <div className={`hidden md:block w-64 border-r overflow-y-auto flex-shrink-0 ${
                theme === 'dark' 
                  ? 'border-slate-700 bg-slate-900' 
                  : 'border-slate-200 bg-white'
              }`}>
                <div className="p-4 space-y-1">
                  <TaskList
                    tasks={visibleTasks}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    onAddSubtask={handleAddSubtask}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={setSelectedTaskId}
                  />
                </div>
              </div>
            )}

            {/* Gantt chart - full width */}
            <div className={`flex-1 ${
              theme === 'dark' ? 'bg-slate-900' : 'bg-white'
            } ${isChartExpanded ? '' : 'overflow-hidden'}`}>
              <GanttChart
                ref={ganttChartRef}
                tasks={visibleTasks}
                onTaskClick={setSelectedTaskId}
                onTaskEdit={handleEditTask}
                onExpandedChange={setIsChartExpanded}
              />
            </div>
          </div>
        )}
      </main>

      {/* Task modal */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          onSave={handleSaveTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
            setParentTaskId(null);
          }}
          allTasks={tasks}
          isSubtask={parentTaskId !== null || (editingTask?.parentId !== null && editingTask?.parentId !== undefined)}
          parentTask={parentTaskId ? findTaskById(parentTaskId) : null}
        />
      )}

      {/* Settings modal */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {/* Delete Task Confirmation */}
      <ConfirmationModal
        isOpen={!!deleteConfirmTask}
        onClose={() => setDeleteConfirmTask(null)}
        onConfirm={confirmDeleteTask}
        title="Delete Task?"
        message={
          deleteConfirmTask?.children?.length > 0
            ? `Are you sure you want to delete "${deleteConfirmTask?.name}"? This will also delete ${deleteConfirmTask.children.length} subtask${deleteConfirmTask.children.length > 1 ? 's' : ''}. This action cannot be undone.`
            : `Are you sure you want to delete "${deleteConfirmTask?.name}"? This action cannot be undone.`
        }
        confirmText="Delete Task"
        type="delete"
      />

      {/* Logout Confirmation */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={logout}
        title="Sign Out?"
        message="Are you sure you want to sign out? You'll need to sign in again to access your workspaces."
        confirmText="Sign Out"
        type="warning"
      />

      {/* Mobile Bottom Navigation - only show when not expanded and has tasks */}
      {!isChartExpanded && visibleTasks.length > 0 && (
        <nav className={`fixed bottom-0 left-0 right-0 z-30 md:hidden border-t safe-area-inset-bottom ${
          theme === 'dark' 
            ? 'bg-slate-900/95 backdrop-blur-xl border-slate-800' 
            : 'bg-white/95 backdrop-blur-xl border-slate-200'
        }`}>
          <div className="flex items-center justify-around px-2 py-2">
            {/* Chart View */}
            <button
              onClick={() => setMobileView('chart')}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                mobileView === 'chart'
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <GanttChartSquare className="w-5 h-5" />
              <span className="text-[10px] font-medium">Chart</span>
            </button>

            {/* List View */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                theme === 'dark'
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutList className="w-5 h-5" />
              <span className="text-[10px] font-medium">Tasks</span>
            </button>

            {/* Add Task - Floating style */}
            <button
              onClick={handleAddTask}
              className="flex flex-col items-center gap-1 -mt-4"
            >
              <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <span className={`text-[10px] font-medium ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>Add</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                theme === 'dark'
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-[10px] font-medium">Settings</span>
            </button>

            {/* Export / More */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  theme === 'dark'
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Download className="w-5 h-5" />
                <span className="text-[10px] font-medium">Export</span>
              </button>
              {showExportMenu && (
                <div className="absolute bottom-full right-0 mb-2">
                  <ExportMenu onSelect={handleExport} />
                </div>
              )}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

// Helper function to filter tasks
function filterTasks(tasks, searchTerm) {
  return tasks.filter((task) => {
    if (task.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return true;
    }
    if (task.children && task.children.length > 0) {
      return filterTasks(task.children, searchTerm).length > 0;
    }
    return false;
  });
}
