import { useState, useCallback } from 'react'

export interface UserPreferences {
  defaultView: 'planner' | 'sports' | 'contracts' | 'admin'
  defaultSportFilter: number | null
  defaultChannelFilter: string
  dateFormat: 'en-GB' | 'en-US' | 'nl-BE'
  compactMode: boolean
  showWeekNumbers: boolean
}

const DEFAULTS: UserPreferences = {
  defaultView: 'planner',
  defaultSportFilter: null,
  defaultChannelFilter: 'all',
  dateFormat: 'en-GB',
  compactMode: false,
  showWeekNumbers: false,
}

const STORAGE_KEY = 'planza_user_preferences'

function load(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(load)

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setPrefs(DEFAULTS)
  }, [])

  return { prefs, update, reset }
}
