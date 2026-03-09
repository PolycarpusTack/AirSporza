import { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import { getStoredToken } from '../utils/api'
import { api } from '../utils/api'
import type { CascadeEstimate, Alert } from '../data/types'

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'

export function useCascade(courtId?: number, date?: string) {
  const [estimates, setEstimates] = useState<CascadeEstimate[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  // REST fallback — fetch initial data
  const fetchEstimates = useCallback(async () => {
    if (!courtId || !date) return
    setLoading(true)
    try {
      const data = await api.get<CascadeEstimate[]>(`/broadcast-slots?courtId=${courtId}&date=${date}`)
      // cascade estimates may come from a dedicated endpoint later; for now use slots
      setEstimates(Array.isArray(data) ? data : [])
    } catch {
      // Endpoint may not exist yet — use empty array
      setEstimates([])
    } finally {
      setLoading(false)
    }
  }, [courtId, date])

  useEffect(() => { fetchEstimates() }, [fetchEstimates])

  // Socket.IO for live updates
  useEffect(() => {
    const token = getStoredToken()
    if (!token || !courtId) return

    const cascadeSocket = io(`${SOCKET_URL}/cascade`, {
      auth: { token },
      transports: ['websocket'],
    })

    const alertsSocket = io(`${SOCKET_URL}/alerts`, {
      auth: { token },
      transports: ['websocket'],
    })

    cascadeSocket.on('connect', () => {
      cascadeSocket.emit('subscribe:court', { courtId })
    })

    alertsSocket.on('connect', () => {
      alertsSocket.emit('subscribe:tenant', {})
    })

    cascadeSocket.on('cascade:updated', (data: CascadeEstimate[]) => {
      setEstimates(data)
    })

    alertsSocket.on('alerts:update', (data: Alert[]) => {
      setAlerts(prev => {
        const merged = [...data, ...prev]
        // Deduplicate by slotId+code, keep latest
        const seen = new Set<string>()
        return merged.filter(a => {
          const key = `${a.slotId}:${a.code}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }).slice(0, 50)
      })
    })

    return () => {
      cascadeSocket.disconnect()
      alertsSocket.disconnect()
    }
  }, [courtId])

  const dismissAlert = useCallback((code: string, slotId: string) => {
    setAlerts(prev => prev.filter(a => !(a.code === code && a.slotId === slotId)))
  }, [])

  return { estimates, alerts, loading, dismissAlert, refetch: fetchEstimates }
}
