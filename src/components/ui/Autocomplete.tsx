import { useState, useRef, useEffect, useCallback } from 'react'

interface AutocompleteOption {
  id: number
  label: string
  subtitle?: string
}

interface AutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => Promise<AutocompleteOption[]>
  placeholder?: string
  className?: string
  debounceMs?: number
}

export function Autocomplete({
  value,
  onChange,
  onSearch,
  placeholder,
  className = '',
  debounceMs = 200,
}: AutocompleteProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (q.length < 1) {
        setOptions([])
        setOpen(false)
        return
      }
      timerRef.current = setTimeout(async () => {
        try {
          const results = await onSearch(q)
          setOptions(results)
          setOpen(results.length > 0)
          setActiveIdx(-1)
        } catch {
          setOptions([])
          setOpen(false)
        }
      }, debounceMs)
    },
    [onSearch, debounceMs],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)
    search(v)
  }

  const select = (opt: AutocompleteOption) => {
    onChange(opt.label)
    setOpen(false)
    setOptions([])
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      select(options[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (options.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className={`field-input px-2 py-1 ${className}`}
        autoComplete="off"
      />
      {open && (
        <div
          ref={listRef}
          className="absolute z-30 mt-1 w-full rounded-md border border-border bg-surface shadow-md max-h-48 overflow-y-auto"
        >
          {options.map((opt, i) => (
            <button
              key={opt.id}
              onMouseDown={(e) => { e.preventDefault(); select(opt) }}
              className={`w-full px-3 py-2 text-left text-sm transition ${
                i === activeIdx ? 'bg-primary/10 text-text' : 'text-text-2 hover:bg-surface-2'
              }`}
            >
              <div className="font-medium">{opt.label}</div>
              {opt.subtitle && <div className="text-xs text-text-3">{opt.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
