import { useState } from 'react';
import { 
  FolderOpen, 
  Plus, 
  ChevronDown, 
  Check, 
  Trash2, 
  Edit2,
  MoreVertical,
  X,
  AlertCircle
} from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { usePreferencesStore } from '../store/preferencesStore';

export default function WorkspaceSelector() {
  const { 
    currentWorkspaceId, 
    getCurrentWorkspace,
    getWorkspaceList,
    switchWorkspace, 
    createWorkspace,
    updateWorkspace,
    deleteWorkspace 
  } = useWorkspaceStore();
  
  const { theme } = usePreferencesStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showNewWorkspaceInput, setShowNewWorkspaceInput] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [inputError, setInputError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const currentWorkspace = getCurrentWorkspace();
  const workspaceList = getWorkspaceList();

  const validateWorkspaceName = (name) => {
    if (!name.trim()) {
      return 'Please enter a workspace name';
    }
    if (name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (name.trim().length > 50) {
      return 'Name must be less than 50 characters';
    }
    // Check for duplicate names
    const existingNames = workspaceList.map(w => w.title.toLowerCase());
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
    
    await createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName('');
    setShowNewWorkspaceInput(false);
    setInputError('');
    setIsOpen(false);
  };

  const handleSwitchWorkspace = async (workspaceId) => {
    if (workspaceId !== currentWorkspaceId) {
      await switchWorkspace(workspaceId);
    }
    setIsOpen(false);
  };

  const handleStartEdit = (workspace) => {
    setEditingWorkspaceId(workspace.id);
    setEditingName(workspace.title);
    setMenuOpenId(null);
    setInputError('');
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      setInputError('Workspace name cannot be empty');
      return;
    }
    if (editingName.trim().length < 2) {
      setInputError('Name must be at least 2 characters');
      return;
    }
    if (editingName.trim().length > 50) {
      setInputError('Name must be less than 50 characters');
      return;
    }
    // Check for duplicate names (excluding current workspace)
    const existingNames = workspaceList
      .filter(w => w.id !== editingWorkspaceId)
      .map(w => w.title.toLowerCase());
    if (existingNames.includes(editingName.trim().toLowerCase())) {
      setInputError('A workspace with this name already exists');
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

  const handleInputChange = (value, isEdit = false) => {
    if (isEdit) {
      setEditingName(value);
    } else {
      setNewWorkspaceName(value);
    }
    setInputError(''); // Clear error on change
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${
          theme === 'dark'
            ? 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-700'
            : 'bg-white hover:bg-slate-50 border-slate-200'
        }`}
      >
        <FolderOpen className="w-4 h-4 text-cyan-400" />
        <span className={`text-sm font-medium max-w-[150px] truncate ${
          theme === 'dark' ? 'text-white' : 'text-slate-900'
        }`}>
          {currentWorkspace?.title || 'Select Workspace'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${
          theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
        } ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => {
              setIsOpen(false);
              setShowNewWorkspaceInput(false);
              setMenuOpenId(null);
            }} 
          />
          
          {/* Dropdown Panel */}
          <div className={`absolute top-full left-0 mt-2 w-72 border rounded-xl shadow-2xl z-50 overflow-hidden ${
            theme === 'dark'
              ? 'bg-slate-800 border-slate-700'
              : 'bg-white border-slate-200'
          }`}>
            {/* Header */}
            <div className={`px-4 py-3 border-b ${
              theme === 'dark' ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <h3 className={`text-sm font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}>Workspaces</h3>
              <p className={`text-xs mt-0.5 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>Switch or create a workspace</p>
            </div>

            {/* Workspace List */}
            <div className="max-h-64 overflow-y-auto">
              {workspaceList.length === 0 ? (
                <div className={`px-4 py-6 text-center text-sm ${
                  theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  No workspaces yet
                </div>
              ) : (
                workspaceList.map((workspace) => (
                  <div
                    key={workspace.id}
                    className={`relative group ${
                      workspace.id === currentWorkspaceId 
                        ? 'bg-cyan-500/10' 
                        : theme === 'dark' ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    {editingWorkspaceId === workspace.id ? (
                      /* Edit Mode */
                      <div className="px-4 py-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => handleInputChange(e.target.value, true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') {
                                setEditingWorkspaceId(null);
                                setInputError('');
                              }
                            }}
                            className={`flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:border-cyan-500 ${
                              inputError
                                ? 'border-red-500 bg-red-500/10'
                                : theme === 'dark'
                                  ? 'bg-slate-900 border-slate-600 text-white'
                                  : 'bg-white border-slate-300 text-slate-900'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="p-1 text-green-400 hover:bg-green-400/20 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingWorkspaceId(null);
                              setInputError('');
                            }}
                            className={`p-1 rounded ${
                              theme === 'dark'
                                ? 'text-slate-400 hover:bg-slate-600'
                                : 'text-slate-500 hover:bg-slate-200'
                            }`}
                          >
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
                      /* Normal Mode */
                      <div className="flex items-center">
                        <button
                          onClick={() => handleSwitchWorkspace(workspace.id)}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <FolderOpen className={`w-4 h-4 ${
                            workspace.id === currentWorkspaceId 
                              ? 'text-cyan-400' 
                              : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${
                              workspace.id === currentWorkspaceId 
                                ? 'text-cyan-400' 
                                : theme === 'dark' ? 'text-white' : 'text-slate-900'
                            }`}>
                              {workspace.title}
                            </p>
                            <p className={`text-xs ${
                              theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              {new Date(workspace.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          {workspace.id === currentWorkspaceId && (
                            <Check className="w-4 h-4 text-cyan-400" />
                          )}
                        </button>
                        
                        {/* Menu Button */}
                        <div className="relative pr-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id);
                            }}
                            className={`p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              theme === 'dark'
                                ? 'text-slate-500 hover:text-white hover:bg-slate-600'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {/* Context Menu */}
                          {menuOpenId === workspace.id && (
                            <div className={`absolute right-0 top-full mt-1 w-36 border rounded-lg shadow-xl z-10 overflow-hidden ${
                              theme === 'dark'
                                ? 'bg-slate-900 border-slate-700'
                                : 'bg-white border-slate-200'
                            }`}>
                              <button
                                onClick={() => handleStartEdit(workspace)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
                                  theme === 'dark'
                                    ? 'text-slate-300 hover:bg-slate-700'
                                    : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Rename
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(workspace)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Create New Workspace */}
            <div className={`border-t p-3 ${
              theme === 'dark' ? 'border-slate-700' : 'border-slate-200'
            }`}>
              {showNewWorkspaceInput ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => handleInputChange(e.target.value, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateWorkspace();
                        if (e.key === 'Escape') {
                          setShowNewWorkspaceInput(false);
                          setNewWorkspaceName('');
                          setInputError('');
                        }
                      }}
                      placeholder="Workspace name..."
                      className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-cyan-500 ${
                        inputError
                          ? 'border-red-500 bg-red-500/10'
                          : theme === 'dark'
                            ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                      autoFocus
                    />
                    <button
                      onClick={handleCreateWorkspace}
                      className="px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Create
                    </button>
                  </div>
                  {inputError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 px-1">
                      <AlertCircle className="w-3 h-3" />
                      {inputError}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowNewWorkspaceInput(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">New Workspace</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`mx-4 w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden ${
            theme === 'dark'
              ? 'bg-slate-900 border-white/10'
              : 'bg-white border-slate-200'
          }`}>
            {/* Warning gradient accent */}
            <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
            
            <div className="p-5">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  theme === 'dark' ? 'bg-red-500/10' : 'bg-red-50'
                }`}>
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
              </div>
              
              {/* Title */}
              <h3 className={`text-lg font-bold text-center mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}>
                Delete Workspace?
              </h3>
              
              {/* Description */}
              <p className={`text-sm text-center mb-6 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Are you sure you want to delete <strong className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>"{showDeleteConfirm.title}"</strong>? 
                All tasks in this workspace will be permanently deleted. This action cannot be undone.
              </p>
              
              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(null);
                    setMenuOpenId(null);
                  }}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium border rounded-xl transition-all ${
                    theme === 'dark'
                      ? 'border-white/10 text-slate-300 hover:bg-white/10'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteWorkspace(showDeleteConfirm.id)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all"
                >
                  Delete Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
