import { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer
}

export function getSocketServer(): SocketServer | null {
  return io
}

export function emit(event: string, data: unknown) {
  if (io) {
    io.emit(event, data)
  }
}
