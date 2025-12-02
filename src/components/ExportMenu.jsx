import { FileText } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

export default function ExportMenu({ onSelect }) {
  const { theme } = usePreferencesStore();
  
  return (
    <div className={`absolute top-full right-0 mt-1 w-40 rounded-lg shadow-xl border z-[100] overflow-hidden ${
      theme === 'dark' 
        ? 'bg-slate-800 border-slate-700' 
        : 'bg-white border-slate-200'
    }`}>
      <button
        onClick={() => onSelect('pdf')}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition text-left text-sm ${
          theme === 'dark' 
            ? 'hover:bg-slate-700 text-slate-300' 
            : 'hover:bg-slate-100 text-slate-700'
        }`}
      >
        <FileText className="w-4 h-4 text-red-500" />
        <span>Export as PDF</span>
      </button>
    </div>
  );
}
