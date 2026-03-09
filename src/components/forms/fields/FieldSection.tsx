import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface FieldSectionProps {
  title: string
  fieldCount?: number
  defaultOpen?: boolean
  children: ReactNode
}

export default function FieldSection({
  title,
  fieldCount,
  defaultOpen = true,
  children,
}: FieldSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-3 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="uppercase tracking-wide text-xs font-medium text-text-2 whitespace-nowrap">
          {title}
          {fieldCount != null && (
            <span className="ml-1 text-text-3">({fieldCount})</span>
          )}
        </span>
        <hr className="flex-1 border-border" />
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}
