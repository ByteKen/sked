import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CaretDown,
  CaretRight,
  Check,
  Code,
  Copy,
  FileCode,
  Sparkle,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  MAX_IMPORT_BYTES,
  validateImportJson,
  type ImportValidationError,
} from '@/domain/validation';
import { toast } from '@/store/toastStore';
import type { ImportTaskInput } from '@/types';
import { cn } from '@/utils/cn';
import { STUDIO_EASE } from '@/utils/motion';

const SAMPLE_TEMPLATE = {
  tasks: [
    {
      id: '1',
      name: 'Phase 1: Discovery & Planning',
      description: 'Align stakeholders on core scope, milestones, and technical architecture.',
      start: '2026-01-05',
      end: '2026-01-16',
      progress: 0,
      children: [
        { name: 'Stakeholder Interviews', start: '2026-01-05', end: '2026-01-09' },
        { name: 'Scope & Architecture Spec', start: '2026-01-10', end: '2026-01-15' },
        { name: 'Kickoff Sign-off', start: '2026-01-16', end: '2026-01-16' },
      ],
    },
    {
      id: '2',
      name: 'Phase 2: Design & Prototyping',
      start: '2026-01-19',
      end: '2026-01-30',
      progress: 0,
      dependencies: ['1'],
      children: [
        { name: 'Interactive Wireframes', start: '2026-01-19', end: '2026-01-24' },
        { name: 'Design System & Review', start: '2026-01-25', end: '2026-01-30' },
      ],
    },
    {
      id: '3',
      name: 'Phase 3: Implementation & QA',
      start: '2026-02-02',
      end: '2026-02-27',
      progress: 0,
      dependencies: ['2'],
      children: [
        { name: 'Core Engineering', start: '2026-02-02', end: '2026-02-18' },
        { name: 'Testing & Polish', start: '2026-02-19', end: '2026-02-26' },
        { name: 'Release Candidate', start: '2026-02-27', end: '2026-02-27' },
      ],
    },
    {
      id: '4',
      name: 'Production Launch',
      start: '2026-03-02',
      end: '2026-03-02',
      dependencies: ['3'],
    },
  ],
};

const TEMPLATE_STRING = JSON.stringify(SAMPLE_TEMPLATE, null, 2);

const SCHEMA_FIELDS = [
  { field: 'id', type: 'string | number', required: false, desc: 'Reference ID used by dependencies' },
  { field: 'name', type: 'string', required: true, desc: 'Task name (2–100 characters)' },
  { field: 'description', type: 'string', required: false, desc: 'Optional task notes (up to 2,000 characters)' },
  { field: 'start', type: 'YYYY-MM-DD', required: true, desc: 'Start date (same as end for deadline)' },
  { field: 'end', type: 'YYYY-MM-DD', required: true, desc: 'End date (must be ≥ start)' },
  { field: 'progress', type: 'number', required: false, desc: 'Completion percentage (0–100)' },
  { field: 'dependencies', type: '(string|number)[]', required: false, desc: 'Blocking task IDs' },
  { field: 'children', type: 'Task[]', required: false, desc: 'Nested subtasks' },
];

export interface ImportModalProps {
  isOpen: boolean;
  onImport: (tasks: ImportTaskInput[]) => void;
  onClose: () => void;
}

