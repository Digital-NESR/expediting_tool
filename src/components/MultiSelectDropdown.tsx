import { useState, useRef, useEffect, useMemo } from 'react';
import { SquareCheckbox } from './SquareCheckbox';

interface Props {
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  label: string;
  displayMap?: Record<string, string>;
}

export default function MultiSelectDropdown({ options, selectedOptions, onChange, label, displayMap }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const lower = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      const display = displayMap ? (displayMap[opt] || opt) : opt;
      return display.toLowerCase().includes(lower);
    });
  }, [options, searchQuery, displayMap]);

  return (
    <div className="relative shrink-0 w-full md:w-56" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-2.5 flex items-center justify-between outline-none focus:border-[#307c4c] focus:ring-1 focus:ring-[#307c4c] transition-colors duration-150 shadow-sm"
      >
        <span className="truncate">
          {selectedOptions.length === 0 ? label : `${label} (${selectedOptions.length})`}
        </span>
        <svg className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] border border-slate-200 z-50 overflow-hidden flex flex-col origin-top animate-in fade-in zoom-in-95 duration-150" style={{ minWidth: '100%', width: 'max-content', maxWidth: '480px' }}>
          
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder={`Search ${label}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-md pl-8 pr-3 py-1.5 focus:ring-[#307c4c] focus:border-[#307c4c] outline-none transition-colors placeholder-slate-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center font-medium">No options found</p>
            ) : (
              filteredOptions.map((opt) => {
                const display = displayMap ? (displayMap[opt] || opt) : opt;
                return (
                  <label key={opt} className="flex items-start gap-3 px-3 py-2 hover:bg-[#307c4c]/5 cursor-pointer transition-colors group">
                    <div className="mt-0.5 shrink-0">
                      <SquareCheckbox
                        checked={selectedOptions.includes(opt)}
                        onChange={() => toggleOption(opt)}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-700 whitespace-nowrap group-hover:text-slate-900 leading-tight">{display}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
