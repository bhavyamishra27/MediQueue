/**
 * Thin Socket.IO emitter layer.
 *
 * Services never import the Socket.IO server directly. They call these helpers,
 * which are no-ops when the realtime server has not been initialized (for
 * example in unit tests or scripts). That keeps the DSA and REST layers fully
 * usable without a socket server.
 */
let io = null;

export function setRealtimeServer(server) {
  io = server;
}

export function getRealtimeServer() {
  return io;
}

export function isRealtimeEnabled() {
  return Boolean(io);
}

/**
 * Fixed room names. Clients can never choose a room; the handshake middleware
 * derives every room from the freshly loaded database identity.
 */
export const rooms = {
  user: (userId) => `user:${userId}`,
  patient: (userId) => `patient:${userId}`,
  doctor: (doctorId) => `doctor:${doctorId}`,
  hospital: (hospitalId) => `hospital:${hospitalId}`,
  platformAdmins: 'platform:admins',
};

export function emitToRoom(room, event, payload) {
  if (!io || !room) return;
  io.to(room).emit(event, payload);
}

export function emitToRooms(roomList, event, payload) {
  if (!io) return;

  const unique = [...new Set((roomList ?? []).filter(Boolean))];
  if (unique.length === 0) return;

  io.to(unique).emit(event, payload);
}