export function ImportModal({ isOpen, onImport, onClose }: ImportModalProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [errors, setErrors] = useState<ImportValidationError[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ImportTaskInput[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (validationTimerRef.current !== null) {
        window.clearTimeout(validationTimerRef.current);
      }
    };
  }, []);

  const updateJsonInput = (nextValue: string) => {
    setJsonInput(nextValue);

    if (validationTimerRef.current !== null) {
      window.clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }

    if (!nextValue.trim()) {
      setErrors([]);
      setParsedTasks(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    validationTimerRef.current = window.setTimeout(() => {
      const result = validateImportJson(nextValue);
      setErrors(result.errors);
      setParsedTasks(result.tasks);
      setIsValidating(false);
      validationTimerRef.current = null;
    }, 250);
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      const maxKb = Math.round(MAX_IMPORT_BYTES / 1024);
      toast.error('File too large', `JSON imports must be ${maxKb} KB or smaller.`);
      setErrors([
        {
          type: 'structure',
          message: `Uploaded file exceeds the ${maxKb} KB size limit`,
        },
      ]);
      setParsedTasks(null);
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateJsonInput(reader.result);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(TEMPLATE_STRING);
      setCopied(true);
      toast.success('Template copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy template');
    }
  };

  const handleConfirmImport = () => {
    const result = validateImportJson(jsonInput);
    if (result.errors.length > 0 || !result.tasks) {
      setErrors(result.errors);
      setParsedTasks(null);
      return;
    }
    onImport(result.tasks);
    onClose();
  };

  const hasErrors = errors.length > 0;
  const canImport = Boolean(parsedTasks && parsedTasks.length > 0 && !hasErrors && !isValidating);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Tasks from JSON"
      description="Paste JSON or upload a previously exported .json backup"
      maxWidth="xl"
      icon={
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <FileCode weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Tasks are appended atomically to your active workspace.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canImport}
              onClick={handleConfirmImport}
              leftIcon={<UploadSimple weight="duotone" className="w-3.5 h-3.5" />}
            >
              Import Tasks
            </Button>
          </div>
        </div>
      }
    >
      <div className="p-5 sm:p-6 space-y-4">
        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="subtle"
            size="sm"
            onClick={() => updateJsonInput(TEMPLATE_STRING)}
            leftIcon={<Sparkle weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
          >
            Load Template
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleCopyTemplate()}
            leftIcon={
              copied ? (
                <Check weight="bold" className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              )
            }
          >
            {copied ? 'Copied' : 'Copy Template'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            leftIcon={<UploadSimple weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
          >
            Upload .json File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDocs((v) => !v)}
            leftIcon={<Code weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
            rightIcon={
              showDocs ? (
                <CaretDown weight="bold" className="w-3 h-3" />
              ) : (
                <CaretRight weight="bold" className="w-3 h-3" />
              )
            }
          >
            Schema
          </Button>
        </div>

        {/* Collapsible Schema Reference */}
        <AnimatePresence initial={false}>
          {showDocs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: STUDIO_EASE }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-slate-200/90 dark:border-white/[0.08] overflow-x-auto bg-slate-50/70 dark:bg-white/[0.025]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                      <th className="text-left py-2.5 px-4 font-semibold">Field</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Type</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Required</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEMA_FIELDS.map((row) => (
                      <tr
                        key={row.field}
                        className="border-t border-slate-200/70 dark:border-white/[0.06]"
                      >
                        <td className="py-2.5 px-4 font-mono text-brand-600 dark:text-brand-400">
                          {row.field}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {row.type}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                              row.required
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                : 'bg-slate-200/80 text-slate-600 dark:bg-white/10 dark:text-slate-400',
                            )}
                          >
                            {row.required ? 'required' : 'optional'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* JSON Editor */}
        <div className="relative">
          <label htmlFor="json-import-textarea" className="sr-only">
            JSON Tasks Payload
          </label>
          <textarea
            id="json-import-textarea"
            value={jsonInput}
            onChange={(e) => updateJsonInput(e.target.value)}
            spellCheck={false}
            placeholder={'{\n  "tasks": [\n    {\n      "name": "Kickoff",\n      "start": "2026-01-05",\n      "end": "2026-01-12"\n    }\n  ]\n}'}
            className={cn(
              'w-full h-64 p-3.5 font-mono text-xs leading-relaxed rounded-xl border resize-none transition focus:outline-none focus:ring-2',
              'bg-slate-50 dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400',
              hasErrors
                ? 'border-rose-400 focus:ring-rose-500/30'
                : canImport
                  ? 'border-emerald-400 focus:ring-emerald-500/30'
                  : 'border-slate-200 dark:border-white/10 focus:ring-brand-500/30 focus:border-brand-500',
            )}
          />

          {jsonInput.trim() && (
            <div className="absolute bottom-3.5 right-3.5">
              {isValidating ? (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                  Validating...
                </span>
              ) : hasErrors ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  <WarningCircle weight="duotone" className="w-3.5 h-3.5" />
                  {errors.length} {errors.length === 1 ? 'issue' : 'issues'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <Check weight="bold" className="w-3 h-3" />
                  Valid JSON
                </span>
              )}
            </div>
          )}
        </div>

        {/* Validation Errors */}
        <AnimatePresence initial={false}>
          {hasErrors && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: STUDIO_EASE }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-rose-200 dark:border-rose-500/20 flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
                  <WarningCircle weight="duotone" className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  Validation Issues
                </div>
                <div className="p-3.5 space-y-1.5 max-h-40 overflow-y-auto">
                  {errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-200"
                    >
                      <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-rose-200/80 dark:bg-rose-500/25 shrink-0">
                        {err.type.slice(0, 3)}
                      </span>
                      <div className="min-w-0">
                        {err.path && (
                          <span className="font-mono text-[11px] opacity-80 mr-1.5">
                            {err.path}
                            {err.field ? `.${err.field}` : ''}:
                          </span>
                        )}
                        <span>{err.message}</span>
                        {err.line && <span className="ml-1.5 opacity-70">(line {err.line})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
