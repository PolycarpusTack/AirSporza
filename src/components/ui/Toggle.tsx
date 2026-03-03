interface ToggleProps {
  active: boolean
  onChange: (active: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ active, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={`flex items-center gap-2 select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <div
        className={`toggle-track ${active ? 'active' : ''}`}
        onClick={() => !disabled && onChange(!active)}
      >
        <div className='toggle-thumb' />
      </div>
      {label && <span className='text-sm text-text-2'>{label}</span>}
    </label>
  )
}
