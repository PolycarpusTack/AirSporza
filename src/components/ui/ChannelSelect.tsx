import { useState, useEffect, useRef } from 'react'
import { channelsApi } from '../../services/channels'
import type { Channel, ChannelType } from '../../data/types'

interface ChannelSelectProps {
  value: number | null | undefined
  onChange: (channelId: number | null, channel?: Channel) => void
  type?: ChannelType
  placeholder?: string
  className?: string
  disabled?: boolean
  allowClear?: boolean
}

export function ChannelSelect({
  value,
  onChange,
  type,
  placeholder = 'Select channel...',
  className = '',
  disabled = false,
}: ChannelSelectProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const loadedType = useRef<ChannelType | undefined>(undefined)

  useEffect(() => {
    if (loadedType.current === type && channels.length > 0) return
    loadedType.current = type
    channelsApi.list(type)
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoading(false))
  }, [type])

  // Build flat options with indent for hierarchy
  const buildOptions = (): { id: number; label: string; depth: number; channel: Channel }[] => {
    const options: { id: number; label: string; depth: number; channel: Channel }[] = []
    const roots = channels.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    const childrenOf = (parentId: number) =>
      channels.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

    const walk = (ch: Channel, depth: number) => {
      options.push({ id: ch.id, label: ch.name, depth, channel: ch })
      for (const child of childrenOf(ch.id)) {
        walk(child, depth + 1)
      }
    }

    for (const root of roots) walk(root, 0)
    return options
  }

  const options = buildOptions()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (!val) {
      onChange(null)
      return
    }
    const id = Number(val)
    const ch = channels.find(c => c.id === id)
    onChange(id, ch)
  }

  return (
    <select
      value={value ?? ''}
      onChange={handleChange}
      className={`field-input border-border ${className}`}
      disabled={disabled || loading}
    >
      <option value="">{loading ? 'Loading...' : placeholder}</option>
      {options.map(opt => (
        <option key={opt.id} value={opt.id}>
          {'  '.repeat(opt.depth)}{opt.depth > 0 ? '└ ' : ''}{opt.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Hook to get a channel name/color from a channelId without rendering a select.
 * Useful for display-only contexts.
 */
export function useChannelLookup() {
  const [channels, setChannels] = useState<Channel[]>([])

  useEffect(() => {
    channelsApi.list().then(setChannels).catch(() => {})
  }, [])

  const getChannel = (id: number | null | undefined): Channel | undefined =>
    id ? channels.find(c => c.id === id) : undefined

  return { channels, getChannel }
}
