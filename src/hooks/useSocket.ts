import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { io, Socket } from 'socket.io-client'
import { getStoredToken } from '../utils/api'
import { useAuth } from './useAuth'

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'

interface SocketContextValue {
  on: <T>(event: string, callback: (data: T) => void) => () => void
  emit: (event: string, data: unknown) => void
  socket: Socket | null
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect()
      socketRef.current = null
      setSocket(null)
      return
    }

    const token = getStoredToken()
    if (!token) {
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      // Tenant scoping is enforced server-side from the JWT/user lookup
      socket.emit('subscribe:events')
      socket.emit('subscribe:techPlans')
      socket.emit('subscribe:encoders')
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
    })

    socketRef.current = socket
    setSocket(socket)

    return () => {
      socket.disconnect()
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      setSocket((current) => (current === socket ? null : current))
    }
  }, [user])

  const on = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    socketRef.current?.on(event, callback as (...args: unknown[]) => void)
    
    return () => {
      socketRef.current?.off(event, callback as (...args: unknown[]) => void)
    }
  }, [])

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data)
  }, [])

  const value = useMemo(
    () => ({ on, emit, socket }),
    [emit, on, socket]
  )

  return createElement(SocketContext.Provider, { value }, children)
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}
