import { useState, useCallback } from 'react';
import { X, Upload, Copy, Check, AlertCircle, Code2, FileJson, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

// JSON Template for tasks
const TEMPLATE = {
  tasks: [
    {
      id: "1",
      name: "Phase 1: Planning",
      start: "2025-01-01",
      end: "2025-01-15",
      progress: 0,
      children: [
        {
          name: "Research & Analysis",
          start: "2025-01-01",
          end: "2025-01-07"
        },
        {
          name: "Requirements Gathering",
          start: "2025-01-08",
          end: "2025-01-14"
        },
        {
          name: "Planning Sign-off",
          start: "2025-01-15",
          end: "2025-01-15"
        }
      ]
    },
    {
      id: "2",
      name: "Phase 2: Design",
      start: "2025-01-16",
      end: "2025-01-31",
      progress: 0,
      dependencies: ["1"],
      children: [
        {
          name: "UI/UX Wireframing",
          start: "2025-01-16",
          end: "2025-01-23"
        },
        {
          name: "Database Schema",
          start: "2025-01-24",
          end: "2025-01-30"
        },
        {
          name: "Design Approved",
          start: "2025-01-31",
          end: "2025-01-31"
        }
      ]
    },
    {
      id: "3",
      name: "Phase 3: Development",
      start: "2025-02-01",
      end: "2025-02-28",
      progress: 0,
      dependencies: ["2"],
      children: [
        {
          name: "Backend API",
          start: "2025-02-01",
          end: "2025-02-14"
        },
        {
          name: "Frontend Implementation",
          start: "2025-02-15",
          end: "2025-02-27"
        },
        {
          name: "Code Complete",
          start: "2025-02-28",
          end: "2025-02-28"
        }
      ]
    },
    {
      id: "4",
      name: "Project Launch",
      start: "2025-03-01",
      end: "2025-03-01",
      dependencies: ["3"]
    }
  ]
};

const TEMPLATE_STRING = JSON.stringify(TEMPLATE, null, 2);

// Schema documentation
const SCHEMA_DOCS = [
  { field: 'id', type: 'string|number', required: false, description: 'Custom ID for dependency references (e.g., "1" or 1)' },
  { field: 'name', type: 'string', required: true, description: 'Task name (2-100 characters)' },
  { field: 'start', type: 'string', required: true, description: 'Start date (YYYY-MM-DD). Same as end for deadlines' },
  { field: 'end', type: 'string', required: true, description: 'End date (YYYY-MM-DD). Same as start for deadlines' },
  { field: 'progress', type: 'number', required: false, description: 'Progress percentage (0-100), default: 0' },
  { field: 'dependencies', type: 'array', required: false, description: 'Array of task IDs this depends on (e.g., ["1"] or [1])' },
  { field: 'children', type: 'array', required: false, description: 'Subtasks: date ranges OR single-date deadlines' },
];

// Validate date format
const isValidDate = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
};

// Validate a single task object (recursive)
const validateTask = (task, path = 'tasks[0]') => {
  const taskErrors = [];

  // Check required fields
  if (!task.name || typeof task.name !== 'string') {
    taskErrors.push({ path, field: 'name', message: 'Task name is required and must be a string' });
  } else if (task.name.trim().length < 2 || task.name.trim().length > 100) {
    taskErrors.push({ path, field: 'name', message: 'Task name must be 2-100 characters' });
  }

  if (!task.start) {
    taskErrors.push({ path, field: 'start', message: 'Start date is required' });
  } else if (!isValidDate(task.start)) {
    taskErrors.push({ path, field: 'start', message: 'Invalid start date format. Use YYYY-MM-DD' });
  }

  if (!task.end) {
    taskErrors.push({ path, field: 'end', message: 'End date is required' });
  } else if (!isValidDate(task.end)) {
    taskErrors.push({ path, field: 'end', message: 'Invalid end date format. Use YYYY-MM-DD' });
  }

  // Check date logic
  if (task.start && task.end && isValidDate(task.start) && isValidDate(task.end)) {
    const start = new Date(task.start);
    const end = new Date(task.end);
    if (end < start && !task.isDeadline) {
      taskErrors.push({ path, field: 'end', message: 'End date cannot be before start date' });
    }
  }

  // Check progress
  if (task.progress !== undefined) {
    if (typeof task.progress !== 'number' || task.progress < 0 || task.progress > 100) {
      taskErrors.push({ path, field: 'progress', message: 'Progress must be a number between 0 and 100' });
    }
  }

  // Validate children recursively
  if (task.children) {
    if (!Array.isArray(task.children)) {
      taskErrors.push({ path, field: 'children', message: 'Children must be an array' });
    } else {
      task.children.forEach((child, index) => {
        const childErrors = validateTask(child, `${path}.children[${index}]`);
        taskErrors.push(...childErrors);
      });
    }
  }

  return taskErrors;
};

