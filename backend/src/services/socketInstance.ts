import { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer
}

export function getSocketServer(): SocketServer | null {
  return io
}

export function emit(event: string, data: unknown, room?: string) {
  if (!io) return
  if (room) {
    io.to(room).emit(event, data)
  } else {
    io.emit(event, data)
  }
}
