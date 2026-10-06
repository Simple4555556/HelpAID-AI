import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;
export const userSocketMap = new Map<string, string>();

export function setIo(io: SocketIOServer) {
  ioInstance = io;
  console.log('[SocketService] Global Socket.io instance set.');
}

export function getIo(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('[SocketService] Socket.io instance has not been initialized yet!');
  }
  return ioInstance;
}
