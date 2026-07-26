'use client';

import * as React from 'react';
import { MapPin } from 'lucide-react';
import { cn, Spinner } from '@uprise/ui';
import { FormField, inputBaseClasses } from './form-field';
import {
  MIN_ADDRESS_QUERY,
  hasAddressSearch,
  isoCodeForCountry,
  searchAddresses,
  type AddressSuggestion,
} from '@/lib/address-autocomplete';

export type { AddressSuggestion };

export interface FormAddressAutocompleteProps {
  label: string;
  id?: string;
  name?: string;
  /** Controlled text of the street line. */
  value: string;
  /** Fires on every keystroke and on a pick (with the picked street line). */
  onChange: (value: string) => void;
  /** Fires only on a pick – carries the structured parts for the sibling fields. */
  onSelect?: (suggestion: AddressSuggestion) => void;
  /** Country `<select>` option value (e.g. "australia") – biases the search. */
  country?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  state?: 'default' | 'error' | 'success' | 'disabled';
  disabled?: boolean;
  className?: string;
}

const stateClasses = {
  default: '',
  error:
    'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-700 dark:focus:border-error-800',
  success:
    'border-success-300 focus:border-success-300 focus:ring-success-500/10 dark:border-success-700 dark:focus:border-success-800',
  disabled:
    'disabled:border-gray-100 disabled:bg-gray-50 disabled:placeholder:text-gray-300 dark:disabled:border-gray-800 dark:disabled:bg-white/[0.03] dark:disabled:placeholder:text-white/15 focus:ring-0 focus:outline-none',
};

const DEBOUNCE_MS = 250;

/**
 * Street-line input backed by Mapbox forward-geocoding: type, pick a real address from the
 * dropdown, and the caller fills suburb / city / state / postcode / country from the pick.
 * Free text still submits – the picklist is an assist, never a gate – and with no public Mapbox
 * token the field degrades silently to a plain text input.
 */
export function FormAddressAutocomplete({
  label,
  id,
  name,
  value,
  onChange,
  onSelect,
  country,
  placeholder = 'Start typing an address…',
  required,
  error,
  state = 'default',
  disabled,
  className,
}: FormAddressAutocompleteProps) {
  const reactId = React.useId();
  const inputId = id ?? `address-${reactId}`;
  const listId = `${inputId}-listbox`;
  const resolvedState = error ? 'error' : state;
  const isDisabled = disabled || resolvedState === 'disabled';

  // The term we search on. Typing sets it; picking clears it, so the effect below doesn't
  // immediately re-search the text we just filled in.
  const [term, setTerm] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchEnabled = React.useMemo(() => hasAddressSearch(), []);
  const countryCode = isoCodeForCountry(country);
  const query = term.trim();

  React.useEffect(() => {
    if (!searchEnabled || query.length < MIN_ADDRESS_QUERY) {
      setSuggestions([]);
      setLoading(false);
      setFailed(false);
      setHighlight(-1);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchAddresses(query, { country: countryCode, signal: controller.signal });
          if (controller.signal.aborted) return;
          setSuggestions(hits);
          setFailed(false);
          setHighlight(hits.length > 0 ? 0 : -1);
          setLoading(false);
        } catch {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setFailed(true);
          setHighlight(-1);
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, countryCode, searchEnabled]);

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const select = (suggestion: AddressSuggestion) => {
    onChange(suggestion.line1);
    onSelect?.(suggestion);
    setTerm('');
    setSuggestions([]);
    setHighlight(-1);
    setOpen(false);
  };

  const panelOpen = open && searchEnabled && query.length >= MIN_ADDRESS_QUERY;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!panelOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      select(suggestions[highlight]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <FormField label={label} htmlFor={inputId} error={error} required={required} disabled={resolvedState === 'disabled'}>
      <div ref={containerRef} className="relative">
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={panelOpen}
          aria-controls={panelOpen ? listId : undefined}
          aria-activedescendant={
            panelOpen && highlight >= 0 ? `${listId}-option-${highlight}` : undefined
          }
          value={value}
          placeholder={placeholder}
          disabled={isDisabled}
          onChange={(e) => {
            onChange(e.target.value);
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(inputBaseClasses, 'pr-11', stateClasses[resolvedState], className)}
        />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          {loading ? <Spinner className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        </span>

        {panelOpen && (
          <div className="shadow-theme-lg absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            {suggestions.length > 0 ? (
              <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li key={s.id} role="none">
                    <button
                      type="button"
                      id={`${listId}-option-${i}`}
                      role="option"
                      aria-selected={i === highlight}
                      // mousedown would blur the input and close the panel before the click lands.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => select(s)}
                      className={cn(
                        'flex w-full items-start gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left transition last:border-b-0 dark:border-gray-800',
                        i === highlight ? 'bg-gray-50 dark:bg-white/[0.03]' : ''
                      )}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-800 dark:text-white/90">
                          {s.line1}
                        </span>
                        {s.context && (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {s.context}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {loading ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Searching addresses…
                  </>
                ) : failed ? (
                  'Address search is unavailable right now – type the address manually.'
                ) : (
                  <>No addresses match &ldquo;{query}&rdquo; – keep typing or enter it manually.</>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