export default function ImportModal({ onImport, onClose }) {
  const { theme } = usePreferencesStore();
  const [jsonInput, setJsonInput] = useState('');
  const [errors, setErrors] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // Extract line number from error message (if available)
  const extractLineNumber = useCallback((message) => {
    const match = message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      const lines = jsonInput.substring(0, pos).split('\n');
      return lines.length;
    }
    return null;
  }, [jsonInput]);

  // Full validation
  const validateJSON = useCallback((input) => {
    const validationErrors = [];

    // Try to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      validationErrors.push({
        type: 'syntax',
        message: `JSON Syntax Error: ${e.message}`,
        line: extractLineNumber(e.message)
      });
      return validationErrors;
    }

    // Check root structure
    if (!parsed.tasks) {
      validationErrors.push({
        type: 'structure',
        message: 'Missing required "tasks" array at root level'
      });
      return validationErrors;
    }

    if (!Array.isArray(parsed.tasks)) {
      validationErrors.push({
        type: 'structure',
        message: '"tasks" must be an array'
      });
      return validationErrors;
    }

    if (parsed.tasks.length === 0) {
      validationErrors.push({
        type: 'structure',
        message: '"tasks" array cannot be empty'
      });
      return validationErrors;
    }

    // Validate each task
    parsed.tasks.forEach((task, index) => {
      const taskErrors = validateTask(task, `tasks[${index}]`);
      validationErrors.push(...taskErrors.map(err => ({
        type: 'validation',
        path: err.path,
        field: err.field,
        message: err.message
      })));
    });

    return validationErrors;
  }, [extractLineNumber]);

  // Handle input change with live validation
  const handleInputChange = (e) => {
    const value = e.target.value;
    setJsonInput(value);
    setImportSuccess(false);
    
    // Clear errors when empty
    if (!value.trim()) {
      setErrors([]);
      return;
    }

    // Debounced validation
    setIsValidating(true);
    const timeoutId = setTimeout(() => {
      const validationErrors = validateJSON(value);
      setErrors(validationErrors);
      setIsValidating(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  // Copy template to clipboard
  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(TEMPLATE_STRING);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Load template into editor
  const loadTemplate = () => {
    setJsonInput(TEMPLATE_STRING);
    setErrors([]);
    setImportSuccess(false);
  };

  // Process and transform tasks for import
  const processTasksForImport = (tasks) => {
    const processTask = (task) => {
      const processed = {
        name: task.name.trim(),
        start: task.start,
        end: task.end,
        progress: task.progress || 0,
        isDeadline: task.isDeadline || task.start === task.end,
        isDone: task.progress === 100,
        isWorking: false,
        dependencies: task.dependencies || [],
      };

      if (task.children && task.children.length > 0) {
        processed.children = task.children.map(processTask);
      }

      return processed;
    };

    return tasks.map(processTask);
  };

  // Handle import
  const handleImport = () => {
    if (!jsonInput.trim()) {
      setErrors([{ type: 'validation', message: 'Please enter JSON data to import' }]);
      return;
    }

    const validationErrors = validateJSON(jsonInput);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      const processedTasks = processTasksForImport(parsed.tasks);
      
      onImport(processedTasks);
      setImportSuccess(true);
      
      // Close after brief success animation
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setErrors([{ type: 'error', message: 'Failed to process import: ' + err.message }]);
    }
  };

  const hasErrors = errors.length > 0;
  const isValid = jsonInput.trim() && !hasErrors && !isValidating;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`rounded-2xl w-full max-w-3xl shadow-2xl border overflow-hidden ${
        theme === 'dark' 
          ? 'bg-slate-900 border-white/10' 
          : 'bg-white border-slate-200'
      }`}>
        {/* Gradient accent */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500" />
        
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          theme === 'dark' ? 'border-white/10' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              theme === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'
            }`}>
              <FileJson className={`w-5 h-5 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${
                theme === 'dark' 
                  ? 'bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent' 
                  : 'text-slate-900'
              }`}>
                Import Tasks from JSON
              </h2>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>
                Bulk create tasks and subtasks from structured data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100'
            }`}
          >
            <X className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`} />
          </button>
        </div>

        {/* Content */}
        <div className={`p-5 space-y-4 max-h-[70vh] overflow-y-auto ${
          theme === 'dark' ? '' : 'bg-slate-50'
        }`}>
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadTemplate}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                theme === 'dark'
                  ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30'
                  : 'bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Load Template
            </button>
            <button
              onClick={copyTemplate}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : theme === 'dark'
                    ? 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Template'}
            </button>
            <button
              onClick={() => setShowDocs(!showDocs)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                theme === 'dark'
                  ? 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Code2 className="w-4 h-4" />
              Schema Docs
              {showDocs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>

          {/* Schema Documentation */}
          {showDocs && (
            <div className={`rounded-xl border overflow-hidden ${
              theme === 'dark' ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'
            }`}>
              <div className={`px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider ${
                theme === 'dark' ? 'bg-slate-800 border-white/10 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}>
                Task Object Schema
              </div>
              <div className="p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>
                      <th className="text-left py-1.5 px-2 font-medium">Field</th>
                      <th className="text-left py-1.5 px-2 font-medium">Type</th>
                      <th className="text-left py-1.5 px-2 font-medium">Required</th>
                      <th className="text-left py-1.5 px-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEMA_DOCS.map((doc) => (
                      <tr key={doc.field} className={`border-t ${
                        theme === 'dark' ? 'border-white/5' : 'border-slate-100'
                      }`}>
                        <td className={`py-2 px-2 font-mono text-xs ${
                          theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'
                        }`}>{doc.field}</td>
                        <td className={`py-2 px-2 font-mono text-xs ${
                          theme === 'dark' ? 'text-violet-400' : 'text-violet-600'
                        }`}>{doc.type}</td>
                        <td className="py-2 px-2">
                          {doc.required ? (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">required</span>
                          ) : (
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              theme === 'dark' ? 'bg-white/10 text-slate-500' : 'bg-slate-100 text-slate-400'
                            }`}>optional</span>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-xs ${
                          theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                        }`}>{doc.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Code Editor */}
          <div className="relative">
            <div className={`absolute top-3 right-3 flex items-center gap-2 z-10 ${
              isValidating ? 'opacity-100' : 'opacity-0'
            } transition-opacity`}>
              <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              <span className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Validating...</span>
            </div>
            
            <textarea
              value={jsonInput}
              onChange={handleInputChange}
              placeholder={`Paste your JSON here...\n\nExample:\n{\n  "tasks": [\n    {\n      "name": "My Task",\n      "start": "2025-01-01",\n      "end": "2025-01-31"\n    }\n  ]\n}`}
              spellCheck={false}
              className={`w-full h-64 px-4 py-3 font-mono text-sm border rounded-xl focus:outline-none focus:ring-2 transition-all resize-none ${
                hasErrors
                  ? 'border-red-500/50 focus:ring-red-500/30 focus:border-red-500/50'
                  : isValid
                    ? 'border-emerald-500/50 focus:ring-emerald-500/30 focus:border-emerald-500/50'
                    : theme === 'dark'
                      ? 'bg-slate-800/50 border-white/10 text-slate-100 placeholder-slate-600 focus:ring-cyan-500/30 focus:border-cyan-500/50'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-cyan-500/30 focus:border-cyan-500/50'
              }`}
              style={{ 
                tabSize: 2,
                lineHeight: 1.6
              }}
            />

            {/* Status indicator */}
            {jsonInput.trim() && !isValidating && (
              <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                hasErrors
                  ? theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                  : theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
              }`}>
                {hasErrors ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.length} error{errors.length > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Valid JSON
                  </>
                )}
              </div>
            )}
          </div>

          {/* Error Panel */}
          {hasErrors && (
            <div className={`rounded-xl border overflow-hidden ${
              theme === 'dark' ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'
            }`}>
              <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${
                theme === 'dark' ? 'bg-red-500/10 border-red-500/20' : 'bg-red-100 border-red-200'
              }`}>
                <AlertCircle className={`w-4 h-4 ${theme === 'dark' ? 'text-red-400' : 'text-red-500'}`} />
                <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-red-300' : 'text-red-700'}`}>
                  Compilation Errors
                </span>
              </div>
              <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
                {errors.map((error, index) => (
                  <div key={index} className={`flex items-start gap-2 text-sm ${
                    theme === 'dark' ? 'text-red-300' : 'text-red-700'
                  }`}>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-mono rounded ${
                      theme === 'dark' ? 'bg-red-500/20' : 'bg-red-200'
                    }`}>
                      {error.type === 'syntax' ? 'SYN' : error.type === 'structure' ? 'STR' : 'VAL'}
                    </span>
                    <div className="flex-1 min-w-0">
                      {error.path && (
                        <span className={`font-mono text-xs mr-2 ${
                          theme === 'dark' ? 'text-red-400/70' : 'text-red-500/70'
                        }`}>
                          {error.path}{error.field ? `.${error.field}` : ''}:
                        </span>
                      )}
                      <span>{error.message}</span>
                      {error.line && (
                        <span className={`ml-2 text-xs ${
                          theme === 'dark' ? 'text-red-400/50' : 'text-red-400'
                        }`}>
                          (line {error.line})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {importSuccess && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              theme === 'dark'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className={`font-semibold ${theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Import Successful!
                </p>
                <p className={`text-sm ${theme === 'dark' ? 'text-emerald-400/70' : 'text-emerald-600'}`}>
                  Tasks have been created successfully
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between gap-3 p-5 border-t ${
          theme === 'dark' ? 'border-white/10' : 'border-slate-200'
        }`}>
          <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            Imported tasks will be added to your current workspace
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2.5 text-sm border rounded-xl font-medium transition-all ${
                theme === 'dark'
                  ? 'border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!isValid || importSuccess}
              className={`group relative px-5 py-2.5 text-sm font-semibold rounded-xl transition-all overflow-hidden ${
                !isValid || importSuccess
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              <div className={`absolute inset-0 transition-transform ${
                isValid && !importSuccess ? 'group-hover:scale-105' : ''
              } ${
                importSuccess 
                  ? 'bg-emerald-500' 
                  : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
              }`} />
              <span className="relative flex items-center justify-center gap-2 text-white">
                {importSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    Imported!
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import Tasks
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
