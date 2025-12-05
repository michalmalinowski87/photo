import { ChevronDown, X, Check } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";

interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  label?: string;
}

/**
 * Modern searchable combobox-style select component
 * The trigger becomes the search input when opened
 * Matches TypeformInput underline style
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Wybierz opcję",
  searchPlaceholder = "Szukaj...",
  emptyMessage = "Brak wyników",
  className = "",
  disabled = false,
  error = false,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search query
  const filteredOptions = options.filter((option) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.toLowerCase();
    return (
      option.label.toLowerCase().includes(query) || option.subLabel?.toLowerCase().includes(query)
    );
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery("");
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
        break;
      case "Tab":
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      {/* When closed: Show as button, when open: Show as input */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className={`
            w-full bg-transparent border-0 border-b-2 pb-2 pt-1 px-3
            text-lg font-medium
            focus:outline-none focus:ring-0
            transition-colors duration-200
            flex items-center justify-between
            text-left
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}
            ${
              error
                ? "border-red-500 text-red-600 dark:text-red-400"
                : "border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:border-gray-400 dark:focus:border-gray-500"
            }
          `}
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-label={placeholder}
        >
          <span
            className={`truncate flex-1 ${
              !selectedOption ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {value && !disabled && (
              <div
                onClick={handleClear}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Wyczyść"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClear(e as any);
                  }
                }}
              >
                <X className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400 transition-transform duration-200" />
          </div>
        </button>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder || placeholder}
            className={`
              w-full bg-transparent border-0 border-b-2 pb-2 pt-1 px-3
              text-lg font-medium
              focus:outline-none focus:ring-0
              transition-colors duration-200
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
              ${
                error
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-gray-400 dark:border-gray-500 text-gray-900 dark:text-white"
              }
              placeholder:text-gray-400 dark:placeholder:text-gray-500
            `}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {searchQuery && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Wyczyść"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchQuery("");
                    inputRef.current?.focus();
                  }
                }}
              >
                <X className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400 transition-transform duration-200 rotate-180" />
          </div>
        </div>
      )}

      {/* Dropdown - Flows naturally from input, minimal design */}
      {isOpen && (
        <div className="absolute z-50 w-full top-full left-0 mt-0 bg-white dark:bg-gray-800 shadow-lg">
          {/* Options List */}
          <div className="relative">
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-60 overflow-y-auto"
              aria-label={placeholder}
            >
              {filteredOptions.length === 0 ? (
                <li className="px-4 py-4 text-lg text-center text-gray-500 dark:text-gray-400">
                  {emptyMessage}
                </li>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseLeave={() => setHighlightedIndex(-1)}
                      className={`
                        px-4 py-4 cursor-pointer transition-colors
                        border-b border-gray-200 dark:border-gray-700 last:border-b-0
                        ${
                          isSelected
                            ? "text-brand-600 dark:text-brand-400 bg-brand-50/30 dark:bg-brand-500/5"
                            : "text-gray-900 dark:text-white"
                        }
                        ${
                          isHighlighted && !isSelected
                            ? "bg-gray-50 dark:bg-gray-700/30"
                            : "bg-transparent"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span
                            className={`text-lg truncate w-full ${
                              isSelected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {option.label}
                          </span>
                          {option.subLabel && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 truncate w-full mt-0.5">
                              {option.subLabel}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-brand-500 dark:text-brand-400 flex-shrink-0" />
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
