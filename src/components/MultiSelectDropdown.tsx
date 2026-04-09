import { useState, useRef, useEffect } from 'react';
import { SquareCheckbox } from './SquareCheckbox';

interface Props {
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  label: string;
}

export default function MultiSelectDropdown({ options, selectedOptions, onChange, label }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selectedOptions.includes(opt)) {
      onChange(selectedOptions.filter((o) => o !== opt));
    } else {
      onChange([...selectedOptions, opt]);
    }
  };

  return (
    <div className="relative shrink-0 w-full md:w-56" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-2.5 flex items-center justify-between outline-none focus:border-[#307c4c] focus:ring-1 focus:ring-[#307c4c] transition-colors duration-150"
      >
        <span className="truncate">
          {selectedOptions.length === 0 ? label : `${label} (${selectedOptions.length})`}
        </span>
        <svg className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full md:w-64 max-h-60 overflow-y-auto bg-white rounded-xl shadow-lg border border-slate-200 z-50 py-1 origin-top animate-in fade-in zoom-in-95 duration-150">
          {options.length === 0 ? (
            <p className="p-3 text-sm text-slate-400 text-center">No options available</p>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-start gap-3 px-3 py-2 hover:bg-[#307c4c]/5 cursor-pointer transition-colors">
                <div className="mt-0.5 shrink-0">
                  <SquareCheckbox
                    checked={selectedOptions.includes(opt)}
                    onChange={() => toggleOption(opt)}
                  />
                </div>
                <span className="text-sm font-medium text-slate-700 break-words">{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
